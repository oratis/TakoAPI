"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { safeCallbackUrl } from "@/lib/callback-url";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default function SignUpForm() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callback = safeCallbackUrl(searchParams.get("callbackUrl"), "/dashboard");
  const absoluteCallback = locale === routing.defaultLocale ? callback : `/${locale}${callback}`;

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("registrationFailed"));
      }

      // Auto sign in after registration, then land on the page they came from
      // (the dashboard by default — that is where the API key lives).
      await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      router.push(callback);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("somethingWentWrong"));
      setLoading(false);
    }
  };

  const input =
    "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none";

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <span className="text-4xl" aria-hidden>🐙</span>
        <h1 className="text-2xl font-bold mt-3">{t("signUpTitle")}</h1>
        <p className="text-sm text-gray-600 mt-1">{t("signUpSubtitle")}</p>
      </div>

      <OAuthButtons callbackUrl={absoluteCallback} mode="signup" />

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-gray-500">{t("or")}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="sr-only">{t("name")}</label>
          <input id="name" type="text" required autoComplete="name" placeholder={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        </div>
        <div>
          <label htmlFor="email" className="sr-only">{t("email")}</label>
          <input id="email" type="email" required autoComplete="email" placeholder={t("email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
        </div>
        <div>
          <label htmlFor="password" className="sr-only">{t("password")}</label>
          <input id="password" type="password" required minLength={8} autoComplete="new-password" placeholder={t("passwordHint")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={input} />
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
          {loading ? t("creatingAccount") : t("createAccount")}
        </button>
      </form>

      <p className="text-center text-sm text-gray-600 mt-6">
        {t("haveAccount")}{" "}
        <Link href={{ pathname: "/auth/signin", query: { callbackUrl: callback } }} className="text-purple-600 hover:underline">
          {t("signInLink")}
        </Link>
      </p>
    </div>
  );
}
