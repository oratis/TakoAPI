"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { KeyRound, Copy, Check, Trash2, Activity, Zap, Wallet } from "lucide-react";

type ApiKeyRow = {
  id: string;
  name: string | null;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};
type Usage = {
  totalCalls: number;
  agentsUsed: number;
  totalSpendUsd: number;
  recent: Array<{
    id: string;
    agent: string;
    slug: string | null;
    protocol: string;
    status: number;
    latencyMs: number | null;
    billedUsd: number | null;
    createdAt: string;
  }>;
};
type Billing = {
  balanceUsd: number;
  topUpEnabled: boolean;
  ledger: Array<{
    id: string;
    type: string;
    amountUsd: number;
    note: string | null;
    createdAt: string;
  }>;
};

// USD formatter: 2 decimals normally, more precision for small non-zero amounts
// (per-call charges can be fractions of a cent).
function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const decimals = abs > 0 && abs < 0.01 ? 4 : 2;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${abs.toFixed(decimals)}`;
}

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const { data: session, status } = useSession();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [topupAmount, setTopupAmount] = useState("10");
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupMsg, setTopupMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [k, u, b] = await Promise.all([
      fetch("/api/keys").then((r) => r.json()).catch(() => ({ keys: [] })),
      fetch("/api/usage").then((r) => r.json()).catch(() => null),
      fetch("/api/billing").then((r) => r.json()).catch(() => null),
    ]);
    setKeys(k.keys || []);
    setUsage(u);
    setBilling(b);
  }, []);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  // Surface the PayPal return status (?topup=success|error|cancel) once, then strip
  // it from the URL so a refresh doesn't re-show it. Balance is refreshed by load().
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get("topup");
    if (!m) return;
    setTopupMsg(m);
    sp.delete("topup");
    const qs = sp.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  if (status === "loading") return null;
  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
        <p className="text-gray-500 mb-6">{t("signInPrompt")}</p>
        <Link href="/auth/signin" className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700">
          {t("signIn")}
        </Link>
      </div>
    );
  }

  const createKey = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Gateway key" }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewKey(data.key);
        await load();
      }
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm(t("revokeConfirm"))) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    await load();
  };

  const copy = () => {
    if (!newKey) return;
    navigator.clipboard?.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const topUp = async () => {
    const amt = Number(topupAmount);
    if (!Number.isFinite(amt) || amt < 5) {
      setTopupMsg("error");
      return;
    }
    setTopupBusy(true);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: amt }),
      });
      const data = await res.json();
      if (res.ok && data.approveUrl) {
        window.location.href = data.approveUrl; // off to PayPal for approval
      } else {
        setTopupMsg("error");
        setTopupBusy(false);
      }
    } catch {
      setTopupMsg("error");
      setTopupBusy(false);
    }
  };

  const topupMessages: Record<string, string> = {
    success: t("topUpSuccess"),
    error: t("topUpError"),
    cancel: t("topUpCancel"),
  };

  const ledgerLabels: Record<string, string> = {
    TOPUP: t("ledgerTopUp"),
    TOPUP_FEE: t("ledgerTopUpFee"),
    DEBIT: t("ledgerDebit"),
    PAYOUT: t("ledgerPayout"),
    REFUND: t("ledgerRefund"),
    ADJUST: t("ledgerAdjust"),
  };
  const ledgerLabel = (type: string) => ledgerLabels[type] ?? type;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-8">
        {t("description")}
      </p>

      {/* API Keys */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">{t("apiKeys")}</h2>
          </div>
          <button
            onClick={createKey}
            disabled={creating}
            className="bg-purple-600 text-white text-sm px-4 py-2 rounded-full font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {creating ? t("creating") : t("createKey")}
          </button>
        </div>

        {newKey && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-xs text-green-700 font-medium mb-2">
              {t("copyKeyWarning")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 font-mono break-all">
                {newKey}
              </code>
              <button onClick={copy} className="shrink-0 inline-flex items-center gap-1 text-xs text-green-700 border border-green-200 bg-white rounded-lg px-3 py-2 hover:bg-green-100">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noKeys")}</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                <div className="min-w-0">
                  <code className="text-sm font-mono text-gray-700">{k.prefix}…</code>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {k.name || t("keyFallbackName")} · {t("created", { date: new Date(k.createdAt).toLocaleDateString() })} ·{" "}
                    {k.lastUsedAt ? t("lastUsed", { date: new Date(k.lastUsedAt).toLocaleDateString() }) : t("neverUsed")}
                  </p>
                </div>
                <button onClick={() => revoke(k.id)} className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500" title={t("revoke")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quickstart */}
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-purple-600" /> {t("quickstart")}
          </h3>
          <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto">
{`# Call any agent through one endpoint
curl https://takoapi.com/v1/agents/{slug}/message \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -d '{"text": "..."}'

# …or with any OpenAI SDK (model = agent slug)
curl https://takoapi.com/v1/chat/completions \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -d '{"model": "{slug}", "messages": [{"role":"user","content":"..."}]}'`}
          </pre>
        </div>
      </section>

      {/* Credits & Billing */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold">{t("billing")}</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold">{fmtUsd(billing?.balanceUsd ?? 0)}</p>
            <p className="text-xs text-gray-400">{t("creditBalance")}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold">{fmtUsd(usage?.totalSpendUsd ?? 0)}</p>
            <p className="text-xs text-gray-400">{t("totalSpend")}</p>
          </div>
        </div>

        {billing?.topUpEnabled ? (
          <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
            <label htmlFor="topup" className="block text-xs text-gray-500 mb-2">{t("topUpLabel")}</label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  id="topup"
                  type="number"
                  min={5}
                  max={500}
                  step={1}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="w-28 pl-6 pr-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
              </div>
              <button
                onClick={topUp}
                disabled={topupBusy}
                className="inline-flex items-center gap-1.5 bg-[#0070ba] text-white text-sm px-4 py-2 rounded-full font-medium hover:bg-[#005c99] disabled:opacity-50"
              >
                {topupBusy ? t("topUpRedirecting") : t("topUpButton")}
              </button>
            </div>
            {topupMsg && topupMessages[topupMsg] && (
              <p className={`mt-2 text-xs ${topupMsg === "success" ? "text-green-600" : topupMsg === "cancel" ? "text-gray-500" : "text-red-500"}`}>
                {topupMessages[topupMsg]}
              </p>
            )}
          </div>
        ) : (
          <p className="mb-5 rounded-xl border border-dashed border-gray-200 p-4 text-xs text-gray-500">
            {t("topUpComingSoon")}
          </p>
        )}

        {billing && billing.ledger.length > 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs">
                <tr>
                  <th className="text-start px-4 py-2 font-medium">{t("ledgerType")}</th>
                  <th className="text-start px-4 py-2 font-medium">{t("ledgerAmount")}</th>
                  <th className="text-start px-4 py-2 font-medium">{t("ledgerNote")}</th>
                  <th className="text-start px-4 py-2 font-medium">{t("tableWhen")}</th>
                </tr>
              </thead>
              <tbody>
                {billing.ledger.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">{ledgerLabel(e.type)}</td>
                    <td className="px-4 py-2">
                      <span className={e.amountUsd >= 0 ? "text-green-600" : "text-red-500"}>{fmtUsd(e.amountUsd)}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{e.note || "—"}</td>
                    <td className="px-4 py-2 text-gray-400">{new Date(e.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">{t("noLedger")}</p>
        )}
      </section>

      {/* Usage */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold">{t("usage")}</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold">{t("totalCount", { count: usage?.totalCalls ?? 0 })}</p>
            <p className="text-xs text-gray-400">{t("totalCalls")}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold">{t("totalCount", { count: usage?.agentsUsed ?? 0 })}</p>
            <p className="text-xs text-gray-400">{t("agentsUsed")}</p>
          </div>
        </div>

        {usage && usage.recent.length > 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs">
                <tr>
                  <th className="text-start px-4 py-2 font-medium">{t("tableAgent")}</th>
                  <th className="text-start px-4 py-2 font-medium">{t("tableProtocol")}</th>
                  <th className="text-start px-4 py-2 font-medium">{t("tableStatus")}</th>
                  <th className="text-start px-4 py-2 font-medium">{t("tableLatency")}</th>
                  <th className="text-start px-4 py-2 font-medium">{t("tableCost")}</th>
                  <th className="text-start px-4 py-2 font-medium">{t("tableWhen")}</th>
                </tr>
              </thead>
              <tbody>
                {usage.recent.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-700">{r.agent}</td>
                    <td className="px-4 py-2 text-gray-500">{r.protocol === "OPENAI_COMPAT" ? "OpenAI" : r.protocol}</td>
                    <td className="px-4 py-2">
                      <span className={r.status >= 200 && r.status < 300 ? "text-green-600" : "text-red-500"}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{r.latencyMs != null ? `${r.latencyMs}ms` : "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{r.billedUsd != null && r.billedUsd > 0 ? fmtUsd(r.billedUsd) : "—"}</td>
                    <td className="px-4 py-2 text-gray-400">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">{t("noCalls")}</p>
        )}
      </section>
    </div>
  );
}
