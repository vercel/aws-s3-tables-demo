import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DuckDB ships a native binding per platform and selects one at runtime via
  // `require`. Bundlers try to resolve every branch statically, which fails for
  // the platforms that are not installed. Keeping the packages external leaves
  // the runtime `require` intact.
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],

  // Marking the packages external is not enough for deployment: the binding is
  // `duckdb.node` plus a sibling `libduckdb.so`, and only the JavaScript is
  // traced into the function bundle. Without the shared library the function
  // fails at module load with:
  //   libduckdb.so: cannot open shared object file
  // Tracing the whole binding directory keeps `libduckdb.so` next to
  // `duckdb.node`, which is where the loader expects it.
  //
  // Every route that touches DuckDB needs its own entry — these are per-route
  // bundles, so tracing only the API route left the page route broken once it
  // started reading the catalog directly.
  outputFileTracingIncludes: {
    "/": ["./node_modules/@duckdb/node-bindings-linux-x64/**/*"],
    "/api/catalog": ["./node_modules/@duckdb/node-bindings-linux-x64/**/*"],
  },
};

export default nextConfig;
