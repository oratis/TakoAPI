"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { safeCallbackUrl } from "@/lib/callback-url";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default function SignInForm() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where to go afterwards: the page the visitor came from (a locale-less path from
  // next-intl's usePathname), never an external URL.
  const callback = safeCallbackUrl(searchParams.get("callbackUrl"));
  // OAuth providers redirect through NextAuth, which needs the real (locale-prefixed) path.
  const absoluteCallback = locale === routing.defaultLocale ? callback : `/${locale}${callback}`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError(t("invalidCredentials"));
    } else {
      router.push(callback);
      router.refresh();
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <span className="text-4xl" aria-hidden>🐙</span>
        <h1 className="text-2xl font-bold mt-3">{t("signInTitle")}</h1>
        <p className="text-sm text-gray-600 mt-1">{t("signInSubtitle")}</p>
      </div>

      <OAuthButtons callbackUrl={absoluteCallback} mode="signin" />

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-gray-500">{t("or")}</span>
        </div>
      </div>

      <form onSubmit={handleCredentials} className="space-y-4">
        <div>
          <label htmlFor="email" className="sr-only">
            {t("email")}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder={t("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
          />
        </div>
        <div>
          <label htmlFor="password" className="sr-only">
            {t("password")}
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {loading ? t("signingIn") : t("signIn")}
        </button>
      </form>

      <p className="text-center text-sm text-gray-600 mt-4">
        <Link href="/auth/forgot" className="text-purple-600 hover:underline">
          {t("forgotPassword")}
        </Link>
      </p>
      <p className="text-center text-sm text-gray-600 mt-2">
        {t("noAccount")}{" "}
        <Link href={{ pathname: "/auth/signup", query: { callbackUrl: callback } }} className="text-purple-600 hover:underline">
          {t("signUpLink")}
        </Link>
      </p>
    </div>
  );
}
