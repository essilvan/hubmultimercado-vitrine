/**
 * Módulo de Integração com a API do Mercado Livre e Utilitários de Produtos
 */

export interface MLAttribute {
  id: string;
  name: string;
  value_name: string | null;
}

export interface MLSearchResultItem {
  id: string;
  title: string;
  price: number;
  original_price?: number | null;
  thumbnail?: string;
  permalink: string;
  attributes?: MLAttribute[];
  pictures?: { id: string; url: string; secure_url?: string }[];
  shipping?: {
    logistic_type?: string;
    mode?: string;
    free_shipping?: boolean;
  };
}

export interface DadosTecnicosProduto {
  codigo_fabricante?: string;
  marca?: string;
  modelo?: string;
  mpn?: string;
  numero_peca?: string;
  codigo_oem?: string;
  posicao?: string;
  lado?: string;
  diametro?: string;
  estrias?: string;
  conteudo?: string;
  medidas?: string;
  material?: string;
  composicao?: string;
  tipo_veiculo?: string;
  garantia?: string;
  [key: string]: string | undefined;
}

export interface EspecificacoesML {
  ml_id: string;
  link_ml: string;
  link_afiliado: string;
  link_destino: string;
  marca: string;
  modelo?: string;
  mpn?: string;
  numero_peca?: string;
  codigo_oem?: string;
  posicao?: string;
  lado?: string;
  medidas?: string;
  composicao?: string;
  preco: string;
  preco_antigo?: string | null;
  desconto_percentual?: string | null;
  aplicacao?: string[];
  compatibility?: string;
  dados_tecnicos?: DadosTecnicosProduto;
  descricao_completa?: string;
  palavras_chave?: string[];
  atributos_ml?: Record<string, string | undefined>;
  ultima_sincronizacao?: string;
  [key: string]: unknown;
}

export interface ProdutoMLExtraido {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  thumbnail: string;
  pictures: string[];
  permalink: string;
  linkAfiliado: string;
  descricao?: string;
  aplicacao?: string[];
  palavras_chave?: string[];
  attributes: {
    marca?: string;
    modelo?: string;
    numero_peca?: string;
    mpn?: string;
    oem?: string;
    lado?: string;
    posicao?: string;
    [key: string]: string | undefined;
  };
  // Objeto estruturado pronto para exibição e salvamento na tabela produtos_afiliados do Supabase
  produtoProntoParaSalvar: {
    titulo: string;
    slug: string;
    codigo_fabricante: string;
    marca: string;
    categoria: string;
    veiculos_compativeis: string;
    codigo_oem: string | null;
    busca_ml: string;
    preco: string;
    preco_estimado: string;
    preco_antigo: string | null;
    desconto_percentual: string | null;
    imagem_url: string;
    link_afiliado: string;
    descricao?: string;
    aplicacao?: string[];
    palavras_chave?: string[];
    especificacoes: EspecificacoesML;
  };
}

/**
 * Converte imagens de thumbnail do Mercado Livre (-I.jpg / -V.jpg) para Alta Resolução (-O.jpg / -D.jpg)
 */
export function obterImagemAltaResolucao(url?: string | null): string {
  if (!url) return "";
  let clean = url.trim().replace(/^http:\/\//i, "https://");

  if (clean.includes("-I.jpg")) {
    clean = clean.replace("-I.jpg", "-O.jpg");
  } else if (clean.includes("-I.webp")) {
    clean = clean.replace("-I.webp", "-O.webp");
  } else if (clean.includes("-V.jpg")) {
    clean = clean.replace("-V.jpg", "-O.jpg");
  } else if (clean.includes("-V.webp")) {
    clean = clean.replace("-V.webp", "-O.webp");
  }

  return clean;
}

/**
 * Anexa os identificadores de afiliado (matt_tool e matt_word) ao permalink
 */
export function formatarLinkAfiliado(permalink: string): string {
  const mattTool = process.env.ML_MATT_TOOL || "31976628";
  const mattWord = process.env.ML_MATT_WORD || "hubmultimercado";
  const separator = permalink.includes("?") ? "&" : "?";
  return `${permalink}${separator}matt_tool=${mattTool}&matt_word=${mattWord}&forceInApp=true`;
}

/**
 * Gera slug limpo a partir de texto
 */
export function gerarSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90)
    .replace(/^-+|-+$/g, "");
}

/**
 * Extrai o ID do item MLB de uma URL ou string de texto (ex: "MLB3931144723" ou "MLB-3931144723")
 */
export function extrairItemIdML(textoOuUrl: string): string | null {
  if (!textoOuUrl || typeof textoOuUrl !== "string") return null;
  const clean = textoOuUrl.trim();

  // 1. Padrão direto na URL: MLB-123456789 ou MLB123456789
  const directMatch = clean.match(/(?:item_id=|wid=|\/p\/|\/up\/MLBU?|MLB-?|^)(MLB-?\d{8,14})/i);
  if (directMatch && directMatch[1]) {
    return directMatch[1].replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  // 2. Formato MLBU (User listing) com número
  const mlbuMatch = clean.match(/MLBU-?(\d{8,14})/i);
  if (mlbuMatch && mlbuMatch[1]) {
    return `MLB${mlbuMatch[1]}`;
  }

  // 3. Padrão geral de ID MLB seguido de números
  const generalMatch = clean.match(/\b(MLB-?\d{8,14})\b/i);
  if (generalMatch && generalMatch[1]) {
    return generalMatch[1].replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  return null;
}

export const MONTADORAS_CONHECIDAS = [
  "Chevrolet", "GM", "Volkswagen", "VW", "Fiat", "Ford", "Toyota", "Honda",
  "Hyundai", "Renault", "Nissan", "Jeep", "Peugeot", "Citroen", "Citroën",
  "Mitsubishi", "Kia", "Chery", "Caoa Chery", "BMW", "Audi", "Mercedes-Benz",
  "Mercedes", "Volvo", "BYD", "GWM", "Suzuki", "Subaru", "Troller"
];

export const MODELOS_CONHECIDOS = [
  "Onix", "Prisma", "Celta", "Corsa", "Cobalt", "Spin", "Cruze", "Tracker", "S10",
  "Montana", "Astra", "Vectra", "Zafira", "Meriva", "Kadett", "Monza", "Opala",
  "Gol", "Fox", "Voyage", "Saveiro", "Polo", "Golf", "Up", "Up!", "Virtus",
  "T-Cross", "Nivus", "Taos", "Tiguan", "Amarok", "Santana", "Parati", "Kombi",
  "Palio", "Uno", "Siena", "Strada", "Toro", "Mobi", "Argo", "Cronos", "Pulse",
  "Fastback", "Fiorino", "Doblo", "Doblò", "Idea", "Punto", "Bravo", "Linea",
  "Palio Weekend", "Weekend", "Adventure",
  "HB20", "HB20S", "HB20X", "Creta", "Tucson", "ix35", "Santa Fe", "i30",
  "Ka", "Fiesta", "EcoSport", "Ranger", "Focus", "Fusion", "Courier",
  "Civic", "Fit", "City", "HR-V", "CR-V", "WR-V", "Accord",
  "Corolla", "Etios", "Yaris", "Hilux", "SW4", "Corolla Cross",
  "Sandero", "Logan", "Duster", "Kwid", "Oroch", "Captur", "Clio",
  "Kicks", "March", "Versa", "Sentra", "Frontier", "Tiida",
  "Compass", "Renegade", "Commander",
  "206", "207", "208", "2008", "307", "308", "3008",
  "C3", "C4", "C4 Cactus", "Aircross"
];

/**
 * Gera automaticamente uma lista/array de 'palavras_chave' (keywords) para SEO
 * combinando: nome da peça, montadoras citadas, modelos, anos e os códigos de peça encontrados.
 */
export function gerarPalavrasChave({
  titulo,
  descricao,
  marca,
  modelo,
  codigo_fabricante,
  codigo_oem,
  aplicacao,
  categoria,
  atributos,
}: {
  titulo: string;
  descricao?: string | null;
  marca?: string | null;
  modelo?: string | null;
  codigo_fabricante?: string | null;
  codigo_oem?: string | null;
  aplicacao?: string[] | string | null;
  categoria?: string | null;
  atributos?: Record<string, string | undefined> | null;
}): string[] {
  const keywordsSet = new Set<string>();
  const aplicacaoTexto = Array.isArray(aplicacao) ? aplicacao.join(" ") : aplicacao || "";
  const textoCompleto = `${titulo || ""} ${descricao || ""} ${aplicacaoTexto} ${categoria || ""}`;

  // 1. Título Limpo
  const tituloLimpo = (titulo || "")
    .replace(/\s*-\s*R\$.*$/i, "")
    .replace(/\s*\|\s*.*$/i, "")
    .trim();
  if (tituloLimpo) keywordsSet.add(tituloLimpo.toLowerCase());

  // 2. Montadoras citadas
  const montadorasEncontradas: string[] = [];
  for (const m of MONTADORAS_CONHECIDAS) {
    const reg = new RegExp(`\\b${m}\\b`, "i");
    if (reg.test(textoCompleto)) {
      montadorasEncontradas.push(m);
      keywordsSet.add(m.toLowerCase());
    }
  }

  // 3. Modelos de veículos citados
  const modelosEncontrados: string[] = [];
  for (const mod of MODELOS_CONHECIDOS) {
    const reg = new RegExp(`\\b${mod}\\b`, "i");
    if (reg.test(textoCompleto)) {
      modelosEncontrados.push(mod);
      keywordsSet.add(mod.toLowerCase());
    }
  }

  // 4. Anos citados (individuais e faixas)
  const anosMatches = textoCompleto.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  const anosUnicos = [...new Set(anosMatches)].slice(0, 8);
  for (const ano of anosUnicos) {
    keywordsSet.add(ano);
  }

  const faixasAnos = textoCompleto.match(/\b(19\d{2}|20\d{2})\s*(?:a|à|-|\/)\s*(19\d{2}|20\d{2})\b/gi) || [];
  for (const faixa of faixasAnos) {
    keywordsSet.add(faixa.toLowerCase());
  }

  // 5. Marca e Modelo técnico
  if (marca && marca !== "Auto Peças") {
    keywordsSet.add(marca.toLowerCase());
  }
  if (modelo) {
    keywordsSet.add(modelo.toLowerCase());
  }

  // 6. Códigos de Peça (Fabricante, MPN, OEM, Número de Peça)
  const codigosRaw = [
    codigo_fabricante,
    codigo_oem,
    atributos?.["PART_NUMBER"],
    atributos?.["MPN"],
    atributos?.["OEM"],
    atributos?.["NUMERO_DE_PECA"],
    atributos?.["NÚMERO DE PEÇA"],
    atributos?.["Número de peça"],
  ].filter(Boolean);

  const codigosEncontrados: string[] = [];
  for (const c of codigosRaw) {
    const parts = String(c).split(/[\s,;/|]+/);
    for (const p of parts) {
      const cleanP = p.trim().replace(/[^A-Za-z0-9-]/g, "");
      if (cleanP.length >= 3) {
        codigosEncontrados.push(cleanP);
        keywordsSet.add(cleanP.toLowerCase());
        keywordsSet.add(cleanP.replace(/-/g, "").toLowerCase());
      }
    }
  }

  // 7. Tipo de Peça / Categoria
  const tiposPeca = [
    "pastilha de freio", "disco de freio", "kit de embreagem", "kit embreagem",
    "amortecedor", "vela de ignição", "vela ignicao", "bomba de combustivel",
    "correia dentada", "filtro de oleo", "filtro de ar", "filtro de combustivel",
    "pivo de suspensao", "bandeja de suspensao", "bieleta", "bateria"
  ];
  const tiposDetectados: string[] = [];
  for (const tp of tiposPeca) {
    if (new RegExp(tp.replace(/\s+/g, "\\s+"), "i").test(textoCompleto)) {
      tiposDetectados.push(tp);
      keywordsSet.add(tp);
    }
  }
  if (tiposDetectados.length === 0 && categoria) {
    keywordsSet.add(categoria.toLowerCase());
    tiposDetectados.push(categoria.toLowerCase());
  }

  // 8. Combinações inteligentes de alto valor de conversão para SEO
  const tipoPrincipal = tiposDetectados[0] || "peça automotiva";

  // Combinações: [tipo] + [modelo]
  for (const mod of modelosEncontrados.slice(0, 6)) {
    keywordsSet.add(`${tipoPrincipal} ${mod.toLowerCase()}`);
    if (marca && marca !== "Auto Peças") {
      keywordsSet.add(`${tipoPrincipal} ${marca.toLowerCase()} ${mod.toLowerCase()}`);
    }
    keywordsSet.add(`peças ${mod.toLowerCase()}`);
  }

  // Combinações: [marca] + [código]
  if (marca && marca !== "Auto Peças") {
    for (const cod of codigosEncontrados.slice(0, 3)) {
      keywordsSet.add(`${marca.toLowerCase()} ${cod.toLowerCase()}`);
      keywordsSet.add(`${tipoPrincipal} ${cod.toLowerCase()}`);
    }
  }

  // Combinações: [código] + [modelo]
  if (codigosEncontrados.length > 0 && modelosEncontrados.length > 0) {
    keywordsSet.add(`${codigosEncontrados[0].toLowerCase()} ${modelosEncontrados[0].toLowerCase()}`);
  }

  return Array.from(keywordsSet)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2 && k.length <= 80)
    .slice(0, 40);
}

/**
 * Converte número para formato monetário BRL sempre com 2 casas decimais (ex: "R$ 31,92" ou "R$ 39,90")
 */
export function formatarPrecoBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return "";
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).replace(/\u00a0/g, " ");
}

/**
 * Deduz a categoria automotiva a partir do título do produto
 */
function deduzirCategoria(titulo: string): string {
  const t = titulo.toLowerCase();
  if (/pastilha|disco|freio|sapata|lona|tambor|fluido|pinca/i.test(t)) return "Freio";
  if (/embreagem|plato|disco embreagem|atuador|volante/i.test(t)) return "Embreagem";
  if (/amortecedor|suspens|mola|batente|coxim|bieleta|pivo|bandeja/i.test(t)) return "Suspensão";
  if (/vela|ignicao|bobina|cabo de vela/i.test(t)) return "Ignição";
  if (/correia|tensor|dentada|motor|valvula|junta|cabecote/i.test(t)) return "Motor";
  if (/bomba|combustivel|bico|injetor|injecao/i.test(t)) return "Injeção Eletrônica";
  if (/filtro|oleo|ar|combustivel|cabine/i.test(t)) return "Filtros";
  if (/radiador|ar condicionado|ventoinha|termostato/i.test(t)) return "Arrefecimento";
  return "Autopeças";
}

/**
 * Deduz veículos compatíveis com base em termos conhecidos no título
 */
function deduzirVeiculos(titulo: string): string {
  const carros = [
    "Onix", "Prisma", "HB20", "HB20S", "Gol", "Fox", "Voyage", "Saveiro",
    "Palio", "Uno", "Celta", "Corsa", "Cobalt", "Spin", "Cruze", "Fiesta",
    "Ka", "EcoSport", "Civic", "Fit", "Corolla", "Sandero", "Logan",
    "Duster", "Polo", "Golf", "Up!", "S10", "Hilux", "Ranger", "Toro",
    "Compass", "Renegade", "Creta", "Kicks", "Tracker"
  ];

  const encontrados: string[] = [];
  for (const carro of carros) {
    const reg = new RegExp(`\\b${carro}\\b`, "i");
    if (reg.test(titulo)) {
      encontrados.push(carro);
    }
  }

  if (encontrados.length > 0) {
    return `Compatível com ${encontrados.join(" / ")}`;
  }
  return "Consulte compatibilidade do veículo com o código da peça";
}

/**
 * Lista de marcas automotivas conhecidas com prioridade para fabricantes diretos
 */
const MARCAS_CONHECIDAS = [
  "SYL", "Cobreq", "Fras-le", "Frasle", "LuK", "Sachs", "Nakata", "Monroe", "Fremax",
  "NGK", "Bosch", "Continental", "Contitech", "Mann-Filter", "Mann",
  "TRW", "Magneti Marelli", "Marelli", "Valeo", "Cofap", "Dayco",
  "Hipper Freios", "Hipper", "Willtec", "Tecfil", "Fram", "Wega", "Mahle",
  "Delphi", "Varga", "Gates", "Urba", "Schadek", "Sabó", "VDO",
  "KYB", "Kayaba", "Jurid", "Brembo", "SKF", "Ina", "MTE-Thomson", "MTE",
  "DS", "Zen", "Sampel", "Axios", "Monroe Axios", "Viemar", "Perfect",
  "Lonaflex", "Ecopads", "Brosol", "Fabreck", "Grazmec", "Cindumel"
];

/**
 * Deduz marca a partir de texto (query ou título do anúncio)
 */
export function deduzirMarca(texto?: string | null): string | null {
  if (!texto) return null;

  // 1. Procura primeiro na lista de marcas conhecidas
  for (const m of MARCAS_CONHECIDAS) {
    const reg = new RegExp(`\\b${m}\\b`, "i");
    if (reg.test(texto)) return m;
  }

  // 2. Tenta identificar palavras curtas em caixa alta de 2 a 5 letras que indicam marca
  const tokens = texto.split(/[\s,/-]+/);
  for (const token of tokens) {
    const cleanToken = token.trim();
    if (
      cleanToken.length >= 2 &&
      cleanToken.length <= 5 &&
      /^[A-Z0-9]+$/.test(cleanToken) &&
      !/^(G[1-9]|1\.0|1\.4|1\.6|1\.8|2\.0|16V|8V|FLEX|KIT|PRO|PAR)$/i.test(cleanToken) &&
      !/^\d+$/.test(cleanToken)
    ) {
      return cleanToken;
    }
  }

  return null;
}

/**
 * Deduz o código de fabricante a partir do título
 */
function deduzirCodigo(titulo: string, marca: string): string {
  const codeSpaceMatch = titulo.match(/\b(\d{3}\s\d{4}\s\d{2})\b/);
  if (codeSpaceMatch) return codeSpaceMatch[1];

  const codeComplexMatch = titulo.match(
    /\b([A-Z]{1,4}[/-]\d{2,6}(?:-[A-Z0-9]+)?|[A-Z]{1,3}\s?\d{3,5}\/\d{1,4})\b/i
  );
  if (codeComplexMatch) return codeComplexMatch[1].toUpperCase();

  const codeAlphaNumMatch = titulo.match(
    /\b([A-Z]{1,3}\d{4,6}[A-Z0-9]*|F000[A-Z0-9]{5,7}|CT\d{4,5}[A-Z0-9]*)\b/i
  );
  if (codeAlphaNumMatch) return codeAlphaNumMatch[1].toUpperCase();

  const codeNumMatch = titulo.match(/\b(\d{4,6})\b/);
  if (codeNumMatch && !codeNumMatch[1].startsWith("201") && !codeNumMatch[1].startsWith("202")) {
    return codeNumMatch[1];
  }

  return marca && marca !== "Auto Peças" ? `${marca}-COD` : "COD-ML";
}

/**
 * Armazena o token de acesso da API do Mercado Livre em memória com timestamp de expiração
 */
let cachedMLToken: {
  token: string;
  expiresAt: number;
} | null = null;

/**
 * Obtém o Access Token da API do Mercado Livre automaticamente via OAuth (client_credentials).
 * Armazena em memória com tempo de expiração para evitar requisições de autenticação desnecessárias.
 */
export async function obterTokenMercadoLivre(): Promise<string | null> {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const now = Date.now();
  // Se o token em cache ainda for válido com margem de segurança de 60s, reutiliza
  if (cachedMLToken && cachedMLToken.expiresAt > now + 60 * 1000) {
    return cachedMLToken.token;
  }

  try {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
    });

    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("Aviso ao obter Access Token OAuth do Mercado Livre:", res.status, errText);
      return null;
    }

    const data = await res.json();
    const token = data.access_token;
    const expiresIn = Number(data.expires_in) || 21600; // Padrão 6 horas

    if (token) {
      cachedMLToken = {
        token,
        expiresAt: now + expiresIn * 1000,
      };
      return token;
    }
  } catch (err) {
    console.warn("Falha ao comunicar com endpoint OAuth do Mercado Livre:", err);
  }

  return null;
}

/**
 * Retorna os cabeçalhos padrão para chamadas à API do Mercado Livre,
 * injetando 'Authorization: Bearer <token>' caso as credenciais estejam disponíveis.
 */
export async function obterHeadersApiML(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9",
  };

  const token = await obterTokenMercadoLivre();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Consulta os detalhes de um item diretamente na API oficial do Mercado Livre
 * @param itemId ID do produto (ex: "MLB123456789" ou "MLB-123456789")
 */
export async function consultarDetalhesItemML(itemId: string): Promise<MLSearchResultItem | null> {
  const cleanId = itemId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!cleanId.startsWith("MLB")) return null;

  try {
    const headers = await obterHeadersApiML();
    const res = await fetch(`https://api.mercadolibre.com/items/${cleanId}`, {
      headers,
      next: { revalidate: 60 },
    });

    if (res.status === 429 || res.status === 403) {
      console.error("Bloqueio/Rate Limit ML (items):", res.statusText || `${res.status}`);
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const item = await res.json();
    return item as MLSearchResultItem;
  } catch (err) {
    console.warn(`Aviso ao consultar detalhes do item ${cleanId} na API do ML:`, err);
    return null;
  }
}

/**
 * Consulta a descrição oficial de um item na API do Mercado Livre
 */
export async function obterDescricaoItemML(itemId: string): Promise<string | null> {
  const cleanId = itemId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!cleanId.startsWith("MLB")) return null;

  try {
    const headers = await obterHeadersApiML();
    const res = await fetch(`https://api.mercadolibre.com/items/${cleanId}/description`, {
      headers,
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return typeof data.plain_text === "string" ? data.plain_text.trim() : null;
  } catch (err) {
    console.warn(`Aviso ao consultar descrição do item ${cleanId}:`, err);
    return null;
  }
}

/**
 * Extrai o texto limpo da descrição a partir do HTML do anúncio do Mercado Livre
 */
export function extrairDescricaoHtml(html: string): string | null {
  if (!html) return null;

  const match =
    html.match(/<p[^>]*class=["'][^"']*ui-pdp-description__content[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) ||
    html.match(/<div[^>]*class=["'][^"']*ui-pdp-description__content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/class=["'][^"']*ui-pdp-description[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);

  if (match && match[1]) {
    const raw = match[1]
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\u00a0/g, " ")
      .trim();
    if (raw.length > 5) return raw;
  }

  return null;
}

/**
 * Extrai pares de chave e valor da tabela de especificações do HTML do anúncio
 */
export function extrairTabelaEspecificacoesHtml(html: string): Record<string, string> {
  const tableAttrs: Record<string, string> = {};
  if (!html) return tableAttrs;

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const r of rows) {
    const th = r[1]
      .match(/<th[^>]*>([\s\S]*?)<\/th>/i)?.[1]
      ?.replace(/<[^>]+>/g, "")
      ?.trim();
    const td = r[1]
      .match(/<td[^>]*>([\s\S]*?)<\/td>/i)?.[1]
      ?.replace(/<[^>]+>/g, "")
      ?.trim();
    if (th && td) {
      tableAttrs[th] = td;
    }
  }

  return tableAttrs;
}

/**
 * Extrai a lista de aplicação de veículos e os dados técnicos estruturados da descrição e atributos
 */
export function extrairDadosDescricaoML(
  descricaoTexto?: string | null,
  atributosML?: Record<string, string | undefined>,
  titulo?: string
): {
  aplicacao: string[];
  compatibility: string;
  dados_tecnicos: DadosTecnicosProduto;
} {
  const desc = (descricaoTexto || "").replace(/\r\n/g, "\n");
  const attrs: Record<string, string | undefined> = {};
  if (atributosML) {
    for (const [k, v] of Object.entries(atributosML)) {
      if (v) {
        attrs[k.toUpperCase()] = String(v).trim();
      }
    }
  }

  // 1. Extração de Aplicação / Veículos Compatíveis
  const aplicacao: string[] = [];
  const lines = desc.split("\n").map((l) => l.trim());

  let emBlocoAplicacao = false;
  for (const line of lines) {
    if (!line) continue;

    // Identifica início da seção de aplicação
    if (
      /^(?:APLICA[ÇC][ÃA]O|APLICA[ÇC][ÕO]ES|VE[ÍI]CULOS COMPAT[ÍI]VEIS|COMPATIBILIDADE|APLICA-SE|APLIC[ÁA]VEL EM|TABELA DE APLICA[ÇC][ÃA]O|COMPAT[ÍI]VEL COM)[:\s-]*$/i.test(
        line
      )
    ) {
      emBlocoAplicacao = true;
      continue;
    }

    // Identifica fim da seção de aplicação quando encontrar outro cabeçalho
    if (
      emBlocoAplicacao &&
      /^(?:DADOS T[ÉE]CNICOS|ESPECIFICA[ÇC][ÕO]ES|CONTE[ÚU]DO|INFORMA[ÇC][ÕO]ES|GARANTIA|OBS|ATEN[ÇC][ÃA]O|C[ÓO]DIGO|D[ÚU]VIDAS|IMPORTANTE|FABRICANTE)[:\s-]/i.test(
        line
      )
    ) {
      emBlocoAplicacao = false;
      continue;
    }

    if (emBlocoAplicacao) {
      const cleanLine = line.replace(/^[-*•·>✓]\s*/, "").trim();
      if (
        cleanLine.length >= 3 &&
        !/^(?:consulte|antes de|foto|imagem|duvidas|garantia|frete|atencao|importante|obs)/i.test(
          cleanLine
        )
      ) {
        aplicacao.push(cleanLine);
      }
    }
  }

  // Fallback: Se não encontrou cabeçalho explícito "APLICAÇÃO", busca linhas com veículos conhecidos
  if (aplicacao.length === 0) {
    const regexVeiculosLinha =
      /\b(Fiat|Chevrolet|GM|Ford|Volkswagen|VW|Renault|Hyundai|Toyota|Honda|Nissan|Jeep|Peugeot|Citro[eë]n|Palio|Uno|Gol|Fox|Polo|Voyage|Saveiro|Onix|Prisma|Corsa|Celta|HB20|Ka|Fiesta|EcoSport|Civic|Fit|Corolla|Sandero|Logan|Duster|Compass|Renegade|Mobi|Siena|Strada|Toro|Cruze|Spin|Cobalt|Tracker|Kicks|Creta|Up!?|Golf)\b/i;
    for (const line of lines) {
      const cleanLine = line.replace(/^[-*•·>✓]\s*/, "").trim();
      if (
        regexVeiculosLinha.test(cleanLine) &&
        cleanLine.length >= 4 &&
        cleanLine.length <= 120
      ) {
        if (
          !/^(?:garantia|atencao|importante|obs|foto|imagem|duvidas|politica)/i.test(
            cleanLine
          )
        ) {
          aplicacao.push(cleanLine);
        }
      }
    }
  }

  // Se ainda estiver vazio, deduz a partir do título
  if (aplicacao.length === 0 && titulo) {
    const deduzidos = deduzirVeiculos(titulo);
    if (deduzidos && !deduzidos.startsWith("Consulte")) {
      aplicacao.push(deduzidos);
    }
  }

  // 2. Extração dos Dados Técnicos
  const dadosTecnicos: DadosTecnicosProduto = {};

  // Marca / Fabricante
  const marcaAttr =
    attrs["MARCA"] || attrs["BRAND"] || attrs["FABRICANTE"] || attrs["MANUFACTURER"];
  const marcaDesc = desc
    .match(/(?:Fabricante|Marca)\s*[:=-]\s*([^\n\r]+)/i)?.[1]
    ?.trim();
  const marcaDeduzida = titulo ? deduzirMarca(titulo) : null;
  dadosTecnicos.marca = marcaAttr || marcaDesc || marcaDeduzida || "Auto Peças";

  // Modelo
  const modeloAttr = attrs["MODEL"] || attrs["MODELO"];
  const modeloDesc = desc.match(/(?:Modelo)\s*[:=-]\s*([^\n\r]+)/i)?.[1]?.trim();
  dadosTecnicos.modelo = modeloAttr || modeloDesc || undefined;

  // MPN (código do fabricante)
  const mpnAttr =
    attrs["MPN"] ||
    attrs["MANUFACTURER_PART_NUMBER"] ||
    attrs["PART_NUMBER"] ||
    attrs["CODIGO_DE_FABRICANTE"] ||
    attrs["CODIGO_FABRICANTE"];
  const mpnDesc = desc
    .match(/(?:MPN|Part\s*Number|C[óo]digo(?:\s+do)?\s+fabricante)\s*[:=-]\s*([A-Za-z0-9\.\-\/]+)/i)?.[1]
    ?.trim();
  dadosTecnicos.mpn = mpnAttr || mpnDesc || undefined;

  // Número da Peça / Part Number
  const numPecaAttr =
    attrs["NUMERO_DE_PECA"] ||
    attrs["NÚMERO DE PEÇA"] ||
    attrs["PART_NUMBER"] ||
    attrs["PIECE_NUMBER"] ||
    attrs["CODIGO_DA_PECA"];
  const numPecaDesc = desc
    .match(/(?:N[úu]mero\s+de\s+pe[çc]a|C[óo]digo(?:\s+da\s+pe[çc]a)?|Ref(?:\.|er[eê]ncia)?)\s*[:=-]\s*([A-Za-z0-9\.\-\/]+(?:\s+[A-Za-z0-9\.\-\/]+)*)/i)?.[1]
    ?.trim();
  dadosTecnicos.numero_peca = numPecaAttr || numPecaDesc || undefined;

  // Padrões de código automotivo fortes (ex: LuK 619 3015 00 ou 619312000, Bosch F000..., etc.)
  const codePatt = desc.match(
    /\b(6\d{2}\s?\d{4}\s?\d{2}|6\d{8}|[A-Z]{2,4}[/-]\d{3,6}|F000[A-Z0-9]{5,7}|CT\d{4,5})\b/i
  );

  let codigoFinal = dadosTecnicos.mpn || dadosTecnicos.numero_peca || codePatt?.[1]?.trim();
  if (!codigoFinal && titulo) {
    codigoFinal = deduzirCodigo(titulo, dadosTecnicos.marca || "Auto Peças");
  }
  dadosTecnicos.codigo_fabricante = codigoFinal || undefined;

  // Código OEM
  const oemAttr = attrs["OEM"] || attrs["OEM_PART_NUMBER"] || attrs["CÓDIGO OEM"] || attrs["CODIGO_OEM"];
  const oemDesc = desc
    .match(/(?:C[óo]digo\s+OEM|OEM|Convers[ãa]o|Original)\s*[:=-]\s*([A-Za-z0-9\s\.\-\/,;]+)/i)?.[1]
    ?.trim();
  if (oemDesc || (oemAttr && !/nao\s+se\s+aplica/i.test(oemAttr))) {
    dadosTecnicos.codigo_oem = oemDesc || oemAttr;
  }

  // Posição
  const posAttr = attrs["POSITION"] || attrs["POSIÇÃO"] || attrs["POSICAO"];
  const posDesc = desc.match(/\b(Dianteir[oa]|Traseir[oa]|Superior|Inferior)\b/i)?.[1];
  dadosTecnicos.posicao = posAttr || posDesc || undefined;

  // Lado
  const ladoAttr = attrs["SIDE"] || attrs["LADO"];
  const ladoDesc = desc.match(/\b(Direit[oa]|Esquerd[oa]|Ambos(?:\s+os\s+lados)?)\b/i)?.[1];
  dadosTecnicos.lado = ladoAttr || ladoDesc || undefined;

  // Diâmetro
  const diamAttr =
    attrs["DIÂMETRO DO DISCO"] ||
    attrs["DIÂMETRO"] ||
    attrs["DIAMETRO"] ||
    attrs["DIAMETER"];
  const diamDesc =
    desc.match(/(?:Di[âa]metro(?:\s+do\s+disco)?)\s*[:=-]?\s*([0-9.,]+\s*(?:mm|pol| polegadas|cm)?)/i)?.[1]?.trim() ||
    desc.match(/\b([0-9]{2,3}(?:[.,][0-9]+)?\s*mm)\b/i)?.[1]?.trim();
  dadosTecnicos.diametro = diamDesc || diamAttr || undefined;

  // Estrias
  const estriasAttr =
    attrs["QUANTIDADE DE ESTRIAS"] ||
    attrs["ESTRIAS"] ||
    attrs["TEETH_COUNT"] ||
    attrs["SPLINES"];
  const estriasDesc =
    desc.match(/(?:Estrias|N[úu]mero\s+de\s+[eE]strias|Qtd\s+de\s+[eE]strias)\s*[:=-]?\s*(\d{1,2}(?:\s*estrias)?)/i)?.[1]?.trim() ||
    desc.match(/\b(\d{1,2})\s*estrias\b/i)?.[1]?.trim();
  dadosTecnicos.estrias = estriasDesc || (estriasAttr ? `${estriasAttr}` : undefined);

  // Material / Composição
  const matAttr = attrs["MATERIAL"] || attrs["COMPOSIÇÃO"] || attrs["COMPOSICAO"];
  const matDesc = desc.match(/(?:Material|Composi[çc][ãa]o)\s*[:=-]\s*([^\n\r]+)/i)?.[1]?.trim();
  dadosTecnicos.material = matAttr || matDesc || undefined;
  dadosTecnicos.composicao = dadosTecnicos.material;

  // Conteúdo da Embalagem
  const conteudoDesc = desc
    .match(/(?:Conte[úu]do(?:\s+da\s+embalagem)?|Itens\s+inclusos|Composi[çc][ãa]o)\s*[:=-]\s*([^\n\r]+)/i)?.[1]
    ?.trim();
  let conteudoMontado = conteudoDesc;
  if (!conteudoMontado) {
    const partes: string[] = [];
    if (/sim/i.test(attrs["INCLUI PLATÔ"] || "")) partes.push("Platô");
    if (/sim/i.test(attrs["INCLUI DISCO"] || "")) partes.push("Disco");
    if (
      /sim/i.test(attrs["INCLUI ROLIMÃ DE IMPULSO"] || "") ||
      /sim/i.test(attrs["INCLUI ROLAMENTO"] || "")
    ) {
      partes.push("Rolamento de Desarme");
    }
    if (/sim/i.test(attrs["INCLUI ATUADOR"] || "")) partes.push("Atuador Hidráulico");
    if (partes.length > 0) {
      conteudoMontado = partes.join(" + ");
    }
  }
  dadosTecnicos.conteudo = conteudoMontado || undefined;

  // Garantia
  const garAttr = attrs["GARANTIA"] || attrs["WARRANTY"];
  const garDesc = desc.match(/(?:Garantia)\s*[:=-]\s*([^\n\r]+)/i)?.[1]?.trim();
  dadosTecnicos.garantia = garAttr || garDesc || undefined;

  return {
    aplicacao,
    compatibility: aplicacao.join("\n"),
    dados_tecnicos: dadosTecnicos,
  };
}

/**
 * Consulta a API do Mercado Livre buscando pelo menor preço real com entrega Full
 * @param query Código ou descrição da peça (ex: "SYL 1092" ou "LUK 620 3268 00 HB20")
 */
export async function buscarProdutoML(query: string): Promise<ProdutoMLExtraido | null> {
  const queryLimpa = query.replace(/[\/\\_\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!queryLimpa) return null;

  let erroBloqueioOuRateLimit: string | null = null;
  let erroDetalhadoApi: string | null = null;

  // 1. Consulta à API Oficial do Mercado Livre (tenta com Full primeiro; fallback automático para busca geral)
  try {
    const queryEncoded = encodeURIComponent(queryLimpa);
    let apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${queryEncoded}&shipping_highlighted=fulfillment&limit=5`;
    const headers = await obterHeadersApiML();

    let res = await fetch(apiUrl, {
      headers,
      next: { revalidate: 60 },
    });

    if (res.status === 429 || res.status === 403) {
      console.error("Bloqueio/Rate Limit ML:", res.statusText || `${res.status}`);
      erroBloqueioOuRateLimit = "Limite temporário de consultas da API atingido. Aguarde 30 segundos ou use a aba 'Por Link Direto'";
    } else if (!res.ok) {
      let detalhe = "";
      try {
        const errJson = await res.json();
        detalhe = errJson.message || errJson.error || JSON.stringify(errJson);
      } catch {
        try {
          detalhe = await res.text();
        } catch {}
      }
      console.error("Erro na API do Mercado Livre:", res.status, detalhe);
      erroDetalhadoApi = detalhe ? `Erro API ML (${res.status}): ${detalhe}` : `Erro API ML (Status ${res.status})`;
    }

    let results: MLSearchResultItem[] = [];
    if (res.ok) {
      const json = await res.json();
      results = json.results || [];
    }

    // Se a consulta com fulfillment não encontrar itens válidos e não houve rate limit/bloqueio,
    // faz busca geral sem filtro de fulfillment
    const itensComFull = results.filter((it) => it && it.price > 0 && it.permalink);
    if (itensComFull.length === 0 && !erroBloqueioOuRateLimit && !erroDetalhadoApi) {
      apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${queryEncoded}&limit=5`;

      res = await fetch(apiUrl, {
        headers,
        next: { revalidate: 60 },
      });

      if (res.status === 429 || res.status === 403) {
        console.error("Bloqueio/Rate Limit ML:", res.statusText || `${res.status}`);
        erroBloqueioOuRateLimit = "Limite temporário de consultas da API atingido. Aguarde 30 segundos ou use a aba 'Por Link Direto'";
      } else if (!res.ok) {
        let detalhe = "";
        try {
          const errJson = await res.json();
          detalhe = errJson.message || errJson.error || JSON.stringify(errJson);
        } catch {
          try {
            detalhe = await res.text();
          } catch {}
        }
        console.error("Erro na API do Mercado Livre:", res.status, detalhe);
        erroDetalhadoApi = detalhe ? `Erro API ML (${res.status}): ${detalhe}` : `Erro API ML (Status ${res.status})`;
      } else {
        const json = await res.json();
        results = json.results || [];
      }
    }

    // Seleciona o item com preço válido e permalink
    const itensValidos = results.filter((it) => it && it.price > 0 && it.permalink);
    const itemEscolhido = itensValidos[0];

    if (itemEscolhido) {
      let descItem: string | null = null;
      try {
        descItem = await obterDescricaoItemML(itemEscolhido.id);
      } catch {}
      return processarItemML(itemEscolhido, queryLimpa, descItem);
    }
  } catch (err) {
    console.warn("Aviso na chamada direta da API do Mercado Livre:", err);
  }

  // 2. Fallback de Segurança Inteligente: Tenta com Envio Full e faz fallback automático para busca geral
  try {
    const fallbackSlug = gerarSlug(queryLimpa);

    // Tenta primeiro filtrar por Envio Full
    let searchUrl = `https://lista.mercadolivre.com.br/${fallbackSlug}_Envio_Full`;
    let htmlRes = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      next: { revalidate: 60 },
    });

    if (htmlRes.status === 429 || htmlRes.status === 403) {
      console.error("Bloqueio/Rate Limit ML:", htmlRes.statusText || `${htmlRes.status}`);
      erroBloqueioOuRateLimit = "Limite temporário de consultas da API atingido. Aguarde 30 segundos ou use a aba 'Por Link Direto'";
    }

    let html = htmlRes.ok ? await htmlRes.text() : "";
    let allHrefs = [...html.matchAll(/href=["'](https:\/\/[^"']*(?:mercadolivre\.com\.br\/[^\/]+\/up\/MLBU|produto\.mercadolivre\.com\.br\/MLB-|mercadolivre\.com\.br\/p\/MLB)[^"']*)["']/gi)].map(m => m[1]);

    // Fallback automático para busca geral caso o filtro Full não encontre anúncios
    if (allHrefs.length === 0) {
      searchUrl = `https://lista.mercadolivre.com.br/${fallbackSlug}`;
      htmlRes = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        next: { revalidate: 60 },
      });

      if (htmlRes.status === 429 || htmlRes.status === 403) {
        console.error("Bloqueio/Rate Limit ML:", htmlRes.statusText || `${htmlRes.status}`);
        erroBloqueioOuRateLimit = "Limite temporário de consultas da API atingido. Aguarde 30 segundos ou use a aba 'Por Link Direto'";
      }

      if (htmlRes.ok) {
        html = await htmlRes.text();
        allHrefs = [...html.matchAll(/href=["'](https:\/\/[^"']*(?:mercadolivre\.com\.br\/[^\/]+\/up\/MLBU|produto\.mercadolivre\.com\.br\/MLB-|mercadolivre\.com\.br\/p\/MLB)[^"']*)["']/gi)].map(m => m[1]);
      }
    }

    if (allHrefs.length > 0) {
      const cleanProductUrl = allHrefs[0].split("#")[0].split("?")[0];
      const idMatch = cleanProductUrl.match(/MLB-?(\d+)/i) || cleanProductUrl.match(/MLBU-?(\d+)/i);
      const mlbId = idMatch ? `MLB${idMatch[1]}` : "MLB-PRODUTO";

      let descricaoProd: string | null = null;
      let tabelaAttrs: Record<string, string> = {};

      // Tenta obter os dados oficiais do item via API do Mercado Livre com Token OAuth
      if (idMatch) {
        const itemApi = await consultarDetalhesItemML(`MLB${idMatch[1]}`);
        if (itemApi && itemApi.price > 0) {
          if (!itemApi.permalink) itemApi.permalink = cleanProductUrl;
          const descApi = await obterDescricaoItemML(itemApi.id);
          return processarItemML(itemApi, queryLimpa, descApi);
        }
      }

      let title = queryLimpa;
      let highResImg = "";
      let priceNum = 0;
      let originalPriceNum: number | null = null;
      let brandFound: string | null = null;

      try {
        let prodRes = await fetch(cleanProductUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
          next: { revalidate: 60 },
        });

        // Se bloqueado, usa fallback para preview bot para recuperar dados e descrição
        if (!prodRes.ok || prodRes.status === 403) {
          try {
            const botRes = await fetch(cleanProductUrl, {
              headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9",
              },
              next: { revalidate: 60 },
            });
            if (botRes.ok) prodRes = botRes;
          } catch {}
        }

        if (prodRes.ok) {
          const prodHtml = await prodRes.text();

          // Extração da descrição limpa e da tabela de especificações técnicas do HTML
          descricaoProd = extrairDescricaoHtml(prodHtml);
          tabelaAttrs = extrairTabelaEspecificacoesHtml(prodHtml);

          // 1. Extração de Marca e Preço via JSON-LD
          const jsonLdScripts = prodHtml.matchAll(
            /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
          );
          for (const m of jsonLdScripts) {
            try {
              const parsed = JSON.parse(m[1].trim());
              const items = Array.isArray(parsed) ? parsed : [parsed];
              for (const it of items) {
                if (it.brand) {
                  const bName = typeof it.brand === "string" ? it.brand : it.brand.name;
                  if (bName && typeof bName === "string" && bName.trim()) {
                    brandFound = bName.trim();
                  }
                }
                const offers = it.offers;
                if (offers) {
                  const offerList = Array.isArray(offers) ? offers : [offers];
                  if (offerList[0]?.price) {
                    const p = parseFloat(String(offerList[0].price));
                    if (!isNaN(p) && p > 0) priceNum = p;
                  }
                }
              }
            } catch {}
          }

          // 2. Extração do Preço Promocional Real Atual (.ui-pdp-price__second-line)
          const secondLineIdx = prodHtml.indexOf("ui-pdp-price__second-line");
          if (secondLineIdx !== -1) {
            const chunk = prodHtml.slice(secondLineIdx, secondLineIdx + 800);
            const frac = chunk.match(/class=["'][^"']*andes-money-amount__fraction[^"']*["'][^>]*>([0-9.,]+)<\/span>/i)?.[1];
            const cents = chunk.match(/class=["'][^"']*andes-money-amount__cents[^"']*["'][^>]*>([0-9]{2})<\/span>/i)?.[1];
            if (frac) {
              const fullStr = `${frac.replace(/\./g, "")}.${cents || "00"}`;
              const parsedP = parseFloat(fullStr);
              if (!isNaN(parsedP) && parsedP > 0) priceNum = parsedP;
            }
          }

          // 3. Extração do Preço Original Antigo Riscado (.ui-pdp-price__original-value)
          const origIdx = prodHtml.indexOf("ui-pdp-price__original-value");
          if (origIdx !== -1) {
            const chunk = prodHtml.slice(origIdx, origIdx + 800);
            const frac = chunk.match(/class=["'][^"']*andes-money-amount__fraction[^"']*["'][^>]*>([0-9.,]+)<\/span>/i)?.[1];
            const cents = chunk.match(/class=["'][^"']*andes-money-amount__cents[^"']*["'][^>]*>([0-9]{2})<\/span>/i)?.[1];
            if (frac) {
              const fullStr = `${frac.replace(/\./g, "")}.${cents || "00"}`;
              const parsedOrig = parseFloat(fullStr);
              if (!isNaN(parsedOrig) && parsedOrig > priceNum) {
                originalPriceNum = parsedOrig;
              }
            }
          }

          // 4. Suporte a aria-labels de preços
          if (!priceNum) {
            const agoraMatch = prodHtml.match(/aria-label=["']Agora:\s*([^"']+)["']/i);
            if (agoraMatch) {
              const m = agoraMatch[1].match(/(\d+)\s*reais(?:\s*com\s*(\d+)\s*centavos)?/i);
              if (m) priceNum = parseFloat(`${m[1]}.${m[2] ? m[2].padStart(2, "0") : "00"}`);
            }
          }

          if (!originalPriceNum) {
            const antesMatch = prodHtml.match(/aria-label=["']Antes:\s*([^"']+)["']/i);
            if (antesMatch) {
              const m = antesMatch[1].match(/(\d+)\s*reais(?:\s*com\s*(\d+)\s*centavos)?/i);
              if (m) {
                const parsedO = parseFloat(`${m[1]}.${m[2] ? m[2].padStart(2, "0") : "00"}`);
                if (parsedO > priceNum) originalPriceNum = parsedO;
              }
            }
          }

          // 5. Extração de Título e Imagem OG
          const ogTitle = prodHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
          const ogImage = prodHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];

          if (ogTitle) {
            title = ogTitle
              .replace(/\s*-\s*R\$\s*[\d.,]+\s*$/i, "")
              .replace(/\s*\|\s*Mercado\s*Livre.*$/i, "")
              .replace(/\s*-\s*Mercado\s*Livre.*$/i, "")
              .trim();
          }
          if (ogImage) {
            highResImg = obterImagemAltaResolucao(ogImage);
          }

          // 6. Extração de Marca da tabela de especificações
          if (!brandFound) {
            const brandTableMatch = prodHtml.match(/<th>\s*Marca\s*<\/th>\s*<td>\s*<span>\s*([^<]+)\s*<\/span>/i)?.[1]
              || prodHtml.match(/data-testid=["']spec-value-BRAND["'][^>]*>([^<]+)/i)?.[1];
            if (brandTableMatch) brandFound = brandTableMatch.trim();
          }
        }
      } catch {
        // Ignora erros no scraping pontual
      }

      const fallbackItem: MLSearchResultItem = {
        id: mlbId,
        title: title,
        price: priceNum,
        original_price: originalPriceNum,
        thumbnail: highResImg,
        permalink: cleanProductUrl,
        attributes: brandFound ? [{ id: "BRAND", name: "Marca", value_name: brandFound }] : undefined,
      };

      return processarItemML(fallbackItem, queryLimpa, descricaoProd, tabelaAttrs);
    }
  } catch (fallbackErr) {
    console.error("Erro no fallback de busca do Mercado Livre:", fallbackErr);
  }

  // Se não encontrou no fallback e houve rate limit ou bloqueio da API, propaga a mensagem clara
  if (erroBloqueioOuRateLimit) {
    throw new Error(erroBloqueioOuRateLimit);
  }

  if (erroDetalhadoApi) {
    throw new Error(erroDetalhadoApi);
  }

  return null;
}

/**
 * Processa e estrutura o item da API do Mercado Livre com extração técnica de especificações e aplicação
 */
export function processarItemML(
  item: MLSearchResultItem,
  queryOriginal: string,
  descricaoTexto?: string | null,
  tabelaHtmlAttrs?: Record<string, string>
): ProdutoMLExtraido {
  const permalink = item.permalink || "";
  const linkAfiliado = formatarLinkAfiliado(permalink);

  // Extração e aprimoramento de imagem para Alta Resolução
  const thumbnail = obterImagemAltaResolucao(item.thumbnail);
  const pictures: string[] = [];
  if (thumbnail) pictures.push(thumbnail);

  if (Array.isArray(item.pictures)) {
    for (const pic of item.pictures) {
      const picUrl = obterImagemAltaResolucao(pic.secure_url || pic.url);
      if (picUrl && !pictures.includes(picUrl)) {
        pictures.push(picUrl);
      }
    }
  }

  // Extração e mesclagem de atributos (da API e da tabela HTML do anúncio)
  const attrs: Record<string, string | undefined> = {};
  if (tabelaHtmlAttrs) {
    for (const [k, v] of Object.entries(tabelaHtmlAttrs)) {
      if (v) attrs[k.toUpperCase()] = v.trim();
    }
  }
  if (Array.isArray(item.attributes)) {
    for (const attr of item.attributes) {
      if (!attr.value_name) continue;
      const key = attr.id ? attr.id.toUpperCase() : attr.name.toUpperCase();
      attrs[key] = attr.value_name;
    }
  }

  // Extração inteligente de aplicação e dados técnicos estruturados
  const { aplicacao, compatibility, dados_tecnicos } = extrairDadosDescricaoML(
    descricaoTexto,
    attrs,
    item.title
  );

  // Extração da Marca com prioridade para dados técnicos e BRAND dos atributos
  const attrMarca = item.attributes?.find(
    (a: any) => a.id === "BRAND" || a.name?.toLowerCase() === "marca"
  )?.value_name;

  let marca = dados_tecnicos.marca || attrMarca || attrs["BRAND"] || attrs["MARCA"] || null;
  if (!marca || marca === "Auto Peças") {
    marca = deduzirMarca(queryOriginal) || deduzirMarca(item.title) || "Auto Peças";
  }

  const numeroPeca =
    dados_tecnicos.codigo_fabricante ||
    attrs["PART_NUMBER"] ||
    attrs["NUMERO_DE_PECA"] ||
    attrs["CODIGO_DE_FABRICANTE"] ||
    deduzirCodigo(item.title, marca);

  const oem = dados_tecnicos.codigo_oem || attrs["OEM"] || attrs["CODIGO_OEM"] || null;
  const modelo = attrs["MODEL"] || attrs["MODELO"] || undefined;

  // 1. Preço atual de venda
  const precoNumerico = Number(item.price) || 0;
  const precoFormatado = precoNumerico > 0 ? formatarPrecoBRL(precoNumerico) : "";

  // 2. Preço antigo/original
  const precoOriginalNumerico =
    item.original_price && Number(item.original_price) > precoNumerico
      ? Number(item.original_price)
      : null;

  const precoOriginalFormatado = precoOriginalNumerico
    ? formatarPrecoBRL(precoOriginalNumerico)
    : null;

  // 3. Desconto percentual
  let descontoPercentual: string | null = null;
  if (precoOriginalNumerico && precoOriginalNumerico > precoNumerico) {
    const desconto = Math.round(((precoOriginalNumerico - precoNumerico) / precoOriginalNumerico) * 100);
    if (desconto > 0) {
      descontoPercentual = `${desconto}% OFF`;
    }
  }

  const categoria = deduzirCategoria(item.title);

  // Veículos compatíveis: prioriza a aplicação extraída da descrição
  let veiculos = deduzirVeiculos(item.title);
  if (aplicacao.length > 0) {
    if (aplicacao.length === 1) {
      veiculos = aplicacao[0].startsWith("Compatível") ? aplicacao[0] : `Compatível com ${aplicacao[0]}`;
    } else {
      veiculos = `Compatível com ${aplicacao.slice(0, 4).join(" / ")}`;
    }
  }

  const slug = gerarSlug(item.title) || `peca-${item.id.toLowerCase()}`;

  // Geração automática de palavras-chave de alto desempenho para SEO
  const palavrasChave = gerarPalavrasChave({
    titulo: item.title,
    descricao: descricaoTexto,
    marca,
    modelo,
    codigo_fabricante: numeroPeca,
    codigo_oem: oem,
    aplicacao,
    categoria,
    atributos: attrs,
  });

  return {
    id: item.id,
    title: item.title,
    price: precoNumerico,
    original_price: precoOriginalNumerico,
    thumbnail: thumbnail,
    pictures: pictures,
    permalink: permalink,
    linkAfiliado: linkAfiliado,
    descricao: descricaoTexto || undefined,
    aplicacao: aplicacao,
    palavras_chave: palavrasChave,
    attributes: {
      marca,
      modelo,
      numero_peca: numeroPeca,
      mpn: dados_tecnicos.mpn || numeroPeca,
      oem: oem || undefined,
      lado: dados_tecnicos.lado,
      posicao: dados_tecnicos.posicao,
      ...attrs,
    },
    produtoProntoParaSalvar: {
      titulo: item.title,
      slug: slug,
      codigo_fabricante: numeroPeca,
      marca: marca,
      categoria: categoria,
      veiculos_compativeis: veiculos,
      codigo_oem: oem,
      busca_ml: queryOriginal,
      preco: precoFormatado,
      preco_estimado: precoFormatado,
      preco_antigo: precoOriginalFormatado,
      desconto_percentual: descontoPercentual,
      imagem_url: thumbnail,
      link_afiliado: linkAfiliado,
      descricao: descricaoTexto || undefined,
      aplicacao: aplicacao,
      palavras_chave: palavrasChave,
      especificacoes: {
        ml_id: item.id,
        link_ml: permalink,
        link_afiliado: linkAfiliado,
        link_destino: linkAfiliado,
        marca: marca,
        modelo: modelo,
        mpn: dados_tecnicos.mpn || numeroPeca,
        numero_peca: numeroPeca,
        codigo_oem: oem || undefined,
        posicao: dados_tecnicos.posicao,
        lado: dados_tecnicos.lado,
        medidas: dados_tecnicos.medidas || dados_tecnicos.diametro,
        composicao: dados_tecnicos.composicao || dados_tecnicos.material,
        preco: precoFormatado,
        preco_antigo: precoOriginalFormatado,
        desconto_percentual: descontoPercentual,
        aplicacao: aplicacao,
        compatibility: compatibility,
        palavras_chave: palavrasChave,
        dados_tecnicos: {
          ...dados_tecnicos,
          codigo_fabricante: numeroPeca,
          marca: marca,
          modelo: modelo,
          codigo_oem: oem || undefined,
        },
        descricao_completa: descricaoTexto || undefined,
        atributos_ml: attrs,
        ultima_sincronizacao: new Date().toISOString(),
      },
    },
  };
}
