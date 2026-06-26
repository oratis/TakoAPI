"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import { SITE_URL } from "@/lib/seo";

// Copy-paste "Listed on TakoAPI" badge for a listing's README — the self-serve
// half of the badge loop (the SVG itself is served by /api/badge/[slug]).
export function BadgeSnippet({ slug }: { slug: string }) {
  const t = useTranslations("Badge");
  const [copied, setCopied] = useState<string | null>(null);

  const img = `${SITE_URL}/api/badge/${slug}`;
  const link = `${SITE_URL}/agents/${slug}`;
  const snippets: { key: string; label: string; text: string }[] = [
    { key: "md", label: "Markdown", text: `[![TakoAPI](${img})](${link})` },
    { key: "html", label: "HTML", text: `<a href="${link}"><img src="${img}" alt="TakoAPI" /></a>` },
  ];

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold mb-2">{t("snippetTitle")}</h3>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="TakoAPI badge" className="mb-3 h-5" />
      <div className="space-y-2">
        {snippets.map((s) => (
          <div key={s.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{s.label}</span>
              <button
                onClick={() => copy(s.text, s.key)}
                className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
              >
                {copied === s.key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === s.key ? t("copied") : t("copy")}
              </button>
            </div>
            <code className="block text-[10px] bg-gray-50 border border-gray-200 rounded px-2 py-1.5 break-all font-mono text-gray-600">
              {s.text}
            </code>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">{t("snippetHint")}</p>
    </div>
  );
}
