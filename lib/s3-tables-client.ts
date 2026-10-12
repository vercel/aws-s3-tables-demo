import { S3TablesClient } from "@aws-sdk/client-s3tables";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { getS3TablesConfiguration } from "@/lib/s3-tables-config";

export function getS3TablesClient() {
  const configuration = getS3TablesConfiguration();

  if (!configuration) {
    throw new Error("S3 Tables configuration is incomplete.");
  }

  return new S3TablesClient({
    region: configuration.region,
    credentials: awsCredentialsProvider({
      roleArn: configuration.roleArn,
      clientConfig: { region: configuration.region },
    }),
  });
}
