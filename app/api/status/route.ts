import { NextResponse } from "next/server";
import { getS3TablesStatus } from "@/lib/s3-tables-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const status = getS3TablesStatus();

  return NextResponse.json({
    configured: status.configured,
    missingEnvironmentVariables: status.missingEnvironmentVariables,
    nextRequirement: status.configured
      ? "Configuration is complete."
      : "Set the required aws_s3_tables_* variables in the Vercel project.",
  });
}
