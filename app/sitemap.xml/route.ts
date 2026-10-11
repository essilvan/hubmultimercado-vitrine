import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const baseUrl = 'https://hubmultimercado-vitrine.vercel.app';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  // Busca todos os produtos com paginação explícita
  let allSlugs: { slug: string; updated_at?: string }[] = [];
  let from = 0;
  const step = 200;
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

  const urlsXml = allSlugs
    .filter((item) => item.slug && item.slug.trim() !== '')
    .map((item) => {
      const lastmod = item.updated_at ? new Date(item.updated_at).toISOString() : new Date().toISOString();
      return `  <url>
    <loc>${baseUrl}/peca/${item.slug.trim()}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join('\n');

  const now = new Date().toISOString();

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/orcamento</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
${urlsXml}
</urlset>`;

  return new NextResponse(xmlContent, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
