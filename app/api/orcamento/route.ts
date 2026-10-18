import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Part, type ResponseSchema } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import catalogoMlDiretoRaw from "@/lib/catalogo-ml-direto.json";

export const maxDuration = 60; // Permite até 60 segundos na Vercel
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CatalogoDiretoItem {
  title: string;
  brand?: string | null;
  price: number;
  url: string;
  img?: string | null;
  codes?: string[];
}

const CATALOGO_ML_DIRETO: CatalogoDiretoItem[] = Array.isArray(catalogoMlDiretoRaw)
  ? (catalogoMlDiretoRaw as CatalogoDiretoItem[])
  : [];

function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ============================================================================
// 1. CONFIGURAÇÃO E AFILIAÇÃO MERCADO LIVRE
// ============================================================================
const ML_TOOL = process.env.ML_MATT_TOOL || "31976628";
const ML_WORD = process.env.ML_MATT_WORD || "hubmultimercado";

const CLIENT_ID = process.env.ML_CLIENT_ID || "2324571286119138";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "yjbLRYJenI5VI8r7bH4JamoeKNTMyw4W";

function formatarLinkAfiliado(url: string): string {
  if (!url || typeof url !== "string") return "";
  let trimmed = url.trim();
  if (trimmed.startsWith("/")) {
    trimmed = `https://www.mercadolivre.com.br${trimmed}`;
  }

  // Se for meli.la (shortlink oficial de afiliado), retorna limpo sem query/hash extras
  if (trimmed.includes("meli.la/")) {
    return trimmed.split("?")[0].split("#")[0];
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

  // Se ainda for click1 ou /social/ ou tiver pdp_filters, anexa mantendo os parâmetros existentes
  if (
    trimmed.includes("click1.mercadolivre.com.br") ||
    trimmed.includes("/social/") ||
    trimmed.includes("pdp_filters=")
  ) {
    const [baseWithoutHash] = trimmed.split("#");
    const sep = baseWithoutHash.includes("?") ? "&" : "?";
    return `${baseWithoutHash}${sep}matt_tool=${ML_TOOL}&matt_word=${ML_WORD}&forceInApp=true`;
  }

  // Para produtos (/p/MLB, /up/MLB, produto.mercadolivre.com.br/MLB-), limpa query/hash anteriores e anexa
  const cleanBase = trimmed.split("?")[0].split("#")[0];
  return `${cleanBase}?matt_tool=${ML_TOOL}&matt_word=${ML_WORD}&forceInApp=true#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
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
// 2. EXTRAÇÃO COM GEMINI (Conversor de Orçamento por Foto / Print / Texto)
// ============================================================================
// Modelos testados e homologados com suporte completo a Visão (inlineData) + JSON
const MODEL_CANDIDATES = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite-preview",
];

const SYSTEM_INSTRUCTION = `Você é um extrator técnico automotivo e especialista em orçamentos de autopeças no Brasil (Mercado Livre).
Sua missão é extrair TODAS as peças presentes no orçamento (seja uma foto de papel, print de WhatsApp, tela de sistema de autopeças ou lista digitada), capturando para cada item:
1. 'codigo': o código alfanumérico / Part Number da peça se constar na linha (ex: GP32965, N-1365, CT488K1, PSL55, BD4742, BKR6E, HG31138, 619312000, etc.). Se a imagem ou linha não exibir código explícito, informe o código de referência padrão do fabricante para aquela peça ou "S/ CÓDIGO".
2. 'marca': fabricante da autopeça se informado ou identificável (ex: Cofap, Nakata, Cobreq, Fras-le, Bosch, NGK, Tecfil, Fremax, Hipper Freios, LuK, Sachs, Valeo, Mahle, Magneti Marelli, Monroe, Sabó, SKF, Contitech, Continental, Dayco, Gates, TRW, Moura, SYL, etc.), ou "Original" se não especificado.
3. 'nome': descrição clara da peça (ex: Amortecedor Dianteiro, Pastilha Dianteira, Kit Correia Dentada, Jogo de Velas, Filtro de Óleo, Par Disco de Freio, Kit Embreagem).
4. 'preco_fornecedor': valor numérico unitário cobrado pelo fornecedor se constar na cotação/imagem (em R$), ou null se não informado. Ignorar linhas de mão de obra/serviço ou totalizadores gerais.
5. 'preco_mercado_livre_estimado': valor numérico unitário real de mercado praticado no Mercado Livre Brasil para essa peça específica (em R$, com centavos, ex: 287.90, 109.90, 28.90).
6. 'quantidade': quantidade cotada (padrão: 1).
7. 'veiculo': veículo ou aplicação descrita no cabeçalho ou nas peças do orçamento, se houver.

REGRAS CRÍTICAS:
- Extraia TODAS as peças visíveis na foto/print, mesmo que alguma linha não tenha código de fábrica explícito.
- NUNCA copie o 'preco_fornecedor' para 'preco_mercado_livre_estimado'.`;

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
      description: "Lista de peças identificadas na foto ou texto do orçamento",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          codigo: {
            type: SchemaType.STRING,
            nullable: true,
            description: "Código alfanumérico / Part Number do fabricante (ou 'S/ CÓDIGO' se não houver)",
          },
          marca: {
            type: SchemaType.STRING,
            nullable: true,
            description: "Fabricante da peça (ex: Cofap, Cobreq, Contitech, NGK, Tecfil, Fremax, Bosch, LuK)",
          },
          nome: {
            type: SchemaType.STRING,
            description: "Descrição da peça (ex: Amortecedor Dianteiro, Pastilha Dianteira, Kit Correia Dentada)",
          },
          preco_fornecedor: {
            type: SchemaType.NUMBER,
            nullable: true,
            description: "Preço unitário cobrado pelo fornecedor em R$, se informado",
          },
          preco_mercado_livre_estimado: {
            type: SchemaType.NUMBER,
            description: "Preço competitivo real no Mercado Livre Brasil em R$ (nunca igual ao preco_fornecedor)",
          },
          quantidade: {
            type: SchemaType.NUMBER,
            nullable: true,
            description: "Quantidade cotada",
          },
        },
        required: ["nome", "preco_mercado_livre_estimado"],
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
  preco: number | null;
  quantidade: number;
  termo_busca: string;
  titulo: string | null;
  titulo_anuncio: string | null;
  imagem: string | null;
  imagem_url: string | null;
  thumbnail: string | null;
  permalink: string;
  linkAfiliado: string;
  link_afiliado: string;
  link: string;
  encontrado: boolean;
  peca_padronizada: string;
  nome_peca: string;
  termo_busca_ml: string;
  termo_busca_mercadolivre: string;
  query_busca: string;
  price?: number | null;
  valor?: number | null;
  preco_real_ml?: number | null;
  preco_formatado?: string | null;
  preco_estimado?: number | null;
  tem_full?: boolean;
}

// ============================================================================
// 3. PARSER REGEX LOCAL INFALÍVEL (Contingência para texto)
// ============================================================================
export const MARCAS_AUTOPECAS = [
  "cofap", "nakata", "cobreq", "fras-le", "frasle", "bosch", "ngk", "tecfil",
  "fremax", "hipper freios", "hipper", "luk", "sachs", "valeo", "mahle",
  "magneti marelli", "marelli", "monroe", "sabo", "skf", "contitech", "continental", "conti",
  "dayco", "gates", "trw", "wega", "mann", "delphi", "urba", "vargas",
  "kayaba", "kyb", "viemar", "sampel", "borflex", "zen", "ikro", "cinpal",
  "dana", "spicer", "albarus", "taranto", "takao", "syl", "moura", "petronas", "acdelco"
];

function normalizarTexto(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function gerarSlugLimpoML(termo: string): string {
  return termo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function estimarPrecoMercadoLivrePorPeca(
  codigo: string,
  marca: string,
  nome: string,
  precoFornecedor?: number | null
): number {
  const texto = normalizarTexto(`${codigo} ${marca} ${nome}`);

  let basePrice = 139.9;
  if (texto.includes("kit embreagem") || texto.includes("embreagem")) basePrice = 385.69;
  else if (texto.includes("amortecedor") || /^gp\d/i.test(codigo) || /^hg\d/i.test(codigo)) basePrice = 287.9;
  else if (texto.includes("disco de freio") || texto.includes("par disco") || /^bd\d/i.test(codigo) || /^hf\d/i.test(codigo)) basePrice = 261.89;
  else if (texto.includes("kit correia") || /^ct\d/i.test(codigo)) basePrice = 109.8;
  else if (texto.includes("correia")) basePrice = 84.9;
  else if (texto.includes("pastilha") || /^n-?\d/i.test(codigo) || /^pd\d/i.test(codigo)) basePrice = 109.9;
  else if (texto.includes("vela") || /^bkr/i.test(codigo) || /^sp\d/i.test(codigo)) basePrice = 89.9;
  else if (texto.includes("bobina")) basePrice = 229.9;
  else if (texto.includes("bomba d") || texto.includes("bomba agua") || texto.includes("bomba de agua")) basePrice = 158.9;
  else if (texto.includes("bomba de combustivel") || texto.includes("bomba combustivel")) basePrice = 249.9;
  else if (texto.includes("filtro de oleo") || texto.includes("filtro oleo") || /^psl/i.test(codigo) || /^wo/i.test(codigo)) basePrice = 28.9;
  else if (texto.includes("filtro")) basePrice = 44.9;
  else if (texto.includes("rolamento") || texto.includes("cubo")) basePrice = 169.9;
  else if (texto.includes("homocinetica") || texto.includes("trizeta") || texto.includes("tulipa")) basePrice = 215.7;
  else if (texto.includes("bandeja") || texto.includes("leque")) basePrice = 239.9;
  else if (texto.includes("bieleta") || texto.includes("pivo") || texto.includes("terminal")) basePrice = 79.9;
  else if (texto.includes("radiador")) basePrice = 204.72;
  else if (texto.includes("bico injetor")) basePrice = 208.99;
  else if (texto.includes("sonda lambda") || texto.includes("sensor")) basePrice = 164.9;

  if (precoFornecedor && Math.abs(basePrice - precoFornecedor) < 1) {
    basePrice = Math.round(basePrice * 0.88 * 100) / 100;
  }

  return Number(basePrice.toFixed(2));
}

function extrairOrcamentoPorCodigosLocalmente(textoBruto: string): {
  veiculo: string;
  pecas: Array<{
    codigo: string;
    marca: string;
    nome: string;
    preco_fornecedor: number | null;
    preco_mercado_livre_estimado: number;
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
    preco_mercado_livre_estimado: number;
    quantidade: number;
  }> = [];

  const stopwords = new Set([
    "KIT", "PAR", "JOGO", "TOTAL", "VALOR", "PECA", "PECAS",
    "AUTO", "CARRO", "MOTOR", "UNID", "UNIDADES", "TROCA", "REVISAO"
  ]);

  for (const linha of linhas) {
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

    let marca = "Original";
    const linhaNorm = normalizarTexto(linha);
    for (const m of MARCAS_AUTOPECAS) {
      const rx = new RegExp(`\\b${m}\\b`, "i");
      if (rx.test(linhaNorm)) {
        if (m === "fras-le" || m === "frasle") marca = "Fras-le";
        else if (m === "ngk" || m === "skf" || m === "trw" || m === "kyb" || m === "syl") marca = m.toUpperCase();
        else if (m === "luk") marca = "LuK";
        else marca = m.charAt(0).toUpperCase() + m.slice(1);
        break;
      }
    }

    let codigo = "";
    const codMatches =
      linha.match(
        /\b([A-Z]{1,5}[-/.]?[0-9]{1,7}[A-Z0-9-]*|[0-9]{3,10}[A-Z]{1,5}[A-Z0-9-]*|[0-9]{5,12})\b/gi
      ) || [];
    for (const cm of codMatches) {
      const cUpper = cm.toUpperCase();
      if (!stopwords.has(cUpper) && cUpper !== marca.toUpperCase()) {
        codigo = cUpper;
        break;
      }
    }

    let quantidade = 1;
    const qtdMatch = linha.match(/\b([1-9][0-9]?)\s*(?:x|unid(?:ades?)?|pe[çc]as?)\b/i);
    if (qtdMatch) {
      quantidade = parseInt(qtdMatch[1], 10) || 1;
    }

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
      const codFinal = codigo || "S/ CÓDIGO";
      pecas.push({
        codigo: codFinal,
        marca,
        nome,
        preco_fornecedor: precoFornecedor,
        preco_mercado_livre_estimado: estimarPrecoMercadoLivrePorPeca(codFinal, marca, nome, precoFornecedor),
        quantidade,
      });
    }
  }

  return {
    veiculo: "Orçamento de Fornecedor",
    pecas,
  };
}

// ============================================================================
// 4. MATCHER DE PRODUTOS REAIS E LINKS DIRETOS DO MERCADO LIVRE
// ============================================================================
interface MLItemResultado {
  titulo: string;
  preco: number | null;
  imagem: string | null;
  linkAfiliado: string;
  encontrado: boolean;
}

function validarCodigoNoTitulo(titulo: string, codigo: string): boolean {
  if (!titulo || !codigo || codigo === "S/ CÓDIGO") return false;
  const titNorm = normalizarTexto(titulo);
  const codNorm = normalizarTexto(codigo);

  if (titNorm.includes(codNorm)) return true;

  const codLimpo = codNorm.replace(/[^a-z0-9]/g, "");
  const titLimpo = titNorm.replace(/[^a-z0-9]/g, "");
  if (codLimpo.length >= 3 && titLimpo.includes(codLimpo)) {
    return true;
  }

  return false;
}

function parseBrlStringToNumber(val: unknown): number | null {
  if (typeof val === "number" && val > 0) return val;
  if (typeof val === "string" && val.trim()) {
    const cleaned = val.replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".").trim();
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 0) return num;
  }
  return null;
}

const CATEGORIAS_PECAS: Array<{ id: string; rx: RegExp }> = [
  { id: "amortecedor", rx: /\bamortecedor/i },
  { id: "pastilha", rx: /\bpastilha/i },
  { id: "sapata", rx: /\bsapata|\bpatim\s*(?:de\s*)?freio/i },
  { id: "disco_freio", rx: /\bdisco\s*(?:de\s*)?freio/i },
  { id: "tambor_freio", rx: /\btambor|\bcampana/i },
  { id: "suporte_cardan", rx: /\bsuporte\s*(?:do\s*|de\s*|rolamento\s*)?cardan|\bcardan/i },
  { id: "correia_dentada", rx: /\bcorreia\s*dentada|\bkit\s*correia/i },
  { id: "corrente_comando", rx: /\bcorrente\s*(?:de\s*)?comando|\bkit\s*corrente/i },
  { id: "embreagem", rx: /\bembreagem|\bplato/i },
  { id: "cilindro_embreagem", rx: /\bcilindro\s*(?:mestre|auxiliar|embreagem)/i },
  { id: "cilindro_roda", rx: /\bcilindro\s*(?:de\s*)?roda/i },
  { id: "vela", rx: /\bvela\b|\bvelas\b/i },
  { id: "cabo_vela", rx: /\bcabo\s*(?:de\s*)?(?:vela|ignicao)/i },
  { id: "bobina", rx: /\bbobina/i },
  { id: "filtro_oleo", rx: /\bfiltro\s*(?:de\s*)?oleo|\bpsl\d+/i },
  { id: "filtro_ar", rx: /\bfiltro\s*(?:de\s*)?ar\b/i },
  { id: "filtro", rx: /\bfiltro/i },
  { id: "oleo_motor", rx: /\boleo\s*(?:de\s*)?motor|\b5w30\b|\b5w40\b|\b10w40\b|\b0w20\b/i },
  { id: "bico_injetor", rx: /\bbico\s*injetor|\binjetor/i },
  { id: "sonda_lambda", rx: /\bsonda\s*lambda/i },
  { id: "bomba_agua", rx: /\bbomba\s*d\s*agua|\bbomba\s*(?:de\s*)?agua/i },
  { id: "bomba_combustivel", rx: /\bbomba\s*(?:de\s*)?combustivel/i },
  { id: "valvula_termostatica", rx: /\bvalvula\s*termostatica|\bcarcaca\s*valvula/i },
  { id: "radiador", rx: /\bradiador/i },
  { id: "reservatorio", rx: /\breservatorio/i },
  { id: "trocador_calor", rx: /\bresfriador|\btrocador\s*(?:de\s*)?calor/i },
  { id: "tulipa_trizeta", rx: /\btulipa|\btrizeta|\bhomocinetica|\bsemi\s*eixo/i },
  { id: "caixa_direcao", rx: /\bcaixa\s*(?:de\s*)?direcao/i },
  { id: "bandeja", rx: /\bbandeja|\bbucha\s*bandeja/i },
  { id: "coxim", rx: /\bcoxim|\bbatente/i },
  { id: "polia", rx: /\bpolia/i },
  { id: "bateria", rx: /\bbateria\b|\b60ah\b/i },
  { id: "turbina", rx: /\bturbocompressor|\bturbina/i },
  { id: "coletor", rx: /\bcoletor\s*(?:de\s*)?admissao/i },
  { id: "sensor_tpms", rx: /\bsensor\s*tpms|\bpressao\s*pneu/i },
  { id: "modulo", rx: /\bmodulo/i },
  { id: "fechadura", rx: /\bfechadura/i },
];

function detectarCategoriaPeca(texto: string): string | null {
  const norm = normalizarTexto(texto);
  for (const cat of CATEGORIAS_PECAS) {
    if (cat.rx.test(norm)) return cat.id;
  }
  return null;
}

interface MLSearchAttribute {
  id?: string;
  name?: string;
  value_name?: string | null;
}

interface MLSearchResultCandidate {
  id?: string;
  title: string;
  price: number;
  thumbnail: string | null;
  permalink: string;
  attributes?: MLSearchAttribute[];
}

function normalizarThumbnailML(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;
  return trimmed
    .replace(/^http:\/\//i, "https://")
    .replace(/-I\.jpg/gi, "-O.jpg")
    .replace(/-I\.webp/gi, "-O.webp");
}

/**
 * Separa letras de números em um Part Number com espaço.
 * Ex: "BD4212" -> "BD 4212", "TY327CPA" -> "TY 327 CPA", "04431ROL" -> "04431 ROL"
 */
function separarLetrasNumerosCodigo(codigo: string): string {
  return (codigo || "")
    .trim()
    .replace(/([A-Za-z]+)(\d+)/g, "$1 $2")
    .replace(/(\d+)([A-Za-z]+)/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PALAVRAS_GENERICAS_PECA = new Set([
  "jogo",
  "kit",
  "par",
  "peca",
  "pecas",
  "conjunto",
  "unidade",
  "unidades",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "com",
  "sem",
  "para",
  "por",
  "original",
  "novo",
  "nova",
]);

/**
 * Extrai a primeira palavra significativa da categoria da peça (ex: "Suporte", "Sapata", "Tambor")
 * ignorando prefixos genéricos como "Jogo", "Kit", "Par".
 */
function extrairPrimeiraPalavraCategoria(descricao: string): string {
  const palavras = (descricao || "")
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-zÀ-ÿ0-9]/g, ""))
    .filter((p) => p.length >= 3);

  for (const p of palavras) {
    if (!PALAVRAS_GENERICAS_PECA.has(normalizarTexto(p))) {
      return p;
    }
  }
  return palavras[0] || "";
}

/**
 * Extrai as duas primeiras palavras úteis da descrição da peça (ex: "Suporte Cardan", "Sapata Freio", "Tambor Freio")
 */
function extrairPrimeirasDuasPalavrasDescricao(descricao: string): string {
  const palavras = (descricao || "")
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-zÀ-ÿ0-9-]/g, ""))
    .filter((p) => p.length >= 2);

  const significativas = palavras.filter((p) => !PALAVRAS_GENERICAS_PECA.has(normalizarTexto(p)));
  if (significativas.length >= 2) {
    return `${significativas[0]} ${significativas[1]}`;
  }
  return palavras.slice(0, 2).join(" ");
}

/**
 * Filtro de Relevância e Validação do Resultado (percorre os primeiros 5 resultados):
 * 1. Dá preferência ao item cujo `title` ou `attributes` (`PART_NUMBER` ou `BRAND`) contenha o código da peça
 *    (ignorando hífens/barras/espaços) OU a marca informada no orçamento (garantindo que a categoria da peça não conflite).
 * 2. Se nenhum anúncio contiver o código ou a marca, filtra ao menos pela primeira palavra significativa da descrição
 *    da peça (ex: "Suporte", "Sapata", "Tambor") para nunca exibir uma peça de outra categoria.
 */
function filtrarResultadoRelevanteML(
  results: MLSearchResultCandidate[],
  codigo: string,
  marca: string,
  descricao: string
): MLSearchResultCandidate | null {
  if (!Array.isArray(results) || results.length === 0) return null;

  const top5 = results.filter((r) => r && r.title && r.price > 0 && r.permalink).slice(0, 5);
  if (top5.length === 0) return null;

  const codAlnum = normalizarTexto(codigo).replace(/[^a-z0-9]/g, "");
  const temCodigo = Boolean(codAlnum && codAlnum !== "scodigo" && codAlnum.length >= 3);

  const marcaNorm =
    marca && !["original", "s/ marca", "generico"].includes(normalizarTexto(marca))
      ? normalizarTexto(marca)
      : "";
  const marcaAlnum = marcaNorm.replace(/[^a-z0-9]/g, "");

  const primeiraPalavra = normalizarTexto(extrairPrimeiraPalavraCategoria(descricao));
  const duasPalavras = extrairPrimeirasDuasPalavrasDescricao(descricao)
    .split(/\s+/)
    .map((w) => normalizarTexto(w))
    .filter((w) => w.length >= 3);

  const catEsperada = detectarCategoriaPeca(descricao);

  const contemCodigo = (item: MLSearchResultCandidate): boolean => {
    if (!temCodigo) return false;
    const titAlnum = normalizarTexto(item.title).replace(/[^a-z0-9]/g, "");
    if (titAlnum.includes(codAlnum)) return true;

    if (Array.isArray(item.attributes)) {
      for (const attr of item.attributes) {
        const idUpper = (attr.id || "").toUpperCase();
        if (
          idUpper === "PART_NUMBER" ||
          idUpper === "ALPHANUMERIC_MODEL" ||
          idUpper === "MODEL" ||
          idUpper === "OEM" ||
          idUpper === "MPN" ||
          idUpper === "GTIN"
        ) {
          const valAlnum = normalizarTexto(attr.value_name || "").replace(/[^a-z0-9]/g, "");
          if (valAlnum && valAlnum.includes(codAlnum)) return true;
        }
      }
    }
    return false;
  };

  const contemMarca = (item: MLSearchResultCandidate): boolean => {
    if (!marcaAlnum || marcaAlnum.length < 2) return false;
    const titNorm = normalizarTexto(item.title);
    const titAlnum = titNorm.replace(/[^a-z0-9]/g, "");

    if (titNorm.includes(marcaNorm) || titAlnum.includes(marcaAlnum)) return true;

    if (Array.isArray(item.attributes)) {
      for (const attr of item.attributes) {
        if ((attr.id || "").toUpperCase() === "BRAND") {
          const valNorm = normalizarTexto(attr.value_name || "");
          const valAlnum = valNorm.replace(/[^a-z0-9]/g, "");
          if (valNorm && (valNorm.includes(marcaNorm) || valAlnum.includes(marcaAlnum))) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const contemPrimeiraPalavraDescricao = (item: MLSearchResultCandidate): boolean => {
    if (!primeiraPalavra) return true;
    const titNorm = normalizarTexto(item.title);
    if (titNorm.includes(primeiraPalavra)) return true;
    // Sinônimos automotivos diretos
    if (primeiraPalavra === "sapata" && titNorm.includes("patim")) return true;
    if (primeiraPalavra === "tambor" && titNorm.includes("campana")) return true;
    return false;
  };

  const categoriaConflitante = (item: MLSearchResultCandidate): boolean => {
    const titNorm = normalizarTexto(item.title);
    const catItem = detectarCategoriaPeca(item.title);

    // Se a descrição pede uma categoria conhecida (ex: sapata, tambor_freio, suporte_cardan)
    // e o item é de outra categoria incompatível (ex: pastilha, disco_freio), rejeita
    if (catEsperada && catItem && catItem !== catEsperada) {
      const compativeis =
        (catEsperada === "filtro_oleo" && catItem === "filtro") ||
        (catEsperada === "filtro_ar" && catItem === "filtro");
      if (!compativeis && !contemPrimeiraPalavraDescricao(item)) {
        return true;
      }
    }

    // Proteção extra para peças com múltiplas palavras críticas (ex: "Suporte Cardan" nunca aceitar "Rolo Cabo")
    if (primeiraPalavra && !contemPrimeiraPalavraDescricao(item)) {
      const temAlgumaPalavraChave = duasPalavras.some((w) => titNorm.includes(w));
      if (!temAlgumaPalavraChave) return true;
    }

    return false;
  };

  // Prioridade 1: Contém o código exato da peça (no title ou PART_NUMBER) e não conflita de categoria
  for (const item of top5) {
    if (contemCodigo(item) && !categoriaConflitante(item)) {
      return item;
    }
  }

  // Prioridade 1b: Contém o código exato da peça mesmo sem checagem secundária
  for (const item of top5) {
    if (contemCodigo(item)) {
      return item;
    }
  }

  // Prioridade 2: Contém a marca informada no orçamento E respeita a palavra-chave/categoria da peça
  for (const item of top5) {
    if (contemMarca(item) && contemPrimeiraPalavraDescricao(item) && !categoriaConflitante(item)) {
      return item;
    }
  }

  // Prioridade 3: Filtra pela primeira palavra significativa da descrição (ex: "Suporte", "Sapata", "Tambor")
  // garantindo que se houver 2 palavras (ex: "Suporte Cardan"), dê preferência a quem tem ambas
  if (duasPalavras.length >= 2) {
    for (const item of top5) {
      const titNorm = normalizarTexto(item.title);
      if (duasPalavras.every((w) => titNorm.includes(w)) && !categoriaConflitante(item)) {
        return item;
      }
    }
  }

  for (const item of top5) {
    if (contemPrimeiraPalavraDescricao(item) && !categoriaConflitante(item)) {
      return item;
    }
  }

  return null;
}

/**
 * Executa uma consulta na API do Mercado Livre (`https://api.mercadolibre.com/sites/MLB/search?q={QUERY}&limit=5`)
 * com fallback automático no servidor para extração estruturada JSON-LD (`@graph`) e cards de `lista.mercadolivre.com.br`
 * caso a API retorne bloqueio 403/CORS em ambiente serverless.
 */
async function consultarMercadoLivreSearch(
  query: string,
  token: string | null,
  signal?: AbortSignal
): Promise<MLSearchResultCandidate[]> {
  const qClean = (query || "").trim();
  if (!qClean) return [];

  const candidates: MLSearchResultCandidate[] = [];

  // 1. Chamada oficial em https://api.mercadolibre.com/sites/MLB/search?q={QUERY}&limit=5
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(qClean)}&limit=5`;
    const reqSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(1800)])
      : AbortSignal.timeout(1800);
    const res = await fetch(apiUrl, {
      headers,
      signal: reqSignal,
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        for (const r of data.results.slice(0, 5)) {
          const price = Number(r?.price) || 0;
          const title = String(r?.title || "").trim();
          const permalink = String(r?.permalink || "").trim();
          if (title && price > 0 && permalink) {
            candidates.push({
              id: r.id,
              title,
              price,
              thumbnail: normalizarThumbnailML(r.thumbnail || r.secure_thumbnail),
              permalink,
              attributes: Array.isArray(r.attributes) ? r.attributes : [],
            });
          }
        }
        if (candidates.length > 0) {
          return candidates;
        }
      }
    }
  } catch {}

  if (signal?.aborted) return candidates;

  // 2. Proxy/Fallback Server-Side na listagem pública do Mercado Livre (extrai JSON-LD @graph oficial + cards)
  // Resolve bloqueios 403 da API pública sites/MLB/search mantendo 100% os dados reais do ML
  try {
    const slug = gerarSlugLimpoML(qClean);
    if (!slug) return candidates;

    const listUrl = `https://lista.mercadolivre.com.br/${slug}`;
    const listSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(1800)])
      : AbortSignal.timeout(1800);
    const htmlRes = await fetch(listUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: listSignal,
      cache: "no-store",
    });

    if (htmlRes.ok) {
      const html = await htmlRes.text();

      // 2a. Extrair objetos Product do JSON-LD (@graph) oficial embutido pelo Mercado Livre
      const ldMatches =
        html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

      for (const scriptBlock of ldMatches) {
        const jsonContent = scriptBlock
          .replace(/^<script[^>]*>/i, "")
          .replace(/<\/script>$/i, "")
          .trim();
        if (!jsonContent.includes('"@graph"') && !jsonContent.includes('"@type":"Product"')) continue;

        try {
          const parsedLd = JSON.parse(jsonContent);
          const graphList = Array.isArray(parsedLd?.["@graph"])
            ? parsedLd["@graph"]
            : Array.isArray(parsedLd)
            ? parsedLd
            : [parsedLd];

          for (const node of graphList) {
            if (node?.["@type"] !== "Product") continue;
            const title = String(node.name || "").trim();
            const price = Number(node.offers?.price) || 0;
            const permalink = String(node.offers?.url || node.url || "").trim();
            const rawImg = Array.isArray(node.image) ? node.image[0] : node.image;
            const brandName = String(node.brand?.name || "").trim();
            const sku = String(node.sku || node.mpn || "").trim();

            if (title && price > 0 && permalink) {
              const attrs: MLSearchAttribute[] = [];
              if (brandName) {
                attrs.push({ id: "BRAND", name: "Marca", value_name: brandName });
              }
              if (sku) {
                attrs.push({ id: "PART_NUMBER", name: "Número de peça", value_name: sku });
              }
              candidates.push({
                id: sku || undefined,
                title,
                price,
                thumbnail: normalizarThumbnailML(rawImg),
                permalink,
                attributes: attrs,
              });
            }
          }
        } catch {}
      }

      if (candidates.length > 0) {
        return candidates.slice(0, 8);
      }

      // 2b. Fallback extra: cards HTML (.poly-card / .ui-search-result) caso o JSON-LD não esteja presente
      const cardBlocks = html.split(/class="[^"]*(?:ui-search-layout__item|poly-card)[^"]*"/i).slice(1, 10);
      for (const block of cardBlocks) {
        const linkMatch = block.match(
          /href="(https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"#?]+(?:\?[^"#]*)?)"/i
        );
        if (!linkMatch) continue;
        let rawUrl = linkMatch[1].replace(/&amp;/g, "&");
        if (rawUrl.includes("click1.mercadolivre")) continue;
        rawUrl = rawUrl.split("?")[0].split("#")[0];

        const titleMatch =
          block.match(/class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</i) ||
          block.match(/class="[^"]*ui-search-item__title[^"]*"[^>]*>([^<]+)</i) ||
          block.match(/title="([^"]{10,160})"/i);
        if (!titleMatch) continue;
        const title = titleMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&#39;/g, "'")
          .trim();

        const priceSection =
          block.match(
            /class="[^"]*(?:poly-price__current|ui-search-price__second-line)[^"]*"[\s\S]{0,600}?andes-money-amount__fraction[^>]*>([0-9.]+)<(?:[\s\S]{0,220}?andes-money-amount__cents[^>]*>([0-9]{2})<)?/i
          ) ||
          block.match(
            /andes-money-amount__fraction[^>]*>([0-9.]+)<(?:[\s\S]{0,220}?andes-money-amount__cents[^>]*>([0-9]{2})<)?/i
          );
        if (!priceSection) continue;

        const reais = priceSection[1].replace(/\./g, "");
        const centavos = priceSection[2] || "00";
        const price = parseFloat(`${reais}.${centavos}`);
        if (!price || isNaN(price) || price <= 0) continue;

        const imgMatch =
          block.match(/data-src="(https?:\/\/http2\.mlstatic\.com\/[^"]+)"/i) ||
          block.match(/src="(https?:\/\/http2\.mlstatic\.com\/[^"]+)"/i);

        candidates.push({
          title,
          price,
          thumbnail: normalizarThumbnailML(imgMatch ? imgMatch[1] : null),
          permalink: rawUrl,
          attributes: [],
        });
      }
    }
  } catch {}

  if (candidates.length === 0) {
    const queryTokens = normalizarTexto(qClean)
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    const queryAlphaNum = qClean.toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (queryTokens.length > 0) {
      const scoredLocal: { item: CatalogoDiretoItem; score: number }[] = [];
      for (const item of CATALOGO_ML_DIRETO) {
        if (!item.price || item.price <= 0 || !item.url) continue;
        const itemTextNorm = normalizarTexto(
          `${item.title} ${item.brand || ""} ${(item.codes || []).join(" ")}`
        );
        const itemAlphaNum = `${item.title} ${(item.codes || []).join(" ")}`
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");

        let score = 0;
        if (queryAlphaNum.length >= 4 && itemAlphaNum.includes(queryAlphaNum)) {
          score += 50;
        }
        for (const tk of queryTokens) {
          const tkAlpha = tk.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (itemTextNorm.includes(tk) || (tkAlpha.length >= 3 && itemAlphaNum.includes(tkAlpha))) {
            score += 10;
          }
        }
        if (score >= 20 || (queryTokens.length === 1 && score >= 10)) {
          scoredLocal.push({ item, score });
        }
      }

      scoredLocal.sort((a, b) => b.score - a.score);
      for (const { item } of scoredLocal.slice(0, 5)) {
        const attrs: MLSearchAttribute[] = [];
        if (item.brand) {
          attrs.push({ id: "BRAND", name: "Marca", value_name: item.brand });
        }
        if (Array.isArray(item.codes) && item.codes.length > 0) {
          attrs.push({ id: "PART_NUMBER", name: "Número de peça", value_name: item.codes.join(" ") });
        }
        candidates.push({
          title: item.title,
          price: item.price,
          thumbnail: normalizarThumbnailML(item.img),
          permalink: item.url,
          attributes: attrs,
        });
      }
    }
  }

  return candidates.slice(0, 8);
}

/**
 * Busca prioritária apenas por código exato em `CATALOGO_ML_DIRETO` e `produtos_afiliados` (Supabase).
 * NUNCA faz chute genérico por palavras soltas para evitar retornar peças de outra marca/categoria.
 */
async function buscarProdutoCodigoExatoLocal(
  codigo: string,
  marca: string,
  descricao: string
): Promise<MLItemResultado | null> {
  const codLimpo = (codigo || "").trim().toUpperCase();
  const codSemTraco = codLimpo.replace(/[^A-Z0-9]/g, "");
  const temCodigo = Boolean(codLimpo && codLimpo !== "S/ CÓDIGO" && codSemTraco.length >= 3);
  if (!temCodigo) return null;

  // 1. Consulta por código exato em `CATALOGO_ML_DIRETO`
  const exactMatches = CATALOGO_ML_DIRETO.filter((item) => {
    if (!item.price || item.price <= 0 || !item.url) return false;
    if (Array.isArray(item.codes)) {
      for (const c of item.codes) {
        const cClean = c.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (cClean === codSemTraco || c.toUpperCase() === codLimpo) return true;
      }
    }
    return validarCodigoNoTitulo(item.title, codLimpo);
  });

  if (exactMatches.length > 0) {
    const validados = filtrarResultadoRelevanteML(
      exactMatches.map((m) => ({
        title: m.title,
        price: m.price,
        thumbnail: normalizarThumbnailML(m.img),
        permalink: m.url,
        attributes: m.brand ? [{ id: "BRAND", value_name: m.brand }] : [],
      })),
      codLimpo,
      marca,
      descricao
    );

    if (validados) {
      return {
        titulo: validados.title,
        preco: validados.price,
        imagem: validados.thumbnail,
        linkAfiliado: formatarLinkAfiliado(validados.permalink),
        encontrado: true,
      };
    }
  }

  // 2. Consulta por código exato no Supabase (`produtos_afiliados`)
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("produtos_afiliados")
        .select("titulo, codigo_fabricante, codigo_oem, marca, preco_estimado, especificacoes, imagem_url, link_afiliado")
        .or(`codigo_fabricante.ilike.%${codLimpo}%,codigo_oem.ilike.%${codLimpo}%,titulo.ilike.%${codLimpo}%,codigo_fabricante.ilike.%${codSemTraco}%`)
        .limit(5);

      if (data && data.length > 0) {
        const match = data.find((p) =>
          validarCodigoNoTitulo(`${p.codigo_fabricante || ""} ${p.codigo_oem || ""} ${p.titulo || ""}`, codLimpo)
        );

        if (match) {
          const precoNum =
            parseBrlStringToNumber(match.preco_estimado) ||
            parseBrlStringToNumber((match.especificacoes as any)?.preco);

          const link =
            (match.especificacoes as any)?.direct_product_url ||
            match.link_afiliado ||
            (match.especificacoes as any)?.link_afiliado ||
            (match.especificacoes as any)?.link_ml;

          if (precoNum && precoNum > 0 && link) {
            return {
              titulo: match.titulo,
              preco: precoNum,
              imagem: normalizarThumbnailML(match.imagem_url),
              linkAfiliado: formatarLinkAfiliado(link),
              encontrado: true,
            };
          }
        }
      }
    } catch (err) {
      console.warn("[Catálogo Supabase] Aviso ao consultar produtos_afiliados:", err);
    }
  }

  return null;
}

/**
 * Estratégia de Busca em Cascata (Multi-Step Fallback) no Mercado Livre:
 * - Tentativa 1 (Busca Precisa): `{marca} {codigo}` (Ex: "SABO 04431ROL", "FRAS-LE TY327CPA", "FREMAX BD4212")
 * - Tentativa 2 (Código Formatado/Separado): `{marca} {codigo_separado}` (Ex: "FREMAX BD 4212", "FRAS-LE TY 327 CPA")
 * - Tentativa 3 (Código + Nome da Peça): `{codigo} {primeiras_duas_palavras_da_descricao}` (Ex: "04431ROL Suporte Cardan")
 * - Tentativa 4 (Apenas o Código Puro): `{codigo}`
 */
async function buscarAnuncioPorCodigo(
  codigo: string,
  marca: string,
  nome: string,
  _veiculo?: string | null,
  _precoFornecedor?: number | null,
  signal?: AbortSignal
): Promise<MLItemResultado> {
  const codLimpo = (codigo || "").trim().toUpperCase();
  const temCodigo = Boolean(codLimpo && codLimpo !== "S/ CÓDIGO");
  const marcaLimpa =
    marca && !["original", "s/ marca", "generico"].includes(normalizarTexto(marca))
      ? marca.trim()
      : "";
  const nomeLimpo = (nome || "").trim();

  // URL de busca direta honesta para fallback caso nenhuma tentativa encontre
  const termoFallbackDireto = `${marcaLimpa ? `${marcaLimpa} ` : ""}${temCodigo ? codLimpo : nomeLimpo}`.trim() || "Peca Automotiva";
  const urlBuscaDiretaFallback = `https://lista.mercadolivre.com.br/${encodeURIComponent(termoFallbackDireto)}`;
  const fallbackLink = formatarLinkAfiliado(urlBuscaDiretaFallback);

  // 0. Verifica se o código exato já consta no catálogo local/Supabase validado
  const itemExatoLocal = await buscarProdutoCodigoExatoLocal(codLimpo, marcaLimpa, nomeLimpo);
  if (itemExatoLocal && itemExatoLocal.preco && itemExatoLocal.preco > 0 && itemExatoLocal.linkAfiliado) {
    return itemExatoLocal;
  }

  const codigoSeparado = temCodigo ? separarLetrasNumerosCodigo(codLimpo) : "";
  const duasPalavras = extrairPrimeirasDuasPalavrasDescricao(nomeLimpo);
  const duasPalavrasBrutas = nomeLimpo
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  // Monta a fila de tentativas da cascata evitando queries duplicadas
  const queriesCascata: string[] = [];
  const addQuery = (q: string) => {
    const clean = q.replace(/\s+/g, " ").trim();
    if (clean && !queriesCascata.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
      queriesCascata.push(clean);
    }
  };

  if (temCodigo) {
    // Tentativa 1 (Busca Precisa): {marca} {codigo}
    if (marcaLimpa) {
      addQuery(`${marcaLimpa} ${codLimpo}`);
    } else {
      addQuery(codLimpo);
    }

    // Tentativa 2 (Código Formatado/Separado): {marca} {codigo_separado}
    if (codigoSeparado && codigoSeparado.toLowerCase() !== codLimpo.toLowerCase()) {
      if (marcaLimpa) {
        addQuery(`${marcaLimpa} ${codigoSeparado}`);
      } else {
        addQuery(codigoSeparado);
      }
    }

    // Tentativa 3 (Código + Nome da Peça): {codigo} {primeiras_duas_palavras_da_descricao}
    if (duasPalavras) {
      addQuery(`${codLimpo} ${duasPalavras}`);
    }
    if (duasPalavrasBrutas && duasPalavrasBrutas.toLowerCase() !== duasPalavras.toLowerCase()) {
      addQuery(`${codLimpo} ${duasPalavrasBrutas}`);
    }
    if (codigoSeparado && duasPalavras && codigoSeparado.toLowerCase() !== codLimpo.toLowerCase()) {
      addQuery(`${codigoSeparado} ${duasPalavras}`);
    }

    // Tentativa 4 (Apenas o Código Puro): {codigo}
    addQuery(codLimpo);

    // Tentativa adicional caso o vendedor tenha cadastrado pela Marca + Nome da Peça
    if (marcaLimpa && duasPalavras) {
      addQuery(`${marcaLimpa} ${duasPalavras}`);
    }
  } else {
    if (marcaLimpa && duasPalavras) {
      addQuery(`${marcaLimpa} ${duasPalavras}`);
    }
    if (nomeLimpo) {
      addQuery(`${marcaLimpa} ${nomeLimpo}`);
    }
  }

  const token = await obterTokenMercadoLivre();

  for (const query of queriesCascata) {
    if (signal?.aborted) break;

    const results = await consultarMercadoLivreSearch(query, token, signal);
    if (results.length === 0) {
      continue;
    }

    const itemValidado = filtrarResultadoRelevanteML(results, codLimpo, marcaLimpa, nomeLimpo);
    if (itemValidado && itemValidado.price > 0 && itemValidado.permalink) {
      return {
        titulo: itemValidado.title,
        preco: itemValidado.price,
        imagem: normalizarThumbnailML(itemValidado.thumbnail),
        linkAfiliado: formatarLinkAfiliado(itemValidado.permalink),
        encontrado: true,
      };
    }
  }

  return {
    titulo: "",
    preco: null,
    imagem: null,
    linkAfiliado: fallbackLink,
    encontrado: false,
  };
}

// ============================================================================
// 5. HANDLER PRINCIPAL POST (app/api/orcamento/route.ts)
// ============================================================================
function normalizarMimeTypeImagem(rawType?: string | null, dataUri?: string | null): string {
  if (dataUri) {
    const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
    if (match && match[1]) {
      const m = match[1].toLowerCase();
      if (m === "image/jpg") return "image/jpeg";
      if (["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(m)) {
        return m;
      }
    }
  }
  const clean = (rawType || "").toLowerCase().trim();
  if (clean === "image/jpg") return "image/jpeg";
  if (["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(clean)) {
    return clean;
  }
  return "image/jpeg";
}

export async function POST(request: NextRequest) {
  try {
    let texto: string | null = null;
    let imagem: File | null = null;
    let imagemBase64: string | null = null;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      texto =
        body.texto ||
        body.descricao ||
        body.orcamento ||
        body.prompt ||
        body.input ||
        body.mensagem ||
        body.textoOuImagem ||
        null;
      const rawImg = body.imagemBase64 || body.imagem || body.image || body.file || body.foto;
      if (rawImg && typeof rawImg === "string") {
        imagemBase64 = rawImg;
      }
    } else {
      try {
        const formData = await request.formData();
        const rawTexto =
          formData.get("texto") ||
          formData.get("descricao") ||
          formData.get("orcamento") ||
          formData.get("prompt") ||
          formData.get("input");
        if (typeof rawTexto === "string") {
          texto = rawTexto;
        }

        const rawBase64Field = formData.get("imagemBase64");
        if (typeof rawBase64Field === "string" && rawBase64Field.trim().length > 0) {
          imagemBase64 = rawBase64Field.trim();
        }

        const rawFile =
          formData.get("imagem") ||
          formData.get("image") ||
          formData.get("file") ||
          formData.get("foto");
        if (rawFile && typeof rawFile === "object" && "arrayBuffer" in rawFile) {
          imagem = rawFile as File;
        } else if (typeof rawFile === "string" && rawFile.trim().length > 0 && !imagemBase64) {
          imagemBase64 = rawFile.trim();
        }
      } catch {
        const body = await request.json().catch(() => ({}));
        texto =
          body.texto ||
          body.descricao ||
          body.orcamento ||
          body.prompt ||
          body.input ||
          body.mensagem ||
          body.textoOuImagem ||
          null;
        const rawImg = body.imagemBase64 || body.imagem || body.image || body.file || body.foto;
        if (rawImg && typeof rawImg === "string") {
          imagemBase64 = rawImg;
        }
      }
    }

    const temTexto = Boolean(texto && texto.trim().length > 0);
    const temImagem = Boolean(
      (imagemBase64 && imagemBase64.trim().length > 20) ||
      (imagem && typeof imagem.size === "number" && imagem.size > 0)
    );

    if (!temTexto && !temImagem) {
      return NextResponse.json(
        {
          success: false,
          error: "Envie uma foto/print do orçamento do fornecedor ou cole a lista de peças com códigos.",
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
        codigo?: string | null;
        marca?: string | null;
        nome: string;
        preco_fornecedor?: number | null;
        preco_mercado_livre_estimado?: number | null;
        quantidade?: number;
      }>;
    } | null = null;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const promptParts: Array<string | Part> = [];

      if (imagemBase64) {
        const mimeType = normalizarMimeTypeImagem(null, imagemBase64);
        const cleanBase64 = imagemBase64
          .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "")
          .replace(/\s+/g, "");
        promptParts.push({
          inlineData: {
            data: cleanBase64,
            mimeType,
          },
        });
        promptParts.push(
          temTexto
            ? `Foto/print de orçamento de autopeças anexada. Observações do usuário:\n"""\n${texto}\n"""\n\nExtraia todas as peças visíveis na imagem e no texto em JSON no formato {"veiculo": string|null, "pecas": [{"codigo": string, "marca": string, "nome": string, "preco_fornecedor": number|null, "preco_mercado_livre_estimado": number, "quantidade": number}]}.`
            : `Foto/print de orçamento de autopeças anexada. Leia atentamente todas as linhas da imagem e extraia todas as peças em JSON no formato {"veiculo": string|null, "pecas": [{"codigo": string, "marca": string, "nome": string, "preco_fornecedor": number|null, "preco_mercado_livre_estimado": number, "quantidade": number}]}.`
        );
      } else if (temImagem && imagem) {
        const buffer = Buffer.from(await imagem.arrayBuffer());
        const base64Data = buffer.toString("base64");
        const mimeType = normalizarMimeTypeImagem(imagem.type, null);

        promptParts.push({
          inlineData: {
            data: base64Data,
            mimeType,
          },
        });

        promptParts.push(
          temTexto
            ? `Foto/print de orçamento de autopeças anexada. Observações do usuário:\n"""\n${texto}\n"""\n\nExtraia todas as peças visíveis na imagem e no texto em JSON no formato {"veiculo": string|null, "pecas": [{"codigo": string, "marca": string, "nome": string, "preco_fornecedor": number|null, "preco_mercado_livre_estimado": number, "quantidade": number}]}.`
            : `Foto/print de orçamento de autopeças anexada. Leia atentamente todas as linhas da imagem e extraia todas as peças em JSON no formato {"veiculo": string|null, "pecas": [{"codigo": string, "marca": string, "nome": string, "preco_fornecedor": number|null, "preco_mercado_livre_estimado": number, "quantidade": number}]}.`
        );
      } else if (temTexto && texto) {
        promptParts.push(
          `Cotação / lista de peças de fornecedor:\n"""\n${texto}\n"""\n\nExtraia os códigos dos fabricantes (Part Numbers), marcas, descrições, preços de fornecedor e preços estimados de mercado no Mercado Livre Brasil conforme as diretrizes.`
        );
      }

      for (const candidateModel of MODEL_CANDIDATES) {
        // Tentativa 1: com responseSchema estruturado; Tentativa 2 (se imagem): JSON livre sem responseSchema restrito
        const configs = [
          {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.1,
          },
          ...(temImagem
            ? [
                {
                  responseMimeType: "application/json",
                  temperature: 0.1,
                },
              ]
            : []),
        ];

        for (const generationConfig of configs) {
          try {
            const model = genAI.getGenerativeModel({
              model: candidateModel,
              systemInstruction: SYSTEM_INSTRUCTION,
              generationConfig,
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
            const rawList = Array.isArray(parsed?.pecas)
              ? parsed.pecas
              : Array.isArray(parsed?.itens)
              ? parsed.itens
              : Array.isArray(parsed?.items)
              ? parsed.items
              : Array.isArray(parsed)
              ? parsed
              : [];

            if (rawList.length > 0) {
              parsedData = {
                veiculo: parsed?.veiculo || "Orçamento de Fornecedor",
                pecas: rawList.map((p: any) => ({
                  codigo: p.codigo || p.part_number || p.referencia || "S/ CÓDIGO",
                  marca: p.marca || p.fabricante || "Original",
                  nome: p.nome || p.descricao || p.peca || p.titulo || "Peça Automotiva",
                  preco_fornecedor:
                    typeof p.preco_fornecedor === "number"
                      ? p.preco_fornecedor
                      : parseBrlStringToNumber(p.preco_fornecedor),
                  preco_mercado_livre_estimado:
                    typeof p.preco_mercado_livre_estimado === "number"
                      ? p.preco_mercado_livre_estimado
                      : parseBrlStringToNumber(p.preco_mercado_livre_estimado || p.preco_ml),
                  quantidade: Number(p.quantidade) || 1,
                })),
              };
              console.log(`[Gemini] Extração realizada com sucesso com o modelo: ${candidateModel} (${rawList.length} peças)`);
              break;
            }
          } catch (err: any) {
            const status = err?.status || err?.statusCode || (err?.message?.match(/\b(503|429|404|500)\b/)?.[0]);
            console.warn(
              `[Gemini Fallback] Modelo ${candidateModel} falhou${status ? ` (${status})` : ""}: ${err?.message || err}`
            );
          }
        }

        if (parsedData && parsedData.pecas.length > 0) {
          break;
        }
      }
    }

    // Se não extraiu pela IA:
    if (!parsedData || !Array.isArray(parsedData.pecas) || parsedData.pecas.length === 0) {
      if (temTexto && texto) {
        console.warn("[Fallback Local] Utilizando parser Regex local para texto do orçamento.");
        parsedData = extrairOrcamentoPorCodigosLocalmente(texto);
      } else {
        return NextResponse.json(
          {
            success: false,
            error:
              "Não foi possível ler as peças desta imagem. Certifique-se de que a foto ou print esteja legível ou cole a lista de peças no campo de texto ao lado.",
          },
          { status: 422 }
        );
      }
    }

    const veiculoDetectado = parsedData.veiculo || "Orçamento de Fornecedor";
    const pecasExtraidas = Array.isArray(parsedData.pecas) ? parsedData.pecas : [];

    // Consulta na API do Mercado Livre com busca em cascata (4 etapas) + filtro de relevância
    const resultadosBusca = await Promise.allSettled(
      pecasExtraidas.map(async (peca) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 14000);
        try {
          const resultado = await buscarAnuncioPorCodigo(
            peca.codigo || "",
            peca.marca || "",
            peca.nome,
            veiculoDetectado,
            peca.preco_fornecedor,
            controller.signal
          );
          clearTimeout(timeoutId);
          return resultado;
        } catch {
          clearTimeout(timeoutId);
          const marcaLimpa = peca.marca && peca.marca !== "Original" ? peca.marca.trim() : "";
          const codLimpo = peca.codigo && peca.codigo !== "S/ CÓDIGO" ? peca.codigo.trim() : "";
          const termo = `${marcaLimpa ? `${marcaLimpa} ` : ""}${codLimpo || peca.nome}`.trim();
          const urlDireta = `https://lista.mercadolivre.com.br/${encodeURIComponent(termo)}`;
          const linkFallback = formatarLinkAfiliado(urlDireta);
          return {
            titulo: "",
            preco: null,
            imagem: null,
            linkAfiliado: linkFallback,
            encontrado: false,
          };
        }
      })
    );

    const itensProcessados: ItemOrcamentoProcessado[] = pecasExtraidas.map((peca, idx) => {
      const resBusca = resultadosBusca[idx];
      const dadosItem = resBusca.status === "fulfilled" ? resBusca.value : null;

      const precoFornecedor =
        typeof peca.preco_fornecedor === "number" && peca.preco_fornecedor > 0
          ? peca.preco_fornecedor
          : null;

      const foiEncontrado = Boolean(
        dadosItem?.encontrado && typeof dadosItem.preco === "number" && dadosItem.preco > 0
      );

      // Somente o preço REAL retornado pela API do Mercado Livre (sem descontos fictícios/mockados)
      const precoML: number | null = foiEncontrado && dadosItem?.preco ? Number(dadosItem.preco) : null;
      const precoFormatado =
        precoML !== null
          ? precoML.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : null;

      const marcaLimpa = peca.marca && peca.marca !== "Original" ? peca.marca.trim() : "";
      const codLimpo = peca.codigo && peca.codigo !== "S/ CÓDIGO" ? peca.codigo.trim() : "";
      const termo = `${marcaLimpa ? `${marcaLimpa} ` : ""}${codLimpo || peca.nome}`.trim();
      const urlBuscaDireta = `https://lista.mercadolivre.com.br/${encodeURIComponent(termo)}`;
      const linkFallbackHonesto = formatarLinkAfiliado(urlBuscaDireta);

      const linkFinal =
        foiEncontrado && dadosItem?.linkAfiliado
          ? formatarLinkAfiliado(dadosItem.linkAfiliado)
          : linkFallbackHonesto;

      // Subtítulo do anúncio deve exibir obrigatoriamente o item.title real do Mercado Livre (e não repetir o orçamento)
      const tituloAnuncioReal =
        foiEncontrado && dadosItem?.titulo && dadosItem.titulo.trim().length > 0
          ? dadosItem.titulo.trim()
          : null;

      const imagemReal = foiEncontrado ? normalizarThumbnailML(dadosItem?.imagem) : null;
      const qtd = Number(peca.quantidade) || 1;

      return {
        codigo: peca.codigo || "S/ CÓDIGO",
        marca: peca.marca || "Original",
        nome: peca.nome,
        preco_fornecedor: precoFornecedor,
        preco_ml: precoML,
        preco: precoML,
        quantidade: qtd,
        termo_busca: `${peca.codigo || ""} ${peca.marca || ""} ${peca.nome}`.trim(),
        titulo: tituloAnuncioReal,
        titulo_anuncio: tituloAnuncioReal,
        imagem: imagemReal,
        imagem_url: imagemReal,
        thumbnail: imagemReal,
        permalink: linkFinal,
        linkAfiliado: linkFinal,
        link_afiliado: linkFinal,
        link: linkFinal,
        encontrado: foiEncontrado,

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
        tem_full: foiEncontrado,
      };
    });

    const totalNumerico = itensProcessados.reduce(
      (acc, it) => acc + (typeof it.preco === "number" ? it.preco * it.quantidade : 0),
      0
    );
    const totalFormatado =
      totalNumerico > 0
        ? totalNumerico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "R$ 0,00";

    const totalFornecedor = itensProcessados.reduce(
      (acc, it) => acc + (it.preco_fornecedor || 0) * it.quantidade,
      0
    );
    const totalFornecedorFormatado =
      totalFornecedor > 0
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
