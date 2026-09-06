"use client";

import { Suspense, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  KeyRound,
  Trash2,
  Wallet,
  Zap,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SignInPrompt } from "@/components/SignInPrompt";
import CodeTabs from "@/components/ui/CodeTabs";
import { gatewaySamples } from "@/lib/samples";
import { fetchJson, useAsync } from "@/hooks/useAsync";

type ApiKeyRow = {
  id: string;
  name: string | null;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};
type UsageDay = { date: string; calls: number; errors: number; billedUsd: number };
type Usage = {
  totalCalls: number;
  agentsUsed: number;
  totalSpendUsd: number;
  // Filled and gap-free from /api/usage. Optional here so an older deploy of that
  // route degrades to the table instead of throwing.
  series?: UsageDay[];
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

/** Day buckets arrive as UTC calendar dates; render them as such, not shifted local. */
function fmtDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function DashboardPage() {
  // useSearchParams (the PayPal return status) needs a Suspense boundary, and the
  // fallback is the same skeleton the page shows while the session resolves.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10" aria-busy="true">
      <div className="h-8 w-56 rounded-lg bg-gray-100 animate-pulse" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-gray-100 animate-pulse" />
      <div className="mt-10 h-40 rounded-xl border border-gray-100 bg-gray-50 animate-pulse" />
      <div className="mt-6 h-40 rounded-xl border border-gray-100 bg-gray-50 animate-pulse" />
    </div>
  );
}

function Dashboard() {
  const t = useTranslations("Dashboard");
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const authed = status === "authenticated";

  const keysQ = useAsync(() => fetchJson<{ keys: ApiKeyRow[] }>("/api/keys"), ["keys"], authed);
  const usageQ = useAsync(() => fetchJson<Usage>("/api/usage"), ["usage"], authed);
  const billingQ = useAsync(() => fetchJson<Billing>("/api/billing"), ["billing"], authed);
  // One real slug so the quickstart is copy-pasteable rather than a placeholder the
  // reader has to fill in. A failure here is not worth surfacing: the samples fall
  // back to `<agent-slug>`, which is what they said before.
  const sampleQ = useAsync(
    () => fetchJson<{ agents: Array<{ slug: string }> }>("/api/registry?format=json&limit=1&kind=HOSTED"),
    ["sample"],
    authed
  );

  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const [topupAmount, setTopupAmount] = useState("10");
  const [topupBusy, setTopupBusy] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  // PayPal comes back as ?topup=success|error|cancel. The value is read straight
  // from the URL on every render instead of being copied into state on mount:
  // history.replaceState is wired into the App Router, so the old "read it, then
  // strip it" effect would erase the very message it had just rendered (and
  // setting state in an effect body is a lint error here). Dismissal is explicit.
  const notice = localNotice ?? searchParams.get("topup");

  const dismissNotice = () => {
    setLocalNotice(null);
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has("topup")) return;
    sp.delete("topup");
    const qs = sp.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  };

  if (status === "loading" || (authed && (keysQ.loading || usageQ.loading || billingQ.loading))) {
    return <DashboardSkeleton />;
  }
  if (!session) {
    return <SignInPrompt title={t("title")} description={t("signInPrompt")} />;
  }

  const keys = keysQ.data?.keys ?? [];
  const usage = usageQ.data ?? null;
  const billing = billingQ.data ?? null;
  const loadFailed = Boolean(keysQ.error || usageQ.error || billingQ.error);
  const sampleSlug = sampleQ.data?.agents?.[0]?.slug ?? "<agent-slug>";

  const hasKey = keys.length > 0;
  const hasCall = (usage?.totalCalls ?? 0) > 0;
  // The checklist is scaffolding, not furniture: once both signals are in, it goes
  // away for good rather than sitting at the top of every future visit.
  const showOnboarding = !loadFailed && (!hasKey || !hasCall);

  const reloadAll = () => {
    keysQ.reload();
    usageQ.reload();
    billingQ.reload();
  };

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateFailed(false);
    try {
      // An empty field means "just give me a key": the placeholder name is sent, so
      // naming stays optional and the one-click path still produces a labelled key.
      const data = await fetchJson<{ key: string }>("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim() || t("keyNamePlaceholder") }),
      });
      setNewKey(data.key);
      setKeyName("");
      keysQ.reload();
    } catch {
      setCreateFailed(true);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm(t("revokeConfirm"))) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    keysQ.reload();
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
      setLocalNotice("error");
      return;
    }
    setTopupBusy(true);
    try {
      const data = await fetchJson<{ approveUrl?: string }>("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: amt }),
      });
      if (data.approveUrl) {
        window.location.href = data.approveUrl; // off to PayPal for approval
        return;
      }
      setLocalNotice("error");
      setTopupBusy(false);
    } catch {
      setLocalNotice("error");
      setTopupBusy(false);
    }
  };

  const noticeMessages: Record<string, string> = {
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
      <p className="text-sm text-gray-500 mt-1 mb-8">{t("description")}</p>

      {loadFailed && (
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">{t("loadError")}</p>
          <button
            onClick={reloadAll}
            className="ms-auto rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {showOnboarding && (
        <section className="mb-10 rounded-xl border border-purple-200 bg-purple-50/60 p-5">
          <h2 className="text-base font-semibold text-gray-900">{t("onboardingTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("onboardingSubtitle")}</p>
          <ol className="mt-4 space-y-3">
            <ChecklistItem done={hasKey} title={t("stepKeyTitle")} body={t("stepKeyBody")} />
            <ChecklistItem done={hasCall} title={t("stepCallTitle")} body={t("stepCallBody")} />
            <ChecklistItem optional title={t("stepInstallTitle")} body={t("stepInstallBody")}>
              <Link
                href="/install"
                className="mt-1 inline-block text-sm font-medium text-purple-700 hover:underline"
              >
                {t("stepInstallLink")}
              </Link>
            </ChecklistItem>
          </ol>
        </section>
      )}

      {/* API Keys */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-purple-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{t("apiKeys")}</h2>
        </div>

        <form onSubmit={createKey} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="grow sm:grow-0">
            <label htmlFor="key-name" className="block text-xs text-gray-500 mb-1">
              {t("keyNameLabel")}
            </label>
            <input
              id="key-name"
              type="text"
              maxLength={100}
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder={t("keyNamePlaceholder")}
              className="w-full sm:w-64 px-3 py-2 rounded-lg border border-gray-200 text-sm placeholder:text-gray-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="bg-purple-600 text-white text-sm px-4 py-2 rounded-full font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {creating ? t("creating") : t("createKey")}
          </button>
        </form>

        {createFailed && <p className="mb-4 text-sm text-red-600">{t("createKeyError")}</p>}

        {newKey && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-xs text-green-700 font-medium mb-2">{t("copyKeyWarning")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 font-mono break-all">
                {newKey}
              </code>
              <button
                onClick={copy}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-green-700 border border-green-200 bg-white rounded-lg px-3 py-2 hover:bg-green-100"
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-gray-500">{t("noKeys")}</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{k.name || t("keyFallbackName")}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <code className="font-mono">{k.prefix}…</code> · {t("created", { date: new Date(k.createdAt).toLocaleDateString() })} ·{" "}
                    {k.lastUsedAt ? t("lastUsed", { date: new Date(k.lastUsedAt).toLocaleDateString() }) : t("neverUsed")}
                  </p>
                </div>
                <button
                  onClick={() => revoke(k.id)}
                  aria-label={t("revokeNamed", { name: k.name || t("keyFallbackName") })}
                  className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"
                  title={t("revoke")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quickstart */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-purple-600" aria-hidden="true" /> {t("quickstart")}
          </h3>
          <p className="text-xs text-gray-500 mb-2">{t("quickstartHint")}</p>
          <CodeTabs samples={gatewaySamples(sampleSlug)} ariaLabel={t("quickstart")} />
        </div>
      </section>

      {/* Credits & Billing */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="h-5 w-5 text-purple-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{t("billing")}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">{t("creditRule")}</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold">{fmtUsd(billing?.balanceUsd ?? 0)}</p>
            <p className="text-xs text-gray-500">{t("creditBalance")}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold">{fmtUsd(usage?.totalSpendUsd ?? 0)}</p>
            <p className="text-xs text-gray-500">{t("totalSpend")}</p>
          </div>
        </div>

        {billing?.topUpEnabled ? (
          <div className="mb-3 rounded-xl border border-gray-200 bg-white p-4">
            <label htmlFor="topup" className="block text-xs text-gray-500 mb-2">
              {t("topUpLabel")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  id="topup"
                  type="number"
                  min={5}
                  max={500}
                  step={1}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="w-28 ps-6 pe-3 py-2 rounded-lg border border-gray-200 text-sm"
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
          </div>
        ) : (
          <p className="mb-3 rounded-xl border border-dashed border-gray-200 p-4 text-xs text-gray-600">
            {t("topUpUnavailable")}
          </p>
        )}

        {notice && noticeMessages[notice] && (
          <div className="mb-5 flex items-start gap-2">
            <p
              className={`text-xs ${
                notice === "success" ? "text-green-700" : notice === "cancel" ? "text-gray-600" : "text-red-600"
              }`}
            >
              {noticeMessages[notice]}
            </p>
            <button
              onClick={dismissNotice}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              {t("dismiss")}
            </button>
          </div>
        )}

        {billing && billing.ledger.length > 0 ? (
          <div className="mt-5 rounded-xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
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
                      <span className={e.amountUsd >= 0 ? "text-green-700" : "text-red-600"}>{fmtUsd(e.amountUsd)}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{e.note || "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{new Date(e.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 text-sm text-gray-500">{t("noLedger")}</p>
        )}
      </section>

      {/* Usage */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-purple-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{t("usage")}</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold">{t("totalCount", { count: usage?.totalCalls ?? 0 })}</p>
            <p className="text-xs text-gray-500">{t("totalCalls")}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold">{t("totalCount", { count: usage?.agentsUsed ?? 0 })}</p>
            <p className="text-xs text-gray-500">{t("agentsUsed")}</p>
          </div>
        </div>

        {usage?.series && usage.series.length > 0 && <UsageChart series={usage.series} />}

        {usage && usage.recent.length > 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("recentCallsCaption")}</caption>
              <thead className="bg-gray-50 text-gray-500 text-xs">
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
                      <span className={r.status >= 200 && r.status < 300 ? "text-green-700" : "text-red-600"}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{r.latencyMs != null ? `${r.latencyMs}ms` : "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{r.billedUsd != null && r.billedUsd > 0 ? fmtUsd(r.billedUsd) : "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t("noCalls")}</p>
        )}
      </section>
    </div>
  );
}

function ChecklistItem({
  done = false,
  optional = false,
  title,
  body,
  children,
}: {
  done?: boolean;
  optional?: boolean;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("Dashboard");
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {/* The tick is the only visual completion cue, so state is spelled out for
              anyone who cannot see it. */}
          <span className="sr-only">{done ? t("stepDone") : t("stepTodo")}: </span>
          {title}
          {optional && (
            <span className="ms-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-normal text-gray-600">
              {t("stepOptional")}
            </span>
          )}
        </p>
        <p className="text-sm text-gray-600">{body}</p>
        {children}
      </div>
    </li>
  );
}

// Call volume for the window /api/usage returns. Hand-rolled bars rather than a
// charting library: the series is fourteen integers next to a table that already
// carries the detail, and any library would outweigh the picture it draws.
function UsageChart({ series }: { series: UsageDay[] }) {
  const t = useTranslations("Dashboard");
  const max = Math.max(1, ...series.map((d) => d.calls));
  const total = series.reduce((n, d) => n + d.calls, 0);

  return (
    <figure className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
      <figcaption className="mb-3 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-gray-700">{t("chartTitle", { days: series.length })}</span>
        <span className="text-gray-500">{t("chartTotal", { count: total })}</span>
      </figcaption>
      <div
        className="flex h-24 items-end gap-1"
        role="img"
        aria-label={t("chartAria", { days: series.length, count: total })}
      >
        {series.map((d) => {
          // A bar short enough to be invisible reads as "no calls", so anything
          // non-zero gets a floor; empty days get a flat rule instead of a bar.
          const height = d.calls === 0 ? 0 : Math.max(6, Math.round((d.calls / max) * 100));
          const errorShare = d.calls === 0 ? 0 : Math.round((d.errors / d.calls) * 100);
          return (
            <div
              key={d.date}
              className="flex h-full flex-1 flex-col justify-end"
              title={t("chartDay", { date: fmtDay(d.date), calls: d.calls, errors: d.errors })}
            >
              {d.calls === 0 ? (
                <div className="h-0.5 w-full rounded-sm bg-gray-200" />
              ) : (
                <div className="w-full overflow-hidden rounded-sm bg-purple-500" style={{ height: `${height}%` }}>
                  <div className="w-full bg-red-400" style={{ height: `${errorShare}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-gray-500">
        <span>{fmtDay(series[0].date)}</span>
        <span>{fmtDay(series[series.length - 1].date)}</span>
      </div>
    </figure>
  );
}
