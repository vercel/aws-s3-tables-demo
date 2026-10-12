import { LOCAL_CATALOG_TABLE, queryRows, toNumber } from "@/lib/db/duckdb";
import type { CatalogRecord, CatalogView, CatalogViewId } from "@/lib/catalog";

/**
 * The two snapshots being compared are derived from the table, not hardcoded,
 * so appending a new snapshot with `npm run db:seed` immediately shifts the
 * comparison forward.
 */
const CURRENT = `(SELECT max(snapshot_at) FROM ${LOCAL_CATALOG_TABLE})`;
const PREVIOUS = `(SELECT max(snapshot_at) FROM ${LOCAL_CATALOG_TABLE} WHERE snapshot_at < ${CURRENT})`;

// Reference point for "expiring soon" — the current snapshot date rather than
// wall-clock time, so the exposure window is stable.
const SNAPSHOT_DATE = `CAST(${CURRENT} AS DATE)`;

/**
 * The table holds one row per title per snapshot, so every query must pick a
 * snapshot. Forgetting this double-counts across snapshots.
 */
const currentSnapshot = `
  SELECT * FROM ${LOCAL_CATALOG_TABLE} WHERE snapshot_at = ${CURRENT}`;

const previousSnapshot = `
  SELECT * FROM ${LOCAL_CATALOG_TABLE} WHERE snapshot_at = ${PREVIOUS}`;

/**
 * Casts are deliberate. DuckDB returns BIGINT as JavaScript BigInt and DATE as
 * a structured value; both break JSON serialization, so counts are cast to
 * INTEGER and dates formatted to VARCHAR inside SQL.
 */
const recordColumns = (alias: string) => `
  ${alias}.title,
  ${alias}.release_year AS year,
  ${alias}.genre,
  ${alias}.territory,
  strftime(${alias}.license_end_date, '%b %-d, %Y') AS license,
  ${alias}.metadata_status AS metadata`;

type RawRecord = Omit<CatalogRecord, "change"> & { change: string };

/**
 * A genuine snapshot-over-snapshot diff.
 *
 * Added and Removed come from presence — a retired title has no row in the
 * current snapshot — and Updated compares the fields that can change between
 * snapshots. Nothing here reads a stored status column.
 */
async function changesRecords(): Promise<CatalogRecord[]> {
  return (await queryRows<RawRecord>(`
    WITH curr AS (${currentSnapshot}),
         prev AS (${previousSnapshot}),
         diff AS (
           SELECT
             coalesce(curr.title, prev.title) AS title,
             coalesce(curr.release_year, prev.release_year) AS year,
             coalesce(curr.genre, prev.genre) AS genre,
             coalesce(curr.territory, prev.territory) AS territory,
             strftime(coalesce(curr.license_end_date, prev.license_end_date), '%b %-d, %Y') AS license,
             coalesce(curr.metadata_status, prev.metadata_status) AS metadata,
             CASE
               WHEN prev.movie_id IS NULL THEN 'Added'
               WHEN curr.movie_id IS NULL THEN 'Removed'
               WHEN curr.license_end_date <> prev.license_end_date THEN 'Licence renewed'
               ELSE 'Metadata updated'
             END AS change
           FROM curr
           FULL OUTER JOIN prev ON curr.movie_id = prev.movie_id
           WHERE prev.movie_id IS NULL
              OR curr.movie_id IS NULL
              OR curr.license_end_date <> prev.license_end_date
              OR curr.metadata_status <> prev.metadata_status
         )
    -- Interleave the change kinds. Ordering by kind alone put all the "Added"
    -- rows first, so the collapsed view hid retirements entirely.
    SELECT title, year, genre, territory, license, metadata, change
    FROM diff
    ORDER BY row_number() OVER (PARTITION BY change ORDER BY title),
             CASE change
               WHEN 'Added' THEN 0
               WHEN 'Removed' THEN 1
               WHEN 'Licence renewed' THEN 2
               ELSE 3
             END,
             title;
  `)) as CatalogRecord[];
}

async function licenseRecords(): Promise<CatalogRecord[]> {
  return (await queryRows<RawRecord>(`
    WITH curr AS (${currentSnapshot})
    SELECT ${recordColumns("curr")},
      'Expires in ' || CAST(date_diff('day', ${SNAPSHOT_DATE}, curr.license_end_date) AS INTEGER)
        || ' days' AS change
    FROM curr
    WHERE curr.license_end_date >= ${SNAPSHOT_DATE}
      AND curr.license_end_date < ${SNAPSHOT_DATE} + INTERVAL 90 DAY
    ORDER BY curr.license_end_date;
  `)) as CatalogRecord[];
}

async function qualityRecords(): Promise<CatalogRecord[]> {
  return (await queryRows<RawRecord>(`
    WITH curr AS (${currentSnapshot})
    SELECT ${recordColumns("curr")},
      curr.metadata_status AS change
    FROM curr
    WHERE curr.metadata_status <> 'Complete'
    ORDER BY CASE curr.metadata_status WHEN 'Missing' THEN 0 ELSE 1 END, curr.title;
  `)) as CatalogRecord[];
}

const viewDefinitions: Record<
  CatalogViewId,
  { label: string; title: string; description: string; action: string; load: () => Promise<CatalogRecord[]> }
> = {
  changes: {
    label: "Catalog changes",
    title: "What changed between the last two catalog snapshots?",
    description:
      "Compares the two most recent snapshots. Added and retired titles are derived from which snapshot each title appears in.",
    action: "Compare snapshots",
    load: changesRecords,
  },
  licenses: {
    label: "License exposure",
    title: "Which titles require licensing attention?",
    description: "Titles in the current snapshot with distribution rights ending within 90 days.",
    action: "Review expiring titles",
    load: licenseRecords,
  },
  quality: {
    label: "Metadata quality",
    title: "Where is catalog metadata incomplete?",
    description: "Titles in the current snapshot needing enrichment before distribution to additional regions.",
    action: "Review incomplete metadata",
    load: qualityRecords,
  },
};

export async function getCatalogViews(): Promise<CatalogView[]> {
  const ids = Object.keys(viewDefinitions) as CatalogViewId[];

  return Promise.all(
    ids.map(async (id) => {
      const definition = viewDefinitions[id];
      return {
        id,
        label: definition.label,
        title: definition.title,
        description: definition.description,
        action: definition.action,
        records: await definition.load(),
      };
    }),
  );
}

export async function getCatalogMetrics() {
  const [row] = await queryRows<Record<string, number>>(`
    WITH curr AS (${currentSnapshot}),
         prev AS (${previousSnapshot})
    SELECT
      CAST((SELECT count(*) FROM curr) AS INTEGER) AS active_titles,
      CAST((SELECT count(DISTINCT territory) FROM curr) AS INTEGER) AS territories,
      CAST((SELECT count(*) FROM curr WHERE curr.movie_id NOT IN (SELECT movie_id FROM prev)) AS INTEGER) AS added_titles,
      CAST((SELECT count(*) FROM prev WHERE prev.movie_id NOT IN (SELECT movie_id FROM curr)) AS INTEGER) AS retired_titles,
      CAST((SELECT count(*) FROM curr
            WHERE curr.license_end_date >= ${SNAPSHOT_DATE}
              AND curr.license_end_date < ${SNAPSHOT_DATE} + INTERVAL 90 DAY) AS INTEGER) AS expiring_titles;
  `);

  return [
    {
      label: "Active titles",
      value: toNumber(row?.active_titles).toLocaleString("en-US"),
      detail: `Across ${toNumber(row?.territories)} territories`,
    },
    {
      label: "Added this refresh",
      value: toNumber(row?.added_titles).toLocaleString("en-US"),
      detail: "Not in the previous snapshot",
      accent: "positive",
    },
    {
      label: "Retired titles",
      value: toNumber(row?.retired_titles).toLocaleString("en-US"),
      detail: "Dropped since the previous snapshot",
      accent: "neutral",
    },
    {
      label: "Licenses expiring",
      value: toNumber(row?.expiring_titles).toLocaleString("en-US"),
      detail: "Within the next 90 days",
      accent: "warning",
    },
  ];
}

export async function getGenreMix() {
  const rows = await queryRows<{ label: string; value: number }>(`
    WITH curr AS (${currentSnapshot})
    SELECT genre AS label,
      CAST(round(100.0 * count(*) / (SELECT count(*) FROM curr)) AS INTEGER) AS value
    FROM curr
    GROUP BY genre
    ORDER BY count(*) DESC
    LIMIT 5;
  `);

  return rows.map((row) => ({ label: row.label, value: toNumber(row.value) }));
}

export async function getTableState() {
  const [row] = await queryRows<Record<string, unknown>>(`
    SELECT
      CAST(count(*) FILTER (WHERE snapshot_at = ${CURRENT}) AS INTEGER) AS records,
      CAST(count(*) AS INTEGER) AS total_rows,
      CAST(count(DISTINCT snapshot_at) AS INTEGER) AS snapshot_count,
      strftime(${CURRENT}, '%b %-d, %Y') AS latest_snapshot,
      -- The snapshot actually being compared against, which is the second most
      -- recent. Using min(snapshot_at) was only correct while the table held
      -- exactly two snapshots.
      strftime(${PREVIOUS}, '%b %-d, %Y') AS previous_snapshot
    FROM ${LOCAL_CATALOG_TABLE};
  `);

  return {
    records: toNumber(row?.records),
    totalRows: toNumber(row?.total_rows),
    snapshotCount: toNumber(row?.snapshot_count),
    latestSnapshot: String(row?.latest_snapshot ?? "unknown"),
    previousSnapshot: String(row?.previous_snapshot ?? "unknown"),
  };
}
