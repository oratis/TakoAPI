import Link from "next/link";
import { Zap, Layers, Star } from "lucide-react";

// Server Component (no client interactivity) — safe to receive Prisma Decimal.
export type AgentCardData = {
  slug: string;
  name: string;
  description: string;
  pricingModel: string;
  unitPriceUsd: unknown; // Prisma Decimal | number | string | null
  protocols: string[];
  streaming: boolean;
  callsCount: number;
  avgRating: number;
  category: { name: string; slug: string } | null;
  _count?: { skills: number };
};

export function priceLabel(model: string, unit: unknown): string {
  if (model === "FREE") return "Free";
  const per =
    model === "PER_CALL" ? "/call" : model === "PER_TASK" ? "/task" : model === "PER_TOKEN" ? "/1k tok" : "";
  const n = unit == null ? null : Number(unit);
  if (n == null || Number.isNaN(n)) return model.replace("PER_", "").toLowerCase();
  return `$${n}${per}`;
}

export default function AgentCard({ agent }: { agent: AgentCardData }) {
  return (
    <Link
      href={`/agents/${agent.slug}`}
      className="group block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-purple-200 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-2 gap-2">
        <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-purple-600 transition-colors">
          {agent.name}
        </h3>
        {agent.streaming && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
            <Zap className="h-2.5 w-2.5" />
            streaming
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 line-clamp-2 mb-3 min-h-[2.5rem]">{agent.description}</p>

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
          {priceLabel(agent.pricingModel, agent.unitPriceUsd)}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        {agent._count && (
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {agent._count.skills} skill{agent._count.skills === 1 ? "" : "s"}
          </span>
        )}
        {agent.avgRating > 0 && (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3" />
            {agent.avgRating.toFixed(1)}
          </span>
        )}
      </div>
    </Link>
  );
}
