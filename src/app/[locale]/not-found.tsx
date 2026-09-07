import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Bot, Boxes, Home } from "lucide-react";

// Branded 404, rendered inside the locale layout (header + footer) for both
// `notFound()` calls in pages and unmatched paths (via [...rest]/page.tsx).
export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-24 text-center">
      <p className="font-mono text-sm text-gray-500">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{t("title")}</h1>
      <p className="mt-3 text-gray-600">{t("description")}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
        >
          <Home className="h-4 w-4" /> {t("home")}
        </Link>
        <Link
          href="/agents"
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-purple-300"
        >
          <Bot className="h-4 w-4" /> {t("agents")}
        </Link>
        <Link
          href="/skills"
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-purple-300"
        >
          <Boxes className="h-4 w-4" /> {t("skills")}
        </Link>
      </div>
    </div>
  );
}
