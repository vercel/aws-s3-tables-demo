export type S3TablesConfiguration = {
  accountId: string;
  region: string;
  resourceArn: string;
  roleArn: string;
  tableBucketName: string;
};

export type S3TablesTarget = {
  namespace?: string;
  tableName?: string;
};

const requiredEnvironmentVariables = [
  "aws_s3_tables_AWS_ACCOUNT_ID",
  "aws_s3_tables_AWS_REGION",
  "aws_s3_tables_AWS_RESOURCE_ARN",
  "aws_s3_tables_AWS_ROLE_ARN",
  "aws_s3_tables_S3_TABLE_BUCKET_NAME",
] as const;

function readEnvironment(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function getS3TablesStatus() {
  const missingEnvironmentVariables = requiredEnvironmentVariables.filter((name) => !readEnvironment(name));

  return {
    configured: missingEnvironmentVariables.length === 0,
    missingEnvironmentVariables,
  };
}

export function getS3TablesConfiguration(): S3TablesConfiguration | null {
  if (!getS3TablesStatus().configured) {
    return null;
  }

  return {
    accountId: readEnvironment("aws_s3_tables_AWS_ACCOUNT_ID")!,
    region: readEnvironment("aws_s3_tables_AWS_REGION")!,
    resourceArn: readEnvironment("aws_s3_tables_AWS_RESOURCE_ARN")!,
    roleArn: readEnvironment("aws_s3_tables_AWS_ROLE_ARN")!,
    tableBucketName: readEnvironment("aws_s3_tables_S3_TABLE_BUCKET_NAME")!,
  };
}

export function getS3TablesTarget(): S3TablesTarget {
  return {
    namespace: readEnvironment("S3_TABLES_NAMESPACE"),
    tableName: readEnvironment("S3_TABLES_TABLE_NAME"),
  };
}

export const DEFAULT_CATALOG_NAMESPACE = "catalog";
export const DEFAULT_CATALOG_TABLE_NAME = "movie_catalog_snapshots";

/**
 * Resolves the namespace and table that setup should create and that the
 * metadata check should look for, so the two can never diverge.
 */
export function resolveS3TablesTarget(): { namespace: string; tableName: string } {
  const target = getS3TablesTarget();

  return {
    namespace: target.namespace ?? DEFAULT_CATALOG_NAMESPACE,
    tableName: target.tableName ?? DEFAULT_CATALOG_TABLE_NAME,
  };
}
