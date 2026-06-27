import Script from "next/script";

/**
 * Public GA4 measurement ID. Safe to commit — it's exposed in every page's HTML
 * anyway. Follows the same hardcoded-default-with-env-override pattern as
 * SITE_URL in lib/seo (override per-environment with NEXT_PUBLIC_GA_ID).
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-PPXV98MJ4Y";

/**
 * Google Analytics 4, loaded via the Next.js-recommended `afterInteractive`
 * strategy. Renders only for real production traffic, so dev and preview builds
 * never pollute the analytics data.
 */
export function Analytics() {
  if (process.env.NODE_ENV !== "production" || !GA_ID) return null;

  const gaId = GA_ID;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  );
}
