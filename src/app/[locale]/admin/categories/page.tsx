"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAsync, fetchJson } from "@/hooks/useAsync";
import {
  FolderTree,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  ArrowUpDown,
  Loader2,
  AlertTriangle,
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  skillCount: number;
  _count: { skills: number };
}

type SortDir = "asc" | "desc";

export default function AdminCategoriesPage() {
  const t = useTranslations("Admin");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIcon, setFormIcon] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const { data, loading, error, reload } = useAsync(
    () => fetchJson<Category[]>("/api/admin/categories"),
    []
  );
  const categories = data ?? [];

  const sorted = [...categories].sort((a, b) => {
    const aCount = a.skillCount ?? a._count?.skills ?? 0;
    const bCount = b.skillCount ?? b._count?.skills ?? 0;
    return sortDir === "desc" ? bCount - aCount : aCount - bCount;
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormIcon("");
    setFormError("");
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormDescription(cat.description ?? "");
    setFormIcon(cat.icon ?? "");
    setFormError("");
    setShowForm(true);
  }

  function startAdd() {
    resetForm();
    setShowForm(true);
  }

  async function handleSave() {
    const name = formName.trim();
    if (!name) {
      setFormError(t("nameRequired"));
      return;
    }

    setSaving(true);
    setFormError("");

    const body: Record<string, string> = { name };
    if (formDescription.trim()) body.description = formDescription.trim();
    if (formIcon.trim()) body.icon = formIcon.trim();

    try {
      const url = editingId
        ? `/api/admin/categories/${editingId}`
        : "/api/admin/categories";

      await fetchJson(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      resetForm();
      reload();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : t("saveCategoryFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteError("");
    try {
      await fetchJson(`/api/admin/categories/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      reload();
    } catch (e: unknown) {
      // Shown in the table row rather than through alert(): a native dialog steals
      // focus and cannot be read by the same screen reader flow as the table.
      setDeleteError(e instanceof Error ? e.message : t("deleteCategoryFailed"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 w-48 bg-gray-200 rounded-lg" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderTree className="h-6 w-6 text-purple-600" />
          {t("categoriesTitle")}
        </h1>
        <button
          onClick={startAdd}
          className="inline-flex items-center gap-1.5 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("addCategory")}
        </button>
      </div>

      {/* `error` is typed unknown by useAsync, so coerce before using it as a JSX guard. */}
      {!!error && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 text-center">
          <p className="text-sm text-gray-600 mb-3">{t("fetchCategoriesFailed")}</p>
          <button
            onClick={reload}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              {editingId ? t("editCategoryTitle") : t("newCategoryTitle")}
            </h2>
            <button
              onClick={resetForm}
              aria-label={t("close")}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="category-name" className="block text-xs font-medium text-gray-600 mb-1">
                {t("fieldName")} <span className="text-red-600">*</span>
              </label>
              <input
                id="category-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("categoryNamePlaceholder")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="category-icon" className="block text-xs font-medium text-gray-600 mb-1">
                {t("fieldIcon")}
              </label>
              <input
                id="category-icon"
                type="text"
                value={formIcon}
                onChange={(e) => setFormIcon(e.target.value)}
                placeholder={t("categoryIconPlaceholder")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="category-description" className="block text-xs font-medium text-gray-600 mb-1">
                {t("fieldDescription")}
              </label>
              <input
                id="category-description"
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t("categoryDescriptionPlaceholder")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {formError && (
            <p role="alert" className="mt-3 text-sm text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {formError}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {editingId ? t("update") : t("create")}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {deleteError && (
        <p role="alert" className="mb-3 text-sm text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          {deleteError}
        </p>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-start text-xs font-medium text-gray-600 uppercase tracking-wider">
              <th className="px-5 py-3">{t("colName")}</th>
              <th className="px-5 py-3">{t("colSlug")}</th>
              <th className="px-5 py-3" aria-sort={sortDir === "desc" ? "descending" : "ascending"}>
                {/* A real button, so the sort is reachable by keyboard. */}
                <button
                  type="button"
                  onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                  className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-purple-700 transition-colors"
                >
                  {t("colSkills")}
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </button>
              </th>
              <th className="px-5 py-3 hidden md:table-cell">{t("colDescription")}</th>
              <th className="px-5 py-3 text-end">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-gray-600"
                >
                  {t("noCategoriesFound")}
                </td>
              </tr>
            )}
            {sorted.map((cat) => {
              const count = cat.skillCount ?? cat._count?.skills ?? 0;
              return (
                <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">
                    <span className="inline-flex items-center gap-2">
                      {cat.icon && (
                        <span className="text-base">{cat.icon}</span>
                      )}
                      {cat.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 font-mono text-xs">
                    {cat.slug}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center justify-center bg-purple-50 text-purple-700 text-xs font-semibold rounded-full px-2.5 py-0.5 min-w-[2rem]">
                      {count}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 hidden md:table-cell max-w-xs truncate">
                    {cat.description ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-end">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => startEdit(cat)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                        aria-label={t("editCategoryNamed", { name: cat.name })}
                        title={t("edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>

                      {deleteConfirmId === cat.id ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <button
                            onClick={() => handleDelete(cat.id)}
                            disabled={deleting}
                            className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {deleting ? t("deleting") : t("confirm")}
                          </button>
                          <button
                            onClick={() => {
                              setDeleteConfirmId(null);
                              setDeleteError("");
                            }}
                            className="px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                          >
                            {t("cancel")}
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setDeleteConfirmId(cat.id);
                            setDeleteError("");
                          }}
                          disabled={count > 0}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label={t("deleteCategoryNamed", { name: cat.name })}
                          title={
                            count > 0
                              ? t("cannotDeleteHasSkills")
                              : t("delete")
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <p className="mt-4 text-xs text-gray-600 text-end">
        {t("categoriesTotal", { count: categories.length })}
      </p>
    </div>
  );
}
