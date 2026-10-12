import { getCatalogConnection, remoteCatalogTableRef } from "@/lib/db/duckdb";
import type { CatalogSnapshotRow } from "@/lib/db/seed-data";

/** Escapes a string for inline SQL by doubling single quotes. */
function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Column order must match `catalogSnapshotSchema` in lib/catalog-table-setup.ts.
 * DuckDB's Iceberg support does not implement targeted inserts — the
 * `INSERT INTO t (col, col)` form raises "Iceberg inserts don't support
 * targeted inserts yet" — so every column is supplied positionally.
 */
function valuesTuple(row: CatalogSnapshotRow) {
  return [
    sqlString(row.movieId),
    sqlString(row.title),
    row.releaseYear,
    sqlString(row.genre),
    sqlString(row.territory),
    `DATE ${sqlString(row.licenseEndDate)}`,
    sqlString(row.metadataStatus),
    sqlString(row.catalogStatus),
    `TIMESTAMP ${sqlString(row.snapshotAt)}`,
  ].join(", ");
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export async function insertRows(rows: CatalogSnapshotRow[], label: string) {
  const connection = await getCatalogConnection();
  const table = remoteCatalogTableRef();
  const batches = chunk(rows, 40);

  for (const [index, batch] of batches.entries()) {
    const values = batch.map((row) => `(${valuesTuple(row)})`).join(",\n  ");
    await connection.run(`INSERT INTO ${table} VALUES\n  ${values};`);
    console.log(`  ${label} batch ${index + 1}/${batches.length} (${batch.length} rows)`);
  }
}

/** Last day of the month following the given date. */
export function endOfNextMonth(isoDate: string) {
  const [year, month] = isoDate.slice(0, 10).split("-").map(Number);
  // Day 0 of month+2 is the last day of month+1 (Date months are 0-based).
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
}

export function addYears(isoDate: string, years: number) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return `${year + years}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const newTitlePool = [
  { title: "Harbour Lights", genre: "Drama", territory: "United States" },
  { title: "The Long Thaw", genre: "Documentary", territory: "Canada" },
  { title: "Paper Lanterns", genre: "Family", territory: "Japan" },
  { title: "Salt and Static", genre: "Thriller", territory: "United Kingdom" },
  { title: "Orchard Signals", genre: "Mystery", territory: "France" },
];

export type ExistingRow = {
  movie_id: string;
  title: string;
  release_year: number;
  genre: string;
  territory: string;
  license_end_date: string;
  metadata_status: CatalogSnapshotRow["metadataStatus"];
};

/**
 * Derives the next monthly snapshot from the most recent one.
 *
 * Deterministic so repeated appends are reproducible, and shaped so the diff
 * tells a story: titles whose rights have lapsed by the new snapshot date are
 * either renewed or retired, which is what the licence exposure view was
 * warning about in the previous snapshot.
 */
export function deriveNextSnapshot(
  existing: ExistingRow[],
  snapshotAt: string,
  snapshotDate: string,
) {
  const carried: CatalogSnapshotRow[] = [];
  let retired = 0;
  let renewed = 0;
  let enriched = 0;

  const sorted = [...existing].sort((a, b) => a.movie_id.localeCompare(b.movie_id));

  sorted.forEach((row, index) => {
    const lapsed = row.license_end_date < snapshotDate;

    if (lapsed && index % 2 !== 0) {
      // Rights expired and were not renewed: the title leaves the catalog, so
      // it simply has no row in this snapshot.
      retired += 1;
      return;
    }

    let licenseEndDate = row.license_end_date;
    if (lapsed) {
      licenseEndDate = addYears(row.license_end_date, 2);
      renewed += 1;
    }

    let metadataStatus = row.metadata_status;
    if (metadataStatus === "Missing" && index % 3 === 0) {
      metadataStatus = "Needs review";
      enriched += 1;
    } else if (metadataStatus === "Needs review" && index % 5 === 0) {
      metadataStatus = "Complete";
      enriched += 1;
    }

    carried.push({
      movieId: row.movie_id,
      title: row.title,
      releaseYear: row.release_year,
      genre: row.genre,
      territory: row.territory,
      licenseEndDate,
      metadataStatus,
      catalogStatus: "Active",
      snapshotAt,
    });
  });

  // New acquisitions, indexed by snapshot month so successive appends introduce
  // different titles.
  const month = Number(snapshotDate.slice(5, 7));
  const highestId = sorted.reduce((max, row) => {
    const numeric = Number(row.movie_id.replace(/\D/g, ""));
    return Number.isFinite(numeric) && numeric > max ? numeric : max;
  }, 0);

  const added: CatalogSnapshotRow[] = [0, 1, 2].map((offset) => {
    const pick = newTitlePool[(month + offset) % newTitlePool.length];
    return {
      movieId: `mv-${String(highestId + offset + 1).padStart(4, "0")}`,
      title: pick.title,
      releaseYear: 2026,
      genre: pick.genre,
      territory: pick.territory,
      licenseEndDate: addYears(snapshotDate, 3),
      metadataStatus: offset === 0 ? "Needs review" : "Complete",
      catalogStatus: "Active",
      snapshotAt,
    };
  });

  return { rows: [...carried, ...added], retired, renewed, enriched, added: added.length };
}
