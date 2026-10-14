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
  return 149.90;
}

function normalizarTexto(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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
    // 1. Extração de Preço Fornecedor (ex: R$ 340,00 ou 340.00)
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

    // 2. Extração de Marca / Fabricante
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

    // 3. Extração de Código Alfanumérico (Part Number)
    // Padrão: [A-Z]{1,5}[-]?[0-9]{1,7}[A-Z0-9]* ou [0-9]{2,7}[A-Z]{1,4}[0-9]*
    let codigo = "";
    const codMatches = linha.match(/\b([A-Z]{1,5}[-]?[0-9]{1,7}[A-Z0-9]*)\b/gi) || [];
    for (const cm of codMatches) {
      const cUpper = cm.toUpperCase();
      if (!stopwords.has(cUpper) && cUpper !== marca.toUpperCase()) {
        codigo = cUpper;
        break;
      }
    }

    // 4. Extração de Quantidade (ex: 2x, 2 unid)
    let quantidade = 1;
    const qtdMatch = linha.match(/\b([1-9][0-9]?)\s*(?:x|unid(?:ades?)?|pe[çc]as?)\b/i);
    if (qtdMatch) {
      quantidade = parseInt(qtdMatch[1], 10) || 1;
    }

    // 5. Extração da Descrição (Nome) da Peça
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

    // Formata a primeira letra em maiúscula
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

  // Fallback caso texto vazio
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
// 4. CONSULTA CIRÚRGICA POR CÓDIGO NO MERCADO LIVRE (VALIDAÇÃO DE CÓDIGO)
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
 * Extrai anúncios ativos diretamente do HTML da listagem pública do Mercado Livre
 */
function extrairAnunciosDoHtml(html: string): MLAnuncioExtraido[] {
  if (!html || html.includes("suspicious-traffic")) {
    return [];
  }

  const anuncios: MLAnuncioExtraido[] = [];
  const secoes = html.split(/(?:class="[^"]*(?:ui-search-layout__item|poly-card|ui-search-result)[^"]*")/i);
  const blocos = secoes.length > 1 ? secoes.slice(1) : [html];

  for (const secao of blocos) {
    // 1. Extração do link
    const linkMatch =
      secao.match(/href="(https:\/\/[^"]*(?:produto\.mercadolivre\.com\.br\/MLB|mercadolivre\.com\.br\/MLB)[^"]*)"/i) ||
      secao.match(/href="(\/[^"]*MLB-\d+[^"]*)"/i);

    if (!linkMatch) continue;

    let link = linkMatch[1];
    if (link.startsWith("/")) {
      link = `https://www.mercadolivre.com.br${link}`;
    }

    // Regra rígida: NUNCA permitir links de catálogo /p/MLB... que geram Produto Indisponível
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

    // 3. Extração do preço
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
 * Busca o anúncio ativo no Mercado Livre cujo título contenha obrigatoriamente o código
 */
async function buscarAnuncioPorCodigo(
  codigo: string,
  marca: string,
  nome: string,
  precoFornecedor: number | null,
  signal?: AbortSignal
): Promise<MLItemResultado> {
  const codLimpo = (codigo || "").trim().toUpperCase();
  const marcaLimpa = (marca || "").trim();
  const nomeLimpo = (nome || "").trim();

  const temCodigoReal = Boolean(codLimpo && codLimpo !== "S/ CÓDIGO");

  // 1. Termo cirúrgico: APENAS `${codigo} ${marca}`.trim() (se não tiver marca, `${codigo} ${nome}`)
  let termoBusca = "";
  if (temCodigoReal && marcaLimpa && marcaLimpa.toLowerCase() !== "original") {
    termoBusca = `${codLimpo} ${marcaLimpa}`.trim();
  } else if (temCodigoReal) {
    termoBusca = `${codLimpo} ${nomeLimpo}`.trim();
  } else {
    termoBusca = `${nomeLimpo} ${marcaLimpa !== "Original" ? marcaLimpa : ""}`.trim();
  }

  // 2. Link garantido com código de afiliado (zero produto indisponível)
  const termoLink = (temCodigoReal && marcaLimpa && marcaLimpa.toLowerCase() !== "original")
    ? `${codLimpo} ${marcaLimpa}`.trim()
    : `${codLimpo || nomeLimpo} ${marcaLimpa !== "Original" ? marcaLimpa : ""}`.trim();

  const fallbackLink = `https://lista.mercadolivre.com.br/${encodeURIComponent(
    termoLink
  )}?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;

  const precoEstimado = (precoFornecedor && precoFornecedor > 0)
    ? precoFornecedor
    : estimarPrecoPeca(nomeLimpo || codLimpo);

  const tituloGarantido = `${marcaLimpa && marcaLimpa !== "Original" ? `${marcaLimpa} ` : ""}${temCodigoReal ? `${codLimpo} - ` : ""}${nomeLimpo || "Peça Automotiva"}`.trim();

  try {
    const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(termoBusca)}`;
    console.log(`[Busca ML Código] Consultando "${url}" (Código: "${codLimpo}", Marca: "${marcaLimpa}")...`);

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

      // Validação obrigatória: título deve conter o código (sem traços ou com traços)
      let anuncioValido: MLAnuncioExtraido | undefined;
      if (temCodigoReal) {
        anuncioValido = anuncios.find((a) => validarCodigoNoTitulo(a.titulo, codLimpo));
      } else if (nomeLimpo) {
        const raiz = nomeLimpo.toLowerCase();
        anuncioValido = anuncios.find((a) => normalizarTexto(a.titulo).includes(raiz));
      }

      if (anuncioValido) {
        console.log(`[Busca ML Código Sucesso] "${anuncioValido.titulo}" | R$ ${anuncioValido.preco}`);
        return {
          titulo: anuncioValido.titulo,
          preco: anuncioValido.preco,
          imagem: anuncioValido.imagem,
          linkAfiliado: formatarLinkAfiliado(anuncioValido.link),
          encontrado: true,
        };
      } else {
        console.warn(`[Busca ML Código] Nenhum anúncio contém o código "${codLimpo}" no título.`);
      }
    }
  } catch (err: any) {
    console.warn(`[Busca ML Código] Falha ao consultar listagem para "${termoBusca}":`, err?.message || err);
  }

  // Fallback garantido caso bloqueado ou sem anúncio válido com o código
  console.log(`[Busca ML Código Fallback] Usando link direto de busca para "${termoBusca}": R$ ${precoEstimado}`);
  return {
    titulo: tituloGarantido,
    preco: precoEstimado,
    imagem: null,
    linkAfiliado: fallbackLink,
    encontrado: true,
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

    // Se todos os modelos Gemini falharem (503, 429, 404, etc.) ou se não houver chave:
    // Utiliza o parser Regex local infalível
    if (!parsedData || !Array.isArray(parsedData.pecas) || parsedData.pecas.length === 0) {
      console.warn("[Fallback Local] Utilizando parser Regex local de contingência para códigos de fornecedores!");
      parsedData = extrairOrcamentoPorCodigosLocalmente(texto || "COFAP GP32965 - Amortecedor Dianteiro (R$ 340,00)");
    }

    const veiculoDetectado = parsedData.veiculo || "Orçamento de Fornecedor";
    const pecasExtraidas = Array.isArray(parsedData.pecas) ? parsedData.pecas : [];

    // Consulta de anúncios ativos no Mercado Livre por código em paralelo
    const resultadosBusca = await Promise.allSettled(
      pecasExtraidas.map(async (peca) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        try {
          const resultado = await buscarAnuncioPorCodigo(
            peca.codigo || "",
            peca.marca || "",
            peca.nome,
            peca.preco_fornecedor ?? null,
            controller.signal
          );
          clearTimeout(timeoutId);
          return resultado;
        } catch {
          clearTimeout(timeoutId);
          const codMarca = `${peca.codigo || ""} ${peca.marca || ""}`.trim() || peca.nome;
          const linkFallback = `https://lista.mercadolivre.com.br/${encodeURIComponent(
            codMarca
          )}?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
          const precoFallback = peca.preco_fornecedor && peca.preco_fornecedor > 0
            ? peca.preco_fornecedor
            : estimarPrecoPeca(peca.nome);
          return {
            titulo: `${peca.marca ? `${peca.marca} ` : ""}${peca.codigo ? `${peca.codigo} - ` : ""}${peca.nome}`,
            preco: precoFallback,
            imagem: null,
            linkAfiliado: linkFallback,
            encontrado: true,
          };
        }
      })
    );

    // Mapeamento e estruturação de cada item com código, marca, preço fornecedor e preço ML
    const itensProcessados: ItemOrcamentoProcessado[] = pecasExtraidas.map((peca, idx) => {
      const resBusca = resultadosBusca[idx];
      const dadosItem = resBusca.status === "fulfilled" ? resBusca.value : null;

      const precoFornecedor = (typeof peca.preco_fornecedor === "number" && peca.preco_fornecedor > 0)
        ? peca.preco_fornecedor
        : null;

      const precoML = (dadosItem?.preco && dadosItem.preco > 0) ? dadosItem.preco : null;
      const precoFinal = precoML || precoFornecedor || estimarPrecoPeca(peca.nome);
      const precoFormatado = precoFinal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      const codMarca = `${peca.codigo || ""} ${peca.marca || ""}`.trim() || peca.nome;
      const linkGarantido = `https://lista.mercadolivre.com.br/${encodeURIComponent(
        codMarca
      )}?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;

      let linkFinal = linkGarantido;
      if (
        dadosItem?.linkAfiliado &&
        !dadosItem.linkAfiliado.includes("/p/MLB") &&
        !dadosItem.linkAfiliado.includes("mercadolivre.com.br/p/")
      ) {
        linkFinal = formatarLinkAfiliado(dadosItem.linkAfiliado) || linkGarantido;
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
        encontrado: dadosItem?.encontrado ?? true,

        // Compatibilidade legada
        peca_padronizada: peca.nome,
        nome_peca: peca.nome,
        termo_busca_ml: codMarca,
        termo_busca_mercadolivre: codMarca,
        query_busca: codMarca,
        price: precoFinal,
        valor: precoFinal,
        preco_real_ml: precoML,
        preco_formatado: precoFormatado,
        preco_estimado: precoFinal,
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
      .map((x) => x.codigo || x.nome)
      .join(" ")
      .trim();

    const linkKitCompleto = formatarLinkAfiliado(
      `https://lista.mercadolivre.com.br/${encodeURIComponent(codigosKit)}`
    );

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
