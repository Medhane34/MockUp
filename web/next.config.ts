import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { withWorkflow } from "workflow/next";

// 1. Initialize the PWA configuration
const withPWA = withPWAInit({
  dest: "public",
  customWorkerSrc: "worker",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  // Disable PWA in development mode to prevent caching issues during hot-reloading
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

// 2. Define your base configuration
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

// 3. Export the wrapped configuration
export default withWorkflow(withPWA(nextConfig));