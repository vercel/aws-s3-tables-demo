import { NextResponse } from "next/server";
import { getCatalogMetrics, getCatalogViews, getGenreMix, getTableState } from "@/lib/db/queries";
import { getS3TablesStatus } from "@/lib/s3-tables-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getS3TablesStatus();

  if (!status.configured) {
    return NextResponse.json(
      { configured: false, missingEnvironmentVariables: status.missingEnvironmentVariables },
      { status: 409 },
    );
  }

  try {
    const [views, metrics, genreMix, tableState] = await Promise.all([
      getCatalogViews(),
      getCatalogMetrics(),
      getGenreMix(),
      getTableState(),
    ]);

    return NextResponse.json({ source: "s3-tables", views, metrics, genreMix, tableState });
  } catch (error) {
    // Log server-side for operators; the response body never leaks ARNs,
    // bucket names, or raw AWS/DuckDB error text.
    console.error("Catalog query failed:", error);

    return NextResponse.json(
      {
        error: "CatalogQueryFailed",
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      { status: 502 },
    );
  }
}
