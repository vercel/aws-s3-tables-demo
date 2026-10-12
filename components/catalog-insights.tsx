"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  CircleCheckBig,
  Database,
  FileStack,
  Film,
  History,
  RotateCcw,
  LayoutDashboard,
  Sparkles,
  TableProperties,
} from "lucide-react";
import type {
  CatalogMetric,
  CatalogTableState,
  CatalogView,
  CatalogViewId,
  GenreShare,
} from "@/lib/catalog";
import { appendSnapshotAction, resetCatalogAction } from "@/lib/db/actions";

const metadataClass: Record<string, string> = {
  Complete: "status-complete",
  "Needs review": "status-review",
  Missing: "status-missing",
};

/** Rows shown before the view is expanded. */
const COLLAPSED_ROW_COUNT = 8;

export type CatalogInsightsProps = {
  dataSourceLabel: string;
  catalogViews: CatalogView[];
  catalogMetrics: CatalogMetric[];
  genreMix: GenreShare[];
  tableState: CatalogTableState;
  tableName: string;
  namespace: string;
  notice?: string;
};

export function CatalogInsights({
  dataSourceLabel,
  catalogViews,
  catalogMetrics,
  genreMix,
  tableState,
  tableName,
  namespace,
  notice,
}: CatalogInsightsProps) {
  const [selectedViewId, setSelectedViewId] = useState<CatalogViewId>("changes");
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<"append" | "reset" | null>(null);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  async function runAction(action: typeof appendSnapshotAction | typeof resetCatalogAction) {
    setPending(action === appendSnapshotAction ? "append" : "reset");
    setActionResult(null);

    try {
      const result = await action();
      setActionResult(result);
      if (result.ok) {
        // The action revalidated the cache; refresh so the new snapshot is
        // reflected without a manual reload.
        router.refresh();
      }
    } catch {
      setActionResult({ ok: false, message: "The request failed. Please try again." });
    } finally {
      setPending(null);
    }
  }

  const view = catalogViews.find((item) => item.id === selectedViewId) ?? catalogViews[0];
  const visibleRecords = expanded ? view.records : view.records.slice(0, COLLAPSED_ROW_COUNT);
  const hiddenCount = view.records.length - visibleRecords.length;

  function selectView(id: CatalogViewId) {
    setSelectedViewId(id);
    // Collapse again so switching views does not inherit the previous
    // view's expanded state.
    setExpanded(false);
  }

  return (
    <main>
      <section className="hero-shell">
        <header className="site-header content-width">
          <a className="brand" href="#top" aria-label="Movie Catalog Insights home">
            <span className="brand-mark"><Film size={18} /></span>
            Movie Catalog Insights
          </a>
          <span className="sample-pill"><span className="pulse" /> {dataSourceLabel}</span>
        </header>

        <div id="top" className="hero content-width">
          <p className="eyebrow">Amazon S3 Tables × Vercel</p>
          <h1>Know how your movie catalog is changing.</h1>
          <p className="hero-copy">
            Track catalog snapshots, license exposure, and metadata quality without managing data files or table maintenance.
          </p>
          <div className="architecture-line">
            <Database size={16} /> S3 Tables table bucket
            <span>→</span>
            <FileStack size={16} /> managed catalog snapshots
            <span>→</span>
            <span>this Vercel app</span>
          </div>
          <img
            alt="Vercel with Amazon S3 Tables architecture graphic"
            className="architecture-image"
            src="/vercel-aws-s3-tables.svg"
          />
        </div>
      </section>

      <section className="content-width snapshot-section" aria-labelledby="snapshot-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current catalog snapshot</p>
            <h2 id="snapshot-heading">{tableState.latestSnapshot} catalog refresh</h2>
            <p className="section-copy">A bounded view of the latest catalog snapshot, compared against {tableState.previousSnapshot}.</p>
          </div>
          <div className="snapshot-actions">
            <button
              className="preview-button"
              disabled={pending !== null}
              onClick={() => runAction(appendSnapshotAction)}
              type="button"
            >
              <History size={16} /> {pending === "append" ? "Appending…" : "Append next snapshot"}
            </button>
            <button
              className="reset-button"
              disabled={pending !== null}
              onClick={() => runAction(resetCatalogAction)}
              type="button"
            >
              <RotateCcw size={16} /> {pending === "reset" ? "Resetting…" : "Reset to baseline"}
            </button>
          </div>
        </div>
        {notice && (
          <div className="preview-notice">
            <CircleCheckBig size={18} /> {notice}
          </div>
        )}
        {actionResult && (
          <div className={actionResult.ok ? "preview-notice" : "preview-notice preview-notice-warn"}>
            <CircleCheckBig size={18} /> {actionResult.message}
          </div>
        )}


        <div className="metric-grid">
          {catalogMetrics.map((metric) => (
            <article className={`metric-card ${metric.accent ? `metric-${metric.accent}` : ""}`} key={metric.label}>
              <span className="metric-kicker">{metric.label}</span>
              <strong>{metric.value}</strong>
              <span className="metric-support">{metric.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="content-width catalog-section" aria-labelledby="catalog-heading">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Catalog views</p>
            <h2 id="catalog-heading">Review the catalog from the angle you need.</h2>
          </div>
          <p>Each view is a bounded, preset query over the catalog snapshots rather than an open-ended query workspace. Catalog changes compares the two most recent snapshots.</p>
        </div>

        <div className="view-tabs" role="tablist" aria-label="Catalog insight views">
          {catalogViews.map((item) => (
            <button
              aria-selected={item.id === selectedViewId}
              className={`view-tab ${item.id === selectedViewId ? "view-tab-selected" : ""}`}
              key={item.id}
              onClick={() => selectView(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="catalog-layout">
          <article className="panel records-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">Snapshot review</span>
                <h3>{view.title}</h3>
                <p>{view.description}</p>
              </div>
              <span className="record-count">
                {hiddenCount > 0
                  ? `${visibleRecords.length} of ${view.records.length} titles`
                  : `${view.records.length} titles`}
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Territory</th>
                    <th>Catalog status</th>
                    <th>License</th>
                    <th>Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.map((record) => (
                    <tr key={`${record.title}-${record.territory}`}>
                      <td><strong>{record.title}</strong><span className="table-detail">{record.year} · {record.genre}</span></td>
                      <td>{record.territory}</td>
                      <td><span className="catalog-change">{record.change}</span></td>
                      <td>{record.license}</td>
                      <td><span className={`metadata-status ${metadataClass[record.metadata]}`}>{record.metadata}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.records.length > COLLAPSED_ROW_COUNT && (
              <button
                aria-expanded={expanded}
                className="text-action"
                onClick={() => setExpanded((value) => !value)}
                type="button"
              >
                {expanded
                  ? `Show first ${COLLAPSED_ROW_COUNT}`
                  : `${view.action} — ${hiddenCount} more`}{" "}
                <ArrowRight size={15} />
              </button>
            )}
          </article>

          <aside className="details-stack">
            <article className="panel table-details">
              <div className="details-icon"><TableProperties size={19} /></div>
              <span className="panel-kicker">S3 Tables state</span>
              <h3>{tableName}</h3>
              <dl>
                <div><dt>Namespace</dt><dd>{namespace}</dd></div>
                <div><dt>Snapshots</dt><dd>{tableState.snapshotCount}</dd></div>
                <div><dt>Comparing</dt><dd>{tableState.previousSnapshot} → {tableState.latestSnapshot}</dd></div>
                <div><dt>Titles in latest</dt><dd>{tableState.records.toLocaleString("en-US")}</dd></div>
                <div><dt>Rows across snapshots</dt><dd>{tableState.totalRows.toLocaleString("en-US")}</dd></div>
              </dl>
              <div className="maintenance-note"><CheckCircle2 size={16} /> Automatic table maintenance enabled</div>
            </article>

            <article className="panel genre-panel">
              <span className="panel-kicker">Catalog composition</span>
              <h3>Titles by genre</h3>
              <div className="genre-bars">
                {genreMix.map((genre) => (
                  <div className="genre-row" key={genre.label}>
                    <div><span>{genre.label}</span><strong>{genre.value}%</strong></div>
                    <span className="genre-track"><span style={{ width: `${genre.value}%` }} /></span>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </div>
      </section>

      <section className="service-story">
        <div className="content-width service-story-inner">
          <div>
            <p className="eyebrow">Why Amazon S3 Tables</p>
            <h2>Keep catalog history structured, versioned, and maintenance-free.</h2>
          </div>
          <div className="story-points">
            <p><LayoutDashboard size={18} /> Preserve catalog snapshots as a managed Iceberg table.</p>
            <p><History size={18} /> Compare catalog state over time without manually managing snapshots.</p>
            <p><Sparkles size={18} /> Let S3 Tables handle compaction and table maintenance.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
