"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAsync, fetchJson } from "@/hooks/useAsync";
import type { Category } from "@/lib/types";
import { SignInPrompt } from "@/components/SignInPrompt";

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

// Which inputs exist per mode. A `details[]` entry whose path is in the list gets
// rendered against that input; anything else falls back to the summary bar, so a
// message can never land on a field the current mode does not show.
const SHARED_FIELDS: readonly string[] = ["categoryId", "pricingModel", "unitPriceUsd", "homepage"];
const URL_MODE_FIELDS: readonly string[] = ["cardUrl", ...SHARED_FIELDS];
const MANUAL_MODE_FIELDS: readonly string[] = [
  "name",
  "description",
  "endpointUrl",
  "protocols",
  ...SHARED_FIELDS,
];

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none";
const errorInputClass = "border-red-400 focus:border-red-400 focus:ring-red-100";

type FieldDetail = { path: string; message: string };
type ApiFailure = { message: string; details: FieldDetail[] };

type CardPreview = {
  name: string;
  description: string;
  cardUrl: string;
  endpointUrl: string;
  streaming: boolean;
  pushNotify: boolean;
  skills: { name: string }[];
};

// Not `fetchJson`: that collapses an error body down to its message, and the whole
// point here is the `details: [{ path, message }]` array our APIs return for a zod
// failure (see lib/api.ts `parseJson`) — one message per input that caused it.
// Never rejects; a transport failure comes back as a normal failure result.
async function postApi<T>(
  url: string,
  body: unknown,
  fallbackMessage: string
): Promise<{ ok: true; data: T } | ({ ok: false } & ApiFailure)> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: fallbackMessage, details: [] };
  }
  let payload: { error?: string; details?: FieldDetail[] } | null = null;
  try {
    payload = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (res.ok) return { ok: true, data: payload as T };
  return {
    ok: false,
    message: payload?.error || fallbackMessage,
    details: Array.isArray(payload?.details) ? payload.details : [],
  };
}

export default function SubmitAgentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations("SubmitAgent");
  const [mode, setMode] = useState<"url" | "manual">("url");
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
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<CardPreview | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<null | { name: string }>(null);

  const { data: categories } = useAsync(
    () => fetchJson<Category[]>("/api/categories"),
    [],
    !!session
  );

  if (status === "loading") return null;
  if (!session) {
    return <SignInPrompt title={t("title")} description={t("signInPrompt")} />;
  }

  const toggleProtocol = (p: string) =>
    setProtocols((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const clearErrors = () => {
    setError("");
    setFieldErrors({});
  };

  const showFailure = (failure: ApiFailure, fields: readonly string[]) => {
    const next: Record<string, string> = {};
    const unplaceable: string[] = [];
    for (const detail of failure.details) {
      if (fields.includes(detail.path)) {
        if (!(detail.path in next)) next[detail.path] = detail.message;
      } else {
        unplaceable.push(detail.message);
      }
    }
    setFieldErrors(next);
    // The bar is only for what has no input to sit beside — a rate limit, a 500,
    // or a detail about a field this mode does not render.
    setError(
      unplaceable.length
        ? unplaceable.join(" ")
        : Object.keys(next).length
          ? ""
          : failure.message
    );
  };

  // `aria-describedby` for an input: its help text, plus its error when it has one.
  const describedBy = (field: string, ...ids: string[]) =>
    [...ids, fieldErrors[field] ? `${field}-error` : ""].filter(Boolean).join(" ") || undefined;

  const fieldClass = (field: string) =>
    `${inputClass} ${fieldErrors[field] ? errorInputClass : ""}`;

  const handleCheckCard = async () => {
    const cardUrl = form.cardUrl.trim();
    if (!cardUrl) {
      setError("");
      setFieldErrors({ cardUrl: t("enterCardUrlFirst") });
      return;
    }
    clearErrors();
    setPreview(null);
    setChecking(true);
    const res = await postApi<CardPreview>(
      "/api/agents/validate-card",
      { cardUrl },
      t("somethingWentWrong")
    );
    setChecking(false);
    if (res.ok) setPreview(res.data);
    else showFailure(res, URL_MODE_FIELDS);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    setSubmitting(true);

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

    const res = await postApi<{ name: string; status: string; slug: string }>(
      "/api/agents/submit",
      body,
      t("somethingWentWrong")
    );
    setSubmitting(false);
    if (!res.ok) {
      showFailure(res, mode === "url" ? URL_MODE_FIELDS : MANUAL_MODE_FIELDS);
      return;
    }
    if (res.data.status === "APPROVED") {
      router.push(`/agents/${res.data.slug}`);
    } else {
      setDone({ name: res.data.name });
    }
  };

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">{t("successTitle")}</h1>
        <p className="text-gray-600 mb-6">
          {t.rich("pendingReview", {
            name: done.name,
            b: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-start mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">{t("nextStepsTitle")}</p>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal ms-4">
            <li>{t("nextStepReview")}</li>
            <li>{t("nextStepEmail")}</li>
            <li>{t("nextStepProfile")}</li>
          </ol>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Link
            href={{ pathname: "/profile", query: { tab: "agents" } }}
            className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
          >
            {t("viewMyListings")}
          </Link>
          <Link href="/agents" className="text-purple-600 text-sm font-medium hover:underline">
            {t("backToMarketplace")}
          </Link>
        </div>
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
            aria-pressed={mode === "url"}
            onClick={() => {
              // Errors belong to the inputs of the mode that produced them.
              clearErrors();
              setMode("url");
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              mode === "url" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("tabUrl")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "manual"}
            onClick={() => {
              clearErrors();
              setMode("manual");
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              mode === "manual" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("tabManual")}
          </button>
        </div>

        {mode === "url" ? (
          <div>
            <label htmlFor="cardUrl" className="block text-sm font-medium text-gray-700 mb-1">
              {t("cardUrlLabel")}
            </label>
            <div className="flex gap-2">
              <input
                id="cardUrl"
                type="url"
                required
                value={form.cardUrl}
                onChange={(e) => {
                  // Any edit invalidates the preview — it describes the URL that
                  // was checked, not the one now in the box.
                  setPreview(null);
                  setForm({ ...form, cardUrl: e.target.value });
                }}
                className={`${fieldClass("cardUrl")} flex-1`}
                placeholder={t("cardUrlPlaceholder")}
                aria-invalid={fieldErrors.cardUrl ? true : undefined}
                aria-describedby={describedBy("cardUrl", "cardUrl-help")}
              />
              <button
                type="button"
                onClick={handleCheckCard}
                disabled={checking}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 disabled:opacity-50 transition-colors"
              >
                {checking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {t("checking")}
                  </>
                ) : (
                  t("checkCard")
                )}
              </button>
            </div>
            {fieldErrors.cardUrl ? (
              <p id="cardUrl-error" role="alert" className="text-sm text-red-600 mt-1">
                {fieldErrors.cardUrl}
              </p>
            ) : null}
            <p id="cardUrl-help" className="text-xs text-gray-500 mt-1">
              {t("cardUrlHelp")}
            </p>

            {/* Live region so the result of "Check card" is announced, not just drawn. */}
            <div aria-live="polite">
              {preview ? (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="inline-flex items-center gap-1.5 text-sm font-medium text-green-800">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {t("previewTitle")}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{preview.name}</p>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {preview.description || t("previewNoDescription")}
                  </p>
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex gap-2">
                      <dt className="text-gray-500 shrink-0">{t("previewEndpoint")}</dt>
                      <dd className="text-gray-700 font-mono break-all">{preview.endpointUrl}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-gray-500 shrink-0">{t("previewCapabilities")}</dt>
                      <dd className="text-gray-700">
                        {t("previewSkillCount", { count: preview.skills.length })}
                        {/* A card may advertise up to 200 skills; name enough to
                            recognise the agent and let the count carry the rest. */}
                        {preview.skills.length > 0
                          ? ` — ${preview.skills
                              .slice(0, 6)
                              .map((s) => s.name)
                              .join(", ")}${preview.skills.length > 6 ? "…" : ""}`
                          : ""}
                      </dd>
                    </div>
                    {preview.streaming || preview.pushNotify ? (
                      <div className="flex gap-2">
                        <dt className="text-gray-500 shrink-0">{t("previewSupports")}</dt>
                        <dd className="text-gray-700">
                          {[
                            preview.streaming ? t("previewStreaming") : "",
                            preview.pushNotify ? t("previewPush") : "",
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <p className="mt-3 text-xs text-gray-500">{t("previewHint")}</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                {t("nameLabel")}
              </label>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={fieldClass("name")}
                placeholder={t("namePlaceholder")}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={describedBy("name")}
              />
              {fieldErrors.name ? (
                <p id="name-error" role="alert" className="text-sm text-red-600 mt-1">
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                {t("descriptionLabel")}
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className={`${fieldClass("description")} resize-none`}
                placeholder={t("descriptionPlaceholder")}
                aria-invalid={fieldErrors.description ? true : undefined}
                aria-describedby={describedBy("description")}
              />
              {fieldErrors.description ? (
                <p id="description-error" role="alert" className="text-sm text-red-600 mt-1">
                  {fieldErrors.description}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="endpointUrl" className="block text-sm font-medium text-gray-700 mb-1">
                {t("endpointLabel")}
              </label>
              <input
                id="endpointUrl"
                type="url"
                required
                value={form.endpointUrl}
                onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })}
                className={fieldClass("endpointUrl")}
                placeholder={t("endpointPlaceholder")}
                aria-invalid={fieldErrors.endpointUrl ? true : undefined}
                aria-describedby={describedBy("endpointUrl")}
              />
              {fieldErrors.endpointUrl ? (
                <p id="endpointUrl-error" role="alert" className="text-sm text-red-600 mt-1">
                  {fieldErrors.endpointUrl}
                </p>
              ) : null}
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">
                {t("protocolsLabel")}
              </span>
              <div className="flex gap-2">
                {PROTOCOL_OPTIONS.map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    aria-pressed={protocols.includes(p.key)}
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
              {fieldErrors.protocols ? (
                <p role="alert" className="text-sm text-red-600 mt-1">
                  {fieldErrors.protocols}
                </p>
              ) : null}
            </div>
          </>
        )}

        {/* Shared fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700 mb-1">
              {t("categoryLabel")}
            </label>
            <select
              id="categoryId"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className={`${fieldClass("categoryId")} bg-white`}
              aria-invalid={fieldErrors.categoryId ? true : undefined}
              aria-describedby={describedBy("categoryId")}
            >
              <option value="">{t("uncategorized")}</option>
              {(categories ?? []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId ? (
              <p id="categoryId-error" role="alert" className="text-sm text-red-600 mt-1">
                {fieldErrors.categoryId}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="pricingModel" className="block text-sm font-medium text-gray-700 mb-1">
              {t("pricingLabel")}
            </label>
            <select
              id="pricingModel"
              value={form.pricingModel}
              onChange={(e) => setForm({ ...form, pricingModel: e.target.value })}
              className={`${fieldClass("pricingModel")} bg-white`}
              aria-invalid={fieldErrors.pricingModel ? true : undefined}
              aria-describedby={describedBy("pricingModel")}
            >
              {PRICING_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
            {fieldErrors.pricingModel ? (
              <p id="pricingModel-error" role="alert" className="text-sm text-red-600 mt-1">
                {fieldErrors.pricingModel}
              </p>
            ) : null}
          </div>
        </div>

        {form.pricingModel !== "FREE" && (
          <div>
            <label htmlFor="unitPriceUsd" className="block text-sm font-medium text-gray-700 mb-1">
              {t("unitPriceLabel")}
            </label>
            <input
              id="unitPriceUsd"
              type="number"
              step="0.000001"
              min="0"
              value={form.unitPriceUsd}
              onChange={(e) => setForm({ ...form, unitPriceUsd: e.target.value })}
              className={fieldClass("unitPriceUsd")}
              placeholder={t("unitPricePlaceholder")}
              aria-invalid={fieldErrors.unitPriceUsd ? true : undefined}
              aria-describedby={describedBy("unitPriceUsd")}
            />
            {fieldErrors.unitPriceUsd ? (
              <p id="unitPriceUsd-error" role="alert" className="text-sm text-red-600 mt-1">
                {fieldErrors.unitPriceUsd}
              </p>
            ) : null}
          </div>
        )}

        <div>
          <label htmlFor="homepage" className="block text-sm font-medium text-gray-700 mb-1">
            {t("homepageLabel")} <span className="text-gray-500 font-normal">- {t("optional")}</span>
          </label>
          <input
            id="homepage"
            type="url"
            value={form.homepage}
            onChange={(e) => setForm({ ...form, homepage: e.target.value })}
            className={fieldClass("homepage")}
            placeholder={t("homepagePlaceholder")}
            aria-invalid={fieldErrors.homepage ? true : undefined}
            aria-describedby={describedBy("homepage")}
          />
          {fieldErrors.homepage ? (
            <p id="homepage-error" role="alert" className="text-sm text-red-600 mt-1">
              {fieldErrors.homepage}
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        ) : null}

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
