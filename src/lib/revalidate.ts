import { revalidateTag } from "next/cache";
import { CATALOG_TAGS } from "@/lib/catalog";

// Cache invalidation for the catalog reads in lib/catalog. Call after any write
// that changes what the public catalog shows: admin moderation, submissions, and
// the ingestion crons. Cheap and safe to over-call; the cost of *under*-calling is
// a stale listing until the revalidate window closes.
//
// `"max"` gives stale-while-revalidate semantics: the tag is marked stale and the
// next visitor is served the old value while a fresh one is fetched behind them.
// (Calling revalidateTag with no profile is deprecated in Next 16 and forces a
// blocking cache miss instead.)
const PROFILE = "max";

export function revalidateAgents() {
  revalidateTag(CATALOG_TAGS.agents, PROFILE);
}

export function revalidateSkills() {
  revalidateTag(CATALOG_TAGS.skills, PROFILE);
}

export function revalidateCategories() {
  revalidateTag(CATALOG_TAGS.categories, PROFILE);
}

export function revalidateCatalog() {
  revalidateAgents();
  revalidateSkills();
  revalidateCategories();
}
