import type { NextConfig } from "next";

/*
 * Two build targets, because Snug does not actually need a server.
 *
 * There are no API routes, nothing reads the environment at runtime, and every byte
 * of work happens in the browser. So the default is a fully static export that can
 * sit on a CDN: cheaper, faster from anywhere, and nothing to keep running or patch.
 * `scripts/test-static.ts` drives the exported directory to prove it.
 *
 * BUILD_TARGET=server switches to a standalone Node build for a container host.
 * Kept because it works and because it is the sibling Thinnai repo's arrangement,
 * not because this app benefits from it.
 */
const server = process.env.BUILD_TARGET === "server";

const nextConfig: NextConfig = {
  output: server ? "standalone" : "export",
  eslint: { ignoreDuringBuilds: true },
  // A static host serves /path and /path/ as the same thing more predictably with
  // real directories than with extensionless files.
  trailingSlash: !server,
};

export default nextConfig;
