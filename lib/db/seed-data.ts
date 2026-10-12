export type CatalogSnapshotRow = {
  movieId: string;
  title: string;
  releaseYear: number;
  genre: string;
  territory: string;
  licenseEndDate: string; // YYYY-MM-DD
  metadataStatus: "Complete" | "Needs review" | "Missing";
  catalogStatus: "Active";
  snapshotAt: string;
};

/**
 * The table holds two catalog snapshots so the app can compare them.
 *
 * Presence is the signal: a title in the catalog on a given date has a row in
 * that snapshot, and a retired title simply has no row in the later one. That
 * is why `catalog_status` is always "Active" — Added and Removed are derived by
 * diffing the snapshots, not stored on the row.
 */
export const PREVIOUS_SNAPSHOT_AT = "2026-08-31 00:00:00";
export const CURRENT_SNAPSHOT_AT = "2026-09-30 00:00:00";

type History =
  | "added" // present in the current snapshot only
  | "removed" // present in the previous snapshot only
  | "updated" // in both, with at least one field changed
  | "unchanged"; // identical in both

type SeedTitle = {
  movieId: string;
  title: string;
  releaseYear: number;
  genre: string;
  territory: string;
  /** Values as of the snapshot the title appears in most recently. */
  licenseEndDate: string;
  metadataStatus: CatalogSnapshotRow["metadataStatus"];
  history: History;
  /** Previous-snapshot values. Only used when history is "updated". */
  previous?: {
    licenseEndDate?: string;
    metadataStatus?: CatalogSnapshotRow["metadataStatus"];
  };
};

const curatedTitles: SeedTitle[] = [
  // Newly licensed this refresh — no row in the August snapshot.
  { movieId: "mv-0001", title: "Aster Harbor", releaseYear: 2025, genre: "Drama", territory: "United States", licenseEndDate: "2028-09-30", metadataStatus: "Complete", history: "added" },
  { movieId: "mv-0002", title: "Signal in the Snow", releaseYear: 2024, genre: "Mystery", territory: "United Kingdom", licenseEndDate: "2027-09-30", metadataStatus: "Complete", history: "added" },

  // Retired — present in August, absent in September.
  { movieId: "mv-0003", title: "Midnight Bicycle", releaseYear: 2021, genre: "Comedy", territory: "Canada", licenseEndDate: "2026-08-31", metadataStatus: "Complete", history: "removed" },
  { movieId: "mv-0004", title: "Northern Passage", releaseYear: 2020, genre: "Action & adventure", territory: "Germany", licenseEndDate: "2026-08-15", metadataStatus: "Needs review", history: "removed" },

  // Licence renewed, so the end date moved out.
  { movieId: "mv-0005", title: "Glass Horizon", releaseYear: 2023, genre: "Thriller", territory: "Australia", licenseEndDate: "2027-05-31", metadataStatus: "Complete", history: "updated", previous: { licenseEndDate: "2026-11-30" } },

  // Licence exposure: rights ending within 90 days of the current snapshot.
  { movieId: "mv-0006", title: "Paper Satellites", releaseYear: 2022, genre: "Science fiction", territory: "United States", licenseEndDate: "2026-10-12", metadataStatus: "Complete", history: "unchanged" },
  { movieId: "mv-0007", title: "The Silent Orchard", releaseYear: 2019, genre: "Drama", territory: "France", licenseEndDate: "2026-10-28", metadataStatus: "Complete", history: "unchanged" },
  { movieId: "mv-0008", title: "Violet Station", releaseYear: 2021, genre: "Drama", territory: "United Kingdom", licenseEndDate: "2026-11-12", metadataStatus: "Needs review", history: "unchanged" },
  { movieId: "mv-0009", title: "Map of Ashes", releaseYear: 2020, genre: "Documentary", territory: "Canada", licenseEndDate: "2026-11-30", metadataStatus: "Complete", history: "unchanged" },
  { movieId: "mv-0010", title: "Before the Tide", releaseYear: 2024, genre: "Family", territory: "Australia", licenseEndDate: "2026-12-22", metadataStatus: "Missing", history: "unchanged" },

  // Metadata quality gaps. Two were enriched since August, so they are updates.
  { movieId: "mv-0011", title: "After the Monsoon", releaseYear: 2024, genre: "Drama", territory: "India", licenseEndDate: "2027-08-31", metadataStatus: "Missing", history: "unchanged" },
  { movieId: "mv-0012", title: "Stillwater Road", releaseYear: 2022, genre: "Drama", territory: "United States", licenseEndDate: "2028-01-31", metadataStatus: "Needs review", history: "updated", previous: { metadataStatus: "Missing" } },
  { movieId: "mv-0013", title: "A House of Kites", releaseYear: 2023, genre: "Family", territory: "Japan", licenseEndDate: "2027-05-31", metadataStatus: "Needs review", history: "unchanged" },
  { movieId: "mv-0014", title: "The Harbor Below", releaseYear: 2025, genre: "Documentary", territory: "Brazil", licenseEndDate: "2029-03-31", metadataStatus: "Missing", history: "unchanged" },
  { movieId: "mv-0015", title: "Moonlight Transit", releaseYear: 2021, genre: "Comedy", territory: "Mexico", licenseEndDate: "2027-10-31", metadataStatus: "Complete", history: "updated", previous: { metadataStatus: "Needs review" } },
];

// Deterministic filler so catalog-level metrics and the genre mix are not
// dominated by the curated titles. No randomness, so re-seeding a freshly
// created table always produces identical contents.
const firstWords = ["Quiet", "Golden", "Distant", "Hollow", "Crimson", "Northern", "Electric", "Patient", "Winter", "Coastal", "Borrowed", "Lantern"];
const secondWords = ["Orbit", "Orchards", "Gardens", "Rivers", "Signal", "Circus", "Archive", "Harbour", "Machine", "Summer", "Letters", "Valley"];
const genres = ["Drama", "Comedy", "Action & adventure", "Documentary", "Family", "Thriller", "Science fiction", "Mystery"];
const territories = ["United States", "United Kingdom", "Canada", "Germany", "France", "Australia", "Japan", "India", "Brazil", "Mexico"];
const metadataCycle: CatalogSnapshotRow["metadataStatus"][] = [
  "Complete", "Complete", "Complete", "Complete", "Complete",
  "Complete", "Complete", "Needs review", "Complete", "Missing",
];

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function buildFillerTitles(count: number): SeedTitle[] {
  const titles: SeedTitle[] = [];

  for (let index = 0; index < count; index += 1) {
    const sequence = index + curatedTitles.length + 1;
    const first = firstWords[index % firstWords.length];
    const second = secondWords[Math.floor(index / firstWords.length) % secondWords.length];

    // Licence end dates spread across 2027-2030 so the 90-day exposure window
    // stays driven by the curated titles.
    const year = 2027 + (index % 4);
    const month = (index % 12) + 1;
    const day = (index % 27) + 1;

    const history: History =
      index % 23 === 0 ? "removed" : index % 17 === 0 ? "added" : index % 11 === 0 ? "updated" : "unchanged";

    titles.push({
      movieId: `mv-${pad(sequence, 4)}`,
      title: `${first} ${second}`,
      releaseYear: 2015 + (index % 11),
      genre: genres[index % genres.length],
      territory: territories[index % territories.length],
      licenseEndDate: `${year}-${pad(month)}-${pad(day)}`,
      metadataStatus: metadataCycle[index % metadataCycle.length],
      history,
      // Updated filler titles had a shorter licence in the previous snapshot.
      previous: history === "updated" ? { licenseEndDate: `${year - 1}-${pad(month)}-${pad(day)}` } : undefined,
    });
  }

  return titles;
}

const seedTitles: SeedTitle[] = [...curatedTitles, ...buildFillerTitles(105)];

function toRow(title: SeedTitle, snapshotAt: string, overrides?: SeedTitle["previous"]): CatalogSnapshotRow {
  return {
    movieId: title.movieId,
    title: title.title,
    releaseYear: title.releaseYear,
    genre: title.genre,
    territory: title.territory,
    licenseEndDate: overrides?.licenseEndDate ?? title.licenseEndDate,
    metadataStatus: overrides?.metadataStatus ?? title.metadataStatus,
    catalogStatus: "Active",
    snapshotAt,
  };
}

function buildRows(): CatalogSnapshotRow[] {
  const rows: CatalogSnapshotRow[] = [];

  for (const title of seedTitles) {
    // Previous snapshot: everything except titles added this refresh.
    if (title.history !== "added") {
      rows.push(toRow(title, PREVIOUS_SNAPSHOT_AT, title.previous));
    }

    // Current snapshot: everything except titles retired this refresh.
    if (title.history !== "removed") {
      rows.push(toRow(title, CURRENT_SNAPSHOT_AT));
    }
  }

  return rows;
}

export const catalogSnapshotRows: CatalogSnapshotRow[] = buildRows();
