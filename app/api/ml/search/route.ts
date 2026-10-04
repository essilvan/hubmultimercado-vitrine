import { NextRequest, NextResponse } from "next/server";
import { buscarProdutoML } from "@/lib/mercadolivre";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || searchParams.get("q");

    if (!query || typeof query !== "string" || !query.replace(/[\/\\_\-]/g, " ").replace(/\s+/g, " ").trim()) {
      return NextResponse.json(
        { success: false, error: "Informe o código ou termo de busca na query ?q= (ex: ?q=SYL 1092)." },
        { status: 400 }
      );
    }

    const queryLimpa = query.replace(/[\/\\_\-]/g, " ").replace(/\s+/g, " ").trim();
    const resultado = await buscarProdutoML(queryLimpa);

    if (!resultado || !resultado.produtoProntoParaSalvar) {
      return NextResponse.json(
        {
          success: false,
          error: `Nenhum anúncio correspondente foi localizado no Mercado Livre para "${queryLimpa}".`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      resultado,
      produto: resultado.produtoProntoParaSalvar,
    });
  } catch (err: unknown) {
    console.error("Erro na busca de produtos ML (GET):", err);
    const msg = err instanceof Error ? err.message : "Falha ao processar busca no Mercado Livre.";
    const isRateLimit = msg.includes("Limite temporário");
    return NextResponse.json({ success: false, error: msg }, { status: isRateLimit ? 429 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, autoSave = false } = body;

    if (!query || typeof query !== "string" || !query.replace(/[\/\\_\-]/g, " ").replace(/\s+/g, " ").trim()) {
      return NextResponse.json(
        { success: false, error: "Informe o código ou nome da peça para buscar." },
        { status: 400 }
      );
    }

    const queryLimpa = query.replace(/[\/\\_\-]/g, " ").replace(/\s+/g, " ").trim();
    const resultado = await buscarProdutoML(queryLimpa);

    if (!resultado || !resultado.produtoProntoParaSalvar) {
      return NextResponse.json(
        {
          success: false,
          error: `Nenhum anúncio correspondente foi localizado no Mercado Livre para a busca "${queryLimpa}".`,
        },
        { status: 404 }
      );
    }

    const produtoDados = resultado.produtoProntoParaSalvar;

    if (!autoSave) {
      return NextResponse.json({
        success: true,
        preview: true,
        resultado,
        produto: produtoDados,
      });
    }

    const supabase = getSupabaseClient();
    const recordParaSalvar = {
      titulo: produtoDados.titulo,
      slug: produtoDados.slug,
      codigo_fabricante: produtoDados.codigo_fabricante,
      marca: produtoDados.marca,
      categoria: produtoDados.categoria || "Autopeças",
      veiculos_compativeis: produtoDados.veiculos_compativeis || "Consulte compatibilidade no anúncio",
      codigo_oem: produtoDados.codigo_oem || null,
      busca_ml: produtoDados.busca_ml || queryLimpa,
      preco_estimado: produtoDados.preco_estimado,
      preco_antigo: produtoDados.preco_antigo || null,
      desconto_percentual: produtoDados.desconto_percentual || null,
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
        throw new Error(`Erro ao atualizar produto no Supabase: ${error.message}`);
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
      message: `Produto "${produtoSalvo.titulo}" cadastrado com sucesso!`,
      produto: produtoSalvo,
      resultadoML: resultado,
    });
  } catch (err: unknown) {
    console.error("Erro na busca de produtos ML (POST):", err);
    const msg = err instanceof Error ? err.message : "Falha ao processar busca no Mercado Livre.";
    const isRateLimit = msg.includes("Limite temporário");
    return NextResponse.json({ success: false, error: msg }, { status: isRateLimit ? 429 : 500 });
  }
}
