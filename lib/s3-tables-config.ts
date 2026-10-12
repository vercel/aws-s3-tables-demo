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

/**
 * The Vercel AWS integration writes these variables when the table bucket is
 * connected to a project. The connection decides the prefix: the Deploy button
 * connects without one, while connecting from the dashboard lets you add one,
 * such as `aws_s3_tables_`. Both spellings are accepted, prefixed first.
 */
const integrationEnvironmentPrefixes = ["aws_s3_tables_", ""] as const;

const requiredEnvironmentVariables = [
  "AWS_ACCOUNT_ID",
  "AWS_REGION",
  "AWS_RESOURCE_ARN",
  "AWS_ROLE_ARN",
  "S3_TABLE_BUCKET_NAME",
] as const;

type RequiredEnvironmentVariable =
  (typeof requiredEnvironmentVariables)[number];

/**
 * What to do when the integration variables are missing. Locally the usual
 * cause is a connection that skips the Development environment: `vercel env
 * pull` reads Development, so it writes none of the variables.
 */
export const MISSING_CONFIGURATION_HINT =
  "Connect the Amazon S3 Tables resource to this project with the Development environment enabled, " +
  "then run `vercel env pull`.";

function readEnvironment(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readIntegrationEnvironment(name: RequiredEnvironmentVariable) {
  for (const prefix of integrationEnvironmentPrefixes) {
    const value = readEnvironment(`${prefix}${name}`);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function getS3TablesStatus() {
  const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
    (name) => !readIntegrationEnvironment(name),
  );

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
    accountId: readIntegrationEnvironment("AWS_ACCOUNT_ID")!,
    region: readIntegrationEnvironment("AWS_REGION")!,
    resourceArn: readIntegrationEnvironment("AWS_RESOURCE_ARN")!,
    roleArn: readIntegrationEnvironment("AWS_ROLE_ARN")!,
    tableBucketName: readIntegrationEnvironment("S3_TABLE_BUCKET_NAME")!,
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
export function resolveS3TablesTarget(): {
  namespace: string;
  tableName: string;
} {
  const target = getS3TablesTarget();

  return {
    namespace: target.namespace ?? DEFAULT_CATALOG_NAMESPACE,
    tableName: target.tableName ?? DEFAULT_CATALOG_TABLE_NAME,
  };
}
