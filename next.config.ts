import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Use system TLS certificates to fix Google Fonts fetch issues
    turbopackUseSystemTlsCerts: true,
  },
};

export default nextConfig;
