export type CatalogViewId = "changes" | "licenses" | "quality";

export type CatalogRecord = {
  title: string;
  year: number;
  genre: string;
  territory: string;
  /**
   * The status column shown for the selected view. Its meaning is view
   * specific: the catalog status for the changes view, a computed
   * "Expires in N days" for licence exposure, and the metadata status for
   * the quality view.
   */
  change: string;
  license: string;
  metadata: "Complete" | "Needs review" | "Missing";
};

export type CatalogView = {
  id: CatalogViewId;
  label: string;
  title: string;
  description: string;
  action: string;
  records: CatalogRecord[];
};

export type CatalogMetric = {
  label: string;
  value: string;
  detail: string;
  accent?: string;
};

export type GenreShare = {
  label: string;
  value: number;
};

export type CatalogTableState = {
  /** Rows in the current snapshot. */
  records: number;
  /** Rows across all snapshots in the table. */
  totalRows: number;
  snapshotCount: number;
  latestSnapshot: string;
  previousSnapshot: string;
};
