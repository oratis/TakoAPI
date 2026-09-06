import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, Compass, Gauge, KeyRound, Server, Terminal, Zap } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/JsonLd";
import CodeTabs from "@/components/ui/CodeTabs";
import { absoluteUrl, localizedAlternates, localizedUrl, SITE_NAME, SITE_URL } from "@/lib/seo";
import { localeOg } from "@/lib/locales";
import { gatewaySamples } from "@/lib/samples";
import {
  AUTH_HEADER_SAMPLE,
  DISCOVERY_ENDPOINTS,
  DOCS_SECTIONS,
  ERROR_ROWS,
  EXAMPLE_AGENT_SLUG,
  EXPORT_KEY_SAMPLE,
  GATEWAY_ENDPOINTS,
  MCP_TOOLS,
  MCP_URL,
  OPENAI_ERROR_SAMPLE,
  RATE_LIMIT_SAMPLE,
  mcpRegisterSamples,
  type DocsSectionId,
  type Endpoint,
} from "@/lib/docs-content";

// Single-page API reference. Deliberately one static server-rendered document
// rather than a per-endpoint route tree: the whole surface is seven sections, and
// one page is both the fastest thing to read and the easiest thing for a search
// engine (or a model fetching the URL) to take in whole.
//
// No data is loaded here, so the page prerenders per locale and is served from
// the CDN. The literal request/response bodies live in lib/docs-content, which is
// where the correspondence with the actual routes is maintained.

const SECTION_ICONS: Record<DocsSectionId, LucideIcon> = {
  quickstart: Terminal,
  authentication: KeyRound,
  discovery: Compass,
  gateway: Zap,
  mcp: Server,
  errors: AlertTriangle,
  limits: Gauge,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Docs" });
  const title = t("title");
  const description = t("description");

  return {
    metadataBase: new URL(absoluteUrl("")),
    title: t("metaTitle"),
    description,
    alternates: localizedAlternates(locale, "/docs"),
    openGraph: {
      type: "article",
      locale: localeOg(locale),
      url: localizedUrl(locale, "/docs"),
      siteName: SITE_NAME,
      title,
      description,
      images: [absoluteUrl("/opengraph-image")],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl("/opengraph-image")],
    },
  };
}

/* ---------------------------------------------------------------- primitives */

function CodeBlock({ code }: { code: string }) {
  // dir="ltr" because Arabic is a supported locale and code must not be mirrored;
  // tabIndex makes the horizontal scroll reachable without a pointer.
  return (
    <pre
      dir="ltr"
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900 px-4 py-3.5 text-start font-mono text-[12.5px] leading-relaxed text-gray-100"
    >
      <code>{code}</code>
    </pre>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code
      dir="ltr"
      className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800"
    >
      {children}
    </code>
  );
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-purple-600 underline underline-offset-2 hover:text-purple-700">
      {children}
    </Link>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</p>
  );
}

function Badge({ tone, children }: { tone: "green" | "amber"; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 py-10 first:pt-0">
      <h2
        id={`${id}-heading`}
        className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-gray-900"
      >
        <Icon className="h-5 w-5 shrink-0 text-purple-600" aria-hidden="true" />
        {title}
      </h2>
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------- endpoint card */

type EndpointView = {
  id: string;
  method: Endpoint["method"];
  path: string;
  summary: string;
  auth: boolean;
  billable: boolean;
  params: Array<{ name: string; type: string; desc: string }>;
  request?: string;
  example: string;
  response: string;
  extras: Array<{ title: string; code: string }>;
  note: string | null;
  paramsCaption: string;
};

type EndpointLabels = {
  params: string;
  request: string;
  example: string;
  response: string;
  authRequired: string;
  noAuth: string;
  billable: string;
  free: string;
  paramName: string;
  paramType: string;
  paramDesc: string;
};

function EndpointCard({ endpoint, labels }: { endpoint: EndpointView; labels: EndpointLabels }) {
  return (
    <article id={endpoint.id} className="scroll-mt-24 rounded-2xl border border-gray-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 dir="ltr" className="flex items-center gap-2 text-start">
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
              endpoint.method === "GET"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-purple-100 text-purple-800"
            }`}
          >
            {endpoint.method}
          </span>
          <code className="font-mono text-sm font-semibold text-gray-900">{endpoint.path}</code>
        </h3>
        <Badge tone={endpoint.auth ? "amber" : "green"}>
          {endpoint.auth ? labels.authRequired : labels.noAuth}
        </Badge>
        <Badge tone={endpoint.billable ? "amber" : "green"}>
          {endpoint.billable ? labels.billable : labels.free}
        </Badge>
      </div>

      <p className="mt-2.5 text-sm text-gray-600">{endpoint.summary}</p>

      {endpoint.params.length > 0 && (
        <div className="mt-5">
          <FieldLabel>{labels.params}</FieldLabel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <caption className="sr-only">{endpoint.paramsCaption}</caption>
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="py-2 pe-4 text-start font-semibold">
                    {labels.paramName}
                  </th>
                  <th scope="col" className="py-2 pe-4 text-start font-semibold">
                    {labels.paramType}
                  </th>
                  <th scope="col" className="py-2 text-start font-semibold">
                    {labels.paramDesc}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {endpoint.params.map((p) => (
                  <tr key={p.name} className="align-top">
                    <td className="py-2 pe-4">
                      <Mono>{p.name}</Mono>
                    </td>
                    <td dir="ltr" className="py-2 pe-4 text-start font-mono text-xs text-gray-600">
                      {p.type}
                    </td>
                    <td className="py-2 text-gray-600">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {endpoint.request && (
        <div className="mt-5">
          <FieldLabel>{labels.request}</FieldLabel>
          <CodeBlock code={endpoint.request} />
        </div>
      )}

      <div className="mt-5">
        <FieldLabel>{labels.example}</FieldLabel>
        <CodeBlock code={endpoint.example} />
      </div>

      <div className="mt-5">
        <FieldLabel>{labels.response}</FieldLabel>
        <CodeBlock code={endpoint.response} />
      </div>

      {endpoint.extras.map((extra) => (
        <div key={extra.title} className="mt-5">
          <FieldLabel>{extra.title}</FieldLabel>
          <CodeBlock code={extra.code} />
        </div>
      ))}

      {endpoint.note && <p className="mt-4 text-xs leading-relaxed text-gray-600">{endpoint.note}</p>}
    </article>
  );
}

/* ---------------------------------------------------------------------- page */

export default async function DocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Docs");

  const labels: EndpointLabels = {
    params: t("labelQueryParams"),
    request: t("labelRequest"),
    example: t("labelExample"),
    response: t("labelResponse"),
    authRequired: t("labelAuthRequired"),
    noAuth: t("labelNoAuth"),
    billable: t("labelBillable"),
    free: t("labelFree"),
    paramName: t("labelParamName"),
    paramType: t("labelParamType"),
    paramDesc: t("labelParamDesc"),
  };

  // Message keys are resolved here so the presentational components below take
  // plain strings and stay free of the translator's type surface.
  const toView = (e: Endpoint): EndpointView => ({
    id: e.id,
    method: e.method,
    path: e.path,
    summary: t(e.summaryKey),
    auth: e.auth,
    billable: e.billable,
    params: (e.params ?? []).map((p) => ({ name: p.name, type: p.type, desc: t(p.descKey) })),
    request: e.request,
    example: e.example,
    response: e.response,
    extras: (e.extras ?? []).map((x) => ({ title: t(x.titleKey), code: x.code })),
    note: e.noteKey ? t(e.noteKey) : null,
    paramsCaption: t("paramsTableCaption", { path: e.path }),
  });

  const discovery = DISCOVERY_ENDPOINTS.map(toView);
  const gateway = GATEWAY_ENDPOINTS.map(toView);

  const apiLd = {
    "@context": "https://schema.org",
    "@type": "APIReference",
    name: t("title"),
    headline: t("title"),
    description: t("description"),
    url: localizedUrl(locale, "/docs"),
    inLanguage: locale,
    articleSection: DOCS_SECTIONS.map((id) => t(`${id}Title`)),
    proficiencyLevel: "Beginner",
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    about: {
      "@type": "WebAPI",
      name: `${SITE_NAME} Gateway`,
      description: t("description"),
      documentation: absoluteUrl("/docs"),
      provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl("/icon.svg"),
    },
  };

  const richTags = {
    b: (chunks: React.ReactNode) => <strong className="font-semibold text-gray-900">{chunks}</strong>,
    cmd: (chunks: React.ReactNode) => <Mono>{chunks}</Mono>,
  };

  return (
    <div>
      <JsonLd data={apiLd} />

      {/* Hero */}
      <section className="border-b border-gray-100 bg-gradient-to-br from-purple-50 via-white to-blue-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            {t("heroBadge")}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {t.rich("heroTitle", {
              grad: (chunks) => (
                <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
                  {chunks}
                </span>
              ),
            })}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-600">{t("heroSubtitle")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" /> {t("heroKeyCta")}
            </Link>
            <Link
              href="/agents"
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-purple-300"
            >
              <Compass className="h-4 w-4" aria-hidden="true" /> {t("heroBrowseCta")}
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
          {/* Table of contents — a plain list on mobile, sticky rail on desktop. */}
          <nav aria-label={t("tocLabel")} className="mb-8 lg:mb-0">
            <div className="lg:sticky lg:top-20">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("tocTitle")}
              </p>
              <ul className="mt-3 space-y-0.5 border-s border-gray-200 ps-3">
                {DOCS_SECTIONS.map((id) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="block rounded py-1 text-sm text-gray-600 hover:text-purple-700"
                    >
                      {t(`${id}Title`)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="min-w-0 divide-y divide-gray-100">
            {/* 1 — Quickstart */}
            <Section id="quickstart" title={t("quickstartTitle")} icon={SECTION_ICONS.quickstart}>
              <p className="text-gray-600">{t("quickstartIntro")}</p>

              <ol className="list-decimal space-y-5 ps-5 marker:font-semibold marker:text-gray-500">
                <li>
                  <h3 className="text-sm font-semibold text-gray-900">{t("quickstartStep1Title")}</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    {t.rich("quickstartStep1", { ...richTags, link: (chunks) => <DocLink href="/dashboard">{chunks}</DocLink> })}
                  </p>
                </li>
                <li>
                  <h3 className="text-sm font-semibold text-gray-900">{t("quickstartStep2Title")}</h3>
                  <p className="mt-1 mb-2 text-sm text-gray-600">
                    {t.rich("quickstartStep2", richTags)}
                  </p>
                  <CodeBlock code={EXPORT_KEY_SAMPLE} />
                </li>
                <li>
                  <h3 className="text-sm font-semibold text-gray-900">{t("quickstartStep3Title")}</h3>
                  <p className="mt-1 mb-2 text-sm text-gray-600">
                    {t.rich("quickstartStep3", { ...richTags, link: (chunks) => <DocLink href="/agents">{chunks}</DocLink> })}
                  </p>
                  <CodeTabs
                    samples={gatewaySamples(EXAMPLE_AGENT_SLUG)}
                    ariaLabel={t("quickstartSamplesLabel")}
                  />
                  <p className="mt-2 text-xs text-gray-600">{t("quickstartNote")}</p>
                </li>
              </ol>
            </Section>

            {/* 2 — Authentication */}
            <Section
              id="authentication"
              title={t("authenticationTitle")}
              icon={SECTION_ICONS.authentication}
            >
              <p className="text-gray-600">{t("authenticationIntro")}</p>
              <CodeBlock code={AUTH_HEADER_SAMPLE} />
              <p className="text-sm text-gray-600">{t.rich("authHeaderNote", richTags)}</p>

              <dl className="grid gap-5 sm:grid-cols-3">
                <div>
                  <dt className="text-sm font-semibold text-gray-900">{t("authWhereTitle")}</dt>
                  <dd className="mt-1 text-sm text-gray-600">
                    {t.rich("authWhere", { ...richTags, link: (chunks) => <DocLink href="/dashboard">{chunks}</DocLink> })}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-gray-900">{t("authOnceTitle")}</dt>
                  <dd className="mt-1 text-sm text-gray-600">{t.rich("authOnce", richTags)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-gray-900">{t("authRevokeTitle")}</dt>
                  <dd className="mt-1 text-sm text-gray-600">{t.rich("authRevoke", richTags)}</dd>
                </div>
              </dl>
            </Section>

            {/* 3 — Discovery */}
            <Section id="discovery" title={t("discoveryTitle")} icon={SECTION_ICONS.discovery}>
              <p className="text-gray-600">{t("discoveryIntro")}</p>
              <div className="space-y-5">
                {discovery.map((e) => (
                  <EndpointCard key={e.id} endpoint={e} labels={labels} />
                ))}
              </div>
            </Section>

            {/* 4 — Gateway */}
            <Section id="gateway" title={t("gatewayTitle")} icon={SECTION_ICONS.gateway}>
              <p className="text-gray-600">{t("gatewayIntro")}</p>
              <div className="space-y-5">
                {gateway.map((e) => (
                  <EndpointCard key={e.id} endpoint={e} labels={labels} />
                ))}
              </div>
            </Section>

            {/* 5 — MCP server */}
            <Section id="mcp" title={t("mcpTitle")} icon={SECTION_ICONS.mcp}>
              <p className="text-gray-600">{t.rich("mcpIntro", { ...richTags, url: MCP_URL })}</p>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">{t("mcpRegisterTitle")}</h3>
                <CodeTabs samples={mcpRegisterSamples()} ariaLabel={t("mcpRegisterLabel")} />
                <p className="mt-2 text-xs text-gray-600">{t.rich("mcpAuthNote", richTags)}</p>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">{t("mcpToolsTitle")}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] border-collapse text-sm">
                    <caption className="sr-only">{t("mcpToolsTableCaption")}</caption>
                    <thead>
                      <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                        <th scope="col" className="py-2 pe-4 text-start font-semibold">
                          {t("mcpToolColumn")}
                        </th>
                        <th scope="col" className="py-2 pe-4 text-start font-semibold">
                          {t("mcpToolAccessColumn")}
                        </th>
                        <th scope="col" className="py-2 text-start font-semibold">
                          {t("mcpToolWhatColumn")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {MCP_TOOLS.map((tool) => (
                        <tr key={tool.name} className="align-top">
                          <td className="py-2.5 pe-4">
                            <Mono>{tool.name}</Mono>
                          </td>
                          <td className="py-2.5 pe-4">
                            <Badge tone={tool.auth ? "amber" : "green"}>
                              {tool.auth ? t("mcpToolKeyRequired") : t("mcpToolAnonymous")}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-gray-600">{t(tool.descKey)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-gray-600">{t("mcpRateNote")}</p>
                <p className="mt-2 text-sm text-gray-600">
                  {t.rich("mcpInstallNote", { ...richTags, link: (chunks) => <DocLink href="/install">{chunks}</DocLink> })}
                </p>
              </div>
            </Section>

            {/* 6 — Errors */}
            <Section id="errors" title={t("errorsTitle")} icon={SECTION_ICONS.errors}>
              <p className="text-gray-600">{t("errorsIntro")}</p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <caption className="sr-only">{t("errorsTableCaption")}</caption>
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className="py-2 pe-4 text-start font-semibold">
                        {t("errorStatusColumn")}
                      </th>
                      <th scope="col" className="py-2 pe-4 text-start font-semibold">
                        {t("errorCodeColumn")}
                      </th>
                      <th scope="col" className="py-2 pe-4 text-start font-semibold">
                        {t("errorWhenColumn")}
                      </th>
                      <th scope="col" className="py-2 text-start font-semibold">
                        {t("errorBodyColumn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ERROR_ROWS.map((row) => (
                      <tr key={row.status} className="align-top">
                        <th scope="row" className="py-3 pe-4 text-start font-mono font-semibold text-gray-900">
                          {row.status}
                        </th>
                        <td className="py-3 pe-4">
                          <Mono>{row.code}</Mono>
                        </td>
                        <td className="py-3 pe-4 text-gray-600">{t(row.whenKey)}</td>
                        <td className="py-3">
                          <pre
                            dir="ltr"
                            tabIndex={0}
                            className="overflow-x-auto rounded-lg bg-gray-900 px-3 py-2 text-start font-mono text-[11.5px] leading-relaxed text-gray-100"
                          >
                            <code>{row.body}</code>
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <p className="mb-2 text-sm text-gray-600">{t.rich("errorsOpenAiNote", richTags)}</p>
                <CodeBlock code={OPENAI_ERROR_SAMPLE} />
              </div>

              <p className="text-sm text-gray-600">{t.rich("errorsPassthroughNote", richTags)}</p>
            </Section>

            {/* 7 — Rate limits & billing */}
            <Section id="limits" title={t("limitsTitle")} icon={SECTION_ICONS.limits}>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t("limitsRateTitle")}</h3>
                <ul className="mt-2 space-y-2 list-disc ps-5 text-sm text-gray-600">
                  <li>{t.rich("limitsRate", richTags)}</li>
                  <li>{t.rich("limitsRateOverride", richTags)}</li>
                </ul>
                <div className="mt-3">
                  <CodeBlock code={RATE_LIMIT_SAMPLE} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t("limitsBillingTitle")}</h3>
                <ul className="mt-2 space-y-2 list-disc ps-5 text-sm text-gray-600">
                  <li>{t.rich("limitsBillingFree", richTags)}</li>
                  <li>{t.rich("limitsBillingPriced", richTags)}</li>
                  <li>{t.rich("limitsBillingPreflight", richTags)}</li>
                  <li>{t.rich("limitsBillingFailures", richTags)}</li>
                  <li>{t.rich("limitsBillingStreams", richTags)}</li>
                  <li>{t.rich("limitsBillingLedger", { ...richTags, link: (chunks) => <DocLink href="/dashboard">{chunks}</DocLink> })}</li>
                </ul>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
