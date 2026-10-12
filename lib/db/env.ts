import { config } from "dotenv";

// Load local environment files for CLI scripts, mirroring the precedence
// Next.js uses in development. The first file to set a variable wins.
//
// `vercel env pull` writes the OIDC token and the integration variables into
// .env.local. `vercel pull` writes them into .vercel/.env.development.local
// instead, so load that too, or the scripts fail after either command.
config({ path: ".env.development.local" });
config({ path: ".env.local" });
config({ path: ".vercel/.env.development.local" });
config();
