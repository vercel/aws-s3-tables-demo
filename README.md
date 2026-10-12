# Amazon S3 Tables Movie Catalog Demo

This demo uses Amazon S3 Tables with Next.js to compare movie-catalog snapshots stored as an Apache Iceberg table. It is able to securely connect to S3 Tables without using hardcoded access tokens through Vercel's [OIDC Federation](https://vercel.com/docs/security/secure-backend-access/oidc).

![Vercel with Amazon S3 Tables](/public/vercel-aws-s3-tables.svg)

**Getting Started:**

Click the "Deploy" button to clone this repo, create a new Vercel project, set up the AWS integration, and provision a new S3 Tables table bucket:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Faws-s3-tables-demo&project-name=aws-s3-tables-demo&repository-name=aws-s3-tables-demo&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22aws%22%2C%22productSlug%22%3A%22aws-s3-tables%22%2C%22protocol%22%3A%22storage%22%7D%5D)

Once the process is complete, you can clone the newly created GitHub repository and start making changes locally.

## Requirements

- Installed Amazon S3 Tables. You can do that via [Vercel Marketplace](https://vercel.com/marketplace/aws)

Deploying provisions everything. The build creates the namespace and Iceberg table inside the
table bucket and loads the catalog data, so there is nothing to run by hand.

## Local Setup

1. Pull vercel environment variables locally

```bash
vercel env pull
```

2. Install dependencies:

```bash
npm install
```

3. Create and seed the catalog table:

```bash
npm run db:setup
```

4. Start the development server:

```bash
npm run dev
```

5. View local development: http://localhost:3000

Other commands:

```bash
npm run db:check     # report table bucket and table state
npm run db:append    # append the next monthly snapshot
npm run db:migrate   # create the namespace and table only
npm run db:seed      # write the baseline snapshots only
```

## How it works

```text
Next.js on Vercel
  → Vercel OIDC federation
  → @aws-sdk/client-s3tables       (create namespace and table)
  → DuckDB + Iceberg REST endpoint (read and write rows)
  → catalog.movie_catalog_snapshots
```

The Vercel AWS integration provisions the S3 Tables **table bucket**. `npm run db:setup`
creates the namespace and the Iceberg table inside it and loads the baseline data. Every step
is idempotent, so re-running is safe.

Two clients are involved because they do different jobs. `@aws-sdk/client-s3tables` covers
table and schema management, but has no row-level API. Rows move through an Iceberg client,
so reads and writes use DuckDB against the S3 Tables Iceberg REST endpoint:

```sql
ATTACH '<table-bucket-arn>' AS s3t (TYPE ICEBERG, ENDPOINT_TYPE 'S3_Tables');
```

### Snapshots

The table stores one row per title per snapshot, and the first seed writes two, one month
apart. Presence is the signal — a retired title simply has no row in the later snapshot — so
the catalog changes view derives Added, Removed, and Licence renewed by diffing the two most
recent snapshots rather than reading a status column.

Which snapshots are compared is read from the table, not configured, so appending a snapshot
moves the comparison forward on its own.

That is the point of the demo: catalog history stays queryable over time without the
application team managing Parquet files, table metadata, compaction, or snapshot cleanup.

### Queries

Each of the three views is a fixed, preset query rather than an open-ended query workspace:

| View | Query |
| --- | --- |
| Catalog changes | `FULL OUTER JOIN` between the two most recent snapshots |
| License exposure | Rights ending within 90 days of the current snapshot |
| Metadata quality | Titles with incomplete metadata in the current snapshot |

Reads are cached for 60 seconds. A cache hit never opens DuckDB, which keeps the native
binding and Iceberg extension off the request path. The window is deliberately short so a
newly appended snapshot shows up promptly.

All S3 Tables access is server-side. No table identifier or credential is exposed to Client
Components.

## Environment variables

Supplied by the Vercel AWS integration:

```text
aws_s3_tables_AWS_ACCOUNT_ID
aws_s3_tables_AWS_REGION
aws_s3_tables_AWS_RESOURCE_ARN
aws_s3_tables_AWS_ROLE_ARN
aws_s3_tables_S3_TABLE_BUCKET_NAME
```

Identifies the catalog table:

```text
S3_TABLES_NAMESPACE=catalog
S3_TABLES_TABLE_NAME=movie_catalog_snapshots
```

`GET /api/status` reports whether the required variables are present, and the names of any
that are missing. It never returns account IDs, role ARNs, resource ARNs, or bucket names.
`GET /api/catalog` returns the same catalog data the page renders, uncached.

## Deployment

`vercel.json` runs provisioning before the build:

```json
"buildCommand": "npm run db:setup && npm run build"
```

`db:setup` creates the namespace and Iceberg table if absent, then writes the baseline
snapshots if the table is empty. Both halves are idempotent, so every deployment runs it and
only the first does any work. It never fails the build — if the AWS integration is not
connected yet, the site still deploys and the page explains what is missing.

DuckDB ships a native binding per platform, so `next.config.ts` keeps it out of the bundle
and traces the binding into every route that queries the catalog. Both are required for
deployment to work.

## Appending snapshots

The page has two controls for exploring how the table changes over time:

- **Append next snapshot** derives the next month from the most recent snapshot. Titles whose
  rights have lapsed are renewed or retired, a few new titles are acquired, and some metadata
  gaps are filled. Since the app compares the two most recent snapshots, the comparison moves
  forward and the previous month's licence warnings become this month's retirements.
- **Reset to baseline** returns the catalog to its two starting snapshots.

The derivation is deterministic, so the same starting table always produces the same next
snapshot. Appending stops at six snapshots; reset to continue.

The same operations are available from the command line:

```bash
npm run db:append
```

Reset has no in-place equivalent, because DuckDB's Iceberg support implements neither `DELETE`
nor snapshot rollback. The reset control drops the table and rebuilds it, which is also what
to do by hand:

```bash
aws s3tables delete-table \
  --table-bucket-arn "$aws_s3_tables_AWS_RESOURCE_ARN" \
  --namespace catalog --name movie_catalog_snapshots
npm run db:setup
```

## Structure

```text
app/                             Next.js App Router entry points and global styles
app/page.tsx                     Server component; reads the cached catalog snapshot
app/api/status/route.ts          Configuration readiness endpoint
app/api/catalog/route.ts         Catalog data as JSON, uncached
components/catalog-insights.tsx  Single-page catalog snapshot experience
lib/catalog.ts                   Shared types
lib/s3-tables-config.ts          Server-only S3 Tables environment-variable contract
lib/s3-tables-client.ts          S3 Tables client using Vercel OIDC credentials
lib/s3-tables-metadata.ts        Table bucket and table state queries
lib/catalog-table-setup.ts       Idempotent namespace/table creation and Iceberg schema
lib/db/duckdb.ts                 DuckDB connection, Iceberg attach, local snapshot copy
lib/db/queries.ts                The three preset catalog queries
lib/db/catalog-data.ts           Cached loader used by the page
lib/db/setup.ts                  Build-time provisioning: migrate then seed
lib/db/migrate.ts                Creates the namespace and Iceberg table
lib/db/seed.ts                   Writes the baseline snapshots
lib/db/append.ts                 Appends the next monthly snapshot
lib/db/catalog-mutations.ts      Shared seed/append/reset logic
lib/db/snapshot-io.ts            Row writing and next-snapshot derivation
lib/db/actions.ts                Server actions behind the page controls
lib/db/seed-data.ts              Baseline snapshot definitions
lib/db/env.ts                    Loads local .env files for the CLI scripts
lib/db/check.ts                  Reports table bucket and table state
.env.example                     Variable names only—no secrets
```
