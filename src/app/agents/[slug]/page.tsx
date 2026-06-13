import Link from "next/link";
import { notFound } from "next/navigation";
import { Zap, Bell, ShieldCheck, BadgeCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { priceLabel } from "@/components/ui/AgentCard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await prisma.agent.findFirst({
    where: { slug, status: "APPROVED" },
    select: { name: true, description: true },
  });
  if (!agent) return { title: "Agent not found — TakoAPI" };
  return { title: `${agent.name} — TakoAPI`, description: agent.description };
}

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await prisma.agent.findFirst({
    where: { slug, status: "APPROVED" },
    include: {
      category: { select: { name: true, slug: true } },
      skills: { orderBy: { name: "asc" } },
      publisher: { select: { name: true, username: true } },
    },
  });
  if (!agent) notFound();

  const publisherName = agent.publisher.username || agent.publisher.name || "unknown";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/agents" className="text-sm text-gray-500 hover:text-gray-700">
        ← Agent Marketplace
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {agent.category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-600 font-medium">
              {agent.category.name}
            </span>
          )}
          {agent.cardSignatureVerified && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <BadgeCheck className="h-3 w-3" /> Signed card
            </span>
          )}
          {agent.namespaceVerified && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <ShieldCheck className="h-3 w-3" /> Verified publisher
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold text-gray-900">{agent.name}</h1>
        <p className="text-sm text-gray-400 mt-1">by {publisherName}</p>
        <p className="text-base text-gray-600 mt-3 max-w-2xl">{agent.description}</p>
      </div>

      {/* Capability + pricing row */}
      <div className="flex flex-wrap gap-2 mb-8">
        {agent.protocols.map((p) => (
          <span key={p} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700">
            {p === "OPENAI_COMPAT" ? "OpenAI-compatible" : p}
          </span>
        ))}
        {agent.streaming && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
            <Zap className="h-3 w-3" /> Streaming
          </span>
        )}
        {agent.pushNotify && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-50 text-sky-700">
            <Bell className="h-3 w-3" /> Push notifications
          </span>
        )}
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-600 text-white">
          {priceLabel(agent.pricingModel, agent.unitPriceUsd)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Skills */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">
            Skills {agent.skills.length > 0 && <span className="text-gray-400 font-normal">({agent.skills.length})</span>}
          </h2>
          {agent.skills.length === 0 ? (
            <p className="text-sm text-gray-500">This agent did not advertise structured skills in its AgentCard.</p>
          ) : (
            <div className="space-y-3">
              {agent.skills.map((s) => (
                <div key={s.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>
                    <code className="text-[11px] text-gray-400">{s.skillKey}</code>
                  </div>
                  {s.description && <p className="text-sm text-gray-600 mt-1">{s.description}</p>}
                  {(s.inputModes.length > 0 || s.outputModes.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] text-gray-500">
                      {s.inputModes.map((m) => (
                        <span key={`in-${m}`} className="px-1.5 py-0.5 rounded bg-gray-100">in: {m}</span>
                      ))}
                      {s.outputModes.map((m) => (
                        <span key={`out-${m}`} className="px-1.5 py-0.5 rounded bg-gray-100">out: {m}</span>
                      ))}
                    </div>
                  )}
                  {s.examples.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {s.examples.slice(0, 3).map((ex, i) => (
                        <li key={i} className="text-xs text-gray-500 italic">“{ex}”</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Integration panel */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold mb-3">Integration</h3>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-gray-400">Endpoint</dt>
                <dd className="text-gray-700 break-all">{agent.endpointUrl}</dd>
              </div>
              {agent.cardUrl && (
                <div>
                  <dt className="text-gray-400">AgentCard</dt>
                  <dd>
                    <a href={agent.cardUrl} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline break-all">
                      {agent.cardUrl.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              )}
              {agent.homepage && (
                <div>
                  <dt className="text-gray-400">Homepage</dt>
                  <dd>
                    <a href={agent.homepage} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline break-all">
                      {agent.homepage.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-dashed border-gray-200 p-4">
            <h3 className="text-sm font-semibold mb-2">Call it through TakoAPI</h3>
            <p className="text-xs text-gray-400 mb-2">Unified gateway — invocation ships in Phase 2.</p>
            <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto">
{`curl https://takoapi.com/v1/agents/${agent.slug}/message \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -d '{"text": "..."}'`}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
