"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { Loader2, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import type { Category } from "@/lib/types";

export default function SubmitPage() {
  const { data: session, status } = useSession();
  const t = useTranslations("Submit");
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
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

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
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

  const handleAutoFill = async () => {
    const url = urlType === "github" ? form.githubUrl : form.clawSkillsUrl;
    if (!url) {
      setError(t("enterUrlFirst"));
      return;
    }

    setError("");
    setAutoFilling(true);
    setAutoFillDone(false);

    try {
      const res = await fetch("/api/skills/auto-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("autoFillFailed"));
      }

      const data = await res.json();

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("autoFillFailed"));
    } finally {
      setAutoFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
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

      const res = await fetch("/api/skills/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("submitFailed"));
      }

      const skill = await res.json();
      router.push(`/skills/${skill.slug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none";

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
      <p className="text-sm text-gray-500 mb-8">
        {t("subtitle")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* URL Type Toggle + Auto-fill */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("skillSource")}
          </label>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setUrlType("github")}
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
              onClick={() => setUrlType("clawskills")}
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
                type="url"
                required
                value={form.githubUrl}
                onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
                className={`${inputClass} flex-1`}
                placeholder={t("githubUrlPlaceholder")}
              />
            ) : (
              <input
                type="url"
                required
                value={form.clawSkillsUrl}
                onChange={(e) => setForm({ ...form, clawSkillsUrl: e.target.value })}
                className={`${inputClass} flex-1`}
                placeholder={t("clawSkillsUrlPlaceholder")}
              />
            )}
            <button
              type="button"
              onClick={handleAutoFill}
              disabled={autoFilling}
              className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                autoFillDone
                  ? "bg-green-50 text-green-600 border border-green-200"
                  : "bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100"
              } disabled:opacity-50`}
            >
              {autoFilling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("fetching")}
                </>
              ) : autoFillDone ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t("filled")}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t("autoFill")}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Skill Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("skillName")}
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
            placeholder={t("skillNamePlaceholder")}
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("category")}
          </label>
          <select
            required
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className={`${inputClass} bg-white`}
          >
            <option value="">{t("selectCategory")}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {t("categoryOption", { name: cat.name, count: cat.skillCount })}
              </option>
            ))}
          </select>
        </div>

        {/* Brief */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("brief")}
            <span className="text-gray-400 font-normal ms-1">{t("briefHelper")}</span>
          </label>
          <input
            type="text"
            required
            value={form.brief || form.description}
            onChange={(e) => setForm({ ...form, brief: e.target.value, description: e.target.value })}
            className={inputClass}
            placeholder={t("briefPlaceholder")}
          />
        </div>

        {/* Advanced Detail Fields */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-start"
          >
            <span className="text-sm font-medium text-gray-700">
              {t("skillDetails")}
              <span className="text-gray-400 font-normal ms-1">{t("skillDetailsHelper")}</span>
            </span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {showAdvanced && (
            <div className="p-4 space-y-4 border-t border-gray-200">
              {/* What This Skill Does */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("whatItDoes")}
                </label>
                <textarea
                  value={form.whatItDoes}
                  onChange={(e) => setForm({ ...form, whatItDoes: e.target.value })}
                  rows={4}
                  className={`${inputClass} resize-none`}
                  placeholder={t("whatItDoesPlaceholder")}
                />
              </div>

              {/* Example Workflow */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("exampleWorkflow")}
                  <span className="text-gray-400 font-normal ms-1">
                    {t("exampleWorkflowHelper")}
                  </span>
                </label>
                <textarea
                  value={form.exampleWorkflow}
                  onChange={(e) => setForm({ ...form, exampleWorkflow: e.target.value })}
                  rows={6}
                  className={`${inputClass} resize-none font-mono text-xs`}
                  placeholder={t("exampleWorkflowPlaceholder")}
                />
              </div>

              {/* Requirements */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("requirements")}
                </label>
                <textarea
                  value={form.requirements}
                  onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder={t("requirementsPlaceholder")}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

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
