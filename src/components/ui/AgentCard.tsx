import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Zap, Layers, Star, GitFork } from "lucide-react";
import { findScenario } from "@/lib/scenarios";

// Minimal translator shape so priceLabel can be called with or without i18n.
type Translator = (key: string, values?: Record<string, string | number>) => string;

// Server Component (no client interactivity) — safe to receive Prisma Decimal.
export type AgentCardData = {
  slug: string;
  name: string;
  description: string;
  kind?: string;
  pricingModel: string;
  unitPriceUsd: unknown; // Prisma Decimal | number | string | null
  protocols: string[];
  streaming: boolean;
  callsCount: number;
  avgRating: number;
  stars?: number | null;
  githubUrl?: string | null;
  repoOwner?: string | null;
  category: { name: string; slug: string } | null;
  scenarios?: string[];
  _count?: { skills: number };
};

export function priceLabel(model: string, unit: unknown, t?: Translator): string {
  if (model === "FREE") return t ? t("agentFree") : "Free";
  const n = unit == null ? null : Number(unit);
  if (n == null || Number.isNaN(n)) {
    // Fallback when there is no numeric price: a bare human word per model.
    if (t) {
      if (model === "PER_CALL") return t("agentPriceFallbackCall");
      if (model === "PER_TASK") return t("agentPriceFallbackTask");
      if (model === "PER_TOKEN") return t("agentPriceFallbackToken");
    }
    return model.replace("PER_", "").toLowerCase();
  }
  const price = `$${n}`;
  if (t) {
    if (model === "PER_CALL") return t("agentPerCall", { price });
    if (model === "PER_TASK") return t("agentPerTask", { price });
    if (model === "PER_TOKEN") return t("agentPerToken", { price });
    return price;
  }
  const per =
    model === "PER_CALL" ? "/call" : model === "PER_TASK" ? "/task" : model === "PER_TOKEN" ? "/1k tok" : "";
  return `${price}${per}`;
}

function formatStars(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

export default async function AgentCard({ agent }: { agent: AgentCardData }) {
  const t = await getTranslations("Components");
  const tScenario = await getTranslations("Scenarios");
  const isProject = agent.kind === "PROJECT";
  return (
    <Link
      href={`/agents/${agent.slug}`}
      className="group block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-purple-200 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-2 gap-2">
        <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-purple-600 transition-colors">
          {agent.name}
        </h3>
        {isProject ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
            <GitFork className="h-2.5 w-2.5" />
            {t("agentBadgeProject")}
          </span>
        ) : agent.streaming ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
            <Zap className="h-2.5 w-2.5" />
            {t("agentBadgeStreaming")}
          </span>
        ) : null}
      </div>

      <p className="text-sm text-gray-600 line-clamp-2 mb-3 min-h-[2.5rem]">{agent.description}</p>

      {agent.scenarios && agent.scenarios.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {agent.scenarios.slice(0, 2).map((slug) => {
            const sc = findScenario(slug);
            if (!sc) return null;
            const label = tScenario(slug);
            return (
              <span
                key={slug}
                title={label}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-600 max-w-full truncate"
              >
                <span>{sc.emoji}</span>
                {label}
              </span>
            );
          })}
        </div>
      )}

      {isProject ? (
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400 truncate">
            {agent.repoOwner ? `${agent.repoOwner}/${agent.name}` : t("agentOpenSource")}
          </span>
          <span className="inline-flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {t("agentSelfHost")}
            </span>
            {typeof agent.stars === "number" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {formatStars(agent.stars)}
              </span>
            )}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {agent.category && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-600 font-medium truncate">
                  {agent.category.name}
                </span>
              )}
              {agent.protocols.slice(0, 2).map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500"
                >
                  {p === "OPENAI_COMPAT" ? "OpenAI" : p}
                </span>
              ))}
            </div>
            <span className="text-xs font-semibold text-gray-700 shrink-0">
              {priceLabel(agent.pricingModel, agent.unitPriceUsd, t)}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
            {agent._count && (
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {t("agentSkills", { count: agent._count.skills })}
              </span>
            )}
            {agent.avgRating > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3" />
                {agent.avgRating.toFixed(1)}
              </span>
            )}
          </div>
        </>
      )}
    </Link>
  );
}
