"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/categories");
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data: Category[] = await res.json();
      setCategories(data);
    } catch {
      // silently fail, categories stay empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

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
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? t("saveCategoryFailed"));
      }

      resetForm();
      await fetchCategories();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : t("somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? t("deleteCategoryFailed"));
      }
      setDeleteConfirmId(null);
      await fetchCategories();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t("deleteFailed"));
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

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              {editingId ? t("editCategoryTitle") : t("newCategoryTitle")}
            </h2>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("fieldName")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("categoryNamePlaceholder")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("fieldIcon")}
              </label>
              <input
                type="text"
                value={formIcon}
                onChange={(e) => setFormIcon(e.target.value)}
                placeholder={t("categoryIconPlaceholder")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("fieldDescription")}
              </label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t("categoryDescriptionPlaceholder")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {formError && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-1">
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3">{t("colName")}</th>
              <th className="px-5 py-3">{t("colSlug")}</th>
              <th
                className="px-5 py-3 cursor-pointer select-none hover:text-purple-600 transition-colors"
                onClick={() =>
                  setSortDir((d) => (d === "desc" ? "asc" : "desc"))
                }
              >
                <span className="inline-flex items-center gap-1">
                  {t("colSkills")}
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </span>
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
                  className="px-5 py-10 text-center text-gray-400"
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
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                    {cat.slug}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center justify-center bg-purple-50 text-purple-700 text-xs font-semibold rounded-full px-2.5 py-0.5 min-w-[2rem]">
                      {count}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell max-w-xs truncate">
                    {cat.description ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-end">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => startEdit(cat)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
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
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            {t("cancel")}
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(cat.id)}
                          disabled={count > 0}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
      <p className="mt-4 text-xs text-gray-400 text-end">
        {t("categoriesTotal", { count: categories.length })}
      </p>
    </div>
  );
}
