import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://hubmultimercado-vitrine.vercel.app"
  ).replace(/\/+$/, "");

  // 1. Rotas estáticas principais
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/orcamento`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  // 2. Consulta Completa ao Supabase com limite ampliado para garantir todos os produtos
  try {
    const { data: produtos, error } = await supabase
      .from("produtos_afiliados")
      .select("slug, updated_at")
      .not("slug", "is", null)
      .limit(2000);

    if (!error && produtos && Array.isArray(produtos)) {
      for (const prod of produtos) {
        if (!prod.slug) continue;
        const cleanSlug = prod.slug.trim();
        if (!cleanSlug) continue;

        let lastModifiedDate: Date;
        try {
          lastModifiedDate = prod.updated_at ? new Date(prod.updated_at) : new Date();
          if (isNaN(lastModifiedDate.getTime())) lastModifiedDate = new Date();
        } catch {
          lastModifiedDate = new Date();
        }

        routes.push({
          url: `https://hubmultimercado-vitrine.vercel.app/peca/${cleanSlug}`,
          lastModified: lastModifiedDate,
          changeFrequency: "daily",
          priority: 0.8,
        });
      }
    } else if (error) {
      console.error("Erro ao consultar produtos no Supabase para sitemap:", error.message);
    }
  } catch (err) {
    console.error("Falha ao consultar produtos para o sitemap:", err);
  }

  return routes;
}

