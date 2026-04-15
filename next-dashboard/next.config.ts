import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Pin tracing to this app when other lockfiles exist higher in the tree. */
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
