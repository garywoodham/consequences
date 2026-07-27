import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for phone/LAN access during `next dev` — otherwise client JS won't load.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((origin) => origin.trim())
    : ["192.168.1.166"],
};

export default nextConfig;
