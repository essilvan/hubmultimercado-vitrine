import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

// Desativa qualquer cache estático para que novos produtos no Supabase apareçam em tempo real
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://hubmultimercado-vitrine.vercel.app';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Consulta exclusivamente a coluna 'slug' para evitar quebras com colunas opcionais ou inexistentes
  const { data: produtos, error } = await supabase
    .from('produtos_afiliados')
    .select('slug')
    .not('slug', 'is', null)
    .range(0, 5000);

  if (error) {
    console.error('[ERRO SUPABASE SITEMAP]:', error.message);
  }

  // Gera as entradas dos produtos garantindo que nenhum slug em branco seja incluído
  const produtosUrls: MetadataRoute.Sitemap = (produtos || [])
    .filter((p) => p.slug && p.slug.trim() !== '')
    .map((item) => ({
      url: `${baseUrl}/peca/${encodeURIComponent(item.slug.trim())}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/orcamento`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...produtosUrls,
  ];
}
