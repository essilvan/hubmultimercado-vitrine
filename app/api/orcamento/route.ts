import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Part, type ResponseSchema } from "@google/generative-ai";
import { supabase } from "@/lib/supabase";
import {
  buscarPrecoMercadoLivre,
  buscarOfertaMercadoLivre,
  isTituloCompativel,
  validarTituloML,
  construirLinkContingenciaML,
  formatarLinkAfiliado,
  type OfertaRealML,
} from "@/lib/mercadolivre";

export const maxDuration = 60; // Permite até 60 segundos na Vercel
export const dynamic = 'force-dynamic';
export const runtime = "nodejs";

export interface VeiculoOrcamento {
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  motorizacao: string | null;
  placa: string | null;
}

export interface ItemOrcamento {
  peca_padronizada: string;
  quantidade: number;
  posicao: string | null;
  marcas_recomendadas: string;
  termo_busca_ml: string;

  // Campos para compatibilidade total com o frontend (page.tsx)
  termo_lido?: string;
  marca_preferencial?: string | null;
  marca_recomendada?: string;
  marca?: string | null;
  termo_busca_mercadolivre?: string;
  query_busca?: string;
  nome_peca?: string;
  confianca?: "alta" | "media" | "baixa";
  requer_confirmacao?: boolean;

  // Preço e variações aceitas
  preco?: number | null;
  price?: number | null;
  valor?: number | null;
  preco_ml?: number | null;
  preco_real_ml?: number | null;
  preco_formatado?: string | null;
  preco_medio?: string | null;
  preco_medio_estimado?: string | null;
  preco_estimado?: number | null;
  preco_estimado_unitario?: number | null;

  // Links diretos e afiliados
  link?: string | null;
  link_ml?: string | null;
  link_afiliado?: string | null;
  affiliate_link?: string | null;
  url?: string | null;
  permalink?: string | null;
  slug?: string | null;
  titulo_anuncio?: string | null;
  link_anuncio?: string | null;
  link_direto_anuncio?: string | null;
  tem_full?: boolean;
  thumbnail?: string | null;
  preco_original?: number | null;
  preco_real?: boolean;
}

export interface OrcamentoResposta {
  veiculo: VeiculoOrcamento;
  itens: ItemOrcamento[];
  observacoes_gerais?: string | null;
  veiculo_detectado?: string;
  total_estimado?: string;
}

export type { OfertaRealML };

const SYSTEM_INSTRUCTION = `Você é o motor central do PeçasFinder, um balconista sénior técnico de autopeças e especialista em catálogo do aftermarket brasileiro.
Sua missão é interpretar orçamentos (manuscritos ou digitados), identificar o veículo e gerar os itens técnicos corretos com queries de busca extremamente precisas para o Mercado Livre.

DIRETRIZES TÉCNICAS RÍGIDAS:
1. VEÍCULO: Extraia Marca, Modelo, Geração, Ano e Motorização exata. Se não constar, infira estritamente pelo contexto automotivo mais comum ou defina null.
2. DISCRIMINAÇÃO DE ITENS:
   - Se o orçamento pedir 'Disco e Pastilha', trate individualmente cada peça ou, se for mais vantajoso, especifique explicitamente como 'Kit Disco e Pastilhas Dianteiro'.
   - NUNCA atribua um anúncio de Kit quando o cliente pedir apenas um dos componentes avulsos (ex: pedir só pastilha e associar kit completo).
   - Peças de motor e filtros devem respeitar estritamente a motorização: Filtro de óleo para HB20 1.0 12V Kappa não pode ser associado a filtros de outros motores ou marcas.
3. QUERY CIRÚRGICA PARA O MERCADO LIVRE (termo_busca_ml):
   - Estrutura obrigatória: [Nome Canónico da Peça] + [Modelo do Carro] + [Motor/Ano] + [Marca Confiável recomendada].
   - Exemplo Filtro de Óleo: 'Filtro Oleo HB20 1.0 3 Cilindros Mann Mahle Fram Wega'
   - Exemplo Pastilhas: 'Jogo Pastilha Freio Dianteira HB20 1.0 Cobreq Fras-le Bosch'
   - Exemplo Discos: 'Par Disco Freio Ventilado Dianteiro HB20 1.0 Fremax Hipper Freios'
4. PREÇO MÉDIO DE MERCADO (preco_estimado_unitario): Forneça o valor unitário estimado realista no mercado de autopeças brasileiro em Reais (float numérico, ex: 85.00 ou 180.00).
5. RETORNO OBRIGATÓRIO: Retorne exclusivamente JSON aderente ao responseSchema fornecido.`;

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    veiculo: {
      type: SchemaType.OBJECT,
      properties: {
        marca: { type: SchemaType.STRING },
        modelo: { type: SchemaType.STRING },
        ano: { type: SchemaType.STRING },
        motorizacao: { type: SchemaType.STRING },
      },
      required: ["marca", "modelo", "ano"],
    },
    itens: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          peca_padronizada: { type: SchemaType.STRING },
          quantidade: { type: SchemaType.INTEGER },
          posicao: { type: SchemaType.STRING, nullable: true },
          marcas_recomendadas: { type: SchemaType.STRING },
          termo_busca_ml: { type: SchemaType.STRING },
          preco_estimado_unitario: { type: SchemaType.NUMBER, description: "Preço médio unitário de mercado em Reais (BRL)" },
        },
        required: ["peca_padronizada", "quantidade", "termo_busca_ml", "marcas_recomendadas"],
      },
    },
  },
  required: ["veiculo", "itens"],
};

/**
 * Consulta e sincroniza os preços reais do Mercado Livre e Supabase em paralelo com timeout rígido de 3.5s
 */
async function sincronizarPrecosReais(orcamento: OrcamentoResposta): Promise<OrcamentoResposta> {
  if (!orcamento?.itens || orcamento.itens.length === 0) return orcamento;

  const veiculo = orcamento.veiculo || {
    marca: null,
    modelo: null,
    ano: null,
    motorizacao: null,
    placa: null,
  };

  if (!orcamento.veiculo_detectado) {
    const partes = [veiculo.marca, veiculo.modelo, veiculo.motorizacao, veiculo.ano].filter(Boolean);
    orcamento.veiculo_detectado = partes.length > 0 ? partes.join(" ") : "Veículo Detectado";
  }

  // Paraleliza as consultas ao Supabase e Mercado Livre com AbortController de 3.5 segundos por requisição
  const resultados = await Promise.allSettled(
    orcamento.itens.map(async (item) => {
      const termoBusca = (item.termo_busca_ml || item.peca_padronizada || "").trim();
      const termoPeca = (item.peca_padronizada || "").trim();
      const linkFallback = formatarLinkAfiliado(
        `https://lista.mercadolivre.com.br/${encodeURIComponent(termoBusca)}_ItemCondition_2230284`
      );

      // 1. Verificação no Supabase: cruza com a tabela 'produtos_afiliados'
      let produtoBanco: any = null;
      try {
        const { data: dbItems, error: dbError } = await supabase
          .from("produtos_afiliados")
          .select("id, titulo, slug, preco_estimado, link_afiliado, imagem_url")
          .ilike("titulo", `%${termoPeca}%`)
          .limit(1);

        if (!dbError && dbItems && dbItems.length > 0) {
          produtoBanco = dbItems[0];
        }
      } catch (errDb) {
        console.warn("[Supabase] Aviso ao consultar produtos_afiliados:", errDb);
      }

      // 2. Busca de Preços no Mercado Livre com Timeout Rígido de 3.5s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      let oferta: OfertaRealML | null = null;

      try {
        oferta = await buscarOfertaMercadoLivre(
          termoBusca,
          controller.signal,
          veiculo,
          item.peca_padronizada,
          item.quantidade
        );
      } catch {
        // Timeout ou erro de rede do Mercado Livre
      } finally {
        clearTimeout(timeoutId);
      }

      // 3. Mapeamento e Exibição Correta do Preço:
      // Trata variações: (item.preco ?? item.price ?? item.valor ?? item.preco_ml ?? produtoBanco ?? Gemini)
      let precoNum: number | null = null;

      if (oferta && typeof oferta.preco === "number" && oferta.preco > 0) {
        precoNum = Number(oferta.preco);
      } else if (produtoBanco) {
        const valDb =
          produtoBanco.preco ??
          produtoBanco.price ??
          produtoBanco.valor ??
          produtoBanco.preco_ml ??
          produtoBanco.preco_estimado;

        if (typeof valDb === "number" && valDb > 0) {
          precoNum = valDb;
        } else if (valDb) {
          const cleaned = String(valDb).replace(/[^0-9.,]/g, "").replace(",", ".");
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed) && parsed > 0) {
            precoNum = parsed;
          }
        }
      }

      // Fallback para preço médio de mercado estimado pela IA se não encontrado no ML/banco
      if (
        precoNum === null &&
        typeof (item as any).preco_estimado_unitario === "number" &&
        (item as any).preco_estimado_unitario > 0
      ) {
        precoNum = Number((item as any).preco_estimado_unitario);
      }

      const precoFormatado = precoNum
        ? new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(Number(precoNum.toFixed(2)))
        : "Consulte o valor";

      // 4. Redirecionamento com Link de Afiliado Direto:
      // a) Priorize sempre o link direto de afiliado retornado do produto
      // b) Se não tiver link direto, rota interna (/peca/[slug]) ou busca com tag de afiliado
      let finalUrl = linkFallback;
      if (
        produtoBanco?.link_afiliado &&
        typeof produtoBanco.link_afiliado === "string" &&
        produtoBanco.link_afiliado.trim()
      ) {
        finalUrl = produtoBanco.link_afiliado.trim();
      } else if (oferta?.link && typeof oferta.link === "string" && oferta.link.trim()) {
        finalUrl = formatarLinkAfiliado(oferta.link.trim());
      } else if (produtoBanco?.slug) {
        finalUrl = `/peca/${produtoBanco.slug}`;
      } else if (oferta?.link_ml) {
        finalUrl = formatarLinkAfiliado(oferta.link_ml);
      }

      const thumbnailFinal = oferta?.thumbnail || produtoBanco?.imagem_url || null;
      const tituloAnuncioFinal = oferta?.titulo || produtoBanco?.titulo || item.peca_padronizada || null;

      return {
        ...item,
        nome_peca: item.peca_padronizada,
        termo_lido: item.peca_padronizada,
        marca_recomendada: item.marcas_recomendadas,
        marca_preferencial: item.marcas_recomendadas,
        termo_busca_mercadolivre: item.termo_busca_ml,
        query_busca: item.termo_busca_ml,
        confianca: "alta" as const,
        requer_confirmacao: false,

        // Mapeamento de todas as variações de preço para total compatibilidade
        preco: precoNum,
        price: precoNum,
        valor: precoNum,
        preco_ml: precoNum,
        preco_real_ml: precoNum,
        preco_formatado: precoFormatado,
        preco_medio: precoFormatado,
        preco_medio_estimado: precoFormatado,
        preco_estimado: precoNum,

        // Mapeamento de links com afiliado direto
        link: finalUrl,
        link_ml: finalUrl,
        link_afiliado: finalUrl,
        affiliate_link: finalUrl,
        url: finalUrl,
        permalink: oferta?.link_ml || finalUrl,
        link_anuncio: finalUrl,
        link_direto_anuncio: finalUrl,
        slug: produtoBanco?.slug || null,

        marca: oferta?.marca || produtoBanco?.marca || item.marcas_recomendadas,
        titulo_anuncio: tituloAnuncioFinal,
        tem_full: oferta?.tem_full || false,
        thumbnail: thumbnailFinal,
        preco_original: oferta?.original_price ? Number(oferta.original_price) : null,
        preco_real: precoNum !== null,
      };
    })
  );

  orcamento.itens = resultados.map((res, index) => {
    if (res.status === "fulfilled") {
      return res.value;
    }
    const item = orcamento.itens[index];
    const termoBusca = (item.termo_busca_ml || item.peca_padronizada || "").trim();
    const linkFallback = formatarLinkAfiliado(
      `https://lista.mercadolivre.com.br/${encodeURIComponent(termoBusca)}_ItemCondition_2230284`
    );
    const precoNum =
      typeof (item as any).preco_estimado_unitario === "number"
        ? Number((item as any).preco_estimado_unitario)
        : null;

    return {
      ...item,
      nome_peca: item.peca_padronizada,
      termo_lido: item.peca_padronizada,
      marca_recomendada: item.marcas_recomendadas,
      marca_preferencial: item.marcas_recomendadas,
      termo_busca_mercadolivre: item.termo_busca_ml,
      query_busca: item.termo_busca_ml,
      preco: precoNum,
      price: precoNum,
      valor: precoNum,
      preco_ml: precoNum,
      preco_real_ml: precoNum,
      preco_formatado: precoNum
        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(precoNum.toFixed(2)))
        : "Consulte o valor",
      preco_medio: "Consulte o valor",
      preco_medio_estimado: "Consulte o valor",
      preco_estimado: precoNum,
      link: linkFallback,
      link_ml: linkFallback,
      link_afiliado: linkFallback,
      affiliate_link: linkFallback,
      url: linkFallback,
      permalink: linkFallback,
      link_anuncio: linkFallback,
      link_direto_anuncio: linkFallback,
      marca: item.marcas_recomendadas,
      titulo_anuncio: null,
      tem_full: false,
      thumbnail: null,
      preco_real: precoNum !== null,
    };
  });

  // Recalcula o total_estimado somando estritamente os subtotais: (quantidade * preco)
  const totalNum = (orcamento.itens || []).reduce((acc, it) => {
    const preco =
      Number(it.preco ?? it.price ?? it.valor ?? it.preco_ml ?? it.preco_real_ml ?? it.preco_estimado) || 0;
    const qtd = Number(it.quantidade) || 1;
    return acc + qtd * preco;
  }, 0);

  if (totalNum > 0) {
    orcamento.total_estimado = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(totalNum.toFixed(2)));
  } else {
    orcamento.total_estimado = "Consulte o valor";
  }

  return orcamento;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const texto = formData.get("texto") as string | null;
    const imagem = formData.get("imagem") as File | null;

    const temTexto = Boolean(texto && texto.trim().length > 0);
    const temImagem = Boolean(imagem && typeof imagem.size === "number" && imagem.size > 0);

    if (!temTexto && !temImagem) {
      return NextResponse.json(
        {
          success: false,
          error: "Envie uma foto do orçamento ou digite a lista de peças para análise.",
        },
        { status: 400 }
      );
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
      .trim()
      .replace(/^["']|["']$/g, "");

    // Validação estrita da chave da API Gemini: sem fallback cego
    if (!apiKey) {
      const msgErro = "Chave GEMINI_API_KEY não configurada no servidor (.env.local).";
      console.error(`[ERRO CONFIGURAÇÃO] ${msgErro}`);
      return NextResponse.json(
        {
          success: false,
          error: msgErro,
        },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Preparação nativa dos conteúdos do Gemini (suporte multimodal com base64 e texto puro)
    const promptParts: Array<string | Part> = [];

    if (temImagem && imagem) {
      const buffer = Buffer.from(await imagem.arrayBuffer());
      const base64Data = buffer.toString("base64");
      const mimeType = imagem.type || "image/jpeg";

      promptParts.push({
        inlineData: {
          data: base64Data,
          mimeType,
        },
      });

      promptParts.push(
        temTexto
          ? `Orçamento mecânico fornecido pelo cliente:\n${texto!.trim()}`
          : "Transcreva, higienize e estruture com precisão todas as peças deste orçamento mecânico."
      );
    } else {
      // Entrada exclusivamente em texto puro
      promptParts.push(`Orçamento mecânico fornecido pelo cliente:\n${texto!.trim()}`);
    }

    // Modelos suportados pela API Gemini em ordem de prioridade (Flash rápido para responder em < 2s)
    const modelsToTry = [
      process.env.GEMINI_MODEL,
      "gemini-flash-latest",
      "gemini-3.8-flash",
      "gemini-2.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-1.5-flash",
    ].filter(Boolean) as string[];

    let rawJsonContent: string | null = null;
    let lastError: Error | unknown = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Gemini SDK] Invocando modelo: ${modelName}`);

        const modelInstance = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_INSTRUCTION,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        });

        const result = await modelInstance.generateContent(promptParts);
        const responseText = result.response.text();

        if (responseText && responseText.trim().length > 0) {
          rawJsonContent = responseText.trim();
          console.log(`[Gemini SDK Sucesso] Resposta obtida via ${modelName}`);
          break;
        } else {
          console.warn(`[Gemini SDK Aviso] Modelo ${modelName} retornou texto vazio.`);
        }
      } catch (err) {
        lastError = err;
        console.error(`[ERRO GEMINI SDK] Falha ao invocar modelo ${modelName}:`, err);
      }
    }

    // Se nenhum modelo da API Gemini responder com sucesso, lança o erro detalhado (sem fallback silencioso)
    if (!rawJsonContent) {
      const detalheErro =
        lastError instanceof Error
          ? `${lastError.name}: ${lastError.message}`
          : String(lastError || "Sem resposta dos modelos Gemini.");

      console.error("[ERRO CRÍTICO GEMINI]: Todos os modelos falharam. Detalhe:", detalheErro);

      return NextResponse.json(
        {
          success: false,
          error: `Falha na API Gemini: ${detalheErro}. Verifique chave, cota ou payload.`,
        },
        { status: 500 }
      );
    }

    // Limpeza de possíveis marcadores markdown ```json ... ```
    let cleanJson = rawJsonContent.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    let parsedData: any;
    try {
      parsedData = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error("[ERRO PARSER JSON GEMINI] Conteúdo recebido:", cleanJson);
      return NextResponse.json(
        {
          success: false,
          error: `Payload retornado pelo Gemini é um JSON inválido: ${cleanJson.slice(0, 200)}`,
        },
        { status: 500 }
      );
    }

    // Normaliza estrutura de retorno de acordo com as interfaces
    const orcamentoEstruturado: OrcamentoResposta = {
      veiculo: {
        marca: parsedData.veiculo?.marca || null,
        modelo: parsedData.veiculo?.modelo || null,
        ano: parsedData.veiculo?.ano || null,
        motorizacao: parsedData.veiculo?.motorizacao || null,
        placa: null,
      },
      itens: (parsedData.itens || []).map((it: any) => ({
        peca_padronizada: it.peca_padronizada,
        quantidade: Number(it.quantidade) || 1,
        posicao: it.posicao || null,
        marcas_recomendadas: it.marcas_recomendadas || "Original / Homologada",
        termo_busca_ml: it.termo_busca_ml,
        preco_estimado_unitario: typeof it.preco_estimado_unitario === "number" ? it.preco_estimado_unitario : null,
      })),
    };

    // Sincroniza preços reais e links de contingência do Mercado Livre
    const orcamentoFinal = await sincronizarPrecosReais(orcamentoEstruturado);

    return NextResponse.json({
      success: true,
      data: orcamentoFinal,
    });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? `${err.name}: ${err.message}` : "Erro desconhecido ao processar orçamento.";
    console.error("[ERRO FATAL ORÇAMENTO CATCH]:", err);
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
