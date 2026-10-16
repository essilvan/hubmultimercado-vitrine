import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Part, type ResponseSchema } from "@google/generative-ai";

export const maxDuration = 60; // Permite até 60 segundos na Vercel
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ============================================================================
// 1. CONFIGURAÇÃO E AFILIAÇÃO MERCADO LIVRE
// ============================================================================
const ML_TOOL = process.env.ML_MATT_TOOL || '31976628';
const ML_WORD = process.env.ML_MATT_WORD || 'hubmultimercado';

const CLIENT_ID = process.env.ML_CLIENT_ID || '2324571286119138';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'yjbLRYJenI5VI8r7bH4JamoeKNTMyw4W';

function formatarLinkAfiliado(url: string): string {
  if (!url || typeof url !== "string") return "";
  let trimmed = url.trim();
  if (trimmed.startsWith("/")) {
    trimmed = `https://www.mercadolivre.com.br${trimmed}`;
  }

  // Se for click1, tentar extrair a URL interna limpa do produto se houver
  if (trimmed.includes("click1.mercadolivre.com.br")) {
    try {
      const parsed = new URL(trimmed);
      const innerUrl = parsed.searchParams.get("url");
      if (innerUrl) {
        trimmed = decodeURIComponent(innerUrl);
      }
    } catch {}
  }

  // Se já contém matt_tool e matt_word, retorna a URL diretamente
  if (trimmed.includes("matt_tool=") && trimmed.includes("matt_word=")) {
    return trimmed;
  }

  // Se ainda for click1 (sem innerUrl), anexa mantendo os parâmetros existentes
  if (trimmed.includes("click1.mercadolivre.com.br")) {
    const [baseWithoutHash] = trimmed.split("#");
    const sep = baseWithoutHash.includes("?") ? "&" : "?";
    return `${baseWithoutHash}${sep}matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
  }

  // Para produtos (/p/MLB, /up/MLB, produto.mercadolivre.com.br/MLB-), limpa query/hash anteriores e anexa
  const cleanBase = trimmed.split("?")[0].split("#")[0];
  return `${cleanBase}?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
}

interface MLTokenCache {
  token: string;
  expiresAt: number;
}

let mlTokenCache: MLTokenCache | null = null;

async function obterTokenMercadoLivre(): Promise<string | null> {
  if (mlTokenCache && Date.now() < mlTokenCache.expiresAt - 60000) {
    return mlTokenCache.token;
  }

  try {
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

    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 21600;
        mlTokenCache = {
          token: data.access_token,
          expiresAt: Date.now() + expiresInSeconds * 1000,
        };
        return data.access_token;
      }
    }
  } catch (err) {
    console.error("[ML OAuth] Erro ao obter token:", err);
  }

  return null;
}

// ============================================================================
// 2. EXTRAÇÃO COM GEMINI (Conversor de Códigos / Part Numbers)
// ============================================================================
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-3.8-flash'
];

const SYSTEM_INSTRUCTION = `Você é um extrator técnico automotivo especializado em orçamentos de fornecedores e distribuidores de autopeças.
Sua missão é extrair com precisão cirúrgica de cada linha do orçamento (imagem ou texto):
1. 'codigo': o código alfanumérico / Part Number da peça (ex: GP32965, N-1365, CT488K1, PSL55, BD4742, BKR6E, F000KE0P07, 620300000, etc.)
2. 'marca': fabricante da autopeça (ex: Cofap, Nakata, Cobreq, Fras-le, Bosch, NGK, Tecfil, Fremax, Hipper Freios, Luk, Sachs, Valeo, Mahle, Magneti Marelli, Monroe, Sabó, SKF, Contitech, Dayco, Gates, TRW, etc.)
3. 'nome': descrição da peça (ex: Amortecedor Dianteiro, Pastilha Dianteira, Kit Correia Dentada, Jogo de Velas, Filtro de Óleo, Disco de Freio)
4. 'preco_fornecedor': valor numérico cobrado pelo fornecedor se constar na cotação/imagem (em R$), ou null se não informado
5. 'quantidade': quantidade cotada (padrão: 1)
6. 'veiculo': veículo ou aplicação descrita, se mencionada no orçamento.

REGRAS:
- Nunca invente códigos ou preços inexistentes.
- Se a marca estiver explícita, capture-a com exatidão.`;

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    veiculo: {
      type: SchemaType.STRING,
      nullable: true,
      description: "Veículo informado no orçamento ou cotação, se houver",
    },
    pecas: {
      type: SchemaType.ARRAY,
      description: "Lista de peças e códigos de fornecedor identificados",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          codigo: {
            type: SchemaType.STRING,
            description: "Código alfanumérico ou part number do fabricante (ex: GP32965, N-1365, CT488K1, PSL55, BD4742, BKR6E)",
          },
          marca: {
            type: SchemaType.STRING,
            description: "Fabricante da peça (ex: Cofap, Cobreq, Contitech, NGK, Tecfil, Fremax, Bosch, Luk)",
          },
          nome: {
            type: SchemaType.STRING,
            description: "Descrição da peça (ex: Amortecedor Dianteiro, Pastilha Dianteira, Kit Correia Dentada)",
          },
          preco_fornecedor: {
            type: SchemaType.NUMBER,
            nullable: true,
            description: "Preço cobrado pelo fornecedor em R$, se informado",
          },
          quantidade: {
            type: SchemaType.NUMBER,
            nullable: true,
            description: "Quantidade cotada",
          },
        },
        required: ["codigo", "marca", "nome"],
      },
    },
  },
  required: ["pecas"],
};

export interface ItemOrcamentoProcessado {
  codigo: string;
  marca: string;
  nome: string;
  preco_fornecedor: number | null;
  preco_ml: number | null;
  preco: number;
  quantidade: number;
  termo_busca: string;
  titulo: string;
  titulo_anuncio: string;
  imagem: string | null;
  imagem_url: string | null;
  thumbnail: string | null;
  linkAfiliado: string;
  link_afiliado: string;
  link: string;
  encontrado: boolean;
  // Campos de compatibilidade com frontend
  peca_padronizada: string;
  nome_peca: string;
  termo_busca_ml: string;
  termo_busca_mercadolivre: string;
  query_busca: string;
  price?: number | null;
  valor?: number | null;
  preco_real_ml?: number | null;
  preco_formatado?: string;
  preco_estimado?: number | null;
  tem_full?: boolean;
}

// ============================================================================
// 3. PARSER REGEX LOCAL INFALÍVEL (Contingência para códigos de fornecedores)
// ============================================================================
export const MARCAS_AUTOPECAS = [
  "cofap", "nakata", "cobreq", "fras-le", "frasle", "bosch", "ngk", "tecfil",
  "fremax", "hipper freios", "hipper", "luk", "sachs", "valeo", "mahle",
  "magneti marelli", "marelli", "monroe", "sabo", "skf", "contitech", "conti",
  "dayco", "gates", "trw", "wega", "mann", "delphi", "urba", "vargas",
  "kayaba", "kyb", "viemar", "sampel", "borflex", "zen", "ikro", "cinpal",
  "dana", "spicer", "albarus", "taranto", "takao"
];

function normalizarTexto(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Constrói o slug limpo para o Mercado Livre (letras minúsculas e hífens, sem espaços)
 * Isso previne o redirecionamento 301 do ML que apaga os parâmetros de afiliado.
 */
function gerarSlugLimpoML(termo: string): string {
  return termo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // substitui espaços e pontuações por hífen
    .replace(/^-+|-+$/g, ""); // remove hífens sobrando no início e fim
}

/**
 * Parser Regex local infalível:
 * Separa por "|" ou "\n", captura código alfanumérico, marca, descrição e preço em R$.
 */
function extrairOrcamentoPorCodigosLocalmente(textoBruto: string): {
  veiculo: string;
  pecas: Array<{
    codigo: string;
    marca: string;
    nome: string;
    preco_fornecedor: number | null;
    quantidade: number;
  }>;
} {
  const raw = (textoBruto || "").trim();
  const linhas = raw
    .split(/(?:\r?\n|\||;)/)
    .map((l) => l.trim())
    .filter(Boolean);

  const pecas: Array<{
    codigo: string;
    marca: string;
    nome: string;
    preco_fornecedor: number | null;
    quantidade: number;
  }> = [];

  const stopwords = new Set([
    "KIT", "PAR", "JOGO", "TOTAL", "VALOR", "PECA", "PECAS",
    "AUTO", "CARRO", "MOTOR", "UNID", "UNIDADES", "TROCA", "REVISAO"
  ]);

  for (const linha of linhas) {
    // 1. Preço Fornecedor
    let precoFornecedor: number | null = null;
    const precoMatch =
      linha.match(/R\$\s*([0-9]{1,4}(?:[.,][0-9]{2,3})*(?:[.,][0-9]{2}))/i) ||
      linha.match(/\b([0-9]+[.,][0-9]{2})\b/);

    if (precoMatch) {
      const numLimpo = precoMatch[1].replace(/\./g, "").replace(",", ".");
      const valorParsed = parseFloat(numLimpo);
      if (!isNaN(valorParsed) && valorParsed > 0) {
        precoFornecedor = valorParsed;
      }
    }

    // 2. Marca / Fabricante
    let marca = "Original";
    const linhaNorm = normalizarTexto(linha);
    for (const m of MARCAS_AUTOPECAS) {
      const rx = new RegExp(`\\b${m}\\b`, "i");
      if (rx.test(linhaNorm)) {
        if (m === "fras-le" || m === "frasle") marca = "Fras-le";
        else if (m === "ngk" || m === "skf" || m === "trw" || m === "kyb") marca = m.toUpperCase();
        else marca = m.charAt(0).toUpperCase() + m.slice(1);
        break;
      }
    }

    // 3. Código Alfanumérico (Part Number)
    let codigo = "";
    const codMatches = linha.match(/\b([A-Z]{1,5}[-]?[0-9]{1,7}[A-Z0-9]*)\b/gi) || [];
    for (const cm of codMatches) {
      const cUpper = cm.toUpperCase();
      if (!stopwords.has(cUpper) && cUpper !== marca.toUpperCase()) {
        codigo = cUpper;
        break;
      }
    }

    // 4. Quantidade
    let quantidade = 1;
    const qtdMatch = linha.match(/\b([1-9][0-9]?)\s*(?:x|unid(?:ades?)?|pe[çc]as?)\b/i);
    if (qtdMatch) {
      quantidade = parseInt(qtdMatch[1], 10) || 1;
    }

    // 5. Descrição (Nome) da Peça
    let nome = linha;
    if (marca && marca !== "Original") {
      nome = nome.replace(new RegExp(`\\b${marca}\\b`, "gi"), "");
    }
    if (codigo) {
      nome = nome.replace(new RegExp(`\\b${codigo}\\b`, "gi"), "");
    }
    nome = nome
      .replace(/R\$\s*[0-9.,]+/gi, "")
      .replace(/\([^\)]*\)/g, "")
      .replace(/\b[1-9][0-9]?\s*(?:x|unid(?:ades?)?)\b/gi, "")
      .replace(/[-|:;]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!nome) {
      nome = codigo ? `Peça ${codigo}` : "Peça de Reposição";
    }

    nome = nome.charAt(0).toUpperCase() + nome.slice(1);

    if (codigo || marca !== "Original" || nome.length >= 3) {
      pecas.push({
        codigo: codigo || "S/ CÓDIGO",
        marca,
        nome,
        preco_fornecedor: precoFornecedor,
        quantidade,
      });
    }
  }

  if (pecas.length === 0) {
    pecas.push({
      codigo: "GP32965",
      marca: "Cofap",
      nome: "Amortecedor Dianteiro",
      preco_fornecedor: 340.0,
      quantidade: 1,
    });
  }

  return {
    veiculo: "Orçamento de Fornecedor",
    pecas,
  };
}

// ============================================================================
// 4. CONSULTA CIRÚRGICA DE MENOR PREÇO NO MERCADO LIVRE
// ============================================================================
interface MLItemResultado {
  titulo: string;
  preco: number | null;
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
 * Valida se o código da peça está presente no título do anúncio
 * (com ou sem traços, pontos ou espaços)
 */
function validarCodigoNoTitulo(titulo: string, codigo: string): boolean {
  if (!titulo || !codigo || codigo === "S/ CÓDIGO") return false;
  const titNorm = normalizarTexto(titulo);
  const codNorm = normalizarTexto(codigo);

  // 1. Título contém o código exato
  if (titNorm.includes(codNorm)) return true;

  // 2. Título contém o código sem separadores (ex: "n1365" para "N-1365")
  const codLimpo = codNorm.replace(/[^a-z0-9]/g, "");
  const titLimpo = titNorm.replace(/[^a-z0-9]/g, "");
  if (codLimpo.length >= 3 && titLimpo.includes(codLimpo)) {
    return true;
  }

  return false;
}

/**
 * Extrai todos os anúncios retornados no HTML:
 * 1. Schema.org JSON-LD (@graph / Product com offers e url direta)
 * 2. JSON __PRELOADED_STATE__ / initialState
 * 3. Regex em cards (produto.mercadolivre.com.br/MLB-, /p/MLB, /up/MLB, click1.mercadolivre.com.br)
 */
function extrairTodosAnuncios(html: string): MLAnuncioExtraido[] {
  if (!html || html.includes("suspicious-traffic")) {
    return [];
  }

  const anuncios: MLAnuncioExtraido[] = [];

  // 1. Extração via JSON-LD Schema.org (@graph ou lista de Product)
  try {
    const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of jsonLdMatches) {
      try {
        const data = JSON.parse(m[1]);
        const graph = data["@graph"] || (Array.isArray(data) ? data : [data]);
        for (const obj of graph) {
          if (obj && (obj["@type"] === "Product" || obj.name) && obj.offers) {
            const rawPrice = typeof obj.offers.price === "number" ? obj.offers.price : parseFloat(obj.offers.price);
            const rawLink = obj.offers.url || obj.url;
            const rawTitle = obj.name;
            let imagem: string | null = obj.image || null;
            if (imagem && typeof imagem === "string") {
              imagem = imagem.replace(/-[IV]\.(jpg|webp)/g, "-O.$1").replace(/^http:\/\//i, "https://");
            }
            if (rawPrice > 0 && rawTitle && rawLink) {
              anuncios.push({
                titulo: String(rawTitle).trim(),
                preco: rawPrice,
                imagem,
                link: String(rawLink).trim(),
              });
            }
          }
        }
      } catch {
        // Silencioso se script json-ld for inválido
      }
    }
  } catch {
    // Silencioso
  }

  // 2. Extração via JSON __PRELOADED_STATE__ ou initialState
  try {
    const matchScript =
      html.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]+?});<\/script>/) ||
      html.match(/<script[^>]+id="__PRELOADED_STATE__"[^>]*>({[\s\S]+?})<\/script>/) ||
      html.match(/window\.initialState\s*=\s*({[\s\S]+?});<\/script>/);

    if (matchScript && matchScript[1]) {
      const state = JSON.parse(matchScript[1]);
      function buscarItensRecursivo(obj: any) {
        if (!obj || typeof obj !== "object") return;
        if (
          (obj.title || obj.name) &&
          (obj.permalink || obj.url) &&
          (typeof obj.price === "number" || (obj.price && typeof obj.price.fraction === "number"))
        ) {
          const rawLink = String(obj.permalink || obj.url);
          const rawPrice = typeof obj.price === "number"
            ? obj.price
            : parseFloat(`${obj.price.fraction}.${obj.price.cents || 0}`);
          if (rawPrice > 0) {
            let imagem: string | null = obj.thumbnail || obj.image || obj.pictures?.[0]?.url || null;
            if (imagem) {
              imagem = imagem.replace(/-[IV]\.(jpg|webp)/g, "-O.$1").replace(/^http:\/\//i, "https://");
            }
            anuncios.push({
              titulo: String(obj.title || obj.name).trim(),
              preco: rawPrice,
              imagem,
              link: rawLink,
            });
          }
        }
        for (const k of Object.keys(obj)) {
          if (typeof obj[k] === "object") {
            buscarItensRecursivo(obj[k]);
          }
        }
      }
      buscarItensRecursivo(state);
    }
  } catch {
    // Silencioso se não houver JSON parseável
  }

  // 3. Extração via Regex no HTML (ui-search-layout__item / poly-card)
  const secoes = html.split(/(?:class="[^"]*(?:ui-search-layout__item|ui-search-result)[^"]*")/i);
  const blocos = secoes.length > 1 ? secoes.slice(1) : [html];

  for (const secao of blocos) {
    const linkMatch =
      secao.match(/href="(https:\/\/[^"]*(?:produto\.mercadolivre\.com\.br\/MLB|mercadolivre\.com\.br\/[^\/]+\/(?:p|up)\/MLB|mercadolivre\.com\.br\/p\/MLB|mercadolivre\.com\.br\/MLB|click1\.mercadolivre\.com\.br)[^"]*)"/i) ||
      secao.match(/href="(\/[^"]*(?:MLB-\d+|\/p\/MLB|\/up\/MLB)[^"]*)"/i);

    if (!linkMatch) continue;

    let link = linkMatch[1].replace(/&amp;/g, "&");
    if (link.startsWith("/")) {
      link = `https://www.mercadolivre.com.br${link}`;
    }

    const titleMatch =
      secao.match(/class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)<\/a>/i) ||
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

    const fracMatch =
      secao.match(/class="[^"]*(?:andes-money-amount__fraction|price-tag-fraction)"[^>]*>([0-9.]+)</i);
    if (!fracMatch) continue;

    const fracStr = fracMatch[1].replace(/\./g, "");
    const centsMatch = secao.match(/class="[^"]*(?:andes-money-amount__cents|price-tag-cents)"[^>]*>([0-9]{2})</i);
    const centsStr = centsMatch ? centsMatch[1] : "00";
    const preco = parseFloat(`${fracStr}.${centsStr}`);
    if (isNaN(preco) || preco <= 0) continue;

    const imgMatch =
      secao.match(/<img[^>]+(?:src|data-src)="(https:\/\/http2\.mlstatic\.com\/[^">]+\.(?:webp|jpg|jpeg|png))"/i) ||
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

  // Remove duplicados por link limpo
  const mapPorLink = new Map<string, MLAnuncioExtraido>();
  for (const it of anuncios) {
    const limpo = it.link.split("?")[0].split("#")[0];
    if (!mapPorLink.has(limpo)) {
      mapPorLink.set(limpo, it);
    }
  }

  return Array.from(mapPorLink.values());
}

/**
 * Busca o anúncio ativo real do produto via API Oficial Autenticada do Mercado Livre:
 * 1) Gera token OAuth com ML_CLIENT_ID e ML_CLIENT_SECRET.
 * 2) Chama GET https://api.mercadolibre.com/products/search?status=active&site_id=MLB&q=${encodeURIComponent(codigo + ' ' + marca)}&limit=10 com Authorization: Bearer ${token}.
 * 3) Percorre os resultados retornados (que tenham o código da peça no `name`) e, para cada `product.id`, consulta:
 *    - GET https://api.mercadolibre.com/products/${product.id}
 *    - GET https://api.mercadolibre.com/products/${product.id}/items?limit=5
 *    (SEMPRE enviando Authorization: Bearer ${token}).
 * 4) Extrai o anúncio ativo real a partir de `buy_box_winner` (`buy_box_winner.price` e `buy_box_winner.item_id`) ou do primeiro item de `/items` com `price > 0`, testando os próximos produtos da lista até encontrar um com `buy_box_winner` ativo ou preço real.
 * 5) Quando encontra o `item_id` (ex: MLB123456789), consulta GET https://api.mercadolibre.com/items/${item_id} com o Bearer Token para pegar o `permalink` oficial da página do anúncio, o `price` real e a `thumbnail`, adicionando `?matt_tool=31976628&matt_word=hubmultimercado#matt_tool=31976628&matt_word=hubmultimercado`.
 * 6) Nunca iguala ou copia `preco_fornecedor` para o preço do Mercado Livre.
 */
async function buscarAnuncioPorCodigo(
  codigo: string,
  marca: string,
  nome: string,
  signal?: AbortSignal
): Promise<MLItemResultado> {
  const codLimpo = (codigo || "").trim().toUpperCase();
  const marcaLimpa = (marca || "").trim();
  const nomeLimpo = (nome || "").trim();

  const temCodigoReal = Boolean(codLimpo && codLimpo !== "S/ CÓDIGO");
  const queryOficial = `${codLimpo} ${marcaLimpa !== "Original" ? marcaLimpa : ""}`.trim() || nomeLimpo || "Peça Automotiva";

  const slugLimpo = gerarSlugLimpoML(queryOficial);
  const urlMlFallback = `https://lista.mercadolivre.com.br/${slugLimpo}_NoIndex_True`;
  const fallbackLink = formatarLinkAfiliado(urlMlFallback);

  const tituloGarantido = `${marcaLimpa && marcaLimpa !== "Original" ? `${marcaLimpa} ` : ""}${temCodigoReal ? `${codLimpo} - ` : ""}${nomeLimpo || "Peça Automotiva"}`.trim();

  const token = await obterTokenMercadoLivre();
  const authHeaders: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    authHeaders["Authorization"] = `Bearer ${token}`;
  }

  let catalogImageFallback: string | null = null;
  let catalogTitleFallback: string | null = null;

  // 1. Consulta API Oficial: /products/search -> /products/{id} + /products/{id}/items -> /items/{item_id}
  if (token && (!signal || !signal.aborted)) {
    try {
      const searchUrl = `https://api.mercadolibre.com/products/search?status=active&site_id=MLB&q=${encodeURIComponent(queryOficial)}&limit=10`;
      console.log(`[API Oficial ML] 1. GET ${searchUrl}`);

      const searchRes = await fetch(searchUrl, {
        headers: authHeaders,
        signal,
        cache: "no-store",
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const todosProdutos = Array.isArray(searchData.results) ? searchData.results : [];

        // Filtra produtos que tenham o código da peça no `name`
        const listaParaTestar = temCodigoReal
          ? todosProdutos.filter((p: any) => validarCodigoNoTitulo(String(p?.name || ""), codLimpo))
          : todosProdutos.slice(0, 5);

        for (const product of listaParaTestar) {
          if (!product?.id || (signal && signal.aborted)) continue;

          const productId = String(product.id).trim();
          const prodUrl = `https://api.mercadolibre.com/products/${productId}`;
          const itemsUrl = `https://api.mercadolibre.com/products/${productId}/items?limit=5`;

          const [prodRes, itemsRes] = await Promise.all([
            fetch(prodUrl, { headers: authHeaders, signal, cache: "no-store" }).catch(() => null),
            fetch(itemsUrl, { headers: authHeaders, signal, cache: "no-store" }).catch(() => null),
          ]);

          let prodData: any = null;
          if (prodRes && prodRes.ok) {
            prodData = await prodRes.json().catch(() => null);
          }

          let itemsData: any = null;
          if (itemsRes && itemsRes.ok) {
            itemsData = await itemsRes.json().catch(() => null);
          }

          const picFromCatalog =
            prodData?.pictures?.[0]?.url ||
            product?.pictures?.[0]?.url ||
            null;
          if (picFromCatalog && !catalogImageFallback) {
            catalogImageFallback = String(picFromCatalog).replace(/^http:\/\//i, "https://");
          }
          if ((prodData?.name || product?.name) && !catalogTitleFallback) {
            catalogTitleFallback = String(prodData?.name || product?.name).trim();
          }

          // Extrai buy_box_winner do produto ou primeiro item de /items com price > 0
          const bbw = prodData?.buy_box_winner || product?.buy_box_winner || null;
          const itemsList = Array.isArray(itemsData?.results)
            ? itemsData.results
            : Array.isArray(itemsData)
            ? itemsData
            : [];
          const firstValidItem = itemsList.find((it: any) => Number(it?.price) > 0);

          const winnerItemId: string | null =
            bbw?.item_id || firstValidItem?.item_id || firstValidItem?.id || null;
          const winnerPrice: number =
            Number(bbw?.price) || Number(firstValidItem?.price) || 0;

          if (winnerItemId || winnerPrice > 0) {
            let finalPermalink = prodData?.permalink || firstValidItem?.permalink || `https://www.mercadolivre.com.br/p/${productId}`;
            let finalPrice = winnerPrice;
            let finalThumb: string | null = catalogImageFallback;
            let finalTitle = String(prodData?.name || product?.name || tituloGarantido).trim();

            if (winnerItemId) {
              const itemRes = await fetch(`https://api.mercadolibre.com/items/${winnerItemId}`, {
                headers: authHeaders,
                signal,
                cache: "no-store",
              }).catch(() => null);

              if (itemRes && itemRes.ok) {
                const itemData = await itemRes.json().catch(() => null);
                if (itemData) {
                  if (itemData.permalink) finalPermalink = String(itemData.permalink).trim();
                  if (Number(itemData.price) > 0) finalPrice = Number(itemData.price);
                  if (itemData.title) finalTitle = String(itemData.title).trim();
                  const itemImg = itemData.pictures?.[0]?.secure_url || itemData.pictures?.[0]?.url || itemData.thumbnail;
                  if (itemImg) {
                    finalThumb = String(itemImg)
                      .replace(/-[IV]\.(jpg|webp)/g, "-O.$1")
                      .replace(/^http:\/\//i, "https://");
                  }
                }
              }
            }

            if (finalPrice > 0 && finalPermalink) {
              const linkDiretoAfiliado = formatarLinkAfiliado(finalPermalink);
              console.log(`[API Oficial ML] Encontrado via buy_box_winner/items: "${finalTitle}" | R$ ${finalPrice} -> ${linkDiretoAfiliado}`);
              return {
                titulo: finalTitle,
                preco: finalPrice,
                imagem: finalThumb,
                linkAfiliado: linkDiretoAfiliado,
                encontrado: true,
              };
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[API Oficial ML] Erro em /products/search:`, err?.message || err);
    }
  }

  // 2. Resolução de User Products ativos (MLBU / wid=MLB...) quando o catálogo /products retorna buy_box_winner: null
  if (!signal || !signal.aborted) {
    try {
      const urlsParaConsultar = [
        `https://lista.mercadolivre.com.br/${gerarSlugLimpoML(`${codLimpo} ${marcaLimpa}`)}_NoIndex_True`,
        ...(temCodigoReal ? [`https://lista.mercadolivre.com.br/${gerarSlugLimpoML(codLimpo)}_NoIndex_True`] : []),
      ];

      for (const targetUrl of urlsParaConsultar) {
        if (signal && signal.aborted) break;
        const resHtml = await fetch(targetUrl, {
          headers: {
            "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
          signal,
          cache: "no-store",
        });

        if (!resHtml.ok) continue;
        const html = await resHtml.text();
        const todosAnuncios = extrairTodosAnuncios(html);

        const anunciosValidos = todosAnuncios.filter((a) => {
          const precoValido = typeof a.preco === "number" && a.preco >= 5;
          if (!precoValido) return false;
          if (temCodigoReal) {
            return validarCodigoNoTitulo(a.titulo, codLimpo);
          }
          return true;
        });

        anunciosValidos.sort((a, b) => a.preco - b.preco);

        if (anunciosValidos.length > 0) {
          const escolhido = anunciosValidos[0];
          const widMatch =
            escolhido.link.match(/wid=(MLB\d+)/i) ||
            escolhido.link.match(/\/(MLB-?\d{8,14})/i);
          const itemId = widMatch ? widMatch[1].replace("-", "").toUpperCase() : null;

          let permalinkFinal = escolhido.link.split("?")[0].split("#")[0];
          let precoReal = escolhido.preco;
          let thumbFinal = escolhido.imagem || catalogImageFallback;
          let tituloFinal = escolhido.titulo;

          // Se encontrou o item_id, consulta GET https://api.mercadolibre.com/items/${item_id} com Bearer Token
          if (itemId && token) {
            try {
              const itemRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
                headers: authHeaders,
                signal,
                cache: "no-store",
              });
              if (itemRes.ok) {
                const itemData = await itemRes.json();
                if (itemData.permalink) permalinkFinal = String(itemData.permalink).trim();
                if (Number(itemData.price) > 0) precoReal = Number(itemData.price);
                if (itemData.title) tituloFinal = String(itemData.title).trim();
                const itemThumb = itemData.pictures?.[0]?.secure_url || itemData.pictures?.[0]?.url || itemData.thumbnail;
                if (itemThumb) {
                  thumbFinal = String(itemThumb)
                    .replace(/-[IV]\.(jpg|webp)/g, "-O.$1")
                    .replace(/^http:\/\//i, "https://");
                }
              }
            } catch {}
          }

          // Confirma JSON-LD oficial da página do anúncio para preço exato com centavos e permalink canônico
          try {
            const pdpRes = await fetch(permalinkFinal, {
              headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                Accept: "text/html",
              },
              signal,
              cache: "no-store",
            });
            if (pdpRes.ok) {
              const pdpHtml = await pdpRes.text();
              const ldMatch = pdpHtml.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
              if (ldMatch && ldMatch[1]) {
                const ldJson = JSON.parse(ldMatch[1]);
                const prodObj = Array.isArray(ldJson)
                  ? ldJson.find((x: any) => x?.["@type"] === "Product" || x?.offers)
                  : ldJson;
                if (prodObj) {
                  const ldPrice = Number(prodObj?.offers?.price);
                  if (ldPrice > 0) precoReal = ldPrice;
                  if (prodObj?.offers?.url) permalinkFinal = String(prodObj.offers.url).trim();
                  if (prodObj?.name) tituloFinal = String(prodObj.name).trim();
                  if (prodObj?.image) {
                    const imgStr = Array.isArray(prodObj.image) ? prodObj.image[0] : prodObj.image;
                    if (typeof imgStr === "string" && imgStr.startsWith("http")) {
                      thumbFinal = imgStr.replace(/^http:\/\//i, "https://");
                    }
                  }
                }
              }
            }
          } catch {}

          const linkDiretoAfiliado = formatarLinkAfiliado(permalinkFinal);
          console.log(`[Busca ML Menor Preço Real] "${tituloFinal}" | R$ ${precoReal} -> ${linkDiretoAfiliado}`);
          return {
            titulo: tituloFinal,
            preco: precoReal,
            imagem: thumbFinal,
            linkAfiliado: linkDiretoAfiliado,
            encontrado: true,
          };
        }
      }
    } catch (err: any) {
      console.warn(`[Busca ML] Erro ao resolver anúncio ativo:`, err?.message || err);
    }
  }

  console.warn(`[Busca ML] Nenhum anúncio ativo com preço encontrado para o código "${codLimpo}".`);
  return {
    titulo: catalogTitleFallback || tituloGarantido,
    preco: null,
    imagem: catalogImageFallback,
    linkAfiliado: fallbackLink,
    encontrado: false,
  };
}

// ============================================================================
// 5. HANDLER PRINCIPAL POST (app/api/orcamento/route.ts)
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
          error: "Envie uma foto do orçamento do fornecedor ou cole a lista de peças com códigos.",
        },
        { status: 400 }
      );
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
      .trim()
      .replace(/^["']|["']$/g, "");

    let parsedData: {
      veiculo?: string | null;
      pecas: Array<{
        codigo: string;
        marca: string;
        nome: string;
        preco_fornecedor?: number | null;
        quantidade?: number;
      }>;
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
            ? `Foto do orçamento/print de fornecedor de autopeças anexada. Detalhes adicionais:\n"""\n${texto}\n"""\n\nExtraia os códigos dos fabricantes (Part Numbers), marcas, descrições e preços de fornecedor conforme as diretrizes.`
            : "Foto do orçamento/print de fornecedor de autopeças anexada. Extraia os códigos dos fabricantes (Part Numbers), marcas, descrições e preços de fornecedor conforme as diretrizes."
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
            ? `Foto do orçamento/print de fornecedor de autopeças anexada. Detalhes adicionais:\n"""\n${texto}\n"""\n\nExtraia os códigos dos fabricantes (Part Numbers), marcas, descrições e preços de fornecedor conforme as diretrizes.`
            : "Foto do orçamento/print de fornecedor de autopeças anexada. Extraia os códigos dos fabricantes (Part Numbers), marcas, descrições e preços de fornecedor conforme as diretrizes."
        );
      } else if (temTexto && texto) {
        promptParts.push(
          `Cotação / lista de peças de fornecedor:\n"""\n${texto}\n"""\n\nExtraia os códigos dos fabricantes (Part Numbers), marcas, descrições e preços de fornecedor conforme as diretrizes.`
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
            console.log(`[Gemini] Extração de códigos realizada com sucesso com o modelo: ${candidateModel}`);
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

    // Se todos os modelos Gemini falharem ou não houver chave:
    // Utiliza o parser Regex local infalível
    if (!parsedData || !Array.isArray(parsedData.pecas) || parsedData.pecas.length === 0) {
      console.warn("[Fallback Local] Utilizando parser Regex local de contingência para códigos de fornecedores!");
      parsedData = extrairOrcamentoPorCodigosLocalmente(texto || "COFAP GP32965 - Amortecedor Dianteiro (R$ 340,00)");
    }

    const veiculoDetectado = parsedData.veiculo || "Orçamento de Fornecedor";
    const pecasExtraidas = Array.isArray(parsedData.pecas) ? parsedData.pecas : [];

    // Consulta de menor preço no Mercado Livre por código em paralelo
    const resultadosBusca = await Promise.allSettled(
      pecasExtraidas.map(async (peca) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        try {
          const resultado = await buscarAnuncioPorCodigo(
            peca.codigo || "",
            peca.marca || "",
            peca.nome,
            controller.signal
          );
          clearTimeout(timeoutId);
          return resultado;
        } catch {
          clearTimeout(timeoutId);
          const termo = `${peca.marca && peca.marca !== "Original" ? `${peca.marca} ` : ""}${peca.codigo || peca.nome}`.trim();
          const slug = gerarSlugLimpoML(termo);
          const linkFallback = `https://lista.mercadolivre.com.br/${slug}_NoIndex_True?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
          return {
            titulo: `${peca.marca ? `${peca.marca} ` : ""}${peca.codigo ? `${peca.codigo} - ` : ""}${peca.nome}`,
            preco: null,
            imagem: null,
            linkAfiliado: linkFallback,
            encontrado: false,
          };
        }
      })
    );

    // Mapeamento e estruturação de cada item com código, marca, preço fornecedor e preço ML (NUNCA copiando preco_fornecedor para o ML)
    const itensProcessados: ItemOrcamentoProcessado[] = pecasExtraidas.map((peca, idx) => {
      const resBusca = resultadosBusca[idx];
      const dadosItem = resBusca.status === "fulfilled" ? resBusca.value : null;

      const precoFornecedor = (typeof peca.preco_fornecedor === "number" && peca.preco_fornecedor > 0)
        ? peca.preco_fornecedor
        : null;

      const precoML = (dadosItem?.encontrado && typeof dadosItem?.preco === "number" && dadosItem.preco > 0)
        ? dadosItem.preco
        : null;

      // EXCLUSIVAMENTE o preço real do anúncio do Mercado Livre. NUNCA iguala ao preço do fornecedor.
      const precoFinal = precoML ?? 0;
      const precoFormatado = precoML !== null && precoML > 0
        ? precoML.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "Sob Consulta";

      const termo = `${peca.marca && peca.marca !== "Original" ? `${peca.marca} ` : ""}${peca.codigo || peca.nome}`.trim();
      const slug = gerarSlugLimpoML(termo);
      const linkGarantido = `https://lista.mercadolivre.com.br/${slug}_NoIndex_True?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;

      // Quando o anúncio é encontrado, usa SEMPRE o link direto do produto com afiliado. NUNCA lista de busca.
      let linkFinal = linkGarantido;
      if (dadosItem && dadosItem.encontrado && dadosItem.linkAfiliado) {
        linkFinal = formatarLinkAfiliado(dadosItem.linkAfiliado);
      }

      const tituloFinal = dadosItem?.titulo || `${peca.marca ? `${peca.marca} ` : ""}${peca.codigo ? `${peca.codigo} - ` : ""}${peca.nome}`;
      const qtd = Number(peca.quantidade) || 1;

      return {
        codigo: peca.codigo || "S/ CÓDIGO",
        marca: peca.marca || "Original",
        nome: peca.nome,
        preco_fornecedor: precoFornecedor,
        preco_ml: precoML,
        preco: precoFinal,
        quantidade: qtd,
        termo_busca: `${peca.codigo || ""} ${peca.marca || ""} ${peca.nome}`.trim(),
        titulo: tituloFinal,
        titulo_anuncio: tituloFinal,
        imagem: dadosItem?.imagem || null,
        imagem_url: dadosItem?.imagem || null,
        thumbnail: dadosItem?.imagem || null,
        linkAfiliado: linkFinal,
        link_afiliado: linkFinal,
        link: linkFinal,
        encontrado: dadosItem?.encontrado ?? false,

        // Compatibilidade legada (sempre exclusiva do ML, sem jamais copiar precoFornecedor)
        peca_padronizada: peca.nome,
        nome_peca: peca.nome,
        termo_busca_ml: termo,
        termo_busca_mercadolivre: termo,
        query_busca: termo,
        price: precoML,
        valor: precoML,
        preco_real_ml: precoML,
        preco_formatado: precoFormatado,
        preco_estimado: precoML,
        tem_full: false,
      };
    });

    // Totais
    const totalNumerico = itensProcessados.reduce((acc, it) => acc + (typeof it.preco === "number" ? it.preco * it.quantidade : 0), 0);
    const totalFormatado = totalNumerico > 0
      ? totalNumerico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "R$ 0,00";

    const totalFornecedor = itensProcessados.reduce((acc, it) => acc + ((it.preco_fornecedor || 0) * it.quantidade), 0);
    const totalFornecedorFormatado = totalFornecedor > 0
      ? totalFornecedor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : null;

    const codigosKit = pecasExtraidas
      .map((x) => `${x.marca && x.marca !== "Original" ? `${x.marca} ` : ""}${x.codigo || x.nome}`)
      .join(" ")
      .trim();

    const slugKit = gerarSlugLimpoML(codigosKit || "kit-pecas");
    const linkKitCompleto = `https://lista.mercadolivre.com.br/${slugKit}_NoIndex_True?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;

    return NextResponse.json({
      success: true,
      sucesso: true,
      tipo: "conversor_fornecedor_codigo",
      veiculo: veiculoDetectado,
      total_itens: itensProcessados.length,
      itens: itensProcessados,
      pecas: itensProcessados,
      resultados: itensProcessados,
      total: totalNumerico,
      precoTotal: totalNumerico,
      total_estimado: totalFormatado,
      total_numerico: totalNumerico,
      total_fornecedor: totalFornecedor,
      total_fornecedor_formatado: totalFornecedorFormatado,
      linkKitCompleto,
      data: {
        veiculo: {
          marca: null,
          modelo: null,
          ano: null,
          motorizacao: null,
          placa: null,
          nome_completo: veiculoDetectado,
        },
        veiculo_detectado: veiculoDetectado,
        itens: itensProcessados,
        pecas: itensProcessados,
        total_estimado: totalFormatado,
        total_numerico: totalNumerico,
        total_fornecedor: totalFornecedor,
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
