import "./env";
import { ensureCatalogTable } from "@/lib/catalog-table-setup";
import { getS3TablesStatus, MISSING_CONFIGURATION_HINT } from "@/lib/s3-tables-config";

async function migrate() {
  const status = getS3TablesStatus();

  if (!status.configured) {
    throw new Error(
      `Missing required environment variables: ${status.missingEnvironmentVariables.join(", ")}. ` +
        MISSING_CONFIGURATION_HINT,
    );
  }

  const setup = await ensureCatalogTable();

  console.log(
    setup.namespaceCreated
      ? `Created namespace ${setup.namespace}`
      : `Namespace ${setup.namespace} already exists`,
  );
  console.log(
    setup.tableCreated
      ? `Created ${setup.tableFormat} table ${setup.namespace}.${setup.tableName}`
      : `Table ${setup.namespace}.${setup.tableName} already exists`,
  );
  console.log("The table is created empty. No catalog rows were written.");
}

migrate().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
