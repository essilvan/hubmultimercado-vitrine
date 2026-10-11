import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://hubmultimercado-vitrine.vercel.app';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  // Busca todos os registos sem filtros condicionais
  const { data: produtos, error } = await supabase
    .from('produtos_afiliados')
    .select('slug, updated_at');

  console.log('[DEBUG SITEMAP] Total retornado do Supabase:', produtos?.length);

  if (error) {
    console.error('[ERRO SUPABASE SITEMAP]:', error.message);
  }

  const produtosUrls: MetadataRoute.Sitemap = (produtos || [])
    .filter((p) => p.slug && typeof p.slug === 'string' && p.slug.trim() !== '')
    .map((item) => ({
      url: `${baseUrl}/peca/${encodeURIComponent(item.slug.trim())}`,
      lastModified: item.updated_at ? new Date(item.updated_at) : new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));

  console.log('[DEBUG SITEMAP] Total de URLs de pecas geradas:', produtosUrls.length);

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
