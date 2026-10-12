import { DeleteTableCommand } from "@aws-sdk/client-s3tables";
import { ensureCatalogTable } from "@/lib/catalog-table-setup";
import { getS3TablesClient } from "@/lib/s3-tables-client";
import { getS3TablesConfiguration, resolveS3TablesTarget } from "@/lib/s3-tables-config";
import {
  queryRemote,
  refreshLocalCatalog,
  remoteCatalogTableRef,
  resetConnection,
  toNumber,
} from "@/lib/db/duckdb";
import { catalogSnapshotRows } from "@/lib/db/seed-data";
import {
  deriveNextSnapshot,
  endOfNextMonth,
  insertRows,
  type ExistingRow,
} from "@/lib/db/snapshot-io";

/**
 * Upper bound on snapshots, so the append action cannot grow the table without
 * limit when it is exposed as a button on a public demo.
 */
export const MAX_SNAPSHOTS = 6;

export type MutationResult = {
  ok: boolean;
  message: string;
};

async function snapshotCounts() {
  const [row] = await queryRemote<{ row_count: number; snapshots: number }>(
    `SELECT CAST(count(*) AS INTEGER) AS row_count,
            CAST(count(DISTINCT snapshot_at) AS INTEGER) AS snapshots
     FROM ${remoteCatalogTableRef()};`,
  );

  return { rows: toNumber(row?.row_count), snapshots: toNumber(row?.snapshots) };
}

/**
 * Writes the two baseline snapshots, and does nothing if the table already has
 * rows. Being a no-op on a populated table is what makes it safe to run from
 * the Vercel build command on every deployment.
 */
export async function seedBaseline(): Promise<{ seeded: boolean; rows: number }> {
  const { rows, snapshots } = await snapshotCounts();

  if (rows > 0) {
    console.log(`Catalog already has ${rows} rows across ${snapshots} snapshots. Nothing to seed.`);
    return { seeded: false, rows };
  }

  console.log("Catalog is empty. Writing the baseline snapshots.");
  await insertRows(catalogSnapshotRows, "baseline");

  const after = await snapshotCounts();
  refreshLocalCatalog();

  console.log(`Seeded ${after.rows} rows across ${after.snapshots} snapshots.`);
  return { seeded: true, rows: after.rows };
}

/**
 * Appends the next monthly snapshot, derived from the most recent one.
 *
 * Guarded two ways because this is reachable from a button: it refuses past
 * MAX_SNAPSHOTS, and it refuses if the month it would write already exists,
 * which makes a double-click or two concurrent visitors harmless.
 */
export async function appendNextSnapshot(): Promise<MutationResult> {
  const table = remoteCatalogTableRef();
  const { rows, snapshots } = await snapshotCounts();

  if (rows === 0) {
    return { ok: false, message: "The catalog is empty. Seed the baseline snapshots first." };
  }

  if (snapshots >= MAX_SNAPSHOTS) {
    return {
      ok: false,
      message: `This demo keeps at most ${MAX_SNAPSHOTS} snapshots. Reset to baseline to start again.`,
    };
  }

  const [latest] = await queryRemote<{ latest: string }>(
    `SELECT strftime(max(snapshot_at), '%Y-%m-%d %H:%M:%S') AS latest FROM ${table};`,
  );
  const latestAt = String(latest?.latest);
  const snapshotDate = endOfNextMonth(latestAt);
  const snapshotAt = `${snapshotDate} 00:00:00`;

  // Concurrency guard: if the target month is already present, another caller
  // got there first.
  const [clash] = await queryRemote<{ existing: number }>(
    `SELECT CAST(count(*) AS INTEGER) AS existing FROM ${table}
     WHERE snapshot_at = TIMESTAMP '${snapshotAt}';`,
  );

  if (toNumber(clash?.existing) > 0) {
    return { ok: false, message: `Snapshot ${snapshotDate} already exists.` };
  }

  const existing = await queryRemote<ExistingRow>(
    `SELECT movie_id, title, release_year, genre, territory,
            strftime(license_end_date, '%Y-%m-%d') AS license_end_date,
            metadata_status
     FROM ${table}
     WHERE snapshot_at = TIMESTAMP '${latestAt}';`,
  );

  const next = deriveNextSnapshot(existing, snapshotAt, snapshotDate);
  await insertRows(next.rows, "append");
  refreshLocalCatalog();

  return {
    ok: true,
    message:
      `Appended snapshot ${snapshotDate} — ${next.added} titles added, ${next.retired} retired, ` +
      `${next.renewed} licences renewed, ${next.enriched} metadata records enriched.`,
  };
}

/**
 * Returns the catalog to its two baseline snapshots.
 *
 * DuckDB's Iceberg support implements neither DELETE nor snapshot rollback, so
 * the only way back is to drop the table and rebuild it. The table is dropped
 * through the S3 Tables API rather than DuckDB, and the DuckDB connection is
 * reset afterwards so it does not hold metadata for a table that no longer
 * exists.
 */
export async function resetToBaseline(): Promise<MutationResult> {
  const configuration = getS3TablesConfiguration();

  if (!configuration) {
    return { ok: false, message: "S3 Tables configuration is incomplete." };
  }

  const { namespace, tableName } = resolveS3TablesTarget();

  try {
    await getS3TablesClient().send(
      new DeleteTableCommand({
        tableBucketARN: configuration.resourceArn,
        namespace,
        name: tableName,
      }),
    );
  } catch (error) {
    // A missing table is fine — we are about to recreate it.
    if (!(error instanceof Error && error.name === "NotFoundException")) {
      throw error;
    }
  }

  resetConnection();

  await ensureCatalogTable();
  const seeded = await seedBaseline();

  return {
    ok: true,
    message: `Catalog reset to the two baseline snapshots (${seeded.rows} rows).`,
  };
}
