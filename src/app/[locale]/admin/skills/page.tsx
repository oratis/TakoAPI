"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAsync, fetchJson } from "@/hooks/useAsync";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Star,
  X,
  Loader2,
} from "lucide-react";

/* ---------- types ---------- */

interface Category {
  name: string;
  slug: string;
}

interface Submitter {
  name: string | null;
  email: string | null;
}

interface Skill {
  id: string;
  name: string;
  slug: string;
  brief: string | null;
  description: string | null;
  author: string;
  status: string;
  featured: boolean;
  likesCount: number;
  viewsCount: number;
  downloads: number;
  createdAt: string;
  category: Category;
  submitter: Submitter | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/* ---------- helpers ---------- */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}

const STATUS_OPTIONS = ["all", "pending", "approved", "rejected"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

const STATUS_LABEL_KEY: Record<string, "statusApproved" | "statusPending" | "statusRejected"> = {
  approved: "statusApproved",
  pending: "statusPending",
  rejected: "statusRejected",
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    approved: "bg-green-50 text-green-700 border-green-200",
    pending: "bg-yellow-50 text-yellow-800 border-yellow-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  return map[status] ?? "bg-gray-50 text-gray-700 border-gray-200";
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

/** Escape closes whichever dialog is open. Pass null when none is. */
function useEscapeKey(onClose: (() => void) | null) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/* ---------- component ---------- */

export default function AdminSkillsPage() {
  const t = useTranslations("Admin");

  /* filter state */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);

  /* edit modal */
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    author: string;
    brief: string;
    status: string;
    featured: boolean;
  }>({ name: "", author: "", brief: "", status: "", featured: false });
  const [saving, setSaving] = useState(false);

  /* delete confirm */
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* batch action state */
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  const statusOptionLabel = (s: StatusFilter) => {
    if (s === "all") return t("allStatuses");
    if (s === "pending") return t("filterStatusPending");
    if (s === "approved") return t("filterStatusApproved");
    return t("filterStatusRejected");
  };

  /* ---------- debounced search ---------- */
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  /* ---------- data ---------- */
  const categoriesQuery = useAsync(
    () => fetchJson<Category[] | { categories: Category[] }>("/api/categories"),
    []
  );
  const categories = Array.isArray(categoriesQuery.data)
    ? categoriesQuery.data
    : categoriesQuery.data?.categories ?? [];

  const skillsQuery = useAsync(() => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (search.trim()) params.set("q", search.trim());
    return fetchJson<{ skills: Skill[]; pagination: Pagination }>(`/api/admin/skills?${params}`);
  }, [page, statusFilter, categoryFilter, search]);

  const skills = skillsQuery.data?.skills ?? [];
  const pagination: Pagination = skillsQuery.data?.pagination ?? { page, limit: 20, total: 0, totalPages: 1 };
  const loading = skillsQuery.loading;

  /* ---------- selection ---------- */
  // Tagged with the query it was made against instead of being reset from an
  // effect: changing a filter or page makes the stored selection stale, and stale
  // ids are simply not used. Same derived-freshness trick as useAsync.
  const queryKey = `${page}|${statusFilter}|${categoryFilter}|${search}`;
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<string> }>({
    key: queryKey,
    ids: EMPTY_SELECTION,
  });
  const selected = selection.key === queryKey ? selection.ids : EMPTY_SELECTION;

  const toggleOne = (id: string) => {
    setSelection((prev) => {
      const ids = new Set(prev.key === queryKey ? prev.ids : []);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { key: queryKey, ids };
    });
  };

  const toggleAll = () => {
    setSelection({
      key: queryKey,
      ids: selected.size === skills.length ? EMPTY_SELECTION : new Set(skills.map((s) => s.id)),
    });
  };

  const clearSelection = () => setSelection({ key: queryKey, ids: EMPTY_SELECTION });

  /* ---------- dialogs ---------- */
  const closeDialogs = useCallback(() => {
    setEditSkill(null);
    setDeleteTarget(null);
    setBatchDeleteOpen(false);
  }, []);
  const dialogOpen = !!editSkill || !!deleteTarget || batchDeleteOpen;
  useEscapeKey(dialogOpen ? closeDialogs : null);

  /* ---------- batch actions ---------- */
  const batchAction = async (action: "approve" | "reject" | "feature" | "delete") => {
    if (selected.size === 0) return;
    setBatchLoading(true);
    try {
      await fetchJson("/api/admin/skills/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: Array.from(selected) }),
      });
      clearSelection();
      setBatchDeleteOpen(false);
      skillsQuery.reload();
    } catch {
      /* silent */
    } finally {
      setBatchLoading(false);
    }
  };

  /* ---------- edit ---------- */
  const openEdit = (skill: Skill) => {
    setEditSkill(skill);
    setEditForm({
      name: skill.name,
      author: skill.author,
      brief: skill.brief ?? "",
      status: skill.status,
      featured: skill.featured,
    });
  };

  const saveEdit = async () => {
    if (!editSkill) return;
    setSaving(true);
    try {
      await fetchJson(`/api/admin/skills/${editSkill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      setEditSkill(null);
      skillsQuery.reload();
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  };

  /* ---------- delete ---------- */
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetchJson(`/api/admin/skills/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      skillsQuery.reload();
    } catch {
      /* silent */
    } finally {
      setDeleting(false);
    }
  };

  /* ---------- render ---------- */
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("skillsTitle")}</h1>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder={t("searchSkillsPlaceholder")}
            aria-label={t("searchSkillsPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full ps-9 pe-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          aria-label={t("fieldStatus")}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {statusOptionLabel(s)}
            </option>
          ))}
        </select>

        {/* Category filter */}
        <select
          value={categoryFilter}
          aria-label={t("colCategory")}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Batch actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <span className="text-sm font-medium text-purple-800">
            {t("selectedLabel", { count: selected.size })}
          </span>
          <div className="flex gap-2 ms-auto">
            <button
              onClick={() => batchAction("approve")}
              disabled={batchLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("batchApprove")}
            </button>
            <button
              onClick={() => batchAction("reject")}
              disabled={batchLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> {t("batchReject")}
            </button>
            <button
              onClick={() => batchAction("feature")}
              disabled={batchLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <Star className="h-3.5 w-3.5" /> {t("batchFeature")}
            </button>
            <button
              onClick={() => setBatchDeleteOpen(true)}
              disabled={batchLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("batchDelete")}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-start text-xs font-medium text-gray-600 uppercase tracking-wider">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={skills.length > 0 && selected.size === skills.length}
                    onChange={toggleAll}
                    aria-label={t("selectAllRows")}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                </th>
                <th className="px-4 py-3">{t("colName")}</th>
                <th className="px-4 py-3">{t("colAuthor")}</th>
                <th className="px-4 py-3">{t("colCategory")}</th>
                <th className="px-4 py-3">{t("colStatus")}</th>
                <th className="px-4 py-3 text-end">{t("colDownloads")}</th>
                <th className="px-4 py-3 text-end">{t("colLikes")}</th>
                <th className="px-4 py-3 text-end">{t("colViews")}</th>
                <th className="px-4 py-3">{t("colCreated")}</th>
                <th className="px-4 py-3 text-end">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-600">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    {t("loading")}
                  </td>
                </tr>
              ) : skillsQuery.error ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-600 mb-3">{t("somethingWentWrong")}</p>
                    <button
                      onClick={skillsQuery.reload}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700"
                    >
                      {t("retry")}
                    </button>
                  </td>
                </tr>
              ) : skills.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-600">
                    {t("noSkillsFound")}
                  </td>
                </tr>
              ) : (
                skills.map((skill) => (
                  <tr
                    key={skill.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      selected.has(skill.id) ? "bg-purple-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(skill.id)}
                        onChange={() => toggleOne(skill.id)}
                        aria-label={t("selectRow", { name: skill.name })}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate max-w-[200px]">
                          {skill.name}
                        </span>
                        {skill.featured && (
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        )}
                      </div>
                      {skill.brief && (
                        <p className="text-xs text-gray-600 truncate max-w-[200px] mt-0.5">
                          {skill.brief}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{skill.author}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                        {skill.category?.name ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize ${statusBadge(
                          skill.status
                        )}`}
                      >
                        {STATUS_LABEL_KEY[skill.status] ? t(STATUS_LABEL_KEY[skill.status]) : skill.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end text-gray-600 tabular-nums">
                      {formatNum(skill.downloads)}
                    </td>
                    <td className="px-4 py-3 text-end text-gray-600 tabular-nums">
                      {formatNum(skill.likesCount)}
                    </td>
                    <td className="px-4 py-3 text-end text-gray-600 tabular-nums">
                      {formatNum(skill.viewsCount)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(skill.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(skill)}
                          className="p-1.5 rounded-md text-gray-500 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                          aria-label={t("editSkillNamed", { name: skill.name })}
                          title={t("edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(skill)}
                          className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label={t("deleteSkillNamed", { name: skill.name })}
                          title={t("delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-600">
              {t("showingRange", {
                from: (pagination.page - 1) * pagination.limit + 1,
                to: Math.min(pagination.page * pagination.limit, pagination.total),
                total: pagination.total,
              })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label={t("prevPage")}
                className="p-1.5 rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (pagination.totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= pagination.totalPages - 3) {
                  pageNum = pagination.totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    aria-current={pageNum === page ? "page" : undefined}
                    className={`w-8 h-8 text-xs rounded-md border ${
                      pageNum === page
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                aria-label={t("nextPage")}
                className="p-1.5 rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========== Edit Modal ========== */}
      {editSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-skill-title"
            className="bg-white rounded-xl shadow-xl w-full max-w-lg"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 id="edit-skill-title" className="text-lg font-semibold">{t("editSkillTitle")}</h2>
              <button
                onClick={() => setEditSkill(null)}
                aria-label={t("close")}
                className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label htmlFor="edit-skill-name" className="block text-sm font-medium text-gray-700 mb-1">{t("fieldName")}</label>
                <input
                  id="edit-skill-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label htmlFor="edit-skill-author" className="block text-sm font-medium text-gray-700 mb-1">{t("fieldAuthor")}</label>
                <input
                  id="edit-skill-author"
                  type="text"
                  value={editForm.author}
                  onChange={(e) => setEditForm((f) => ({ ...f, author: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label htmlFor="edit-skill-brief" className="block text-sm font-medium text-gray-700 mb-1">{t("fieldBrief")}</label>
                <textarea
                  id="edit-skill-brief"
                  value={editForm.brief}
                  onChange={(e) => setEditForm((f) => ({ ...f, brief: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-skill-status" className="block text-sm font-medium text-gray-700 mb-1">{t("fieldStatus")}</label>
                  <select
                    id="edit-skill-status"
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    <option value="pending">{t("optionPending")}</option>
                    <option value="approved">{t("optionApproved")}</option>
                    <option value="rejected">{t("optionRejected")}</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.featured}
                      onChange={(e) => setEditForm((f) => ({ ...f, featured: e.target.checked }))}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    {t("fieldFeatured")}
                  </label>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setEditSkill(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("saveChanges")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Delete Confirmation Modal ========== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-skill-title"
            className="bg-white rounded-xl shadow-xl w-full max-w-sm"
          >
            <div className="px-6 py-5">
              <h2 id="delete-skill-title" className="text-lg font-semibold mb-2">{t("deleteSkillTitle")}</h2>
              <p className="text-sm text-gray-600">
                {t.rich("deleteSkillConfirm", {
                  name: deleteTarget.name,
                  strong: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
                })}
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Batch Delete Confirmation Modal ========== */}
      {batchDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-delete-title"
            className="bg-white rounded-xl shadow-xl w-full max-w-sm"
          >
            <div className="px-6 py-5">
              <h2 id="batch-delete-title" className="text-lg font-semibold mb-2">{t("batchDeleteTitle")}</h2>
              <p className="text-sm text-gray-600">{t("batchDeleteConfirm", { count: selected.size })}</p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setBatchDeleteOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => batchAction("delete")}
                disabled={batchLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {batchLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("batchDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
