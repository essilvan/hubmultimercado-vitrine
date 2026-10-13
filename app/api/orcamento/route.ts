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
 * Modelos conhecidos do mercado brasileiro para deteccao de conflitos
 */
const MODELOS_CONCORRENTES = [
  "onix", "prisma", "celta", "corsa", "cruze", "tracker", "spin", "s10", "montana", "astra", "vectra",
  "gol", "fox", "polo", "voyage", "saveiro", "up", "virtus", "nivus", "t-cross", "golf", "jetta",
  "palio", "uno", "strada", "toro", "mobi", "argo", "cronos", "fiorino", "siena", "punto",
  "hb20", "creta", "tucson", "i30", "ix35",
  "ka", "fiesta", "ecosport", "focus", "fusion", "ranger",
  "corolla", "hilux", "yaris", "etios",
  "civic", "fit", "city", "hrv", "crv",
  "sandero", "logan", "duster", "kwid", "captur", "clio",
  "kicks", "march", "versa", "frontier", "sentra",
  "renegade", "compass", "commander",
  "206", "207", "208", "2008", "3008",
  "c3", "c4"
];

/**
 * Extrai o modelo principal do veículo em lowercase limpo (ex: "onix", "civic", "hb20", "toro", "gol")
 */
function extrairModeloPrincipal(veiculo: string): string {
  if (!veiculo || typeof veiculo !== "string") return "";

  const marcas = [
    "chevrolet", "gm", "volkswagen", "vw", "fiat", "ford", "hyundai", "toyota",
    "honda", "renault", "nissan", "jeep", "peugeot", "citroen", "citroën", "mitsubishi",
    "audi", "bmw", "mercedes-benz", "mercedes", "kia", "chery", "caoa chery", "byd"
  ];

  const descartes = [
    "freedom", "volcano", "endurance", "ranch", "ultra", "trekking", "drive", "precision",
    "attactive", "sporting", "hgt", "way", "fire", "firefly", "evo", "ea111", "msi", "tsi",
    "comfortline", "highline", "trendline", "cross", "track", "joy", "lt", "ltz", "premier",
    "active", "evolution", "zen", "intense", "iconic", "outsider", "sense", "advance", "exclusive",
    "lx", "lxs", "ex", "exl", "touring", "gli", "xei", "altis", "gr-s", "longitude", "trailhawk",
    "limited", "sedan", "hatch", "suv", "pickup", "picape", "sw", "wagon", "total flex", "flex",
    "diesel", "gasolina", "alcool", "gnv", "turbo", "aspirado", "manual", "automatico", "aut"
  ];

  let limpo = veiculo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Remove marcas conhecidas
  for (const m of marcas) {
    limpo = limpo.replace(new RegExp(`\\b${m}\\b`, "gi"), " ");
  }

  // Remove anos de 4 dígitos (ex: 2016, 2018) e motorizações (ex: 1.0, 2.0, 16v, 8v)
  limpo = limpo.replace(/\b(19\d\d|20\d\d)\b/g, " ");
  limpo = limpo.replace(/\b\d+\.\d+\b/g, " ");
  limpo = limpo.replace(/\b\d+v\b/g, " ");
  limpo = limpo.replace(/[^a-z0-9\s-]/g, " ");

  const tokens = limpo.split(/\s+/).filter((t) => t.length >= 2);
  const modeloValido = tokens.find((t) => !descartes.includes(t)) || tokens[0] || "";
  return modeloValido.trim();
}

/**
 * Validação de compatibilidade do título do anúncio com o modelo do carro
 */
function isTituloCompativelComModelo(titulo: string, modeloPrincipal: string): boolean {
  if (!titulo) return false;
  const titLower = titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!modeloPrincipal) return true;

  const modLower = modeloPrincipal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const contemModelo = new RegExp(`\\b${modLower}\\b`, "i").test(titLower) || titLower.includes(modLower);

  const outrosConflitantes = MODELOS_CONCORRENTES.filter((m) => m !== modLower);
  const temConcorrente = outrosConflitantes.some((concorrente) => {
    return new RegExp(`\\b${concorrente}\\b`, "i").test(titLower);
  });

  // Se o título menciona um concorrente (ex: Civic, Gol) e NÃO menciona o modelo do carro, é incompatível!
  if (temConcorrente && !contemModelo) {
    return false;
  }

  return contemModelo;
}

/**
 * ETAPA 2 - Busca Oficial em Tempo Real na API do Mercado Livre (MLB1747)
 * Categoria MLB1747 restringe estritamente para Peças de Carros e Caminhonetes.
 * Traz os 5 primeiros resultados e faz varredura filtrando pelo modelo exato do veículo.
 */
async function buscarItemMercadoLivre(
  termoBuscaOriginal: string,
  nomePeca: string,
  veiculoCompleto: string,
  signal?: AbortSignal
): Promise<MLSearchResult> {
  const modeloPrincipal = extrairModeloPrincipal(veiculoCompleto); // ex: 'onix', 'toro', 'civic'

  // 1. Montagem do termo de busca cirúrgico:
  // Garante o nome da peça + modelo principal
  let termoBuscaCirurgico = termoBuscaOriginal.trim();
  if (modeloPrincipal) {
    const termoLower = termoBuscaCirurgico.toLowerCase();
    const modeloLower = modeloPrincipal.toLowerCase();
    if (!termoLower.includes(modeloLower)) {
      termoBuscaCirurgico = `${nomePeca} ${modeloPrincipal}`.trim();
    }
  }

  const linkFallback = formatarLinkAfiliado(
    `https://lista.mercadolivre.com.br/${encodeURIComponent(termoBuscaCirurgico)}_ItemCondition_2230284`
  );

  // 2. Consulta à API Oficial do Mercado Livre trazendo até 5 resultados (limit=5)
  const endpointML = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(
    termoBuscaCirurgico
  )}&category=MLB1747&limit=5`;

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
      const results: any[] = Array.isArray(data.results) ? data.results : [];

      if (results.length > 0) {
        // Varredura nos 5 itens procurando o primeiro compatível com o modelo do carro
        let itemCompativel: any = null;

        if (modeloPrincipal) {
          // 1º: Procura item cujo título contenha explicitamente o modelo do veículo
          itemCompativel = results.find((item) => {
            if (!item?.title) return false;
            return isTituloCompativelComModelo(item.title, modeloPrincipal);
          });

          // 2º: Se nenhum tiver o modelo explícito, procura um que ao menos NÃO contenha modelos concorrentes
          if (!itemCompativel) {
            itemCompativel = results.find((item) => {
              if (!item?.title) return false;
              const titLower = item.title.toLowerCase();
              const outrosConflitantes = MODELOS_CONCORRENTES.filter((m) => m !== modeloPrincipal.toLowerCase());
              const temConflito = outrosConflitantes.some((c) => new RegExp(`\\b${c}\\b`, "i").test(titLower));
              return !temConflito;
            });
          }
        } else {
          itemCompativel = results[0];
        }

        // Validação final de conflito: se o item retornado tiver modelo conflitante e não tiver o modelo do carro, descarte
        if (itemCompativel && itemCompativel.title && modeloPrincipal) {
          const titLower = itemCompativel.title.toLowerCase();
          const contemModelo = titLower.includes(modeloPrincipal.toLowerCase());
          const outrosConflitantes = MODELOS_CONCORRENTES.filter((m) => m !== modeloPrincipal.toLowerCase());
          const temConflito = outrosConflitantes.some((c) => new RegExp(`\\b${c}\\b`, "i").test(titLower));

          if (temConflito && !contemModelo) {
            itemCompativel = null;
          }
        }

        if (itemCompativel) {
          const tituloReal = itemCompativel.title || nomePeca;
          const precoReal =
            typeof itemCompativel.price === "number" && itemCompativel.price > 0
              ? Number(itemCompativel.price)
              : null;

          let imagemAltaRes = itemCompativel.thumbnail || null;
          if (imagemAltaRes) {
            imagemAltaRes = imagemAltaRes
              .replace("-I.jpg", "-O.jpg")
              .replace("-I.webp", "-O.webp")
              .replace("-V.jpg", "-O.jpg")
              .replace(/^http:\/\//i, "https://");
          }

          const linkAnuncio = formatarLinkAfiliado(itemCompativel.permalink || linkFallback);

          return {
            titulo_anuncio: tituloReal,
            preco: precoReal,
            imagem_url: imagemAltaRes,
            link: linkAnuncio,
            encontrado: true,
          };
        }
      }
    }
  } catch {
    // API externa indisponível ou timeout
  }

  // 3. Consulta de contingência no Supabase filtrando obrigatoriamente por modelo para não misturar carros
  try {
    let queryDb = supabase
      .from("produtos_afiliados")
      .select("id, titulo, slug, preco_estimado, link_afiliado, imagem_url")
      .ilike("titulo", `%${nomePeca}%`);

    if (modeloPrincipal) {
      queryDb = queryDb.ilike("titulo", `%${modeloPrincipal}%`);
    }

    const { data: dbItems } = await queryDb.limit(5);

    if (dbItems && dbItems.length > 0) {
      const dbProdValido = dbItems.find((item: any) => {
        if (!item?.titulo) return false;
        if (modeloPrincipal) {
          return isTituloCompativelComModelo(item.titulo, modeloPrincipal);
        }
        return true;
      });

      if (dbProdValido) {
        let precoDb: number | null = null;
        if (dbProdValido.preco_estimado) {
          const cleaned = String(dbProdValido.preco_estimado).replace(/[^0-9.,]/g, "").replace(",", ".");
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed) && parsed > 0) {
            precoDb = parsed;
          }
        }

        const linkDb = dbProdValido.link_afiliado
          ? formatarLinkAfiliado(dbProdValido.link_afiliado)
          : dbProdValido.slug
          ? `/peca/${dbProdValido.slug}`
          : linkFallback;

        return {
          titulo_anuncio: dbProdValido.titulo || nomePeca,
          preco: precoDb,
          imagem_url: dbProdValido.imagem_url || null,
          link: linkDb,
          encontrado: true,
        };
      }
    }
  } catch {
    // Supabase indisponível
  }

  // 4. Fallback estrito: Preço null e link apontando para busca cirúrgica do termo no ML com tag de afiliado
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
            veiculoDetectado,
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
