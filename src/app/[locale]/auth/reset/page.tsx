"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { fetchJson } from "@/hooks/useAsync";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  // The token arrives in the emailed link. It is never rendered or stored — it goes
  // straight back to the API, which is the only thing that can check it.
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStatus("saving");
    try {
      await fetchJson("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setStatus("done");
      router.push("/auth/signin");
    } catch {
      // The input below enforces the only other rejection the API has (a password
      // under 8 characters), so a failure here is a spent, expired or forged link.
      setStatus("idle");
      setError(t("resetLinkInvalid"));
    }
  };

  const missingToken = !token;

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <span className="text-4xl" aria-hidden>🐙</span>
        <h1 className="text-2xl font-bold mt-3">{t("resetTitle")}</h1>
        <p className="text-sm text-gray-600 mt-1">{t("resetSubtitle")}</p>
      </div>

      {missingToken ? (
        <div className="text-center">
          <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {t("resetLinkInvalid")}
          </p>
          <Link
            href="/auth/forgot"
            className="inline-flex mt-6 bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
          >
            {t("requestNewLink")}
          </Link>
        </div>
      ) : status === "done" ? (
        <div role="status" className="text-sm text-gray-700 bg-purple-50 px-4 py-3 rounded-lg text-center">
          {t("passwordUpdated")}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="password" className="sr-only">
              {t("password")}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t("newPasswordHint")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
            />
          </div>

          {error && (
            <>
              <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
              <p className="text-center text-sm">
                <Link href="/auth/forgot" className="text-purple-600 hover:underline">
                  {t("requestNewLink")}
                </Link>
              </p>
            </>
          )}

          <button
            type="submit"
            disabled={status === "saving"}
            className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {status === "saving" ? t("updatingPassword") : t("updatePassword")}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-gray-600 mt-6">
        <Link href="/auth/signin" className="text-purple-600 hover:underline">
          {t("backToSignIn")}
        </Link>
      </p>
    </div>
  );
}
