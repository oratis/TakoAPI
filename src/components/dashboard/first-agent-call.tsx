"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { fetchJson, useAsync } from "@/hooks/useAsync";

type AgentChoice = { slug: string; name: string };

export function FirstAgentCall({ apiKey, onCall }: { apiKey: string; onCall: () => void }) {
  const t = useTranslations("Dashboard");
  const choices = useAsync(
    () => fetchJson<{ agents: AgentChoice[] }>("/api/agents?kind=HOSTED&protocol=A2A&pricing=free&health=ok&limit=100"),
    []
  );
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ status: number; body: string } | null>(null);
  const [failed, setFailed] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !message.trim() || !choices.data?.agents.some(agent => agent.slug === slug)) return;
    setBusy(true);
    setReply(null);
    setFailed(false);
    try {
      const response = await fetch(`/v1/agents/${encodeURIComponent(slug)}/message`, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Tako-Free-Only": "1",
        },
        body: JSON.stringify({ text: message.trim() }),
      });
      const body = await response.json();
      setReply({ status: response.status, body: JSON.stringify(body, null, 2) });
    } catch {
      setFailed(true);
    } finally {
      // A network failure can happen after the gateway has recorded the call.
      onCall();
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="mt-4 grid gap-3 border-t border-green-200 pt-4">
      <label className="grid gap-1 text-sm font-medium">
        {t("testAgent")}
        <select value={slug} onChange={e => setSlug(e.target.value)} required disabled={busy}
          className="rounded-lg border border-gray-300 bg-white p-2">
          <option value="">—</option>
          {choices.data?.agents.map(agent => <option key={agent.slug} value={agent.slug}>{agent.name}</option>)}
        </select>
      </label>
      {choices.error ? <button type="button" onClick={choices.reload} className="justify-self-start underline">{t("retry")}</button>
        : choices.data?.agents.length === 0 && <p role="status" className="text-sm">{t("testNoAgent")}</p>}
      <label className="grid gap-1 text-sm font-medium">
        {t("testMessage")}
        <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={4000}
          className="rounded-lg border border-gray-300 bg-white p-2" rows={2} disabled={busy} required />
      </label>
      <button type="submit" disabled={busy || !slug || !message.trim()} aria-busy={busy}
        className="justify-self-start rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {t("testSend")}
      </button>
      {failed && <p role="alert" className="text-sm text-red-700">{t("testFailed")}</p>}
      {reply && <div role="status" className="min-w-0 text-sm">
        <strong>HTTP {reply.status}</strong>
        <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs">{reply.body}</pre>
      </div>}
    </form>
  );
}
