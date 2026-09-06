"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  X,
  Star,
  Trash2,
  ExternalLink,
  Tag,
  Ban,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAsync, fetchJson } from "@/hooks/useAsync";
import { SCENARIOS, findScenario } from "@/lib/scenarios";

type AgentRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  kind: string;
  featured: boolean;
  pricingModel: string;
  reviewNote: string | null;
  endpointUrl: string | null;
  healthStatus: string | null;
  healthCheckedAt: string | null;
  category: { name: string } | null;
  publisher: { name: string | null; email: string | null } | null;
  scenarios: string[];
  _count: { skills: number };
};

type AgentsResponse = {
  agents: AgentRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const PAGE_SIZE = 20;

const FILTERS = ["PENDING", "APPROVED", "REJECTED", "DISABLED", "ALL"] as const;

const FILTER_LABEL_KEY: Record<
  (typeof FILTERS)[number],
  "filterPending" | "filterApproved" | "filterRejected" | "filterDisabled" | "filterAll"
> = {
  PENDING: "filterPending",
  APPROVED: "filterApproved",
  REJECTED: "filterRejected",
  DISABLED: "filterDisabled",
  ALL: "filterAll",
};

const STATUS_LABEL_KEY: Record<string, "filterPending" | "filterApproved" | "filterRejected" | "filterDisabled"> = {
  PENDING: "filterPending",
  APPROVED: "filterApproved",
  REJECTED: "filterRejected",
  DISABLED: "filterDisabled",
};

const statusBadge: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
  DISABLED: "bg-gray-200 text-gray-700",
};

// Health is written by the /api/cron/health probe (src/lib/health.ts) and only
// means anything for HOSTED agents — a PROJECT listing has no endpoint to probe.
const HEALTH_BADGE: Record<string, string> = {
  ok: "bg-green-50 text-green-700",
  degraded: "bg-amber-50 text-amber-700",
  down: "bg-red-50 text-red-700",
};

const HEALTH_LABEL_KEY: Record<string, "healthOk" | "healthDegraded" | "healthDown"> = {
  ok: "healthOk",
  degraded: "healthDegraded",
  down: "healthDown",
};

/** In-page dialog. Replaces the native prompt()/confirm() this screen used to call. */
function Modal({
  titleId,
  title,
  onClose,
  children,
  footer,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  // Callers pass a stable (useCallback'd) onClose, so the key listener is bound
  // once per open dialog rather than on every keystroke in it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5">
          <h2 id={titleId} className="text-lg font-semibold mb-2">
            {title}
          </h2>
          {children}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">{footer}</div>
      </div>
    </div>
  );
}

export default function AdminAgentsPage() {
  const t = useTranslations("Admin");
  const tScenario = useTranslations("Scenarios");

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("PENDING");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);

  /* moderation dialogs */
  const [rejectTarget, setRejectTarget] = useState<AgentRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [disableTarget, setDisableTarget] = useState<AgentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentRow | null>(null);

  const closeReject = useCallback(() => setRejectTarget(null), []);
  const closeDisable = useCallback(() => setDisableTarget(null), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);

  const { data, loading, error, reload } = useAsync(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filter !== "ALL") params.set("status", filter);
    return fetchJson<AgentsResponse>(`/api/admin/agents?${params}`);
  }, [filter, page]);

  const agents = data?.agents ?? [];
  const pagination = data?.pagination ?? { page, limit: PAGE_SIZE, total: 0, totalPages: 0 };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    try {
      await fetchJson(`/api/admin/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      reload();
    } catch {
      /* the row keeps its current values; the next reload reconciles */
    } finally {
      setBusy(null);
    }
  };

  const openEditor = (a: AgentRow) => {
    setEditingId(a.id);
    setDraft(a.scenarios);
  };
  const toggleDraft = (slug: string) =>
    setDraft((d) => (d.includes(slug) ? d.filter((x) => x !== slug) : [...d, slug]));
  const saveScenarios = async (id: string) => {
    await patch(id, { scenarios: draft });
    setEditingId(null);
  };

  const openReject = (a: AgentRow) => {
    setRejectTarget(a);
    setRejectNote(a.reviewNote ?? "");
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const note = rejectNote.trim();
    // Empty box clears any earlier note rather than leaving a stale reason behind.
    await patch(rejectTarget.id, { status: "REJECTED", reviewNote: note || null });
    setRejectTarget(null);
  };

  const confirmDisable = async () => {
    if (!disableTarget) return;
    await patch(disableTarget.id, { status: "DISABLED" });
    setDisableTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setBusy(id);
    try {
      await fetchJson(`/api/admin/agents/${id}`, { method: "DELETE" });
      setDeleteTarget(null);
      reload();
    } catch {
      /* leave the dialog open so the admin sees it did not happen */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("agentsTitle")}</h1>
        <p className="text-sm text-gray-600 mt-1">{t("agentsSubtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label={t("filterByStatus")}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
            aria-pressed={filter === f}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === f ? "bg-purple-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-purple-300"
            }`}
          >
            {t(FILTER_LABEL_KEY[f])}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-600">{t("loading")}</p>
      ) : error ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-600 mb-3">{t("somethingWentWrong")}</p>
          <button
            onClick={reload}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700"
          >
            {t("retry")}
          </button>
        </div>
      ) : agents.length === 0 ? (
        <p className="text-sm text-gray-600">{t("noAgentsInView")}</p>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => {
            const healthKey = a.healthStatus ? HEALTH_LABEL_KEY[a.healthStatus] : undefined;
            return (
              <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900 truncate">{a.name}</span>
                      {a.featured && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusBadge[a.status] || "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABEL_KEY[a.status] ? t(STATUS_LABEL_KEY[a.status]) : a.status}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                        {a.kind === "PROJECT" ? t("kindProject") : t("kindHosted")}
                      </span>
                      {a.kind !== "PROJECT" && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            (a.healthStatus && HEALTH_BADGE[a.healthStatus]) || "bg-gray-100 text-gray-700"
                          }`}
                          title={
                            a.healthCheckedAt
                              ? t("healthCheckedAt", { date: new Date(a.healthCheckedAt).toLocaleString() })
                              : t("healthNeverChecked")
                          }
                        >
                          {healthKey ? t(healthKey) : t("healthUnknown")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 truncate">
                      {a.publisher?.email || a.publisher?.name || t("unknownPublisher")} · {a.category?.name || t("uncategorized")} ·{" "}
                      {t("agentMetaSkills", { count: a._count.skills })} · {a.pricingModel}
                      {a.endpointUrl ? ` · ${a.endpointUrl}` : ""}
                    </p>
                    {a.scenarios.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {a.scenarios.map((slug) => {
                          const sc = findScenario(slug);
                          return sc ? (
                            <span
                              key={slug}
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700"
                            >
                              <span>{sc.emoji}</span>
                              {tScenario(slug)}
                            </span>
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-500 mt-1.5">{t("noScenarios")}</p>
                    )}
                    {a.reviewNote && <p className="text-xs text-red-600 mt-0.5">{t("reviewNoteLabel", { note: a.reviewNote })}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      href={`/agents/${a.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      aria-label={t("preview")}
                      title={t("preview")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => (editingId === a.id ? setEditingId(null) : openEditor(a))}
                      disabled={busy === a.id}
                      aria-label={t("editScenarios")}
                      aria-expanded={editingId === a.id}
                      title={t("editScenarios")}
                      className={`p-1.5 rounded-lg disabled:opacity-50 ${
                        editingId === a.id ? "bg-purple-100 text-purple-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      }`}
                    >
                      <Tag className="h-4 w-4" />
                    </button>
                    {a.status === "DISABLED" ? (
                      <button
                        onClick={() => patch(a.id, { status: "APPROVED" })}
                        disabled={busy === a.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> {t("actionEnable")}
                      </button>
                    ) : (
                      a.status !== "APPROVED" && (
                        <button
                          // Approving clears the rejection note so the publisher is
                          // not left looking at a reason that no longer applies.
                          onClick={() => patch(a.id, { status: "APPROVED", reviewNote: null })}
                          disabled={busy === a.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> {t("actionApprove")}
                        </button>
                      )
                    )}
                    {a.status === "APPROVED" && (
                      <button
                        onClick={() => setDisableTarget(a)}
                        disabled={busy === a.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                      >
                        <Ban className="h-3.5 w-3.5" /> {t("actionDisable")}
                      </button>
                    )}
                    {a.status !== "REJECTED" && (
                      <button
                        onClick={() => openReject(a)}
                        disabled={busy === a.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> {t("actionReject")}
                      </button>
                    )}
                    <button
                      onClick={() => patch(a.id, { featured: !a.featured })}
                      disabled={busy === a.id}
                      aria-label={a.featured ? t("unfeature") : t("feature")}
                      aria-pressed={a.featured}
                      title={a.featured ? t("unfeature") : t("feature")}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                    >
                      <Star className={`h-4 w-4 ${a.featured ? "text-amber-500 fill-amber-500" : ""}`} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(a)}
                      disabled={busy === a.id}
                      aria-label={t("delete")}
                      title={t("delete")}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {editingId === a.id && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-600 mb-2">{t("scenariosEditorHint")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SCENARIOS.map((s) => {
                        const on = draft.includes(s.slug);
                        return (
                          <button
                            key={s.slug}
                            onClick={() => toggleDraft(s.slug)}
                            aria-pressed={on}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition ${
                              on
                                ? "bg-purple-600 text-white border-purple-600"
                                : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
                            }`}
                          >
                            <span>{s.emoji}</span>
                            {t("scenarioOption", { name: tScenario(s.slug) })}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => saveScenarios(a.id)}
                        disabled={busy === a.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> {t("save")}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        disabled={busy === a.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                      >
                        {t("cancel")}
                      </button>
                      <span className="text-xs text-gray-600">{t("selectedCount", { count: draft.length })}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
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
              className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              aria-label={t("nextPage")}
              className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {rejectTarget && (
        <Modal
          titleId="reject-agent-title"
          title={t("rejectAgentTitle")}
          onClose={closeReject}
          footer={
            <>
              <button
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={confirmReject}
                disabled={busy === rejectTarget.id}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {busy === rejectTarget.id && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("actionReject")}
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-600 mb-3">{rejectTarget.name}</p>
          <label htmlFor="reject-note" className="block text-sm font-medium text-gray-700 mb-1">
            {t("rejectReasonLabel")}
          </label>
          <textarea
            id="reject-note"
            autoFocus
            rows={3}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder={t("rejectReasonPlaceholder")}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </Modal>
      )}

      {disableTarget && (
        <Modal
          titleId="disable-agent-title"
          title={t("disableAgentTitle")}
          onClose={closeDisable}
          footer={
            <>
              <button
                onClick={() => setDisableTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={confirmDisable}
                disabled={busy === disableTarget.id}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900 disabled:opacity-50"
              >
                {busy === disableTarget.id && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("actionDisable")}
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            {t.rich("disableAgentConfirm", {
              name: disableTarget.name,
              strong: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
            })}
          </p>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          titleId="delete-agent-title"
          title={t("deleteAgentTitle")}
          onClose={closeDelete}
          footer={
            <>
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={confirmDelete}
                disabled={busy === deleteTarget.id}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {busy === deleteTarget.id && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("delete")}
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            {t.rich("deleteAgentConfirmNamed", {
              name: deleteTarget.name,
              strong: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
            })}
          </p>
        </Modal>
      )}
    </div>
  );
}
