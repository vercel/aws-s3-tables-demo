import "./env";
import { seedBaseline } from "@/lib/db/catalog-mutations";

seedBaseline()
  .then(() => {
    console.log("Run `npm run db:append` to add the next monthly snapshot.");
  })
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
