#!/usr/bin/env node
// Guards i18n message catalogs: every messages/<locale>.json must have exactly
// the same flattened keys as the source (messages/en.json), and every value
// must be valid ICU. Run with: npm run check:i18n  (also used in CI).
import fs from "node:fs";
import path from "node:path";

const DIR = "messages";
const SOURCE = "en";

const flat = (o) => {
  const r = {};
  for (const ns of Object.keys(o)) for (const k of Object.keys(o[ns])) r[`${ns}.${k}`] = o[ns][k];
  return r;
};

const en = JSON.parse(fs.readFileSync(path.join(DIR, `${SOURCE}.json`), "utf8"));
const enF = flat(en);
const enKeys = new Set(Object.keys(enF));

// ICU validation is optional — only runs if the parser (a next-intl dep) is
// resolvable, so the script also works in a bare checkout.
let parse = null;
try {
  ({ parse } = await import("@formatjs/icu-messageformat-parser"));
} catch {
  console.warn("note: @formatjs/icu-messageformat-parser not found — skipping ICU validation (key parity only)");
}
// Keys whose English value itself isn't strict-ICU (e.g. a literal "<query>"
// rendered as plain text, not via t.rich) — skip ICU validation for these.
const enParses = new Set();
if (parse) {
  for (const [k, v] of Object.entries(enF)) {
    try { parse(String(v)); enParses.add(k); } catch { /* literal-tag edge case */ }
  }
}

const locales = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== `${SOURCE}.json`)
  .map((f) => f.replace(".json", ""))
  .sort();

let problems = 0;
for (const loc of locales) {
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(path.join(DIR, `${loc}.json`), "utf8"));
  } catch (e) {
    console.error(`✗ ${loc}: invalid JSON — ${e.message}`);
    problems++;
    continue;
  }
  const f = flat(obj);
  const keys = new Set(Object.keys(f));
  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));
  let icuErrors = 0;
  if (parse) {
    for (const k of keys) {
      if (!enParses.has(k)) continue;
      try { parse(String(f[k])); } catch { icuErrors++; if (icuErrors <= 3) console.error(`    ↳ invalid ICU: ${k}`); }
    }
  }
  if (missing.length || extra.length || icuErrors) {
    console.error(
      `✗ ${loc}: ${missing.length} missing, ${extra.length} extra, ${icuErrors} ICU error(s)` +
        (missing.length ? `  (e.g. ${missing.slice(0, 3).join(", ")})` : "") +
        (extra.length ? `  (extra e.g. ${extra.slice(0, 3).join(", ")})` : ""),
    );
    problems++;
  } else {
    console.log(`✓ ${loc}: ${keys.size} keys${parse ? ", ICU valid" : ""}`);
  }
}

if (problems) {
  console.error(`\n${problems} locale(s) drifted from ${SOURCE}.json — fix before merging.`);
  process.exit(1);
}
console.log(`\nAll ${locales.length} locales match ${SOURCE}.json (${enKeys.size} keys) ✓`);
