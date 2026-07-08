import Script from "next/script";

// Privacy-light web analytics, enabled entirely by env — renders nothing until
// one is set, so it's inert in dev/preview:
//   NEXT_PUBLIC_PLAUSIBLE_DOMAIN=takoapi.com   (recommended — lightweight, cookieless)
//   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX              (Google Analytics 4)
export default function Analytics() {
  const plausible = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const ga = process.env.NEXT_PUBLIC_GA_ID;

  if (plausible) {
    return (
      <Script
        defer
        data-domain={plausible}
        src="https://plausible.io/js/script.js"
        strategy="afterInteractive"
      />
    );
  }

  if (ga) {
    return (
      <>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`}
        </Script>
      </>
    );
  }

  return null;
}
