import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

// 1. Força a rota a ser executada sempre dinamicamente no servidor
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://hubmultimercado-vitrine.vercel.app';

  // 2. Inicializa o Supabase diretamente na rota do sitemap
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 3. Procura TODOS os produtos sem limite restritivo
  const { data: produtos, error } = await supabase
    .from('produtos_afiliados')
    .select('slug, updated_at')
    .not('slug', 'is', null)
    .range(0, 1000);

  if (error) {
    console.error('[ERRO SITEMAP SUPABASE]:', error);
  }

  const produtosUrls: MetadataRoute.Sitemap = (produtos || []).map((item) => ({
    url: `${baseUrl}/peca/${item.slug}`,
    lastModified: item.updated_at ? new Date(item.updated_at) : new Date(),
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
