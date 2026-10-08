import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buscarProdutoML } from "@/lib/mercadolivre";
import { gerarSlugUnicoNoBanco } from "@/lib/slug";

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

    if (!query || typeof query !== "string" || !query.replace(/[\/\\_\-]/g, ' ').replace(/\s+/g, ' ').trim()) {
      return NextResponse.json(
        { success: false, error: "Informe o código ou nome da peça para buscar (ex: ?q=SYL 1092)." },
        { status: 400 }
      );
    }

    const queryLimpa = query.replace(/[\/\\_\-]/g, ' ').replace(/\s+/g, ' ').trim();
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

    return NextResponse.json({
      success: true,
      resultado,
      produto: resultado.produtoProntoParaSalvar,
    });
  } catch (err: unknown) {
    console.error("Erro na busca via API do ML (GET):", err);
    const msg = err instanceof Error ? err.message : "Falha interna ao processar busca no Mercado Livre.";
    const isRateLimit = msg.includes("Limite temporário");
    return NextResponse.json({ success: false, error: msg }, { status: isRateLimit ? 429 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, autoSave = true } = body;

    if (!query || typeof query !== "string" || !query.replace(/[\/\\_\-]/g, ' ').replace(/\s+/g, ' ').trim()) {
      return NextResponse.json(
        { success: false, error: "Informe o código ou nome da peça para buscar (ex: SYL 1092 ou LUK 620 3268 00 HB20)." },
        { status: 400 }
      );
    }

    const queryLimpa = query.replace(/[\/\\_\-]/g, ' ').replace(/\s+/g, ' ').trim();

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

    // 2. Trava prévia por ml_id: se já existe, sincroniza preços e preserva id e slug originais
    const supabase = getSupabaseClient();
    const mlbId = (resultado.id || produtoDados.ml_id || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

    if (mlbId) {
      const { data: existentePorMlId } = await supabase
        .from("produtos_afiliados")
        .select("*")
        .or(`ml_id.eq.${mlbId},especificacoes->>ml_id.eq.${mlbId}`)
        .limit(1)
        .maybeSingle();

      if (existentePorMlId && existentePorMlId.id) {
        const payloadUpdate = {
          ml_id: mlbId,
          preco_estimado: produtoDados.preco_estimado,
          preco_antigo: produtoDados.preco_antigo || null,
          desconto_percentual: produtoDados.desconto_percentual || null,
          ultima_sincronizacao: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          especificacoes: {
            ...(existentePorMlId.especificacoes || {}),
            ml_id: mlbId,
            preco: produtoDados.preco_estimado,
            preco_antigo: produtoDados.preco_antigo || null,
            desconto_percentual: produtoDados.desconto_percentual || null,
            ultima_sincronizacao: new Date().toISOString(),
          },
        };

        const { data: produtoAtualizado, error: errUpdate } = await supabase
          .from("produtos_afiliados")
          .update(payloadUpdate)
          .eq("id", existentePorMlId.id)
          .select()
          .single();

        if (errUpdate) {
          console.warn("Aviso ao atualizar preços de produto existente:", errUpdate.message);
        }

        const prodFinal = produtoAtualizado || existentePorMlId;

        return NextResponse.json({
          success: true,
          alreadyExists: true,
          message: "Produto já cadastrado! Dados e preços foram sincronizados.",
          produto: {
            ...prodFinal,
            preco: prodFinal.preco_estimado,
          },
          resultadoML: resultado,
        });
      }
    }

    // 3. Produto novo: gera slug único limpo (apenas adicionando hash se houver colisão de slug no banco)
    const slugUnico = await gerarSlugUnicoNoBanco(
      supabase,
      {
        titulo: produtoDados.titulo,
        marca: produtoDados.marca,
        modelo: (produtoDados.especificacoes as any)?.dados_tecnicos?.modelo,
        veiculo: produtoDados.veiculos_compativeis,
        codigo: produtoDados.codigo_fabricante,
        hash: mlbId ? mlbId.replace(/\D/g, "").slice(-4) : Date.now().toString().slice(-4),
      },
      undefined,
      mlbId
    );

    // Objeto limpo estritamente mapeado com as colunas reais da tabela produtos_afiliados
    const recordParaSalvar = {
      ml_id: mlbId || null,
      titulo: produtoDados.titulo,
      slug: slugUnico,
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
      descricao: produtoDados.descricao || produtoDados.especificacoes?.descricao_completa || null,
      aplicacao: produtoDados.aplicacao || produtoDados.especificacoes?.aplicacao || [],
      palavras_chave: produtoDados.palavras_chave || produtoDados.especificacoes?.palavras_chave || [],
      especificacoes: {
        ...(produtoDados.especificacoes || {}),
        ml_id: mlbId || undefined,
        marca: produtoDados.marca,
        preco: produtoDados.preco_estimado,
        preco_antigo: produtoDados.preco_antigo || null,
        desconto_percentual: produtoDados.desconto_percentual || null,
        aplicacao: produtoDados.especificacoes?.aplicacao || [],
        compatibility: produtoDados.especificacoes?.compatibility || "",
        palavras_chave: produtoDados.palavras_chave || produtoDados.especificacoes?.palavras_chave || [],
        dados_tecnicos: produtoDados.especificacoes?.dados_tecnicos || {},
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: produtoSalvo, error: insertError } = await supabase
      .from("produtos_afiliados")
      .upsert(recordParaSalvar, { onConflict: "slug" })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Erro ao cadastrar produto no Supabase: ${insertError.message}`);
    }

    return NextResponse.json({
      success: true,
      alreadyExists: false,
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
    const isRateLimit = msg.includes("Limite temporário");
    return NextResponse.json({ success: false, error: msg }, { status: isRateLimit ? 429 : 500 });
  }
}
