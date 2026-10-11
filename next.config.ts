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
      {
        protocol: "http",
        hostname: "**.mlstatic.com",
      },
      {
        protocol: "https",
        hostname: "http2.mlstatic.com",
      },
      {
        protocol: "http",
        hostname: "http2.mlstatic.com",
      },
    ],
  },
  serverExternalPackages: ["pdf-parse"],
  async redirects() {
    return [
      {
        source: "/produto/:slug",
        destination: "/peca/:slug",
        permanent: true,
      },
      // Redirects 301 para slugs legados higienizados (SEO Friendly)
      {
        source:
          "/peca/disco-de-freio-hipper-freios-fiat-palio-weekend-siena-uno-87-88-89-90-91-92-93-94-95-96-97-98-99-2000-2001-2002-2003-2004-2005-2006-2007-2008-2009-palio-uno-hf38-similares-bd0178-fldi00116-d44a-rcdi02300",
        destination: "/peca/disco-de-freio-hipper-freios-palio-uno-hf38",
        permanent: true,
      },
      {
        source:
          "/peca/bomba-d-x27-agua-vw-up-yiming-parts-polo-virtus-nivus-t-cross-schadek-20256-90000856-90001222",
        destination: "/peca/bomba-dagua-yiming-parts-up-polo-virtus-nivus-20256",
        permanent: true,
      },
      {
        source:
          "/peca/valvula-termostatica-carcaca-valvula-termostatica-sensor-ka-3-cilindros-com-sensor-ford-ka-3-cilindros-ka-1-0-valvula-termostatica-ford-ka-3cc-new-fiesta-avts06016t92-cm5g61j20aa-cm5g9k478fa-cm5g9k478fb-cm5g9k478ga-cm5z8592b",
        destination: "/peca/valvula-termostatica-ka-1-0",
        permanent: true,
      },
      {
        source:
          "/peca/valvula-termostatica-valvula-termostatica-ka-3-cilindros-ldru-ford-ka-3-cilindros-new-fiesta-ka-1-0-valvula-termostatica-ford-ka-3cc-new-fiesta-avts06016t92-cm5g61j20aa-cm5g9k478fa-cm5g9k478fb-cm5g9k478ga-cm5z8592b",
        destination: "/peca/carcaca-valvula-termostatica-ka-1-0",
        permanent: true,
      },
      {
        source:
          "/peca/filtro-ar-lp-de-tbi-turbina-citroen-peugeot-1-6-16v-turbo-thp-1440q6-308-3008-1-6",
        destination: "/peca/filtro-ar-lp-308-3008-1-6",
        permanent: true,
      },
      {
        source: "/peca/tulipatrizeta-hb20-1-6-aut-20132021-22x27-dentes",
        destination: "/peca/trizeta-vetor-automotivos-hb20-1-6-aut",
        permanent: true,
      },
      {
        source:
          "/peca/pastilha-freio-dianteira-up-fox-gol-polo-1-0-16-2013-a-2021",
        destination:
          "/peca/pastilha-freio-dianteira-up-fox-gol-polo-1-0-1-6-2013-a-2021",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
