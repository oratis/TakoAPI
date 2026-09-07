"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { fetchJson } from "@/hooks/useAsync";

export default function ForgotPasswordPage() {
  const t = useTranslations("Auth");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStatus("sending");
    try {
      await fetchJson("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : t("somethingWentWrong"));
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <span className="text-4xl" aria-hidden>🐙</span>
        <h1 className="text-2xl font-bold mt-3">{t("forgotTitle")}</h1>
        <p className="text-sm text-gray-600 mt-1">{t("forgotSubtitle")}</p>
      </div>

      {status === "sent" ? (
        // Deliberately says nothing about whether the address is registered — the
        // API answers identically either way, and this copy has to match it.
        <div role="status" className="text-sm text-gray-700 bg-purple-50 px-4 py-3 rounded-lg text-center">
          {t("resetLinkSent")}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {status === "sending" ? t("sendingResetLink") : t("sendResetLink")}
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
