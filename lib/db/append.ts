import "./env";
import { appendNextSnapshot } from "@/lib/db/catalog-mutations";

appendNextSnapshot()
  .then((result) => {
    console.log(result.message);
    if (result.ok) {
      console.log("Reload the app to see the comparison move forward.");
    }
  })
  .catch((error) => {
    console.error("Append failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
