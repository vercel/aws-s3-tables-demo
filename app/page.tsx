import { CatalogInsights } from "@/components/catalog-insights";
import { getCatalogData } from "@/lib/db/catalog-data";
import { getS3TablesStatus, resolveS3TablesTarget } from "@/lib/s3-tables-config";
import type { CatalogView } from "@/lib/catalog";

// Rendered per request; the snapshot read itself is cached in getCatalogData,
// so a cache hit never opens DuckDB.
export const dynamic = "force-dynamic";

const emptyViews: CatalogView[] = [
  {
    id: "changes",
    label: "Catalog changes",
    title: "What changed since the last catalog refresh?",
    description: "Catalog data is unavailable.",
    action: "Compare snapshots",
    records: [],
  },
  {
    id: "licenses",
    label: "License exposure",
    title: "Which titles require licensing attention?",
    description: "Catalog data is unavailable.",
    action: "Review expiring titles",
    records: [],
  },
  {
    id: "quality",
    label: "Metadata quality",
    title: "Where is catalog metadata incomplete?",
    description: "Catalog data is unavailable.",
    action: "Review incomplete metadata",
    records: [],
  },
];

export default async function HomePage() {
  const { namespace, tableName } = resolveS3TablesTarget();
  const status = getS3TablesStatus();

  if (!status.configured) {
    return (
      <CatalogInsights
        dataSourceLabel="Not configured"
        catalogViews={emptyViews}
        catalogMetrics={[]}
        genreMix={[]}
        tableState={{ records: 0, totalRows: 0, snapshotCount: 0, latestSnapshot: "unavailable", previousSnapshot: "unavailable" }}
        namespace={namespace}
        tableName={tableName}
        notice="Set the aws_s3_tables_* environment variables to connect this demo to S3 Tables."
      />
    );
  }

  try {
    const { views, metrics, genreMix, tableState } = await getCatalogData();

    return (
      <CatalogInsights
        dataSourceLabel="Live from S3 Tables"
        catalogViews={views}
        catalogMetrics={metrics}
        genreMix={genreMix}
        tableState={tableState}
        namespace={namespace}
        tableName={tableName}
      />
    );
  } catch (error) {
    // Keep the page renderable if the table is unreachable or not yet seeded,
    // rather than failing the whole route.
    console.error("Catalog data unavailable:", error);

    return (
      <CatalogInsights
        dataSourceLabel="Catalog unavailable"
        catalogViews={emptyViews}
        catalogMetrics={[]}
        genreMix={[]}
        tableState={{ records: 0, totalRows: 0, snapshotCount: 0, latestSnapshot: "unavailable", previousSnapshot: "unavailable" }}
        namespace={namespace}
        tableName={tableName}
        notice={`Could not read ${namespace}.${tableName}. Run \`npm run db:migrate\` and \`npm run db:seed\`, then reload.`}
      />
    );
  }
}
