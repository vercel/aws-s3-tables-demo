import { unstable_cache } from "next/cache";
import { getCatalogMetrics, getCatalogViews, getGenreMix, getTableState } from "@/lib/db/queries";

export type CatalogData = {
  views: Awaited<ReturnType<typeof getCatalogViews>>;
  metrics: Awaited<ReturnType<typeof getCatalogMetrics>>;
  genreMix: Awaited<ReturnType<typeof getGenreMix>>;
  tableState: Awaited<ReturnType<typeof getTableState>>;
};

async function loadCatalogData(): Promise<CatalogData> {
  const [views, metrics, genreMix, tableState] = await Promise.all([
    getCatalogViews(),
    getCatalogMetrics(),
    getGenreMix(),
    getTableState(),
  ]);

  return { views, metrics, genreMix, tableState };
}

/**
 * Caches the whole snapshot read.
 *
 * This is what keeps cold starts off the critical path. A cache miss pays the
 * full cost — loading DuckDB's native binding, downloading the Iceberg
 * extension into /tmp, assuming the role, and reading table metadata (~5s
 * measured in production). On a hit none of that runs, because DuckDB is only
 * touched inside this function.
 *
 * The catalog snapshot is immutable once seeded, so a long window is safe.
 */
/**
 * The deployment id is part of the cache key on purpose.
 *
 * Vercel's Data Cache outlives a deployment, so without this a new build serves
 * payloads cached by the previous one — a query change appears to have no
 * effect until the revalidation window expires. Keying by deployment means new
 * code always reads fresh data.
 */
const cacheVersion = process.env.VERCEL_DEPLOYMENT_ID ?? "local";

/**
 * 60s rather than longer, deliberately.
 *
 * The cache exists to keep the ~5.6s cold path off most requests, but it also
 * delays newly appended snapshots from appearing. A minute keeps the cold-start
 * protection while making `npm run db:seed` visible on the page without a long
 * wait. `/api/catalog` is uncached if you need the table state immediately.
 */
export const getCatalogData = unstable_cache(loadCatalogData, ["catalog-snapshot", cacheVersion], {
  revalidate: 60,
  tags: ["catalog-snapshot"],
});
