"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, Star, Trash2, ExternalLink } from "lucide-react";

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
  _count: { skills: number };
};

const FILTERS = ["PENDING", "APPROVED", "REJECTED", "ALL"];

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

  const reject = async (id: string) => {
    const note = prompt("Reason for rejection (optional):") ?? undefined;
    await patch(id, { status: "REJECTED", reviewNote: note });
  };

  const remove = async (id: string) => {
    if (!confirm("Permanently delete this agent?")) return;
    setBusy(id);
    await fetch(`/api/admin/agents/${id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="text-sm text-gray-500 mt-1">Review and moderate submitted agents.</p>
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
            {f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-gray-400">No agents in this view.</p>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900 truncate">{a.name}</span>
                  {a.featured && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusBadge[a.status] || "bg-gray-100"}`}>
                    {a.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {a.publisher?.email || a.publisher?.name || "unknown"} · {a.category?.name || "uncategorized"} ·{" "}
                  {a._count.skills} skills · {a.pricingModel} · {a.endpointUrl}
                </p>
                {a.reviewNote && <p className="text-xs text-red-500 mt-0.5">Note: {a.reviewNote}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`/agents/${a.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                  title="Preview"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                {a.status !== "APPROVED" && (
                  <button
                    onClick={() => patch(a.id, { status: "APPROVED" })}
                    disabled={busy === a.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                )}
                {a.status !== "REJECTED" && (
                  <button
                    onClick={() => reject(a.id)}
                    disabled={busy === a.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                )}
                <button
                  onClick={() => patch(a.id, { featured: !a.featured })}
                  disabled={busy === a.id}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50"
                  title={a.featured ? "Unfeature" : "Feature"}
                >
                  <Star className={`h-4 w-4 ${a.featured ? "text-amber-500 fill-amber-500" : ""}`} />
                </button>
                <button
                  onClick={() => remove(a.id)}
                  disabled={busy === a.id}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
