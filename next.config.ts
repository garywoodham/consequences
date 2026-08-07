import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for phone/LAN access during `next dev` — otherwise client JS won't load.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((origin) => origin.trim())
    : ["192.168.1.166"],
  // Comic resume payloads include base64 cast sheets. With `proxy.ts` present,
  // Next buffers the body (default 10MB) and truncates oversize JSON →
  // "Invalid request body". Allow enough headroom for multi-character casts.
  experimental: {
    proxyClientMaxBodySize: "64mb",
  },
};

export default nextConfig;
