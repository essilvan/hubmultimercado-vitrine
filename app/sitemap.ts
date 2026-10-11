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

  // Busca paginada para contornar qualquer teto do PostgREST
  let allSlugs: { slug: string; updated_at?: string }[] = [];
  let from = 0;
  const step = 500;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('produtos_afiliados')
      .select('slug, updated_at')
      .not('slug', 'is', null)
      .range(from, from + step - 1);

    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      allSlugs = [...allSlugs, ...data];
      if (data.length < step) {
        hasMore = false;
      } else {
        from += step;
      }
    }
  }

  const produtosUrls: MetadataRoute.Sitemap = allSlugs
    .filter((p) => p.slug && typeof p.slug === 'string' && p.slug.trim() !== '')
    .map((item) => ({
      url: `${baseUrl}/peca/${encodeURIComponent(item.slug.trim())}`,
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
