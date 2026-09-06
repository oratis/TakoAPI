"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// Shared "please sign in" placeholder for gated pages. The link carries the page
// the visitor was on, so signing in returns them here instead of the home page.
export function SignInPrompt({ title, description }: { title: string; description: string }) {
  const t = useTranslations("Auth");
  const pathname = usePathname();
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-gray-600 mb-6">{description}</p>
      <Link
        href={{ pathname: "/auth/signin", query: { callbackUrl: pathname } }}
        className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
      >
        {t("signIn")}
      </Link>
    </div>
  );
}
