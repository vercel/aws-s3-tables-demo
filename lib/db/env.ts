import { config } from "dotenv";

// Load local environment files for CLI scripts, mirroring the precedence
// Next.js uses in development. `vercel pull` writes the OIDC token and the
// integration variables into .vercel/.env.development.local.
config({ path: ".env.development.local" });
config({ path: ".env.local" });
config();
