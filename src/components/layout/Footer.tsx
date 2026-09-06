import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SITE_URL } from "@/lib/seo";

export default async function Footer() {
  const t = await getTranslations("Footer");
  const year = String(new Date().getFullYear());

  const platform = [
    { href: "/agents", label: t("browseAgents") },
    { href: "/scenarios", label: t("scenarios") },
    { href: "/skills", label: t("browseSkills") },
    { href: "/install", label: t("installInAgent") },
    { href: "/submit-agent", label: t("publishAnAgent") },
    { href: "/dashboard", label: t("developerDashboard") },
  ];
  const resources = [
    { href: "/blog", label: t("blog"), external: false },
    { href: "/badge", label: t("badge"), external: false },
    { href: "https://a2aproject.github.io/A2A/", label: t("a2aSpec"), external: true },
    { href: "https://github.com/oratis/TakoAPI", label: t("github"), external: true },
  ];

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <span className="text-2xl" aria-hidden>🐙</span>
              <span className="text-lg font-bold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
                TakoAPI
              </span>
            </Link>
            <p className="text-sm text-gray-600 max-w-sm">{t("tagline")}</p>
            <p className="text-xs text-gray-600 mt-4">
              {t("agentRegistry")}{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{SITE_URL}/api/registry</code>
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("platform")}</h3>
            <ul className="space-y-2">
              {platform.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-gray-600 hover:text-gray-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("resources")}</h3>
            <ul className="space-y-2">
              {resources.map((l) =>
                l.external ? (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noopener" className="text-sm text-gray-600 hover:text-gray-900">
                      {l.label}
                    </a>
                  </li>
                ) : (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-gray-600 hover:text-gray-900">
                      {l.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 mt-8 pt-8 text-center">
          <p className="text-xs text-gray-600">{t("copyright", { year })}</p>
        </div>
      </div>
    </footer>
  );
}
