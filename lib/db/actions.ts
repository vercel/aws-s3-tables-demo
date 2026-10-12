"use server";

import { updateTag } from "next/cache";
import {
  appendNextSnapshot,
  resetToBaseline,
  type MutationResult,
} from "@/lib/db/catalog-mutations";
import { getS3TablesStatus } from "@/lib/s3-tables-config";

/**
 * Server actions backing the demo controls.
 *
 * Both revalidate the catalog cache on success, so the page reflects the change
 * on the next render rather than waiting out the cache window. Errors are
 * returned as text for the UI — never thrown — and never include ARNs, bucket
 * names, or raw AWS messages.
 */
async function run(operation: () => Promise<MutationResult>): Promise<MutationResult> {
  if (!getS3TablesStatus().configured) {
    return { ok: false, message: "S3 Tables is not configured for this deployment." };
  }

  try {
    const result = await operation();

    if (result.ok) {
      // updateTag, not revalidateTag: it expires the entry immediately and gives
      // read-your-own-writes semantics inside a Server Action, so the very next
      // render shows the change rather than serving the cached payload.
      updateTag("catalog-snapshot");
    }

    return result;
  } catch (error) {
    console.error("Catalog mutation failed:", error);
    const name = error instanceof Error ? error.name : "UnknownError";

    return {
      ok: false,
      message:
        name === "AccessDeniedException"
          ? "The deployment's IAM role is not permitted to modify the catalog table."
          : `The catalog could not be updated (${name}).`,
    };
  }
}

export async function appendSnapshotAction(): Promise<MutationResult> {
  return run(appendNextSnapshot);
}

export async function resetCatalogAction(): Promise<MutationResult> {
  return run(resetToBaseline);
}
