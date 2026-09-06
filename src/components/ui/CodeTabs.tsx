"use client";

import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

// Tabbed code samples with a copy button — used for the home-page quickstart and
// the per-agent call examples. Plain <pre>, no syntax-highlighting dependency: the
// samples are four lines of curl or SDK setup, and a highlighter would cost more
// bytes than the code it colours.
export type CodeSample = { key: string; label: string; code: string };

export default function CodeTabs({
  samples,
  className = "",
  ariaLabel,
}: {
  samples: CodeSample[];
  className?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("InstallTabs");
  const [active, setActive] = useState(samples[0]?.key);
  const [copied, setCopied] = useState(false);
  const id = useId();
  const current = samples.find((s) => s.key === active) ?? samples[0];
  if (!current) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className={`overflow-hidden rounded-xl border border-gray-800 bg-gray-900 ${className}`}>
      <div className="flex items-center gap-1 border-b border-gray-800 px-2 py-1.5" role="tablist" aria-label={ariaLabel}>
        {samples.map((s) => (
          <button
            key={s.key}
            role="tab"
            type="button"
            id={`${id}-${s.key}`}
            aria-selected={s.key === current.key}
            aria-controls={`${id}-panel`}
            onClick={() => setActive(s.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              s.key === current.key ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={copy}
          className="ms-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:text-white"
          aria-label={copied ? t("copied") : t("copy")}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? t("copied") : t("copy")}</span>
        </button>
      </div>
      <pre
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${current.key}`}
        className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-relaxed text-gray-100"
      >
        <code>{current.code}</code>
      </pre>
    </div>
  );
}
