import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.mercadolivre.com",
      },
      {
        protocol: "https",
        hostname: "**.mercadolivre.com.br",
      },
      {
        protocol: "https",
        hostname: "**.mlstatic.com",
      },
    ],
  },
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
