import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: currentDirectory,
  },
};

export default nextConfig;
