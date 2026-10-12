import {
  CreateNamespaceCommand,
  CreateTableCommand,
  GetNamespaceCommand,
  GetTableCommand,
} from "@aws-sdk/client-s3tables";
import { getS3TablesClient } from "@/lib/s3-tables-client";
import {
  DEFAULT_CATALOG_NAMESPACE,
  DEFAULT_CATALOG_TABLE_NAME,
  getS3TablesConfiguration,
  resolveS3TablesTarget,
} from "@/lib/s3-tables-config";

export const CATALOG_NAMESPACE = DEFAULT_CATALOG_NAMESPACE;
export const CATALOG_TABLE_NAME = DEFAULT_CATALOG_TABLE_NAME;

const catalogSnapshotSchema = [
  { id: 1, name: "movie_id", type: "string", required: true },
  { id: 2, name: "title", type: "string", required: true },
  { id: 3, name: "release_year", type: "int", required: false },
  { id: 4, name: "genre", type: "string", required: false },
  { id: 5, name: "territory", type: "string", required: false },
  { id: 6, name: "license_end_date", type: "date", required: false },
  { id: 7, name: "metadata_status", type: "string", required: false },
  { id: 8, name: "catalog_status", type: "string", required: true },
  { id: 9, name: "snapshot_at", type: "timestamp", required: true },
];

export type CatalogTableSetupSummary = {
  namespace: string;
  tableName: string;
  namespaceCreated: boolean;
  tableCreated: boolean;
  tableFormat: "ICEBERG";
};

function isNamedError(error: unknown, name: string) {
  return error instanceof Error && error.name === name;
}

export async function ensureCatalogTable(): Promise<CatalogTableSetupSummary> {
  const configuration = getS3TablesConfiguration();

  if (!configuration) {
    throw new Error("S3 Tables configuration is incomplete.");
  }

  const { namespace, tableName } = resolveS3TablesTarget();
  const client = getS3TablesClient();
  let namespaceCreated = false;
  let tableCreated = false;

  try {
    await client.send(
      new GetNamespaceCommand({
        tableBucketARN: configuration.resourceArn,
        namespace,
      }),
    );
  } catch (error) {
    if (!isNamedError(error, "NotFoundException")) {
      throw error;
    }

    try {
      await client.send(
        new CreateNamespaceCommand({
          tableBucketARN: configuration.resourceArn,
          namespace: [namespace],
        }),
      );
      namespaceCreated = true;
    } catch (createError) {
      if (!isNamedError(createError, "ConflictException")) {
        throw createError;
      }
    }
  }

  try {
    await client.send(
      new GetTableCommand({
        tableBucketARN: configuration.resourceArn,
        namespace,
        name: tableName,
      }),
    );
  } catch (error) {
    if (!isNamedError(error, "NotFoundException")) {
      throw error;
    }

    try {
      await client.send(
        new CreateTableCommand({
          tableBucketARN: configuration.resourceArn,
          namespace,
          name: tableName,
          format: "ICEBERG",
          metadata: {
            iceberg: {
              schema: {
                fields: catalogSnapshotSchema,
              },
            },
          },
        }),
      );
      tableCreated = true;
    } catch (createError) {
      if (!isNamedError(createError, "ConflictException")) {
        throw createError;
      }
    }
  }

  return {
    namespace,
    tableName,
    namespaceCreated,
    tableCreated,
    tableFormat: "ICEBERG",
  };
}
