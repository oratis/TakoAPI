"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, Star, Trash2, ExternalLink, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { SCENARIOS, findScenario } from "@/lib/scenarios";

type AgentRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  featured: boolean;
  pricingModel: string;
  reviewNote: string | null;
  endpointUrl: string;
  category: { name: string } | null;
  publisher: { name: string | null; email: string | null } | null;
  scenarios: string[];
  _count: { skills: number };
};

const FILTERS = ["PENDING", "APPROVED", "REJECTED", "ALL"] as const;

const FILTER_LABEL_KEY: Record<(typeof FILTERS)[number], "filterPending" | "filterApproved" | "filterRejected" | "filterAll"> = {
  PENDING: "filterPending",
  APPROVED: "filterApproved",
  REJECTED: "filterRejected",
  ALL: "filterAll",
};

const STATUS_LABEL_KEY: Record<string, "filterPending" | "filterApproved" | "filterRejected"> = {
  PENDING: "filterPending",
  APPROVED: "filterApproved",
  REJECTED: "filterRejected",
};

const statusBadge: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
  DISABLED: "bg-gray-100 text-gray-500",
};

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [filter, setFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const t = useTranslations("Admin");
  const tScenario = useTranslations("Scenarios");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter === "ALL" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/admin/agents${qs}`);
    const data = await res.json();
    setAgents(data.agents || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    await fetch(`/api/admin/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setBusy(null);
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

  const reject = async (id: string) => {
    const note = prompt(t("rejectReasonPrompt")) ?? undefined;
    await patch(id, { status: "REJECTED", reviewNote: note });
  };

  const remove = async (id: string) => {
    if (!confirm(t("deleteAgentConfirm"))) return;
    setBusy(id);
    await fetch(`/api/admin/agents/${id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("agentsTitle")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("agentsSubtitle")}</p>
      </div>

      <div className="flex gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === f ? "bg-purple-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-purple-300"
            }`}
          >
            {t(FILTER_LABEL_KEY[f])}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t("loading")}</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noAgentsInView")}</p>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900 truncate">{a.name}</span>
                    {a.featured && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusBadge[a.status] || "bg-gray-100"}`}>
                      {STATUS_LABEL_KEY[a.status] ? t(STATUS_LABEL_KEY[a.status]) : a.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {a.publisher?.email || a.publisher?.name || t("unknownPublisher")} · {a.category?.name || t("uncategorized")} ·{" "}
                    {t("agentMetaSkills", { count: a._count.skills })} · {a.pricingModel} · {a.endpointUrl}
                  </p>
                  {a.scenarios.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {a.scenarios.map((slug) => {
                        const sc = findScenario(slug);
                        return sc ? (
                          <span
                            key={slug}
                            title={`${sc.nameZh} · ${sc.name}`}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600"
                          >
                            <span>{sc.emoji}</span>
                            {tScenario(slug)}
                          </span>
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-300 mt-1.5">{t("noScenarios")}</p>
                  )}
                  {a.reviewNote && <p className="text-xs text-red-500 mt-0.5">{t("reviewNoteLabel", { note: a.reviewNote })}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`/agents/${a.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                    title={t("preview")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => (editingId === a.id ? setEditingId(null) : openEditor(a))}
                    disabled={busy === a.id}
                    className={`p-1.5 rounded-lg disabled:opacity-50 ${
                      editingId === a.id ? "bg-purple-100 text-purple-600" : "text-gray-400 hover:bg-gray-100"
                    }`}
                    title={t("editScenarios")}
                  >
                    <Tag className="h-4 w-4" />
                  </button>
                  {a.status !== "APPROVED" && (
                    <button
                      onClick={() => patch(a.id, { status: "APPROVED" })}
                      disabled={busy === a.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> {t("actionApprove")}
                    </button>
                  )}
                  {a.status !== "REJECTED" && (
                    <button
                      onClick={() => reject(a.id)}
                      disabled={busy === a.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> {t("actionReject")}
                    </button>
                  )}
                  <button
                    onClick={() => patch(a.id, { featured: !a.featured })}
                    disabled={busy === a.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50"
                    title={a.featured ? t("unfeature") : t("feature")}
                  >
                    <Star className={`h-4 w-4 ${a.featured ? "text-amber-500 fill-amber-500" : ""}`} />
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    disabled={busy === a.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    title={t("delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {editingId === a.id && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-400 mb-2">{t("scenariosEditorHint")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SCENARIOS.map((s) => {
                      const on = draft.includes(s.slug);
                      return (
                        <button
                          key={s.slug}
                          onClick={() => toggleDraft(s.slug)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition ${
                            on
                              ? "bg-purple-600 text-white border-purple-600"
                              : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
                          }`}
                        >
                          <span>{s.emoji}</span>
                          {t("scenarioOption", { nameZh: s.nameZh, name: s.name })}
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
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                    >
                      {t("cancel")}
                    </button>
                    <span className="text-xs text-gray-400">{t("selectedCount", { count: draft.length })}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
