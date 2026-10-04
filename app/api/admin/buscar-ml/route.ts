import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buscarProdutoML } from "@/lib/mercadolivre";

export const runtime = "nodejs";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Credenciais do Supabase não configuradas.");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, autoSave = true } = body;

    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json(
        { success: false, error: "Informe o código ou nome da peça para buscar (ex: SYL 1092 ou LUK 620 3268 00 HB20)." },
        { status: 400 }
      );
    }

    const queryLimpa = query.trim();

    // 1. Busca produto via API do Mercado Livre priorizando menor preço e Full
    const resultado = await buscarProdutoML(queryLimpa);

    if (!resultado || !resultado.produtoProntoParaSalvar) {
      return NextResponse.json(
        {
          success: false,
          error: `Nenhum anúncio correspondente foi localizado no Mercado Livre para a busca "${queryLimpa}". Verifique o código e tente novamente.`,
        },
        { status: 404 }
      );
    }

    const produtoDados = resultado.produtoProntoParaSalvar;

    // Se autoSave estiver desabilitado, apenas retorna o preview
    if (!autoSave) {
      return NextResponse.json({
        success: true,
        preview: true,
        resultado,
        produto: produtoDados,
      });
    }

    // 2. Salva / Upsert direto no Supabase (tabela produtos_afiliados)
    const supabase = getSupabaseClient();

    // Objeto limpo estritamente mapeado com as colunas reais da tabela produtos_afiliados
    const recordParaSalvar = {
      titulo: produtoDados.titulo,
      slug: produtoDados.slug,
      codigo_fabricante: produtoDados.codigo_fabricante,
      marca: produtoDados.marca, // Marca oficial (ex: "SYL")
      categoria: produtoDados.categoria || "Autopeças",
      veiculos_compativeis: produtoDados.veiculos_compativeis || "Consulte compatibilidade no anúncio",
      codigo_oem: produtoDados.codigo_oem || null,
      busca_ml: produtoDados.busca_ml || queryLimpa,
      preco_estimado: produtoDados.preco_estimado, // Preço promocional real (ex: "R$ 31,92")
      preco_antigo: produtoDados.preco_antigo || null, // Preço original cheio (ex: "R$ 39,90" ou null)
      desconto_percentual: produtoDados.desconto_percentual || null, // Selo de desconto (ex: "20% OFF" ou null)
      imagem_url: produtoDados.imagem_url || null,
      link_afiliado: produtoDados.link_afiliado || null,
      especificacoes: {
        ...(produtoDados.especificacoes || {}),
        marca: produtoDados.marca,
        preco: produtoDados.preco_estimado,
        preco_antigo: produtoDados.preco_antigo || null,
        desconto_percentual: produtoDados.desconto_percentual || null,
      },
      updated_at: new Date().toISOString(),
    };

    // Verifica se já existe um produto com o mesmo slug ou código
    const { data: existente } = await supabase
      .from("produtos_afiliados")
      .select("id, slug")
      .or(`slug.eq.${recordParaSalvar.slug},codigo_fabricante.eq.${recordParaSalvar.codigo_fabricante}`)
      .limit(1)
      .maybeSingle();

    let produtoSalvo;

    if (existente && existente.id) {
      const { data, error } = await supabase
        .from("produtos_afiliados")
        .update(recordParaSalvar)
        .eq("id", existente.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Erro ao atualizar produto existente no Supabase: ${error.message}`);
      }
      produtoSalvo = data;
    } else {
      const { data, error } = await supabase
        .from("produtos_afiliados")
        .insert({
          ...recordParaSalvar,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Erro ao cadastrar produto no Supabase: ${error.message}`);
      }
      produtoSalvo = data;
    }

    return NextResponse.json({
      success: true,
      message: `Produto "${produtoSalvo.titulo}" cadastrado com sucesso na vitrine!`,
      produto: {
        ...produtoSalvo,
        preco: produtoSalvo.preco_estimado,
      },
      resultadoML: resultado,
    });
  } catch (err: unknown) {
    console.error("Erro na busca e cadastro via API do ML:", err);
    const msg = err instanceof Error ? err.message : "Falha interna ao processar busca no Mercado Livre.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
