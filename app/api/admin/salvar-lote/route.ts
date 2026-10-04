import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ItemExtraidoCatalogo } from "@/lib/catalogo-types";
import { generateSlug } from "@/lib/catalogo-types";

export const runtime = "nodejs";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prioriza service_role se disponível, com fallback para anon key
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Variáveis do Supabase não configuradas no servidor.");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items = body.items as ItemExtraidoCatalogo[];

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhum produto fornecido para gravação." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Normaliza o payload para as colunas da tabela produtos_afiliados
    const records = items.map((item, index) => {
      const slugBase = item.slug || generateSlug(item.titulo);
      return {
        titulo: item.titulo.trim(),
        slug: slugBase || `produto-${Date.now()}-${index}`,
        codigo_fabricante: item.codigo_fabricante.trim(),
        marca: item.marca.trim(),
        categoria: item.categoria?.trim() || null,
        veiculos_compativeis: item.veiculos_compativeis?.trim() || null,
        codigo_oem: item.codigo_oem?.trim() || null,
        busca_ml:
          item.busca_ml?.trim() ||
          `${item.marca.trim()} ${item.codigo_fabricante.trim()}`,
        preco_estimado: item.preco_estimado || null,
        imagem_url: item.imagem_url?.trim() || null,
        especificacoes:
          item.link_destino?.trim() || item.link_ml?.trim()
            ? {
                link_destino: item.link_destino?.trim() || item.link_ml?.trim(),
                link_ml: item.link_destino?.trim() || item.link_ml?.trim(),
              }
            : null,
      };
    });

    let insertedCount = 0;
    const errors: { index: number; slug: string; message: string }[] = [];

    // Gravação em lote com chunks de 25 para segurança de payload
    const chunkSize = 25;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);

      // Tenta upsert baseado em slug
      const { data, error } = await supabase
        .from("produtos_afiliados")
        .upsert(chunk, { onConflict: "slug" })
        .select("id, slug");

      if (error) {
        console.error(`Erro ao gravar lote ${i / chunkSize + 1}:`, error);

        // Se o erro for de permissão RLS
        if (error.code === "42501") {
          return NextResponse.json(
            {
              success: false,
              code: "42501",
              error:
                "Permissão negada no Supabase (código 42501). É necessário conceder privilégios na tabela 'produtos_afiliados'.",
              sqlFix:
                "GRANT ALL ON TABLE produtos_afiliados TO anon, authenticated, service_role;\nALTER TABLE produtos_afiliados DISABLE ROW LEVEL SECURITY;",
            },
            { status: 403 }
          );
        }

        // Tenta gravar individualmente para não abortar todo o lote
        for (let j = 0; j < chunk.length; j++) {
          const singleRecord = chunk[j];
          const { error: singleErr } = await supabase
            .from("produtos_afiliados")
            .upsert(singleRecord, { onConflict: "slug" });

          if (singleErr) {
            errors.push({
              index: i + j,
              slug: singleRecord.slug,
              message: singleErr.message,
            });
          } else {
            insertedCount++;
          }
        }
      } else {
        insertedCount += data?.length || chunk.length;
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      totalRequested: items.length,
      insertedCount,
      errorsCount: errors.length,
      errors: errors.slice(0, 10), // Limita primeiros 10 erros para resposta limpa
      message: `Gravação finalizada: ${insertedCount} de ${items.length} produtos gravados com sucesso no Supabase!`,
    });
  } catch (error: unknown) {
    console.error("Erro interno ao gravar lote:", error);
    const msg =
      error instanceof Error ? error.message : "Erro desconhecido ao salvar lote.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
