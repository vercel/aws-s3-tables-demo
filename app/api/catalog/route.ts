import { NextResponse } from "next/server";
import { getCatalogData } from "@/lib/db/catalog-data";
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
    // Served from the same 60-second cache as the page. Uncached, every request
    // paid the full DuckDB cold path (~5s), which let anyone run up function
    // time and S3 Tables reads just by calling this endpoint in a loop.
    const { views, metrics, genreMix, tableState } = await getCatalogData();

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
