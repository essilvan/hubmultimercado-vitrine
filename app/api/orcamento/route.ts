import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Part, type ResponseSchema } from "@google/generative-ai";

export const maxDuration = 60; // Permite até 60 segundos na Vercel
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ============================================================================
// 1. AUTENTICAÇÃO MERCADO LIVRE (Server-to-Server com cache em memória)
// ============================================================================
interface MLTokenCache {
  token: string;
  expiresAt: number;
}

let mlTokenCache: MLTokenCache | null = null;

async function obterTokenMercadoLivre(): Promise<string | null> {
  // Retorna do cache em memória se ainda estiver válido (margem de segurança de 60s)
  if (mlTokenCache && Date.now() < mlTokenCache.expiresAt - 60000) {
    return mlTokenCache.token;
  }

  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[ML OAuth] ML_CLIENT_ID ou ML_CLIENT_SECRET não configurados no ambiente.");
    return null;
  }

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);

    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[ML OAuth] Falha ao obter token (${res.status}):`, errText);
      return null;
    }

    const data = await res.json();
    if (data.access_token) {
      const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 21600;
      mlTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + expiresInSeconds * 1000,
      };
      return data.access_token;
    }
  } catch (err) {
    console.error("[ML OAuth] Exceção durante requisição do token:", err);
  }

  return null;
}

// ============================================================================
// 2. EXTRAÇÃO COM GEMINI (gemini-2.5-flash)
// ============================================================================
const SYSTEM_INSTRUCTION = `Você é um extrator técnico automotivo especializado do PeçasFinder.
Sua missão é extrair estritamente as informações mecânicas do orçamento (imagem ou texto) com foco cirúrgico no cabeçalho do veículo e na lista de peças de reposição.

DIRETRIZES TÉCNICAS RÍGIDAS:
1. VEÍCULO:
   - "veiculo": nome completo com marca e ano (ex: "Chevrolet Onix 1.0 2016", "Fiat Toro Freedom 2.0 16V Diesel 2018").
   - "modelo_chave": apenas o modelo principal em minúsculas (ex: "onix", "civic", "hb20", "gol", "toro", "corolla").
   - "placa": placa identificada se visível (ex: "BRA2E19"), ou null.
2. PEÇAS:
   - Extraia exclusivamente peças físicas de reposição mecânica (pastilhas, discos, amortecedores, filtros, óleo, velas, embreagem, correias, bombas, buchas, pivôs, terminais).
   - DESCARTE mão de obra, serviços, diagnósticos, alinhamento, balanceamento e lavagem.
3. CONSTRUÇÃO DO TERMO DE BUSCA (termo_busca):
   - O "termo_busca" DEVE OBRIGATORIAMENTE conter: [nome da peça] + [modelo_chave] + [motorização/ano].
   - Exemplos obrigatórios:
     * "pastilha freio dianteira onix 1.0"
     * "amortecedor dianteiro onix 1.0"
     * "pastilha freio dianteira toro diesel 2.0 2018"
     * "filtro oleo gol 1.6 2012"
4. ZERO ALUCINAÇÃO:
   - NÃO invente preços, estoques, códigos ou URLs.
   - Retorne exclusivamente o JSON estruturado conforme o schema.`;

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    veiculo: {
      type: SchemaType.STRING,
      description: "Nome completo do veículo com marca e ano (ex: Chevrolet Onix 1.0 2016)",
    },
    modelo_chave: {
      type: SchemaType.STRING,
      description: "Apenas o modelo principal em minúsculas (ex: onix, civic, hb20, gol, toro)",
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
            description: "Obrigatório: [nome da peça] + [modelo_chave] + [motorização/ano] (ex: pastilha freio dianteira onix 1.0)",
          },
        },
        required: ["nome", "termo_busca"],
      },
    },
  },
  required: ["veiculo", "modelo_chave", "pecas"],
};

export interface ItemOrcamentoProcessado {
  nome: string;
  termo_busca: string;
  titulo: string | null;
  titulo_anuncio: string | null;
  preco: number | null;
  imagem: string | null;
  imagem_url: string | null;
  thumbnail: string | null;
  linkAfiliado: string;
  link_afiliado: string;
  link: string;
  encontrado: boolean;
  quantidade: number;
  // Campos de compatibilidade com frontend
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
  marca?: string | null;
  tem_full?: boolean;
}

// ============================================================================
// 3. CONSULTA AO VIVO NA API DO MERCADO LIVRE
// ============================================================================
interface MLItemResultado {
  titulo: string | null;
  preco: number | null;
  imagem: string | null;
  linkAfiliado: string;
  encontrado: boolean;
}

async function buscarItemMercadoLivre(
  termoBuscaOriginal: string,
  nomePeca: string,
  modeloChave: string,
  token: string | null,
  signal?: AbortSignal
): Promise<MLItemResultado> {
  let termoBusca = termoBuscaOriginal.trim();
  const modLower = (modeloChave || "").toLowerCase().trim();

  // Garante que o termo_busca contenha a modelo_chave
  if (modLower && !termoBusca.toLowerCase().includes(modLower)) {
    termoBusca = `${nomePeca} ${modLower}`.trim();
  }

  const endpoint = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(
    termoBusca
  )}&category=MLB1747&limit=10`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(endpoint, {
      headers,
      signal,
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      const results: any[] = Array.isArray(data.results) ? data.results : [];

      if (results.length > 0) {
        // Encontra o primeiro item cujo título contenha obrigatoriamente a 'modelo_chave'
        let itemCompativel: any = null;
        if (modLower) {
          itemCompativel = results.find((item: any) =>
            (item?.title || "").toLowerCase().includes(modLower)
          );
        }

        // Se não encontrar com filtro exato, utilize results[0]
        if (!itemCompativel) {
          itemCompativel = results[0];
        }

        if (itemCompativel) {
          const titulo = itemCompativel.title || nomePeca;
          const preco =
            typeof itemCompativel.price === "number" && itemCompativel.price > 0
              ? Number(itemCompativel.price)
              : null;

          let imagem: string | null = null;
          if (itemCompativel.thumbnail) {
            imagem = itemCompativel.thumbnail
              .replace("-I.jpg", "-O.jpg")
              .replace("-I.webp", "-O.webp")
              .replace("-V.jpg", "-O.jpg")
              .replace(/^http:\/\//i, "https://");
          }

          // Aplica tags oficiais no permalink retornado
          const mattTool = process.env.ML_MATT_TOOL || process.env.NEXT_PUBLIC_ML_MATT_TOOL || "31976628";
          const mattWord = process.env.ML_MATT_WORD || process.env.NEXT_PUBLIC_ML_MATT_WORD || "hubmultimercado";

          let linkAfiliado: string;
          if (itemCompativel.permalink) {
            const sep = itemCompativel.permalink.includes("?") ? "&" : "?";
            linkAfiliado = `${itemCompativel.permalink}${sep}matt_tool=${mattTool}&matt_word=${mattWord}`;
          } else {
            linkAfiliado = `https://lista.mercadolivre.com.br/${encodeURIComponent(termoBusca)}_ItemCondition_2230284?matt_tool=${mattTool}&matt_word=${mattWord}`;
          }

          return {
            titulo,
            preco,
            imagem,
            linkAfiliado,
            encontrado: true,
          };
        }
      }
    }
  } catch (err) {
    console.error(`[Busca ML] Erro ao buscar "${termoBusca}":`, err);
  }

  // Fallback quando a API não retorna resultados
  const mattTool = process.env.ML_MATT_TOOL || process.env.NEXT_PUBLIC_ML_MATT_TOOL || "31976628";
  const mattWord = process.env.ML_MATT_WORD || process.env.NEXT_PUBLIC_ML_MATT_WORD || "hubmultimercado";
  const linkFallback = `https://lista.mercadolivre.com.br/${encodeURIComponent(termoBusca)}_ItemCondition_2230284?matt_tool=${mattTool}&matt_word=${mattWord}`;

  return {
    titulo: null,
    preco: null,
    imagem: null,
    linkAfiliado: linkFallback,
    encontrado: false,
  };
}

// ============================================================================
// HANDLER PRINCIPAL POST (app/api/orcamento/route.ts)
// ============================================================================
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
          ? `Foto do orçamento anexada. Detalhes complementares fornecidos pelo cliente:\n"""\n${texto}\n"""\n\nExtraia os dados técnicos com máxima precisão conforme as diretrizes.`
          : "Foto do orçamento anexada. Extraia os dados técnicos com máxima precisão conforme as diretrizes."
      );
    } else if (temTexto && texto) {
      promptParts.push(
        `Texto do orçamento / lista de peças digitada pelo cliente:\n"""\n${texto}\n"""\n\nExtraia os dados técnicos com máxima precisão conforme as diretrizes.`
      );
    }

    // Instanciação do modelo rápido gemini-2.5-flash
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1,
      },
    });

    const result = await model.generateContent(promptParts);
    const response = await result.response;
    const textOutput = response.text();

    if (!textOutput || !textOutput.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "O modelo de IA não retornou conteúdo estruturado do orçamento.",
        },
        { status: 500 }
      );
    }

    let parsedData: {
      veiculo: string;
      modelo_chave: string;
      placa?: string | null;
      pecas: Array<{ nome: string; termo_busca: string }>;
    };

    try {
      const cleanJson = textOutput
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "");
      parsedData = JSON.parse(cleanJson);
    } catch {
      console.error("[ERRO PARSER JSON GEMINI] Conteúdo recebido:", textOutput);
      return NextResponse.json(
        {
          success: false,
          error: `Payload retornado pelo Gemini é um JSON inválido: ${textOutput.slice(0, 200)}`,
        },
        { status: 500 }
      );
    }

    const veiculoDetectado = parsedData.veiculo || "Veículo não especificado";
    const modeloChave = (parsedData.modelo_chave || "").toLowerCase().trim();
    const placaDetectada = parsedData.placa && parsedData.placa !== "null" ? parsedData.placa.trim().toUpperCase() : null;
    const pecasExtraidas = Array.isArray(parsedData.pecas) ? parsedData.pecas : [];

    // 1. Obtenção do Bearer Token OAuth do Mercado Livre
    const token = await obterTokenMercadoLivre();

    // 3. Consulta ao vivo na API do Mercado Livre para cada peça em paralelo com timeout de 3.5s
    const mattTool = process.env.ML_MATT_TOOL || process.env.NEXT_PUBLIC_ML_MATT_TOOL || "31976628";
    const mattWord = process.env.ML_MATT_WORD || process.env.NEXT_PUBLIC_ML_MATT_WORD || "hubmultimercado";

    const resultadosBusca = await Promise.allSettled(
      pecasExtraidas.map(async (peca) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        try {
          const resultado = await buscarItemMercadoLivre(
            peca.termo_busca,
            peca.nome,
            modeloChave,
            token,
            controller.signal
          );
          clearTimeout(timeoutId);
          return resultado;
        } catch {
          clearTimeout(timeoutId);
          const linkFallback = `https://lista.mercadolivre.com.br/${encodeURIComponent(peca.termo_busca)}_ItemCondition_2230284?matt_tool=${mattTool}&matt_word=${mattWord}`;
          return {
            titulo: null,
            preco: null,
            imagem: null,
            linkAfiliado: linkFallback,
            encontrado: false,
          };
        }
      })
    );

    // Mapeamento e estruturação de cada item
    const itensProcessados: ItemOrcamentoProcessado[] = pecasExtraidas.map((peca, idx) => {
      const resBusca = resultadosBusca[idx];
      const dadosItem = resBusca.status === "fulfilled" ? resBusca.value : null;

      const precoNum = dadosItem?.preco ?? null;
      const precoFormatado = precoNum !== null
        ? precoNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "Consultar no Mercado Livre";

      const fallbackLink = `https://lista.mercadolivre.com.br/${encodeURIComponent(peca.termo_busca)}_ItemCondition_2230284?matt_tool=${mattTool}&matt_word=${mattWord}`;
      const linkFinal = dadosItem?.linkAfiliado || fallbackLink;

      return {
        nome: peca.nome,
        termo_busca: peca.termo_busca,
        titulo: dadosItem?.titulo || peca.nome,
        titulo_anuncio: dadosItem?.titulo || peca.nome,
        preco: precoNum,
        imagem: dadosItem?.imagem || null,
        imagem_url: dadosItem?.imagem || null,
        thumbnail: dadosItem?.imagem || null,
        linkAfiliado: linkFinal,
        link_afiliado: linkFinal,
        link: linkFinal,
        encontrado: dadosItem?.encontrado ?? false,
        quantidade: 1,

        // Compatibilidade com interfaces legadas do frontend
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
        marca: "Original / Homologada",
        tem_full: false,
      };
    });

    // 4. Soma numérica do total do orçamento
    const totalNumerico = itensProcessados.reduce((acc, it) => acc + (typeof it.preco === "number" ? it.preco : 0), 0);
    const totalFormatado = totalNumerico > 0
      ? totalNumerico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "Consultar no Mercado Livre";

    return NextResponse.json({
      success: true,
      veiculo: veiculoDetectado,
      modelo_chave: modeloChave,
      placa: placaDetectada,
      itens: itensProcessados,
      total_estimado: totalFormatado,
      total_numerico: totalNumerico,
      // Estrutura para compatibilidade total
      data: {
        veiculo: {
          marca: null,
          modelo: modeloChave,
          ano: null,
          motorizacao: null,
          placa: placaDetectada,
          nome_completo: veiculoDetectado,
        },
        veiculo_detectado: veiculoDetectado,
        modelo_chave: modeloChave,
        placa: placaDetectada,
        itens: itensProcessados,
        total_estimado: totalFormatado,
        total_numerico: totalNumerico,
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
