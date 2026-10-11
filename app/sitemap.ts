import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600; // Revalidação a cada 1 hora para inclusão automática de novos produtos

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

  // 2. Busca todos os produtos ativos que possuam slug no Supabase (limite ampliado para 1000)
  try {
    const { data: produtos, error } = await supabase
      .from("produtos_afiliados")
      .select("slug, updated_at, created_at")
      .not("slug", "is", null)
      .limit(1000);

    if (!error && produtos && Array.isArray(produtos)) {
      for (const prod of produtos) {
        const cleanSlug = prod.slug?.trim();
        if (!cleanSlug) continue;

        let lastModDate: Date;
        try {
          lastModDate =
            prod.updated_at || prod.created_at
              ? new Date(prod.updated_at || prod.created_at)
              : new Date();
          if (isNaN(lastModDate.getTime())) lastModDate = new Date();
        } catch {
          lastModDate = new Date();
        }

        routes.push({
          url: `${baseUrl}/peca/${cleanSlug}`,
          lastModified: lastModDate,
          changeFrequency: "daily",
          priority: 0.8,
        });
      }
    }
  } catch (err) {
    console.error("Falha ao consultar produtos para o sitemap:", err);
  }

  return routes;
}

