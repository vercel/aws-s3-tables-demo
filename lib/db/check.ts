import "./env";
import { getS3TablesMetadataSummary } from "@/lib/s3-tables-metadata";
import { getS3TablesStatus, MISSING_CONFIGURATION_HINT } from "@/lib/s3-tables-config";

async function check() {
  const status = getS3TablesStatus();

  if (!status.configured) {
    throw new Error(
      `Missing required environment variables: ${status.missingEnvironmentVariables.join(", ")}. ` +
        MISSING_CONFIGURATION_HINT,
    );
  }

  const metadata = await getS3TablesMetadataSummary();

  console.log(`Table bucket reachable   ${metadata.bucketReachable ? "yes" : "no"}`);
  console.log(`Namespaces               ${metadata.namespaceCount}`);
  console.log(`Tables                   ${metadata.tableCount}`);

  if (!metadata.targetTableConfigured) {
    console.log("Target table             not configured (set S3_TABLES_NAMESPACE and S3_TABLES_TABLE_NAME)");
    return;
  }

  if (metadata.targetTableReachable) {
    console.log(`Target table             reachable (${metadata.targetTableFormat})`);
    return;
  }

  console.log(`Target table             not reachable (${metadata.targetTableError ?? "unknown"})`);

  if (metadata.targetTableError === "NotFoundException") {
    console.log("Run `npm run db:migrate` to create it.");
  }
}

check().catch((error) => {
  console.error("Check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
