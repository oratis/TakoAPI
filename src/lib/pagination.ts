export type Pagination = { page: number; limit: number; skip: number };

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

export function clampPagination(params: URLSearchParams | { get(k: string): string | null }): Pagination {
  const rawPage = Number(params.get("page") ?? "1");
  const rawLimit = Number(params.get("limit") ?? String(DEFAULT_LIMIT));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
}
