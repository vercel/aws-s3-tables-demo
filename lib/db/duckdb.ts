import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { getS3TablesConfiguration, resolveS3TablesTarget } from "@/lib/s3-tables-config";

let connectionPromise: Promise<DuckDBConnection> | undefined;

/**
 * Opens an in-memory DuckDB connection attached to the S3 Tables bucket through
 * the Apache Iceberg REST endpoint.
 *
 * Credentials come from the same Vercel OIDC federation the rest of the app
 * uses. They are resolved once and handed to DuckDB's `credential_chain`
 * provider via environment variables, which is the mechanism DuckDB's S3
 * support reads.
 */
async function openConnection(): Promise<DuckDBConnection> {
  const configuration = getS3TablesConfiguration();

  if (!configuration) {
    throw new Error(
      "S3 Tables configuration is incomplete. Run `vercel pull --environment=development` first.",
    );
  }

  const credentials = await awsCredentialsProvider({
    roleArn: configuration.roleArn,
    clientConfig: { region: configuration.region },
  })();

  process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
  if (credentials.sessionToken) {
    process.env.AWS_SESSION_TOKEN = credentials.sessionToken;
  }
  process.env.AWS_REGION = configuration.region;

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  // DuckDB stores downloaded extensions under a home directory. Serverless
  // functions have no HOME set and a read-only filesystem apart from /tmp, so
  // without this the first INSTALL fails with:
  //   IO Error: Can't find the home directory at ''
  // These are runtime settings, not instance-creation options — passing them to
  // DuckDBInstance.create raises "Failed to set config".
  await connection.run("SET home_directory = '/tmp';");
  await connection.run("SET extension_directory = '/tmp/duckdb_extensions';");

  await connection.run("INSTALL iceberg; LOAD iceberg;");
  await connection.run(
    `CREATE OR REPLACE SECRET s3_tables_secret (
       TYPE S3, PROVIDER credential_chain, REGION '${configuration.region}'
     );`,
  );
  await connection.run(
    `ATTACH IF NOT EXISTS '${configuration.resourceArn}' AS s3t
       (TYPE ICEBERG, ENDPOINT_TYPE 'S3_Tables');`,
  );

  return connection;
}

export function getCatalogConnection(): Promise<DuckDBConnection> {
  connectionPromise ??= openConnection().catch((error) => {
    // Do not cache a failed connection, so a transient credential or network
    // failure does not poison every later request.
    connectionPromise = undefined;
    throw error;
  });

  return connectionPromise;
}

/** The S3 Tables Iceberg table. Use for writes and for the initial read. */
export function remoteCatalogTableRef() {
  const { namespace, tableName } = resolveS3TablesTarget();
  return `s3t."${namespace}"."${tableName}"`;
}

/** Local in-memory copy of the snapshot that read queries run against. */
export const LOCAL_CATALOG_TABLE = "catalog_snapshot";

let materializePromise: Promise<DuckDBConnection> | undefined;

/**
 * Returns a connection with the catalog snapshot materialized into a local
 * in-memory table.
 *
 * Every query against the attached Iceberg table costs roughly one network
 * round-trip (~900ms measured), because DuckDB re-reads table metadata through
 * the REST catalog each time — and queries on one connection serialize, so six
 * aggregates cost six round-trips. Copying the snapshot once turns the
 * aggregates into local scans.
 *
 * The snapshot is immutable once seeded, so a per-process copy is safe. Call
 * `refreshLocalCatalog()` after writing new rows.
 */
export function getReadConnection(): Promise<DuckDBConnection> {
  materializePromise ??= (async () => {
    const connection = await getCatalogConnection();

    await connection.run(
      `CREATE OR REPLACE TABLE ${LOCAL_CATALOG_TABLE} AS
         SELECT * FROM ${remoteCatalogTableRef()};`,
    );

    return connection;
  })().catch((error) => {
    materializePromise = undefined;
    throw error;
  });

  return materializePromise;
}

export function refreshLocalCatalog() {
  materializePromise = undefined;
}

/**
 * Drops the cached connection entirely.
 *
 * Needed after the Iceberg table is deleted and recreated: the attached catalog
 * holds metadata for the old table, so reusing the connection would query a
 * table that no longer exists.
 */
export function resetConnection() {
  connectionPromise = undefined;
  materializePromise = undefined;
}

/**
 * DuckDB returns BIGINT values (including `count(*)`) as JavaScript BigInt,
 * which `JSON.stringify` throws on. Queries cast counts to INTEGER, but this
 * guards anything that slips through before it reaches a JSON response.
 */
export function toNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(value ?? 0);
}

/** Runs a query against the attached Iceberg table (one network round-trip). */
export async function queryRemote<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const connection = await getCatalogConnection();
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjects() as T[];
}

/** Runs a query against the local materialized snapshot. */
export async function queryRows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const connection = await getReadConnection();
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjects() as T[];
}
