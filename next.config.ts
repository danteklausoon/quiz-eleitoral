import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Regra 1 — cabeçalhos de cache de borda.
  // O conteúdo público fica 1h fresco e até 24h "stale": se o banco cair,
  // a Cloudflare continua servindo a última versão boa em vez de derrubar o site.
  async headers() {
    return [
      {
        source: "/api/conteudo/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/api/participacao",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=600",
          },
        ],
      },
      {
        // Cabeçalhos de segurança básicos em todas as rotas
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
