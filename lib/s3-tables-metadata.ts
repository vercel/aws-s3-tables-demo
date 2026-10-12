import {
  GetTableBucketCommand,
  GetTableCommand,
  type GetTableCommandOutput,
  ListNamespacesCommand,
  ListTablesCommand,
} from "@aws-sdk/client-s3tables";
import { getS3TablesClient } from "@/lib/s3-tables-client";
import { getS3TablesConfiguration, getS3TablesTarget } from "@/lib/s3-tables-config";

export type S3TablesMetadataSummary = {
  bucketReachable: boolean;
  bucketType?: string;
  namespaceCount: number;
  tableCount: number;
  targetTableConfigured: boolean;
  targetTableReachable?: boolean;
  targetTableFormat?: string;
  targetTableError?: string;
};

export async function getS3TablesMetadataSummary(): Promise<S3TablesMetadataSummary> {
  const configuration = getS3TablesConfiguration();

  if (!configuration) {
    throw new Error("S3 Tables configuration is incomplete.");
  }

  const target = getS3TablesTarget();
  const client = getS3TablesClient();

  const [bucket, namespaces, tables] = await Promise.all([
    client.send(new GetTableBucketCommand({ tableBucketARN: configuration.resourceArn })),
    client.send(new ListNamespacesCommand({ tableBucketARN: configuration.resourceArn, maxNamespaces: 100 })),
    client.send(new ListTablesCommand({ tableBucketARN: configuration.resourceArn, maxTables: 100 })),
  ]);

  const targetTableConfigured = Boolean(target.namespace && target.tableName);
  let targetTable: GetTableCommandOutput | undefined;
  let targetTableError: string | undefined;

  if (targetTableConfigured) {
    try {
      targetTable = await client.send(
        new GetTableCommand({
          tableBucketARN: configuration.resourceArn,
          namespace: target.namespace,
          name: target.tableName,
        }),
      );
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";

      // A target table that does not exist yet (NotFoundException) or that the
      // role cannot read (AccessDeniedException, when a permissions boundary
      // omits s3tables:GetTable) are both expected states. Report them rather
      // than failing the bucket-level metadata check, which still succeeds.
      if (errorName !== "NotFoundException" && errorName !== "AccessDeniedException") {
        throw error;
      }

      targetTableError = errorName;
    }
  }

  return {
    bucketReachable: Boolean(bucket.arn),
    bucketType: bucket.type,
    namespaceCount: namespaces.namespaces?.length ?? 0,
    tableCount: tables.tables?.length ?? 0,
    targetTableConfigured,
    targetTableReachable: targetTableConfigured ? Boolean(targetTable?.tableARN) : undefined,
    targetTableFormat: targetTable?.format,
    targetTableError,
  };
}
