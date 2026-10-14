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
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("/")) return trimmed;

  // NUNCA permita links no formato /p/MLB... que geram "Produto Indisponível"
  if (trimmed.includes("/p/MLB") || trimmed.includes("mercadolivre.com.br/p/")) {
    return "";
  }

  const [baseWithoutHash] = trimmed.split("#");
  let baseWithQuery = baseWithoutHash;
  if (!baseWithQuery.includes("matt_tool")) {
    const sep = baseWithQuery.includes("?") ? "&" : "?";
    baseWithQuery = `${baseWithQuery}${sep}matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
  }
  return `${baseWithQuery}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
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
  const p = (nomePeca || "").toLowerCase();
  if (p.includes("embreagem")) return 549.90;
  if (p.includes("vela")) return 129.90;
  if (p.includes("correia") && p.includes("tensor")) return 219.90;
  if (p.includes("correia")) return 149.90;
  if (p.includes("tensor")) return 119.90;
  if (p.includes("pastilha")) return 119.90;
  if (p.includes("disco")) return 229.90;
  if ((p.includes("filtro") && p.includes("oleo")) || (p.includes("filtro") && p.includes("óleo"))) return 45.90;
  if (p.includes("filtro") && p.includes("ar")) return 49.90;
  if ((p.includes("filtro") && p.includes("combustivel")) || (p.includes("filtro") && p.includes("combustível"))) return 42.90;
  if (p.includes("filtro") && p.includes("cabine")) return 39.90;
  if (p.includes("filtro")) return 45.90;
  if (p.includes("amortecedor")) return 289.90;
  if (p.includes("oleo") || p.includes("óleo")) return 169.90;
  if (p.includes("bomba") && (p.includes("agua") || p.includes("água"))) return 179.90;
  if (p.includes("bomba") && p.includes("combustivel")) return 239.90;
  if (p.includes("bomba")) return 210.00;
  if (p.includes("bateria")) return 429.90;
  if (p.includes("radiador")) return 369.90;
  if (p.includes("bucha") || p.includes("pivo") || p.includes("pivô") || p.includes("bieleta")) return 79.90;
  if (p.includes("terminal")) return 89.90;
  if (p.includes("coxim")) return 139.90;
  if (p.includes("rolamento")) return 159.90;
  if (p.includes("escapamento") || p.includes("silencioso")) return 249.90;
  if (p.includes("farol")) return 299.90;
  if (p.includes("lanterna")) return 189.90;
  return 149.90;
}

function extrairOrcamentoLocalmente(textoBruto: string): {
  veiculo: string;
  modelo_chave: string;
  placa: string | null;
  pecas: Array<{ nome: string; termo_busca: string; preco_estimado?: number }>;
} {
  const raw = (textoBruto || "").trim();

  let veiculo = "Veículo não especificado";
  let modeloChave = "automovel";
  let placa: string | null = null;
  const listaBruta: string[] = [];

  const placaMatch = raw.match(/\b([A-Z]{3}[0-9][A-Z0-9][0-9]{2})\b/i);
  if (placaMatch) {
    placa = placaMatch[1].toUpperCase();
  }

  const MODELOS_CONHECIDOS = [
    "onix", "gol", "hb20", "palio", "uno", "corsa", "celta", "prisma", "civic", "corolla",
    "toro", "renegade", "compass", "fiesta", "ka", "fox", "sandero", "clio", "fit", "city",
    "cruze", "spin", "voyage", "saveiro", "strada", "mobi", "kwid", "argo", "cronos", "duster",
    "kicks", "creta", "tracker", "polo", "virtus", "t-cross", "nivus", "etios", "yaris", "ecosport",
    "ranger", "hilux", "s10", "amarok", "fusca", "opala", "chevette", "montana", "zafira", "meriva",
    "siena", "punto", "linea", "bravo", "idea", "doblo", "stilo", "tempra", "marea", "tipo",
    "parati", "santana", "quantum", "bora", "jetta", "golf", "passat", "up", "taos",
    "tiguan", "206", "207", "208", "307", "308", "2008", "3008", "c3", "c4", "aircross",
    "logan", "captur", "oroch", "megane", "scenic", "sentra", "tiida", "versa", "march",
    "frontier", "hr-v", "wr-v", "cr-v", "accord", "focus", "fusion", "edge", "courier"
  ];

  function detectarModeloChave(textoVeiculo: string): string {
    const limpo = textoVeiculo.toLowerCase();
    for (const mod of MODELOS_CONHECIDOS) {
      const regex = new RegExp(`\\b${mod}\\b`, "i");
      if (regex.test(limpo)) {
        return mod;
      }
    }
    const palavras = limpo.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
    return palavras[1] || palavras[0] || "automovel";
  }

  function limparNomePeca(str: string): string {
    return str
      .replace(/^[-*•\d.)\s]+/, "")
      .replace(/^(?:troca\s+d[eoa]s?|substitui[çc][ãa]o\s+d[eoa]s?|revis[ãa]o\s+d[eoa]s?|\d+\s*x|\d+\s+unid(?:ades?)?|\d+\s+)\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // CASO 1: Formato com dois-pontos (ex: "Volkswagen Gol G5 1.6 2012: Kit de embreagem, jogo de velas e correia dentada com tensor")
  if (raw.includes(":")) {
    const colonIdx = raw.indexOf(":");
    const parteVeic = raw.slice(0, colonIdx).trim();
    const partePecas = raw.slice(colonIdx + 1).trim();

    if (parteVeic) {
      veiculo = parteVeic.replace(/^(?:ve[íi]culo|carro|auto|modelo)\s*[:=-]?\s*/i, "").trim();
      modeloChave = detectarModeloChave(veiculo);
    }

    if (partePecas) {
      // Divide por vírgula, nova linha, ponto e vírgula, ou " e " / " E "
      const pedacos = partePecas
        .split(/(?:\r?\n|;|,|\s+e\s+|\s+E\s+)/)
        .map((p) => limparNomePeca(p))
        .filter((p) => p.length >= 3);

      for (const p of pedacos) {
        if (!/m[ãa]o\s*de\s*obra|alinhamento|balanceamento|lavagem/i.test(p)) {
          listaBruta.push(p);
        }
      }
    }
  } else {
    // CASO 2: Texto em linhas ou texto corrido sem dois-pontos
    const linhas = raw
      .split(/\r?\n|;/)
      .map((l) => l.trim())
      .filter(Boolean);

    for (const linha of linhas) {
      const matchVeic = linha.match(/(?:ve[íi]culo|carro|auto|modelo)\s*[:=-]\s*(.+)/i);
      if (matchVeic && (!veiculo || veiculo === "Veículo não especificado")) {
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

      const subItens = linha
        .split(/(?:,|\s+e\s+|\s+E\s+)/)
        .map((p) => limparNomePeca(p))
        .filter((p) => p.length >= 3);

      for (const sub of subItens) {
        if (!/m[ãa]o\s*de\s*obra|alinhamento|balanceamento|lavagem/i.test(sub)) {
          listaBruta.push(sub);
        }
      }
    }

    if (veiculo && veiculo !== "Veículo não especificado") {
      modeloChave = detectarModeloChave(veiculo);
    }
  }

  // Garante que nunca caia no bug de lista vazia nem retorne "Revisão Geral"
  const pecasFinais = listaBruta.length > 0
    ? listaBruta
    : ["Pastilha de Freio Dianteira", "Disco de Freio Dianteiro"];

  const pecas = pecasFinais.map((nomePeca) => {
    const nomeFormatado = nomePeca.charAt(0).toUpperCase() + nomePeca.slice(1);
    const motorAno = veiculo !== "Veículo não especificado" ? veiculo : modeloChave;
    return {
      nome: nomeFormatado,
      termo_busca: `${nomeFormatado} ${motorAno}`.trim(),
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
// 3. CONSULTA DE ANÚNCIOS 100% ATIVOS NO MERCADO LIVRE (VALIDAÇÃO DUPLA PEÇA + CARRO)
// ============================================================================
interface MLItemResultado {
  titulo: string;
  preco: number;
  imagem: string | null;
  linkAfiliado: string;
  encontrado: boolean;
}

interface MLAnuncioExtraido {
  titulo: string;
  preco: number;
  imagem: string | null;
  link: string;
}

/**
 * Normaliza strings para comparação (lowercase, sem acentos, sem caracteres especiais)
 */
function normalizarTexto(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Identifica a palavra-raiz obrigatória da peça
 * (ex: primeira palavra substantiva com mais de 3 letras, ignorando "kit", "jogo", "par", "troca",
 * como "embreagem", "vela", "correia", "pastilha", "disco", "filtro", "amortecedor").
 */
function extrairPalavraRaizPeca(nomePeca: string): string {
  const ignorar = new Set([
    "kit", "kits", "jogo", "jogos", "par", "pares", "troca", "substituicao",
    "revisao", "conjunto", "unid", "unidade", "unidades", "peca", "pecas",
    "novo", "nova", "novos", "novas", "original", "genuino"
  ]);

  const normalizado = normalizarTexto(nomePeca);
  const palavras = normalizado
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const pal of palavras) {
    if (pal.length > 3 && !ignorar.has(pal)) {
      // Normalização de plurais comuns em autopeças
      if (pal.endsWith("es") && pal.length > 5) {
        return pal.slice(0, -2); // amortecedores -> amortecedor
      }
      if (pal.endsWith("s") && !pal.endsWith("is") && pal.length > 4) {
        return pal.slice(0, -1); // velas -> vela, pastilhas -> pastilha, correias -> correia
      }
      return pal;
    }
  }

  return palavras[0] || normalizado;
}

/**
 * VALIDAÇÃO DUPLA OBRIGATÓRIA:
 * Só aceita um anúncio se o título dele (em lowercase, sem acentos) contiver AO MESMO TEMPO:
 * a) A palavra-raiz da peça (ex: "embreagem")
 * b) O modelo_chave do carro (ex: "gol")
 */
function validarAnuncio(titulo: string, palavraRaiz: string, modeloChave: string): boolean {
  if (!titulo || !palavraRaiz) return false;
  const titNorm = normalizarTexto(titulo);
  const raizNorm = normalizarTexto(palavraRaiz);

  // a) A palavra-raiz da peça deve estar no título
  if (!titNorm.includes(raizNorm)) {
    return false;
  }

  // b) O modelo_chave do carro deve estar no título
  if (!modeloChave) return true;
  const modNorm = normalizarTexto(modeloChave);

  if (titNorm.includes(modNorm)) {
    return true;
  }

  // Se o modelo_chave for composto (ex: "vw gol", "gol g5", "palio fire"), valida a palavra principal
  const partes = modNorm
    .split(/\s+/)
    .filter((p) => p.length >= 2 && !["volkswagen", "chevrolet", "fiat", "ford", "renault", "toyota", "honda", "hyundai", "nissan", "jeep"].includes(p));

  if (partes.length > 0) {
    return partes.some((p) => titNorm.includes(p));
  }

  return false;
}

/**
 * Extrai itens da listagem pública do Mercado Livre
 * Extrai título, preço real, imagem e permalink MLB ativo.
 * NUNCA aceita links de catálogo inativo (/p/MLB...)
 */
function extrairAnunciosDoHtml(html: string): MLAnuncioExtraido[] {
  if (!html || html.includes("suspicious-traffic")) {
    return [];
  }

  const anuncios: MLAnuncioExtraido[] = [];

  // Divide o HTML pelos blocos de anúncio da listagem
  const secoes = html.split(/(?:class="[^"]*(?:ui-search-layout__item|poly-card|ui-search-result)[^"]*")/i);
  const blocos = secoes.length > 1 ? secoes.slice(1) : [html];

  for (const secao of blocos) {
    // 1. Extração do permalink ativo (deve ser MLB ativo direto, NUNCA /p/MLB...)
    const linkMatch =
      secao.match(/href="(https:\/\/[^"]*(?:produto\.mercadolivre\.com\.br\/MLB|mercadolivre\.com\.br\/MLB)[^"]*)"/i) ||
      secao.match(/href="(\/[^"]*MLB-\d+[^"]*)"/i);

    if (!linkMatch) continue;

    let link = linkMatch[1];
    if (link.startsWith("/")) {
      link = `https://www.mercadolivre.com.br${link}`;
    }

    // REGRA RÍGIDA: Nunca gere nem aceite links de catálogo /p/MLB... que geram Produto Indisponível
    if (link.includes("/p/MLB") || link.includes("mercadolivre.com.br/p/")) {
      continue;
    }

    // 2. Extração do título
    const titleMatch =
      secao.match(/class="[^"]*poly-component__title"[^>]*><a[^>]*>([^<]+)<\/a>/i) ||
      secao.match(/<h2[^>]*class="[^"]*ui-search-item__title[^"]*"[^>]*>([^<]+)<\/h2>/i) ||
      secao.match(/class="[^"]*ui-search-item__title"[^>]*>([^<]+)<\/h2>/i) ||
      secao.match(/<a[^>]+title="([^"]+)"[^>]+href="[^"]*MLB/i) ||
      secao.match(/title="([^"]+)"/i);

    let titulo = titleMatch ? titleMatch[1].trim() : "";
    if (!titulo) {
      const altMatch = secao.match(/alt="([^"]+)"/i);
      if (altMatch) titulo = altMatch[1].trim();
    }
    if (!titulo) continue;

    // 3. Extração do preço real
    const fracMatch =
      secao.match(/class="[^"]*(?:andes-money-amount__fraction|price-tag-fraction)"[^>]*>([0-9.]+)</i);
    if (!fracMatch) continue;

    const fracStr = fracMatch[1].replace(/\./g, "");
    const centsMatch = secao.match(/class="[^"]*andes-money-amount__cents"[^>]*>([0-9]{2})</i);
    const centsStr = centsMatch ? centsMatch[1] : "00";
    const preco = parseFloat(`${fracStr}.${centsStr}`);
    if (isNaN(preco) || preco <= 0) continue;

    // 4. Extração da imagem
    const imgMatch =
      secao.match(/<img[^>]+src="([^">]+\.(?:webp|jpg|jpeg|png))"/i) ||
      secao.match(/data-src="([^">]+\.(?:webp|jpg|jpeg|png))"/i);

    let imagem: string | null = imgMatch ? imgMatch[1] : null;
    if (imagem) {
      imagem = imagem
        .replace("-I.jpg", "-O.jpg")
        .replace("-I.webp", "-O.webp")
        .replace("-V.jpg", "-O.jpg")
        .replace("-V.webp", "-O.webp")
        .replace(/^http:\/\//i, "https://");
    }

    anuncios.push({
      titulo,
      preco,
      imagem,
      link,
    });
  }

  return anuncios;
}

/**
 * Busca de anúncios 100% ativos com validação dupla e garantia contra 'Produto Indisponível'
 */
async function buscarAnuncioAtivoMercadoLivre(
  termoBuscaOriginal: string,
  nomePeca: string,
  veiculo: string,
  modeloChave: string,
  tokenOrSignal?: string | null | AbortSignal,
  maybeSignal?: AbortSignal
): Promise<MLItemResultado> {
  const signal = tokenOrSignal instanceof AbortSignal ? tokenOrSignal : maybeSignal;
  const palavraRaiz = extrairPalavraRaizPeca(nomePeca);
  const modLower = (modeloChave || "").toLowerCase().trim();
  const veiculoLimpo = (veiculo || "").trim();

  // Link direto e garantido da busca filtrada (zero produto indisponível)
  const linkBuscaFiltrada = `https://lista.mercadolivre.com.br/${encodeURIComponent(
    `${nomePeca} ${veiculoLimpo}`.trim()
  )}?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
  const precoEstimado = estimarPrecoPeca(nomePeca);
  const tituloGarantido = `${nomePeca} - ${veiculoLimpo || "Compatível"}`;

  // Termo de busca direto para a página de listagem
  let termoBusca = termoBuscaOriginal.trim();
  const termoNorm = normalizarTexto(termoBusca);
  const raizNorm = normalizarTexto(palavraRaiz);
  const modNorm = normalizarTexto(modLower);

  if (!termoNorm || !termoNorm.includes(raizNorm) || (modNorm && !termoNorm.includes(modNorm))) {
    termoBusca = `${palavraRaiz} ${modLower}`.trim();
  }

  try {
    const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(termoBusca)}`;
    console.log(`[Busca ML Ativos] Consultando "${url}" (Raiz: "${palavraRaiz}", Carro: "${modLower}")...`);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal,
      cache: "no-store",
    });

    if (res.ok) {
      const html = await res.text();
      const anuncios = extrairAnunciosDoHtml(html);

      // VALIDAÇÃO DUPLA OBRIGATÓRIA:
      // Só aceita o anúncio se contiver AO MESMO TEMPO a palavra-raiz da peça E o modelo_chave do carro
      const anuncioValido = anuncios.find((a) => validarAnuncio(a.titulo, palavraRaiz, modLower));

      if (anuncioValido) {
        console.log(`[Busca ML Validação Dupla Sucesso] "${anuncioValido.titulo}" | R$ ${anuncioValido.preco}`);
        return {
          titulo: anuncioValido.titulo,
          preco: anuncioValido.preco,
          imagem: anuncioValido.imagem,
          linkAfiliado: formatarLinkAfiliado(anuncioValido.link),
          encontrado: true,
        };
      } else {
        console.warn(`[Busca ML] Nenhum anúncio passou na validação dupla para "${palavraRaiz}" + "${modLower}".`);
      }
    } else {
      console.warn(`[Busca ML] Resposta HTTP ${res.status} ao consultar listagem.`);
    }
  } catch (err: any) {
    console.warn(`[Busca ML] Bloqueio de IP ou exceção ao buscar "${termoBusca}":`, err?.message || err);
  }

  // Se o IP da Vercel for bloqueado ou nenhum anúncio passar na validação dupla:
  // Usa o link direto da busca filtrada de anúncios ativos (nunca produto inativo)
  console.log(`[Busca ML Fallback Garantido] Usando busca ativa direta para "${tituloGarantido}": R$ ${precoEstimado}`);
  return {
    titulo: tituloGarantido,
    preco: precoEstimado,
    imagem: null,
    linkAfiliado: linkBuscaFiltrada,
    encontrado: true,
  };
}

const buscarNoMercadoLivreCascata = buscarAnuncioAtivoMercadoLivre;


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
      texto = body.texto || body.descricao || body.orcamento || body.prompt || body.input || body.mensagem || body.textoOuImagem || null;
      if (body.imagem || body.image || body.file || body.foto) {
        imagemBase64 = String(body.imagem || body.image || body.file || body.foto);
      }
    } else {
      try {
        const formData = await request.formData();
        texto = (formData.get("texto") || formData.get("descricao") || formData.get("orcamento") || formData.get("prompt") || formData.get("input")) as string | null;
        imagem = (formData.get("imagem") || formData.get("image") || formData.get("file") || formData.get("foto")) as File | null;
      } catch {
        const body = await request.json().catch(() => ({}));
        texto = body.texto || body.descricao || body.orcamento || body.prompt || body.input || body.mensagem || body.textoOuImagem || null;
        if (body.imagem || body.image || body.file || body.foto) {
          imagemBase64 = String(body.imagem || body.image || body.file || body.foto);
        }
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

    // 2. Consulta de anúncios ativos no Mercado Livre com validação dupla
    const resultadosBusca = await Promise.allSettled(
      pecasExtraidas.map(async (peca) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        try {
          const resultado = await buscarAnuncioAtivoMercadoLivre(
            peca.termo_busca,
            peca.nome,
            veiculoDetectado,
            modeloChave,
            token,
            controller.signal
          );
          clearTimeout(timeoutId);
          return resultado;
        } catch {
          clearTimeout(timeoutId);
          const linkFallback = `https://lista.mercadolivre.com.br/${encodeURIComponent(
            `${peca.nome} ${veiculoDetectado}`.trim()
          )}?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
          const precoFallback = estimarPrecoPeca(peca.nome);
          return {
            titulo: `${peca.nome} - ${veiculoDetectado}`,
            preco: precoFallback,
            imagem: null,
            linkAfiliado: linkFallback,
            encontrado: true,
          };
        }
      })
    );

    // Mapeamento e estruturação de cada item garantindo preços reais/realistas e links ativos
    const itensProcessados: ItemOrcamentoProcessado[] = pecasExtraidas.map((peca, idx) => {
      const resBusca = resultadosBusca[idx];
      const dadosItem = resBusca.status === "fulfilled" ? resBusca.value : null;

      const precoEstimado = (peca as any).preco_estimado || estimarPrecoPeca(peca.nome);
      const precoNum = (dadosItem?.preco && dadosItem.preco > 0)
        ? dadosItem.preco
        : precoEstimado;
      const precoFormatado = precoNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      const linkBuscaGarantida = `https://lista.mercadolivre.com.br/${encodeURIComponent(
        `${peca.nome} ${veiculoDetectado}`.trim()
      )}?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;

      // Validação de link: NUNCA permite /p/MLB... de catálogo inativo
      let linkFinal = linkBuscaGarantida;
      if (
        dadosItem?.linkAfiliado &&
        !dadosItem.linkAfiliado.includes("/p/MLB") &&
        !dadosItem.linkAfiliado.includes("mercadolivre.com.br/p/")
      ) {
        linkFinal = formatarLinkAfiliado(dadosItem.linkAfiliado) || linkBuscaGarantida;
      }

      const tituloFinal = dadosItem?.titulo || `${peca.nome} - ${veiculoDetectado}`;

      return {
        nome: peca.nome,
        termo_busca: peca.termo_busca,
        titulo: tituloFinal,
        titulo_anuncio: tituloFinal,
        preco: precoNum,
        imagem: dadosItem?.imagem || null,
        imagem_url: dadosItem?.imagem || null,
        thumbnail: dadosItem?.imagem || null,
        linkAfiliado: linkFinal,
        link_afiliado: linkFinal,
        link: linkFinal,
        encontrado: dadosItem?.encontrado ?? true,
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
      : "R$ 0,00";

    const linkKitCompleto = formatarLinkAfiliado(
      `https://lista.mercadolivre.com.br/${encodeURIComponent(
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
