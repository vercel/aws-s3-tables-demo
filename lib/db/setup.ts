import "./env";
import { ensureCatalogTable } from "@/lib/catalog-table-setup";
import { getS3TablesStatus } from "@/lib/s3-tables-config";
import { seedBaseline } from "@/lib/db/catalog-mutations";

/**
 * One-shot provisioning used by the Vercel build command.
 *
 * Creates the namespace and Iceberg table if absent, then writes the baseline
 * snapshots if the table is empty. Both halves are idempotent, so every
 * deployment can run this and only the first one does any work.
 *
 * It never fails the build. A deployment whose integration is not ready yet
 * should still produce a working site: the page has a fallback that names the
 * commands to run. A hard failure here would leave someone who clicked Deploy
 * with no site and no explanation.
 */
async function setup() {
  const status = getS3TablesStatus();

  if (!status.configured) {
    console.warn(
      "\n[db:setup] Skipping catalog provisioning — missing environment variables: " +
        `${status.missingEnvironmentVariables.join(", ")}.\n` +
        "[db:setup] The site will build and deploy, but the catalog will be unavailable\n" +
        "[db:setup] until the AWS integration is connected. Then redeploy, or run\n" +
        "[db:setup] `npm run db:migrate && npm run db:seed` locally.\n",
    );
    return;
  }

  const table = await ensureCatalogTable();
  console.log(
    table.tableCreated
      ? `[db:setup] Created ${table.tableFormat} table ${table.namespace}.${table.tableName}`
      : `[db:setup] Table ${table.namespace}.${table.tableName} already exists`,
  );

  const result = await seedBaseline();
  console.log(
    result.seeded
      ? `[db:setup] Catalog seeded with ${result.rows} rows.`
      : `[db:setup] Catalog already populated (${result.rows} rows).`,
  );
}

setup()
  .then(() => {
    console.log("[db:setup] Done.");
  })
  .catch((error) => {
    // Deliberately exit 0: provisioning problems must not break the deployment.
    console.warn(
      "\n[db:setup] WARNING: catalog provisioning did not complete.\n" +
        `[db:setup] ${error instanceof Error ? `${error.name}: ${error.message}` : error}\n` +
        "[db:setup] The site will still build and deploy. The catalog page shows a\n" +
        "[db:setup] fallback until the table is provisioned. Common causes: the AWS\n" +
        "[db:setup] integration is not connected yet, or the IAM permissions boundary\n" +
        "[db:setup] is missing s3tables:CreateTable / PutTableData.\n",
    );
  });
