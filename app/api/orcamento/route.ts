import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Part, type ResponseSchema } from "@google/generative-ai";
import { supabase } from "@/lib/supabase";
import { formatarLinkAfiliado } from "@/lib/mercadolivre";

export const maxDuration = 60; // Permite até 60 segundos na Vercel
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface ItemOrcamentoProcessado {
  nome: string;
  termo_busca: string;
  titulo_anuncio: string | null;
  preco: number | null;
  imagem_url: string | null;
  link: string;
  link_afiliado: string;
  encontrado: boolean;
  quantidade: number;
  // Campos de compatibilidade legada com frontend
  peca_padronizada: string;
  nome_peca: string;
  termo_busca_ml: string;
  termo_busca_mercadolivre: string;
  query_busca: string;
  price?: number | null;
  valor?: number | null;
  preco_ml?: number | null;
  preco_real_ml?: number | null;
  preco_formatado?: string;
  thumbnail?: string | null;
  marca?: string | null;
  tem_full?: boolean;
  confianca?: "alta" | "media" | "baixa";
  requer_confirmacao?: boolean;
}

export interface OrcamentoRespostaRefatorada {
  veiculo: string;
  placa: string | null;
  itens: ItemOrcamentoProcessado[];
  total_estimado: string;
}

/**
 * Prompt cirúrgico: Gemini atua EXCLUSIVAMENTE como extrator técnico.
 * Ele NÃO inventa preços, estoques, URLs ou anúncios.
 */
const SYSTEM_INSTRUCTION = `Você é um extrator técnico automotivo especializado do PeçasFinder.
Sua missão é extrair estritamente as informações mecânicas do orçamento (imagem ou texto) com foco cirúrgico no cabeçalho do veículo e na lista de peças de reposição.

DIRETRIZES TÉCNICAS RÍGIDAS:
1. CABEÇALHO DO VEÍCULO:
   - Identifique com máxima precisão: Marca, Modelo, Versão, Motorização, Válvulas, Combustível e Ano (ex: "Fiat Toro Freedom 2.0 16V Diesel 2018").
   - Identifique a Placa se visível (ex: "BRA2E19"), ou retorne null.
2. EXTRAÇÃO TÉCNICA DAS PEÇAS:
   - Extraia exclusivamente peças físicas de reposição e componentes de manutenção preventiva/corretiva (ex: pastilhas, discos, amortecedores, filtros, óleo, velas, embreagem, correias, bombas, buchas, pivôs, terminais).
   - DESCARTE mão de obra, serviços, diagnósticos, alinhamento, balanceamento e lavagem.
3. CONSTRUÇÃO DO TERMO DE BUSCA (termo_busca):
   - Monte para cada peça um termo de busca altamente específico para o Mercado Livre combinando:
     [Nome da Peça] + [Modelo] + [Motor/Combustível] + [Ano]
   - Exemplos obrigatórios:
     * "pastilha freio dianteira toro diesel 2.0 2018"
     * "amortecedor dianteiro toro diesel 2.0 2018"
     * "filtro oleo gol g5 1.0 2011"
     * "jogo vela ignicao onix 1.0 2016"
4. ZERO ALUCINAÇÃO:
   - NÃO invente preços, estoques, códigos de anúncio ou URLs.
   - Retorne exclusivamente o JSON estruturado conforme o schema.`;

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    veiculo: {
      type: SchemaType.STRING,
      description: "Marca, Modelo, Versão, Motorização e Ano (ex: Fiat Toro Freedom 2.0 16V Diesel 2018)",
    },
    placa: {
      type: SchemaType.STRING,
      nullable: true,
      description: "Placa do veículo se presente no orçamento, ou null",
    },
    pecas: {
      type: SchemaType.ARRAY,
      description: "Lista de peças mecânicas encontradas no orçamento",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          nome: {
            type: SchemaType.STRING,
            description: "Nome canônico da peça (ex: Pastilha de Freio Dianteira)",
          },
          termo_busca: {
            type: SchemaType.STRING,
            description: "Termo de busca altamente específico combinando: [Nome da Peça] + [Modelo] + [Motor/Combustível] + [Ano]",
          },
        },
        required: ["nome", "termo_busca"],
      },
    },
  },
  required: ["veiculo", "pecas"],
};

interface MLSearchResult {
  titulo_anuncio: string | null;
  preco: number | null;
  imagem_url: string | null;
  link: string;
  encontrado: boolean;
}

/**
 * ETAPA 2 - Busca Oficial em Tempo Real na API do Mercado Livre (MLB1747)
 * Categoria MLB1747 restringe estritamente para Peças de Carros e Caminhonetes.
 */
async function buscarItemMercadoLivre(
  termoBusca: string,
  nomePeca: string,
  signal?: AbortSignal
): Promise<MLSearchResult> {
  const queryLimpa = termoBusca.trim();
  const linkFallback = formatarLinkAfiliado(
    `https://lista.mercadolivre.com.br/${encodeURIComponent(queryLimpa)}_ItemCondition_2230284`
  );

  // 1. Consulta direta na API oficial do Mercado Livre com categoria restrita MLB1747
  const endpointML = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(
    queryLimpa
  )}&category=MLB1747&limit=1`;

  try {
    const res = await fetch(endpointML, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal,
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      const firstItem = data.results && data.results.length > 0 ? data.results[0] : null;

      if (firstItem) {
        const tituloReal = firstItem.title || nomePeca;
        const precoReal =
          typeof firstItem.price === "number" && firstItem.price > 0
            ? Number(firstItem.price)
            : null;

        let imagemAltaRes = firstItem.thumbnail || null;
        if (imagemAltaRes) {
          imagemAltaRes = imagemAltaRes
            .replace("-I.jpg", "-O.jpg")
            .replace("-I.webp", "-O.webp")
            .replace("-V.jpg", "-O.jpg")
            .replace(/^http:\/\//i, "https://");
        }

        const linkAnuncio = formatarLinkAfiliado(firstItem.permalink || linkFallback);

        return {
          titulo_anuncio: tituloReal,
          preco: precoReal,
          imagem_url: imagemAltaRes,
          link: linkAnuncio,
          encontrado: true,
        };
      }
    }
  } catch {
    // API oficial externa indisponível ou timeout
  }

  // 2. Consulta de contingência no Supabase (produtos_afiliados cadastrados no catálogo)
  try {
    const { data: dbItems } = await supabase
      .from("produtos_afiliados")
      .select("id, titulo, slug, preco_estimado, link_afiliado, imagem_url")
      .ilike("titulo", `%${nomePeca}%`)
      .limit(1);

    if (dbItems && dbItems.length > 0) {
      const dbProd = dbItems[0];
      let precoDb: number | null = null;
      if (dbProd.preco_estimado) {
        const cleaned = String(dbProd.preco_estimado).replace(/[^0-9.,]/g, "").replace(",", ".");
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed) && parsed > 0) {
          precoDb = parsed;
        }
      }

      const linkDb = dbProd.link_afiliado
        ? formatarLinkAfiliado(dbProd.link_afiliado)
        : dbProd.slug
        ? `/peca/${dbProd.slug}`
        : linkFallback;

      return {
        titulo_anuncio: dbProd.titulo || nomePeca,
        preco: precoDb,
        imagem_url: dbProd.imagem_url || null,
        link: linkDb,
        encontrado: true,
      };
    }
  } catch {
    // Supabase indisponível
  }

  // 3. Fallback estrito: Preço null e link apontando para busca geral do termo no ML com tag de afiliado
  return {
    titulo_anuncio: null,
    preco: null,
    imagem_url: null,
    link: linkFallback,
    encontrado: false,
  };
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

    // Preparação nativa dos conteúdos (suporte multimodal com imagem base64 ou texto puro)
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
          ? `Orçamento mecânico fornecido pelo cliente:\n${texto!.trim()}\nExtraia rigorosamente o cabeçalho do veículo e as peças mecânicas.`
          : "Analise a imagem da ordem de serviço. Extraia rigorosamente o cabeçalho do veículo e as peças mecânicas de reposição."
      );
    } else {
      promptParts.push(
        `Orçamento mecânico fornecido pelo cliente:\n${texto!.trim()}\nExtraia rigorosamente o cabeçalho do veículo e as peças mecânicas.`
      );
    }

    // Modelos suportados: Prioriza gemini-2.5-flash e alternativas ativas da Google
    const modelsToTry = [
      process.env.GEMINI_MODEL,
      "gemini-2.5-flash",
      "gemini-flash-latest",
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-1.5-flash",
    ].filter(Boolean) as string[];

    let rawJsonContent: string | null = null;
    let lastError: Error | unknown = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Gemini SDK] Invocando modelo extrator: ${modelName}`);

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
          console.log(`[Gemini SDK Sucesso] Extração concluída via modelo ${modelName}`);
          break;
        } else {
          console.warn(`[Gemini SDK Aviso] Modelo ${modelName} retornou texto vazio.`);
        }
      } catch (err) {
        lastError = err;
        console.error(`[ERRO GEMINI SDK] Falha ao invocar modelo ${modelName}:`, err);
      }
    }

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

    // Limpeza de blocos de código markdown se presentes
    let cleanJson = rawJsonContent.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    let parsedData: {
      veiculo?: string;
      placa?: string | null;
      pecas?: Array<{ nome: string; termo_busca: string }>;
    };

    try {
      parsedData = JSON.parse(cleanJson);
    } catch {
      console.error("[ERRO PARSER JSON GEMINI] Conteúdo recebido:", cleanJson);
      return NextResponse.json(
        {
          success: false,
          error: `Payload retornado pelo Gemini é um JSON inválido: ${cleanJson.slice(0, 200)}`,
        },
        { status: 500 }
      );
    }

    const veiculoDetectado = parsedData.veiculo || "Veículo não especificado";
    const placaDetectada = parsedData.placa && parsedData.placa !== "null" ? parsedData.placa.trim().toUpperCase() : null;
    const pecasExtraidas = Array.isArray(parsedData.pecas) ? parsedData.pecas : [];

    // ETAPA 2: Busca paralela em tempo real no Mercado Livre com timeout rígido de 3.5s
    const resultadosBusca = await Promise.allSettled(
      pecasExtraidas.map(async (peca) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        try {
          const resultado = await buscarItemMercadoLivre(
            peca.termo_busca,
            peca.nome,
            controller.signal
          );
          clearTimeout(timeoutId);
          return resultado;
        } catch {
          clearTimeout(timeoutId);
          const linkFallback = formatarLinkAfiliado(
            `https://lista.mercadolivre.com.br/${encodeURIComponent(peca.termo_busca)}_ItemCondition_2230284`
          );
          return {
            titulo_anuncio: null,
            preco: null,
            imagem_url: null,
            link: linkFallback,
            encontrado: false,
          };
        }
      })
    );

    // Estruturação final com mapeamento de todas as propriedades esperadas
    const itensProcessados: ItemOrcamentoProcessado[] = pecasExtraidas.map((peca, idx) => {
      const resBusca = resultadosBusca[idx];
      const dadosItem = resBusca.status === "fulfilled" ? resBusca.value : null;

      const precoNum = dadosItem?.preco ?? null;
      const precoFormatado = precoNum !== null
        ? precoNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "Consultar no Mercado Livre";

      const linkFinal = dadosItem?.link || formatarLinkAfiliado(
        `https://lista.mercadolivre.com.br/${encodeURIComponent(peca.termo_busca)}_ItemCondition_2230284`
      );

      return {
        nome: peca.nome,
        termo_busca: peca.termo_busca,
        titulo_anuncio: dadosItem?.titulo_anuncio || peca.nome,
        preco: precoNum,
        imagem_url: dadosItem?.imagem_url || null,
        link: linkFinal,
        link_afiliado: linkFinal,
        encontrado: dadosItem?.encontrado ?? false,
        quantidade: 1,

        // Compatibilidade com interfaces legadas
        peca_padronizada: peca.nome,
        nome_peca: peca.nome,
        termo_busca_ml: peca.termo_busca,
        termo_busca_mercadolivre: peca.termo_busca,
        query_busca: peca.termo_busca,
        price: precoNum,
        valor: precoNum,
        preco_ml: precoNum,
        preco_real_ml: precoNum,
        preco_formatado: precoFormatado,
        thumbnail: dadosItem?.imagem_url || null,
        marca: "Original / Homologada",
        tem_full: false,
        confianca: "alta",
        requer_confirmacao: false,
      };
    });

    // Cálculo do total somando apenas itens com preço numérico confirmado
    const totalNumerico = itensProcessados.reduce((acc, it) => acc + (it.preco || 0), 0);
    const totalFormatado = totalNumerico > 0
      ? totalNumerico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "Consultar no Mercado Livre";

    return NextResponse.json({
      success: true,
      veiculo: veiculoDetectado,
      placa: placaDetectada,
      itens: itensProcessados,
      total_estimado: totalFormatado,
      // Estrutura de dados para compatibilidade total
      data: {
        veiculo: {
          marca: null,
          modelo: null,
          ano: null,
          motorizacao: null,
          placa: placaDetectada,
          nome_completo: veiculoDetectado,
        },
        veiculo_detectado: veiculoDetectado,
        placa: placaDetectada,
        itens: itensProcessados,
        total_estimado: totalFormatado,
      },
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
