"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { Category } from "@/lib/types";

const PROTOCOL_OPTIONS = [
  { key: "A2A", label: "A2A" },
  { key: "OPENAI_COMPAT", labelKey: "protocolOpenAiCompat" },
  { key: "MCP", label: "MCP" },
] as const;
const PRICING_OPTIONS = [
  { key: "FREE", labelKey: "pricingFree" },
  { key: "PER_CALL", labelKey: "pricingPerCall" },
  { key: "PER_TASK", labelKey: "pricingPerTask" },
  { key: "PER_TOKEN", labelKey: "pricingPerToken" },
] as const;

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none";

export default function SubmitAgentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations("SubmitAgent");
  const [mode, setMode] = useState<"url" | "manual">("url");
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    cardUrl: "",
    name: "",
    description: "",
    endpointUrl: "",
    homepage: "",
    categoryId: "",
    pricingModel: "FREE",
    unitPriceUsd: "",
  });
  const [protocols, setProtocols] = useState<string[]>(["A2A"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { name: string; status: string; slug: string }>(null);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  if (status === "loading") return null;
  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
        <p className="text-gray-500 mb-6">{t("signInPrompt")}</p>
        <Link
          href="/auth/signin"
          className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
        >
          {t("signIn")}
        </Link>
      </div>
    );
  }

  const toggleProtocol = (p: string) =>
    setProtocols((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        categoryId: form.categoryId || undefined,
        pricingModel: form.pricingModel,
      };
      if (mode === "url") {
        body.cardUrl = form.cardUrl;
      } else {
        body.name = form.name;
        body.description = form.description;
        body.endpointUrl = form.endpointUrl;
        body.protocols = protocols;
      }
      if (form.homepage) body.homepage = form.homepage;
      if (form.pricingModel !== "FREE" && form.unitPriceUsd) {
        body.unitPriceUsd = Number(form.unitPriceUsd);
      }

      const res = await fetch("/api/agents/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("submitFailed"));

      if (data.status === "APPROVED") {
        router.push(`/agents/${data.slug}`);
      } else {
        setDone({ name: data.name, status: data.status, slug: data.slug });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">{t("successTitle")}</h1>
        <p className="text-gray-600 mb-1">
          {t.rich("pendingReview", {
            name: done.name,
            b: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
        <p className="text-sm text-gray-400 mb-6">{t("successDetail")}</p>
        <Link href="/agents" className="text-purple-600 text-sm font-medium hover:underline">
          {t("backToMarketplace")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
      <p className="text-sm text-gray-500 mb-8">{t("intro")}</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              mode === "url" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("tabUrl")}
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              mode === "manual" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("tabManual")}
          </button>
        </div>

        {mode === "url" ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("cardUrlLabel")}</label>
            <input
              type="url"
              required
              value={form.cardUrl}
              onChange={(e) => setForm({ ...form, cardUrl: e.target.value })}
              className={inputClass}
              placeholder={t("cardUrlPlaceholder")}
            />
            <p className="text-xs text-gray-400 mt-1">{t("cardUrlHelp")}</p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("nameLabel")}</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("descriptionLabel")}</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("endpointLabel")}</label>
              <input
                type="url"
                required
                value={form.endpointUrl}
                onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })}
                className={inputClass}
                placeholder={t("endpointPlaceholder")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("protocolsLabel")}</label>
              <div className="flex gap-2">
                {PROTOCOL_OPTIONS.map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    onClick={() => toggleProtocol(p.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      protocols.includes(p.key)
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
                    }`}
                  >
                    {"labelKey" in p ? t(p.labelKey) : p.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Shared fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("categoryLabel")}</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className={`${inputClass} bg-white`}
            >
              <option value="">{t("uncategorized")}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("pricingLabel")}</label>
            <select
              value={form.pricingModel}
              onChange={(e) => setForm({ ...form, pricingModel: e.target.value })}
              className={`${inputClass} bg-white`}
            >
              {PRICING_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.pricingModel !== "FREE" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("unitPriceLabel")}
            </label>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={form.unitPriceUsd}
              onChange={(e) => setForm({ ...form, unitPriceUsd: e.target.value })}
              className={inputClass}
              placeholder={t("unitPricePlaceholder")}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("homepageLabel")} <span className="text-gray-400 font-normal">- {t("optional")}</span>
          </label>
          <input
            type="url"
            value={form.homepage}
            onChange={(e) => setForm({ ...form, homepage: e.target.value })}
            className={inputClass}
            placeholder={t("homepagePlaceholder")}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>
    </div>
  );
}
