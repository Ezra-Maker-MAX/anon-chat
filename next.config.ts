import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel Blob serves media from *.blob.vercel-storage.com; we render with plain
  // <img>/<audio>/<video> tags (not next/image), so no remotePatterns config is needed.
  reactStrictMode: true,
};

export default nextConfig;
