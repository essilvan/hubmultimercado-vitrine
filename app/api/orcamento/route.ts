import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Part, type ResponseSchema } from "@google/generative-ai";

export const maxDuration = 60; // Permite até 60 segundos na Vercel
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ============================================================================
// 1. CONFIGURAÇÃO E AUTENTICAÇÃO MERCADO LIVRE
// ============================================================================
const ML_TOOL = process.env.ML_MATT_TOOL || '31976628';
const ML_WORD = process.env.ML_MATT_WORD || 'hubmultimercado';

const CLIENT_ID = process.env.ML_CLIENT_ID || '2324571286119138';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'yjbLRYJenI5VI8r7bH4JamoeKNTMyw4W';

function formatarLinkAfiliado(url: string): string {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  // Garante que não duplique caso já exista
  if (url.includes('matt_tool')) return url;
  return `${url}${sep}matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
}

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

  try {
    console.log("[ML OAuth] Solicitando novo Bearer Token OAuth ao Mercado Livre...");
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", CLIENT_ID);
    params.append("client_secret", CLIENT_SECRET);

    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    console.log(`[ML OAuth] Resposta HTTP ${res.status}`);

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
      console.log(`[ML OAuth] Token obtido com sucesso! Válido por ${expiresInSeconds}s`);
      return data.access_token;
    }
  } catch (err) {
    console.error("[ML OAuth] Exceção durante requisição do token:", err);
  }

  return null;
}

// ============================================================================
// 2. EXTRAÇÃO COM GEMINI (com fallback de modelos resilientes)
// ============================================================================
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-3.8-flash'
];

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
  preco_estimado?: number | null;
  marca?: string | null;
  tem_full?: boolean;
}

// ============================================================================
// ESTIMATIVA DE PREÇOS E EXTRATOR LOCAL DE CONTINGÊNCIA (FALLBACK SEM ERRO)
// ============================================================================
function estimarPrecoPeca(nomePeca: string): number {
  const p = nomePeca.toLowerCase();
  if (p.includes("amortecedor")) return 280;
  if (p.includes("pastilha")) return 95;
  if (p.includes("disco")) return 160;
  if (p.includes("embreagem")) return 450;
  if (p.includes("correia") || p.includes("tensor")) return 140;
  if (p.includes("vela")) return 110;
  if (p.includes("filtro") && p.includes("oleo")) return 40;
  if (p.includes("filtro")) return 55;
  if (p.includes("oleo")) return 150;
  if (p.includes("bomba")) return 210;
  if (p.includes("bucha") || p.includes("pivo") || p.includes("pivô") || p.includes("bieleta")) return 75;
  if (p.includes("bateria")) return 390;
  if (p.includes("radiador")) return 340;
  return 120;
}

function extrairOrcamentoLocalmente(textoBruto: string): {
  veiculo: string;
  modelo_chave: string;
  placa: string | null;
  pecas: Array<{ nome: string; termo_busca: string; preco_estimado?: number }>;
} {
  const texto = textoBruto || "Revisão Geral";
  const linhas = texto
    .split(/\r?\n|;|\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let veiculo = "Veículo não especificado";
  let modeloChave = "veiculo";
  let placa: string | null = null;
  const listaBruta: string[] = [];

  const placaMatch = texto.match(/\b([A-Z]{3}[0-9][A-Z0-9][0-9]{2})\b/i);
  if (placaMatch) {
    placa = placaMatch[1].toUpperCase();
  }

  for (const linha of linhas) {
    const matchVeic = linha.match(/(?:ve[íi]culo|carro|auto|modelo)\s*[:=-]\s*(.+)/i);
    if (matchVeic && !veiculo.includes(" ")) {
      veiculo = matchVeic[1].trim();
      continue;
    }

    const lLower = linha.toLowerCase();
    if (
      /m[ãa]o\s*de\s*obra|servi[çc]o|alinhamento|balanceamento|lavagem|mecanica/i.test(lLower) &&
      !/filtro|pastilha|disco|amortecedor|correia|vela|embreagem/i.test(lLower)
    ) {
      continue;
    }

    if (!veiculo || veiculo === "Veículo não especificado") {
      const montadoras = ["chevrolet", "fiat", "volkswagen", "vw", "ford", "toyota", "honda", "hyundai", "renault", "nissan", "jeep", "peugeot", "citroen", "mitsubishi", "bmw"];
      if (montadoras.some((m) => lLower.includes(m))) {
        veiculo = linha.replace(/^[^a-zA-Z0-9]+/, "").trim();
        continue;
      }
    }

    const pecaLimpa = linha
      .replace(/^[-*•\d.)\s]+/, "")
      .replace(/\b(troca\s*de|jogo\s*de|kit\s*de|par\s*de|unidade|unid|qtd|pecas?)\b/gi, "")
      .trim();

    if (pecaLimpa.length >= 3) {
      listaBruta.push(pecaLimpa);
    }
  }

  const palavrasVeiculo = veiculo.toLowerCase().split(/\s+/).filter(Boolean);
  modeloChave = palavrasVeiculo[1] || palavrasVeiculo[0] || "veiculo";

  const pecas = (listaBruta.length > 0 ? listaBruta : ["Revisão Geral"]).map((nomePeca) => {
    const nomeFormatado = nomePeca.charAt(0).toUpperCase() + nomePeca.slice(1);
    return {
      nome: nomeFormatado,
      termo_busca: `${nomeFormatado} ${modeloChave}`.trim(),
      preco_estimado: estimarPrecoPeca(nomeFormatado),
    };
  });

  return {
    veiculo,
    modelo_chave: modeloChave.toLowerCase(),
    placa,
    pecas,
  };
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

  console.log(`[Busca ML] Consultando: "${termoBusca}" (Token presente: ${Boolean(token)})`);

  try {
    let res = await fetch(endpoint, {
      headers,
      signal,
      cache: "no-store",
    });

    console.log(`[Busca ML] Status HTTP ${res.status} para busca "${termoBusca}"`);

    // Se falhar com token (ex: 401 ou 403), tenta sem token na busca pública
    if (!res.ok && token) {
      console.warn(`[Busca ML] Falha com Bearer Token (${res.status}). Tentando busca pública sem token...`);
      delete headers["Authorization"];
      res = await fetch(endpoint, {
        headers,
        signal,
        cache: "no-store",
      });
      console.log(`[Busca ML] Status HTTP (sem token) ${res.status} para "${termoBusca}"`);
    }

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
              .replace("-V.webp", "-O.webp")
              .replace(/^http:\/\//i, "https://");
          }

          const linkAfiliado = itemCompativel.permalink
            ? formatarLinkAfiliado(itemCompativel.permalink)
            : formatarLinkAfiliado(
                `https://lista.mercadolivre.com.br/veiculos-acessorios-pecas/${encodeURIComponent(termoBusca)}`
              );

          console.log(`[Busca ML] Sucesso: "${titulo}" | Preço: ${preco} | Link: ${linkAfiliado}`);

          return {
            titulo,
            preco,
            imagem,
            linkAfiliado,
            encontrado: true,
          };
        }
      } else {
        console.warn(`[Busca ML] 0 resultados retornados para "${termoBusca}"`);
      }
    } else {
      const errText = await res.text().catch(() => "");
      console.error(`[Busca ML] Erro HTTP ${res.status} ao consultar "${termoBusca}":`, errText.slice(0, 150));
    }
  } catch (err) {
    console.error(`[Busca ML] Exceção ao buscar "${termoBusca}":`, err);
  }

  // Fallback obrigatório com link de busca na categoria MLB1747 e tag de afiliado
  const linkBusca = formatarLinkAfiliado(
    `https://lista.mercadolivre.com.br/veiculos-acessorios-pecas/${encodeURIComponent(termoBusca)}`
  );

  return {
    titulo: null,
    preco: null,
    imagem: null,
    linkAfiliado: linkBusca,
    encontrado: false,
  };
}

// ============================================================================
// HANDLER PRINCIPAL POST (app/api/orcamento/route.ts)
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    let texto: string | null = null;
    let imagem: File | null = null;
    let imagemBase64: string | null = null;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      texto = body.texto || body.textoOuImagem || body.prompt || body.orcamento || null;
      if (body.imagem || body.image || body.file) {
        imagemBase64 = String(body.imagem || body.image || body.file);
      }
    } else {
      try {
        const formData = await request.formData();
        texto = formData.get("texto") as string | null;
        imagem = formData.get("imagem") as File | null;
      } catch {
        const body = await request.json().catch(() => ({}));
        texto = body.texto || body.textoOuImagem || body.prompt || body.orcamento || null;
      }
    }

    const temTexto = Boolean(texto && texto.trim().length > 0);
    const temImagem = Boolean((imagem && typeof imagem.size === "number" && imagem.size > 0) || imagemBase64);

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

    let parsedData: {
      veiculo: string;
      modelo_chave: string;
      placa?: string | null;
      pecas: Array<{ nome: string; termo_busca: string; preco_estimado?: number }>;
    } | null = null;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const promptParts: Array<string | Part> = [];

      if (imagemBase64) {
        const cleanBase64 = imagemBase64.replace(/^data:image\/\w+;base64,/, "");
        promptParts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: "image/jpeg",
          },
        });
        promptParts.push(
          temTexto
            ? `Foto do orçamento anexada. Detalhes complementares fornecidos pelo cliente:\n"""\n${texto}\n"""\n\nExtraia os dados técnicos com máxima precisão conforme as diretrizes.`
            : "Foto do orçamento anexada. Extraia os dados técnicos com máxima precisão conforme as diretrizes."
        );
      } else if (temImagem && imagem) {
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

      for (const candidateModel of MODEL_CANDIDATES) {
        try {
          const model = genAI.getGenerativeModel({
            model: candidateModel,
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
            console.warn(`[Gemini Fallback] Modelo ${candidateModel} retornou resposta vazia. Tentando próximo modelo...`);
            continue;
          }

          const cleanJson = textOutput
            .trim()
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "");

          const parsed = JSON.parse(cleanJson);
          if (parsed && Array.isArray(parsed.pecas) && parsed.pecas.length > 0) {
            parsedData = parsed;
            console.log(`[Gemini] Extração realizada com sucesso com o modelo: ${candidateModel}`);
            break;
          }
        } catch (err: any) {
          const status = err?.status || err?.statusCode || (err?.message?.match(/\b(503|429|404|500)\b/)?.[0]);
          console.warn(
            `[Gemini Fallback] Modelo ${candidateModel} falhou${status ? ` (${status})` : ""}: ${err?.message || err}. Tentando próximo modelo...`
          );
        }
      }
    }

    // Se todos os modelos Gemini falharem (503, 429, 404, etc.) ou se a chave não estiver configurada,
    // cai automaticamente no extrator local de contingência sem dar erro 503 na tela!
    if (!parsedData) {
      console.warn("[Fallback IA] Modelos de IA indisponíveis ou sobrecarregados. Resolvendo orçamento localmente!");
      parsedData = extrairOrcamentoLocalmente(texto || "Revisão Geral");
    }

    const veiculoDetectado = parsedData.veiculo || "Veículo não especificado";
    const palavrasVeiculo = veiculoDetectado.toLowerCase().split(/\s+/).filter(Boolean);
    const modeloChave = (
      parsedData.modelo_chave ||
      palavrasVeiculo[1] ||
      palavrasVeiculo[0] ||
      ""
    ).toLowerCase().trim();
    const placaDetectada = parsedData.placa && parsedData.placa !== "null" ? parsedData.placa.trim().toUpperCase() : null;
    const pecasExtraidas = Array.isArray(parsedData.pecas) ? parsedData.pecas : [];

    // 1. Obtenção do Bearer Token OAuth do Mercado Livre
    const token = await obterTokenMercadoLivre();

    // 2. Consulta ao vivo na API do Mercado Livre para cada peça em paralelo com timeout de 5.0s
    const resultadosBusca = await Promise.allSettled(
      pecasExtraidas.map(async (peca) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
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
          const linkFallback = formatarLinkAfiliado(
            `https://lista.mercadolivre.com.br/veiculos-acessorios-pecas/${encodeURIComponent(peca.termo_busca)}`
          );
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

      const precoEstimado = (peca as any).preco_estimado || estimarPrecoPeca(peca.nome);
      const precoNum = dadosItem?.preco ?? precoEstimado ?? null;
      const precoFormatado = precoNum !== null && precoNum > 0
        ? precoNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "Consultar no Mercado Livre";

      const fallbackLink = formatarLinkAfiliado(
        `https://lista.mercadolivre.com.br/veiculos-acessorios-pecas/${encodeURIComponent(peca.termo_busca)}`
      );
      const linkFinal = formatarLinkAfiliado(dadosItem?.linkAfiliado || fallbackLink);

      return {
        nome: peca.nome,
        termo_busca: peca.termo_busca,
        titulo: dadosItem?.titulo || `${peca.nome} - ${veiculoDetectado}`,
        titulo_anuncio: dadosItem?.titulo || `${peca.nome} - ${veiculoDetectado}`,
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
        preco_estimado: precoEstimado,
        marca: "Original / Homologada",
        tem_full: false,
      };
    });

    // 3. Soma numérica do total do orçamento
    const totalNumerico = itensProcessados.reduce((acc, it) => acc + (typeof it.preco === "number" ? it.preco : 0), 0);
    const totalFormatado = totalNumerico > 0
      ? totalNumerico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "Consultar no Mercado Livre";

    const linkKitCompleto = formatarLinkAfiliado(
      `https://lista.mercadolivre.com.br/veiculos-acessorios-pecas/${encodeURIComponent(
        `${pecasExtraidas.map((x) => x.nome).join(" ")} ${veiculoDetectado}`.trim()
      )}`
    );

    return NextResponse.json({
      success: true,
      sucesso: true,
      veiculo: veiculoDetectado,
      modelo_chave: modeloChave,
      placa: placaDetectada,
      itens: itensProcessados,
      pecas: itensProcessados,
      resultados: itensProcessados,
      total: totalNumerico,
      precoTotal: totalNumerico,
      total_estimado: totalFormatado,
      total_numerico: totalNumerico,
      linkKitCompleto,
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
        pecas: itensProcessados,
        total_estimado: totalFormatado,
        total_numerico: totalNumerico,
        linkKitCompleto,
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
