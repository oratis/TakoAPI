"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Loader2, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useAsync, fetchJson } from "@/hooks/useAsync";
import type { Category } from "@/lib/types";
import { SignInPrompt } from "@/components/SignInPrompt";

// Inputs that can carry an error message. The API's `details[]` paths do not map
// one-to-one onto them — the single "Brief" input feeds both `brief` and
// `description`, and one URL input stands in for whichever source field is
// selected — so paths are aliased onto the input the publisher can actually see.
// Anything left over goes to the summary bar rather than being dropped.
const FORM_FIELDS: readonly string[] = ["name", "brief", "sourceUrl", "categoryId"];
const FIELD_ALIASES: Record<string, string> = {
  description: "brief",
  githubUrl: "sourceUrl",
  clawSkillsUrl: "sourceUrl",
};

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none";
const errorInputClass = "border-red-400 focus:border-red-400 focus:ring-red-100";

type FieldDetail = { path: string; message: string };
type ApiFailure = { message: string; details: FieldDetail[] };

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

export default function SubmitPage() {
  const { data: session, status } = useSession();
  const t = useTranslations("Submit");
  const router = useRouter();
  const [urlType, setUrlType] = useState<"github" | "clawskills">("github");
  const [form, setForm] = useState({
    name: "",
    brief: "",
    description: "",
    whatItDoes: "",
    exampleWorkflow: "",
    requirements: "",
    githubUrl: "",
    clawSkillsUrl: "",
    categoryId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillDone, setAutoFillDone] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const clearErrors = () => {
    setError("");
    setFieldErrors({});
  };

  const showFailure = (failure: ApiFailure) => {
    const next: Record<string, string> = {};
    const unplaceable: string[] = [];
    for (const detail of failure.details) {
      const field = FIELD_ALIASES[detail.path] ?? detail.path;
      if (FORM_FIELDS.includes(field)) {
        if (!(field in next)) next[field] = detail.message;
      } else {
        unplaceable.push(detail.message);
      }
    }
    setFieldErrors(next);
    // The bar is only for what has no input to sit beside — a rate limit, a 500,
    // or a detail about a field this form does not render.
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

  const handleAutoFill = async () => {
    const url = urlType === "github" ? form.githubUrl : form.clawSkillsUrl;
    if (!url) {
      setError("");
      setFieldErrors({ sourceUrl: t("enterUrlFirst") });
      return;
    }

    clearErrors();
    setAutoFilling(true);
    setAutoFillDone(false);

    const res = await postApi<{
      name?: string;
      brief?: string;
      whatItDoes?: string;
      exampleWorkflow?: string;
      requirements?: string;
    }>("/api/skills/auto-fill", { url }, t("autoFillFailed"));
    setAutoFilling(false);

    if (!res.ok) {
      // Auto-fill only ever fails because of the URL, so the message belongs on
      // that input rather than in a bar the user has to hunt for.
      setFieldErrors({ sourceUrl: res.message });
      return;
    }

    const data = res.data;
    setForm((prev) => ({
      ...prev,
      name: data.name || prev.name,
      brief: data.brief || prev.brief,
      description: data.brief || prev.description,
      whatItDoes: data.whatItDoes || prev.whatItDoes,
      exampleWorkflow: data.exampleWorkflow || prev.exampleWorkflow,
      requirements: data.requirements || prev.requirements,
    }));

    // Show advanced fields if we got data for them
    if (data.whatItDoes || data.exampleWorkflow || data.requirements) {
      setShowAdvanced(true);
    }

    setAutoFillDone(true);
    setTimeout(() => setAutoFillDone(false), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    setSubmitting(true);

    // Build readme from detail fields
    const readmeParts: string[] = [];
    if (form.whatItDoes) readmeParts.push("## What This Skill Does\n\n" + form.whatItDoes);
    if (form.exampleWorkflow) readmeParts.push("## Example Workflow\n\n" + form.exampleWorkflow);
    if (form.requirements) readmeParts.push("## Requirements\n\n" + form.requirements);

    const body: Record<string, string | null> = {
      name: form.name,
      brief: form.brief || form.description,
      description: form.description,
      readme: readmeParts.length > 0 ? readmeParts.join("\n\n") : null,
      categoryId: form.categoryId,
    };

    if (urlType === "github") {
      body.githubUrl = form.githubUrl;
    } else {
      body.clawSkillsUrl = form.clawSkillsUrl;
    }

    const res = await postApi<{ name: string; slug: string; status: string }>(
      "/api/skills/submit",
      body,
      t("somethingWentWrong")
    );
    setSubmitting(false);
    if (!res.ok) {
      showFailure(res);
      return;
    }
    // A pending skill exists but is invisible to everyone else, so sending the
    // publisher to its page would look like nothing happened. Say what is next.
    if (res.data.status === "APPROVED") {
      router.push(`/skills/${res.data.slug}`);
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
            href={{ pathname: "/profile", query: { tab: "skills" } }}
            className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
          >
            {t("viewMyListings")}
          </Link>
          <Link href="/skills" className="text-purple-600 text-sm font-medium hover:underline">
            {t("backToSkills")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
      <p className="text-sm text-gray-500 mb-8">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* URL Type Toggle + Auto-fill */}
        <div>
          <label htmlFor="sourceUrl" className="block text-sm font-medium text-gray-700 mb-2">
            {t("skillSource")}
          </label>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              aria-pressed={urlType === "github"}
              onClick={() => {
                // The error was about the other source's URL.
                clearErrors();
                setUrlType("github");
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                urlType === "github"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t("githubUrl")}
            </button>
            <button
              type="button"
              aria-pressed={urlType === "clawskills"}
              onClick={() => {
                clearErrors();
                setUrlType("clawskills");
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                urlType === "clawskills"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t("clawSkillsUrl")}
            </button>
          </div>

          <div className="flex gap-2">
            {urlType === "github" ? (
              <input
                id="sourceUrl"
                type="url"
                required
                value={form.githubUrl}
                onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
                className={`${fieldClass("sourceUrl")} flex-1`}
                placeholder={t("githubUrlPlaceholder")}
                aria-invalid={fieldErrors.sourceUrl ? true : undefined}
                aria-describedby={describedBy("sourceUrl")}
              />
            ) : (
              <input
                id="sourceUrl"
                type="url"
                required
                value={form.clawSkillsUrl}
                onChange={(e) => setForm({ ...form, clawSkillsUrl: e.target.value })}
                className={`${fieldClass("sourceUrl")} flex-1`}
                placeholder={t("clawSkillsUrlPlaceholder")}
                aria-invalid={fieldErrors.sourceUrl ? true : undefined}
                aria-describedby={describedBy("sourceUrl")}
              />
            )}
            <button
              type="button"
              onClick={handleAutoFill}
              disabled={autoFilling}
              className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                autoFillDone
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100"
              } disabled:opacity-50`}
            >
              {autoFilling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("fetching")}
                </>
              ) : autoFillDone ? (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {t("filled")}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {t("autoFill")}
                </>
              )}
            </button>
          </div>
          {fieldErrors.sourceUrl ? (
            <p id="sourceUrl-error" role="alert" className="text-sm text-red-600 mt-1">
              {fieldErrors.sourceUrl}
            </p>
          ) : null}
        </div>

        {/* Skill Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            {t("skillName")}
          </label>
          <input
            id="name"
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={fieldClass("name")}
            placeholder={t("skillNamePlaceholder")}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={describedBy("name")}
          />
          {fieldErrors.name ? (
            <p id="name-error" role="alert" className="text-sm text-red-600 mt-1">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        {/* Category */}
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700 mb-1">
            {t("category")}
          </label>
          <select
            id="categoryId"
            required
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className={`${fieldClass("categoryId")} bg-white`}
            aria-invalid={fieldErrors.categoryId ? true : undefined}
            aria-describedby={describedBy("categoryId")}
          >
            <option value="">{t("selectCategory")}</option>
            {(categories ?? []).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {t("categoryOption", { name: cat.name, count: cat.skillCount })}
              </option>
            ))}
          </select>
          {fieldErrors.categoryId ? (
            <p id="categoryId-error" role="alert" className="text-sm text-red-600 mt-1">
              {fieldErrors.categoryId}
            </p>
          ) : null}
        </div>

        {/* Brief */}
        <div>
          <label htmlFor="brief" className="block text-sm font-medium text-gray-700 mb-1">
            {t("brief")}
            <span className="text-gray-500 font-normal ms-1">{t("briefHelper")}</span>
          </label>
          <input
            id="brief"
            type="text"
            required
            value={form.brief || form.description}
            onChange={(e) => setForm({ ...form, brief: e.target.value, description: e.target.value })}
            className={fieldClass("brief")}
            placeholder={t("briefPlaceholder")}
            aria-invalid={fieldErrors.brief ? true : undefined}
            aria-describedby={describedBy("brief")}
          />
          {fieldErrors.brief ? (
            <p id="brief-error" role="alert" className="text-sm text-red-600 mt-1">
              {fieldErrors.brief}
            </p>
          ) : null}
        </div>

        {/* Advanced Detail Fields */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
            aria-controls="skill-details"
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-start"
          >
            <span className="text-sm font-medium text-gray-700">
              {t("skillDetails")}
              <span className="text-gray-500 font-normal ms-1">{t("skillDetailsHelper")}</span>
            </span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 text-gray-500" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
            )}
          </button>

          <div id="skill-details" hidden={!showAdvanced}>
            <div className="p-4 space-y-4 border-t border-gray-200">
              {/* What This Skill Does */}
              <div>
                <label htmlFor="whatItDoes" className="block text-sm font-medium text-gray-700 mb-1">
                  {t("whatItDoes")}
                </label>
                <textarea
                  id="whatItDoes"
                  value={form.whatItDoes}
                  onChange={(e) => setForm({ ...form, whatItDoes: e.target.value })}
                  rows={4}
                  className={`${inputClass} resize-none`}
                  placeholder={t("whatItDoesPlaceholder")}
                />
              </div>

              {/* Example Workflow */}
              <div>
                <label
                  htmlFor="exampleWorkflow"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t("exampleWorkflow")}
                  <span className="text-gray-500 font-normal ms-1">
                    {t("exampleWorkflowHelper")}
                  </span>
                </label>
                <textarea
                  id="exampleWorkflow"
                  value={form.exampleWorkflow}
                  onChange={(e) => setForm({ ...form, exampleWorkflow: e.target.value })}
                  rows={6}
                  className={`${inputClass} resize-none font-mono text-xs`}
                  placeholder={t("exampleWorkflowPlaceholder")}
                />
              </div>

              {/* Requirements */}
              <div>
                <label
                  htmlFor="requirements"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t("requirements")}
                </label>
                <textarea
                  id="requirements"
                  value={form.requirements}
                  onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder={t("requirementsPlaceholder")}
                />
              </div>
            </div>
          </div>
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
          {submitting ? t("submitting") : t("submitSkill")}
        </button>
      </form>
    </div>
  );
}
