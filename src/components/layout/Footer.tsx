import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function Footer() {
  const t = await getTranslations("Footer");
  const year = String(new Date().getFullYear());

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🐙</span>
              <span className="text-lg font-bold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
                TakoAPI
              </span>
            </Link>
            <p className="text-sm text-gray-500 max-w-sm">
              {t("tagline")}
            </p>
            <p className="text-xs text-gray-400 mt-4">
              {t("agentRegistry")}{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                https://takoapi.com/api/registry
              </code>
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("platform")}</h3>
            <ul className="space-y-2">
              <li><Link href="/install" className="text-sm text-gray-500 hover:text-gray-700">{t("installInAgent")}</Link></li>
              <li><Link href="/agents" className="text-sm text-gray-500 hover:text-gray-700">{t("browseAgents")}</Link></li>
              <li><Link href="/submit-agent" className="text-sm text-gray-500 hover:text-gray-700">{t("publishAnAgent")}</Link></li>
              <li><Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">{t("developerDashboard")}</Link></li>
              <li><Link href="/skills" className="text-sm text-gray-500 hover:text-gray-700">{t("browseSkills")}</Link></li>
              <li><Link href="/blog" className="text-sm text-gray-500 hover:text-gray-700">{t("blog")}</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("resources")}</h3>
            <ul className="space-y-2">
              <li><a href="https://github.com/VoltAgent/awesome-openclaw-skills" target="_blank" rel="noopener" className="text-sm text-gray-500 hover:text-gray-700">{t("awesomeList")}</a></li>
              <li><a href="https://clawskills.sh" target="_blank" rel="noopener" className="text-sm text-gray-500 hover:text-gray-700">{t("clawHub")}</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 mt-8 pt-8 text-center">
          <p className="text-xs text-gray-400">{t("copyright", { year })}</p>
        </div>
      </div>
    </footer>
  );
}
