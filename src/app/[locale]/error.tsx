"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RotateCcw, Home } from "lucide-react";

// Route-level error boundary for every page under the locale layout. Keeps the
// header/footer, offers a retry, and prints the digest so a report can be matched
// to the server log line.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ErrorPage");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-24 text-center">
      <p className="font-mono text-sm text-gray-500">500</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{t("title")}</h1>
      <p className="mt-3 text-gray-600">{t("description")}</p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-gray-500">{t("reference", { id: error.digest })}</p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
        >
          <RotateCcw className="h-4 w-4" /> {t("retry")}
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-purple-300"
        >
          <Home className="h-4 w-4" /> {t("home")}
        </Link>
      </div>
    </div>
  );
}
