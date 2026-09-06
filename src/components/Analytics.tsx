"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";

/**
 * Public GA4 measurement ID. Safe to commit — it is exposed in every page's HTML
 * anyway. Same hardcoded-default-with-env-override pattern as SITE_URL in lib/seo.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-PPXV98MJ4Y";

const STORAGE_KEY = "tako.analytics-consent";
type Consent = "granted" | "denied";

// Consent lives in localStorage, which is an external store, so it is read through
// useSyncExternalStore rather than copied into component state by an effect. That
// keeps the server render and the first client render agreed on "no consent yet"
// and avoids the setState-in-effect pattern.
//
// It is localStorage and not a cookie precisely because the pre-consent state must
// set no cookies at all.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab answering the banner should settle this one too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readConsent(): Consent | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    // Private mode or storage blocked: we cannot remember an answer, so never ask
    // and never load anything.
    return "denied";
  }
}

/** During SSR and the first paint there is no stored answer to act on. */
function serverConsent(): Consent | null {
  return null;
}

function writeConsent(value: Consent): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* nothing to persist to; the in-memory notification below still applies */
  }
  for (const listener of listeners) listener();
}

/**
 * Analytics, gated behind an explicit choice.
 *
 * The site serves fifteen locales including German, French, Spanish and Italian,
 * so a meaningful share of visitors are covered by the ePrivacy directive — and
 * GA4 was loading and setting its cookies on first paint with no notice and no way
 * to decline. Nothing loads until the visitor answers, and declining is a single
 * click, so this is not an accept-only dark pattern.
 */
export function Analytics() {
  const consent = useSyncExternalStore(subscribe, readConsent, serverConsent);

  // Production only, so dev and preview traffic never pollutes the property.
  const enabled = process.env.NODE_ENV === "production" && !!GA_ID;
  if (!enabled) return null;

  if (consent === "granted") {
    return (
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
    );
  }

  if (consent === null) return <ConsentBanner onDecide={writeConsent} />;
  return null;
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
