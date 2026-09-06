"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";

/**
 * Public GA4 measurement ID. Safe to commit — it is exposed in every page's HTML
 * anyway. Same hardcoded-default-with-env-override pattern as SITE_URL in lib/seo.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-PPXV98MJ4Y";

const STORAGE_KEY = "tako.analytics-consent";
type Consent = "granted" | "denied";

/**
 * Analytics, gated behind an explicit choice.
 *
 * The site serves fifteen locales including German, French, Spanish and Italian,
 * so a meaningful share of visitors are covered by the ePrivacy directive — and
 * GA4 was loading and setting its cookies on first paint with no notice and no way
 * to decline. Nothing loads here until the visitor answers; declining is a single
 * click and is remembered, so the banner is not a dark pattern that only has an
 * "accept" path.
 *
 * The choice lives in localStorage rather than a cookie precisely because the
 * pre-consent state must set no cookies at all.
 */
export function Analytics() {
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setConsent(stored === "granted" || stored === "denied" ? stored : null);
    } catch {
      // Private mode / storage disabled: treat as undecided but never prompt in a
      // loop — without storage we cannot remember the answer, so stay off.
      setConsent("denied");
    }
  }, []);

  const decide = (value: Consent) => {
    setConsent(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* nothing to persist to */
    }
  };

  // Production only, so dev and preview traffic never pollutes the property.
  const enabled = process.env.NODE_ENV === "production" && !!GA_ID;

  return (
    <>
      {enabled && consent === "granted" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('consent', 'default', {ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied', analytics_storage:'granted'});
gtag('config', '${GA_ID}', {anonymize_ip: true});`}
          </Script>
        </>
      )}
      {enabled && consent === null && <ConsentBanner onDecide={decide} />}
    </>
  );
}

function ConsentBanner({ onDecide }: { onDecide: (v: Consent) => void }) {
  const t = useTranslations("Consent");
  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex-1 min-w-[16rem] text-sm text-gray-700">{t("description")}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDecide("denied")}
            className="rounded-full border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("decline")}
          </button>
          <button
            type="button"
            onClick={() => onDecide("granted")}
            className="rounded-full bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            {t("accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
