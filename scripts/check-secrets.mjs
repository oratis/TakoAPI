#!/usr/bin/env node
// Fails when a tracked file contains something that looks like a live credential.
// A production database password once shipped in scripts/deploy-sync-job.sh; this
// is the cheap, always-on guard against a repeat. Runs in CI (npm run check:secrets)
// and can be run locally before committing.
//
// Deliberately narrow patterns — it looks for *values*, not for words like
// "password" in prose or variable names. Add a pattern when a new class of secret
// enters the stack; add a path to IGNORE only for files that cannot contain a value.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  // connection strings with an inline password (postgres://user:pass@host)
  { name: "database URL with inline password", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/'"`]+:[^\s@/'"`]{4,}@/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/ },
  { name: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Stripe live key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "TakoAPI gateway key", re: /\btako_live_[A-Za-z0-9_-]{24,}\b/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
];

// Files that legitimately contain matching-looking strings (placeholders, examples).
const SELF = "scripts/check-secrets.mjs";
// The scanner's own patterns look exactly like the values it hunts for.
const IGNORE = [new RegExp(`^${SELF}$`), /^package-lock\.json$/, /^scripts\/notify-ledger\.json$/, /^prisma\/seed-data\.json$/, /\.(png|jpg|jpeg|gif|svg|ico|woff2?)$/];

const files = execSync("git ls-files -z", { encoding: "utf8" }).split("\0").filter(Boolean);
const hits = [];
for (const file of files) {
  if (IGNORE.some((re) => re.test(file))) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // binary / unreadable
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) {
        // Allow obvious placeholders so docs can show the *shape* of a value, and
        // the local docker-compose defaults (a throwaway password on localhost).
        if (/<[^>]*(redacted|password|secret|token|your-[a-z-]+)[^>]*>|\*{3,}|example\.com/i.test(line)) continue;
        // Documentation placeholders: postgres://user:pass@host, USER:PASSWORD@…
        if (/:\/\/(user|username|usuario|<[^>]+>|\$\{?\w+\}?)[^\s@]*:(pass(word)?|secret|<[^>]+>|\$\{?\w+\}?)[^\s@]*@/i.test(line)) continue;
        // Local development targets — a throwaway password on a loopback host.
        // NOT applied when the line also carries a unix-socket host override: Cloud
        // SQL connection strings are written `…@localhost/db?host=/cloudsql/<inst>`,
        // which is a *production* credential wearing a loopback hostname. That is
        // the exact shape of the password this scanner exists to stop recurring,
        // so exempting it would make the guard blind to its own founding incident.
        if (/@(localhost|127\.0\.0\.1|db)(:\d+)?[\/?]/.test(line) && !/[?&]host=\//.test(line)) continue;
        // A "secret" made of one repeated character is a shape, not a value —
        // docs write tako_live_xxxxxxxx… and AKIA0000… to show the format. Real
        // credentials are random, so this cannot mask one.
        if (/(.)\1{7,}/.test(line.match(re)?.[0] ?? "")) continue;
        hits.push(`${file}:${i + 1}: ${name}`);
      }
    }
  });
}

if (hits.length) {
  console.error("Possible credentials found in tracked files:\n" + hits.map((h) => `  ${h}`).join("\n"));
  console.error("\nRemove the value (bind it from Secret Manager / env instead), then rotate it.");
  process.exit(1);
}
console.log(`check-secrets: ${files.length} tracked files scanned, nothing found ✓`);
