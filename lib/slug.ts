/**
 * Utilitários para geração, limpeza e padronização de slugs amigáveis e semânticos para SEO.
 *
 * Formato oficial: [nome-da-peca]-[marca]-[modelo-carro]-[codigo-opcional]-[hash-unico-apenas-se-colisao]
 * Exemplo padrão: "kit-disco-pastilha-freio-hb20-hb20s-1-0"
 * Exemplo em caso de colisão: "kit-disco-pastilha-freio-hb20-hb20s-1-0-1321"
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// Marcas automotivas conhecidas no mercado brasileiro
export const MARCAS_AUTOMOTIVAS = [
  "nakata",
  "bosch",
  "luk",
  "sachs",
  "valeo",
  "cofap",
  "moura",
  "fras-le",
  "frasle",
  "fremax",
  "cobreq",
  "dayco",
  "gates",
  "mahle",
  "tecfil",
  "wega",
  "syl",
  "monroe",
  "ngk",
  "continental",
  "contitech",
  "mann-filter",
  "mann",
  "trw",
  "magneti marelli",
  "marelli",
  "hipper freios",
  "willtec",
  "fram",
  "delphi",
  "varga",
  "urba",
  "schadek",
  "sabo",
  "vdo",
  "kyb",
  "kayaba",
  "heliar",
  "cral",
  "skf",
  "ina",
  "fag",
];

// Marcas genéricas ou termos que NUNCA devem compor o slug como marca oficial
export const MARCAS_GENERICAS = new Set([
  "auto pecas",
  "auto peças",
  "auto-pecas",
  "autopecas",
  "generico",
  "genérico",
  "generica",
  "genérica",
  "universal",
  "multimarcas",
  "multi marcas",
  "mercado livre",
  "ml",
  "importado",
  "nacional",
  "original",
  "pecas",
  "peca",
]);

// Modelos conhecidos para priorização no slug semântico
export const MODELOS_AUTOMOTIVOS = [
  "hb20s",
  "hb20x",
  "hb20",
  "novo onix plus",
  "novo onix",
  "onix plus",
  "onix",
  "prisma",
  "celta",
  "corsa",
  "cobalt",
  "spin",
  "cruze",
  "tracker",
  "s10",
  "montana",
  "astra",
  "vectra",
  "zafira",
  "meriva",
  "kadett",
  "monza",
  "opala",
  "gol",
  "fox",
  "voyage",
  "saveiro",
  "polo",
  "golf",
  "up",
  "virtus",
  "t-cross",
  "nivus",
  "taos",
  "tiguan",
  "amarok",
  "santana",
  "parati",
  "kombi",
  "palio weekend",
  "palio",
  "uno mille",
  "uno vivace",
  "uno way",
  "uno",
  "siena",
  "strada adventure",
  "strada adventur",
  "strada",
  "toro",
  "mobi",
  "argo",
  "cronos",
  "pulse",
  "fastback",
  "fiorino",
  "doblo",
  "idea",
  "punto",
  "bravo",
  "linea",
  "creta",
  "tucson",
  "ix35",
  "santa fe",
  "i30",
  "ka",
  "fiesta",
  "ecosport",
  "ranger",
  "focus",
  "fusion",
  "courier",
  "civic",
  "fit",
  "city",
  "hr-v",
  "cr-v",
  "wr-v",
  "accord",
  "corolla cross",
  "corolla",
  "etios",
  "yaris",
  "hilux",
  "sw4",
  "sandero",
  "logan",
  "duster",
  "kwid",
  "oroch",
  "captur",
  "clio",
  "kicks",
  "march",
  "versa",
  "sentra",
  "frontier",
  "tiida",
  "compass",
  "renegade",
  "commander",
  "ducato",
  "boxer",
  "jumper",
  "206",
  "207",
  "208",
  "2008",
  "307",
  "308",
  "3008",
  "c3",
  "c4 cactus",
  "c4",
  "aircross",
  "qq",
];

// Nomes compostos de peças comuns ordenados por especificidade (maiores primeiro)
export const NOMES_PECAS = [
  "kit disco pastilha freio",
  "kit disco e pastilha freio",
  "kit disco e pastilha",
  "disco e pastilha de freio",
  "disco e pastilha freio",
  "disco pastilha freio",
  "disco pastilha",
  "disco de freio",
  "disco freio",
  "pastilha de freio dianteira",
  "pastilha de freio traseira",
  "pastilha de freio",
  "pastilha freio dianteira",
  "pastilha freio traseira",
  "pastilha freio",
  "sapata de freio",
  "sapata freio",
  "tambor de freio",
  "cilindro de roda",
  "cilindro mestre",
  "kit embreagem e atuador",
  "kit embreagem atuador",
  "kit embreagem garfo",
  "kit embreagem plato disco",
  "kit embreagem",
  "disco plato embreagem",
  "plato embreagem",
  "atuador embreagem",
  "embreagem",
  "par amortecedores dianteiros",
  "par amortecedores traseiros",
  "par amortecedor dianteiro",
  "par amortecedor traseiro",
  "par amortecedores",
  "kit amortecedor dianteiro",
  "kit amortecedor traseiro",
  "kit amortecedor batente coxim",
  "kit amortecedor batente",
  "kit amortecedor coxim",
  "kit amortecedor",
  "amortecedor dianteiro",
  "amortecedor traseiro",
  "amortecedor pro link",
  "amortecedor",
  "kit correia dentada e tensor",
  "kit correia dentada tensor",
  "kit correia dentada",
  "correia dentada",
  "correia alternador",
  "tensor correia",
  "bomba de combustivel",
  "bomba combustivel",
  "bomba de agua",
  "bomba dagua",
  "bomba d agua",
  "bomba agua",
  "cavalete valvula termostatica",
  "valvula termostatica",
  "radiador agua",
  "radiador",
  "caixa direcao hidraulica",
  "caixa direcao",
  "caixa de direcao",
  "tulipa trizeta",
  "tulipa e trizeta",
  "trizeta",
  "tulipa",
  "bateria de carro",
  "bateria automotiva",
  "bateria 60ah",
  "bateria",
  "jogo de velas",
  "velas de ignicao",
  "vela de ignicao",
  "velas ignicao",
  "vela ignicao",
  "cabos de vela",
  "bobina de ignicao",
  "bobina ignicao",
  "kit saca pivo",
  "pivo suspensao",
  "pivo",
  "terminal de direcao",
  "bieleta",
  "coxim motor",
  "coxim amortecedor",
  "batente amortecedor",
  "filtro de oleo",
  "filtro oleo",
  "filtro de ar",
  "filtro ar",
  "filtro de combustivel",
  "filtro combustivel",
  "filtro de cabine",
  "filtro cabine",
  "kit ar condicionado",
  "pistola tornador",
  "medidor de compressao",
  "medidor espessura",
  "kit ferramentas sincronismo",
];

/**
 * Verifica se uma marca informada é válida ou se é um termo genérico
 */
export function isMarcaValida(marca?: string | null): boolean {
  if (!marca || typeof marca !== "string") return false;
  const clean = marca
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (clean.length < 2) return false;
  if (MARCAS_GENERICAS.has(clean)) return false;
  if (clean.startsWith("auto-pecas") || clean.startsWith("auto pecas")) return false;
  return true;
}

/**
 * Verifica se um código de peça é real ou se é um código fictício/placeholder
 */
export function isCodigoValido(codigo?: string | null): boolean {
  if (!codigo || typeof codigo !== "string") return false;
  const clean = codigo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (clean.length < 2) return false;
  if (clean === "cod-ml" || clean === "cod_ml" || clean === "codml" || clean === "cod") return false;
  if (clean.endsWith("-pec") || clean.endsWith("-cod")) return false;
  if (clean.startsWith("auto-pecas") || clean.startsWith("autopecas")) return false;
  if (/^mlb-?\d+/i.test(clean)) return false;
  if (/^(sem|nao|null|undefined|none)$/i.test(clean)) return false;

  return true;
}

/**
 * Função básica para transformar qualquer texto em formato kebab-case limpo.
 * Preserva números decimais automotivos como hífens (ex: 1.0 -> 1-0, 1.4 -> 1-4).
 */
export function gerarSlug(text: string): string {
  if (!text || typeof text !== "string") return "";

  return (
    text
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentuações
      // Converte decimais automotivos (ex: 1.0 -> 1-0, 1.4 -> 1-4, 1.6 -> 1-6, 2.0 -> 2-0)
      .replace(/(\d+)\.(\d+)/g, "$1-$2")
      // Substitui símbolos comuns e separadores por espaços
      .replace(/[/\\+&|_,;:?!=()#*]/g, " ")
      .toLowerCase()
      .trim()
      // Remove caracteres não alfanuméricos exceto espaços e hífens
      .replace(/[^a-z0-9\s-]/g, "")
      // Transforma espaços múltiplos em hífen único
      .replace(/[\s-]+/g, "-")
      // Remove hífens sobrando nas bordas
      .replace(/^-+|-+$/g, "")
  );
}

export interface GerarSlugProdutoParams {
  titulo: string;
  marca?: string | null;
  modelo?: string | null;
  veiculo?: string | null;
  codigo?: string | null;
  hash?: string | null;
}

/**
 * Remove termos automáticos e redundâncias de um slug já formatado:
 * - "auto-pecas-cod-ml-", "cod-ml-", "auto-pecas-"
 * - Repetições da marca (ex: "nakata-nakata-cod-..." -> "amortecedor-nakata-...")
 * - Converte motores colados sem ponto (ex: hb20s-10 -> hb20s-1-0)
 */
export function limparSlug(slugExistente: string): string {
  if (!slugExistente || typeof slugExistente !== "string") return "";

  let s = slugExistente.toLowerCase().trim();

  // 1. Remove prefixos genéricos do início
  s = s.replace(/^auto-pecas-cod-ml-+/g, "");
  s = s.replace(/^auto-pecas-+/g, "");
  s = s.replace(/^cod-ml-+/g, "");
  s = s.replace(/^cod-+/g, "");
  s = s.replace(/^pec-+/g, "");

  // 2. Remove repetições de marca com códigos dummy do início
  // Ex: "nakata-nakata-cod-...", "bosch-bosch-pec-...", "luk-luk-cod-..."
  s = s.replace(/^([a-z0-9]+)-\1-(?:cod|pec|ml)-+/g, "");
  // Ex: "nakata-nakata-..."
  s = s.replace(/^([a-z0-9]+)-\1-+/g, "$1-");
  // Ex: "tu-21-tu-21-..."
  s = s.replace(/^([a-z0-9]+-[0-9]+)-\1-+/g, "$1-");

  // 3. Remove prefixos de ano ou código que tenham ficado no início antes do nome da peça
  // Ex: "2009-caixa-direcao-..." -> "caixa-direcao-..."
  s = s.replace(/^(19\d\d|20\d\d)-(caixa|amortecedor|pastilha|kit|disco|radiador|cavalete|bateria|tulipa)/g, "$2");

  // 4. Remove códigos longos duplicados no início (ex: "luk-619301500-619-3015-00-embreagem-original-luk-kit-embreagem..." -> "kit-embreagem...")
  if (s.includes("-kit-") || s.includes("-amortecedor-") || s.includes("-pastilha-") || s.includes("-disco-")) {
    s = s.replace(/^[a-z0-9-]+-(kit-[a-z0-9-]+)/, "$1");
  }

  // 5. Remove prefixos numéricos de quantidade antes de peças
  // Ex: "4-amortecedor-original-nakata..." -> "amortecedor-nakata..."
  s = s.replace(/^(\d+x?)-(amortecedor|pastilha|disco|kit|par|jogo|vela|filtro|correia|bomba|radiador|tulipa)/g, "$2");

  // 6. Remove 'original' logo após a peça para deixar o slug mais semântico
  // Ex: "amortecedor-original-nakata..." -> "amortecedor-nakata..."
  s = s.replace(/^(amortecedor|pastilha|disco|kit-embreagem|radiador|cavalete)-original-/g, "$1-");

  // 7. Remove repetições da marca ao longo do slug (ex: "nakata-...-nakata" -> apenas um "nakata")
  for (const m of MARCAS_AUTOMOTIVAS) {
    const slugMarca = m.replace(/\s+/g, "-");
    const regexDuplicado = new RegExp(`(^|-)${slugMarca}-([a-z0-9-]+-)?${slugMarca}(-|$)`, "g");
    if (regexDuplicado.test(s)) {
      s = s.replace(regexDuplicado, `$1$2${slugMarca}$3`);
    }
  }

  // 8. Corrige cilindrada sem hífen após modelos de carro (ex: hb20s-10 -> hb20s-1-0)
  s = s.replace(/-(10|14|16|18|20)-/g, (match, engine) => {
    return `-${engine[0]}-${engine[1]}-`;
  });

  // 9. Remove hífens duplicados ou nas extremidades
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");

  return s;
}

/**
 * Gera o slug base sem hash:
 * [nome-da-peca]-[marca]-[modelo-carro]-[codigo-opcional]
 */
export function gerarBaseSlugProduto(params: Omit<GerarSlugProdutoParams, "hash"> | string): string {
  if (typeof params === "string") {
    return limparSlug(params);
  }

  const { titulo, marca, modelo, veiculo, codigo } = params;

  if (!titulo || !titulo.trim()) {
    return `peca-${Date.now().toString().slice(-4)}`;
  }

  // 1. Normaliza texto do título preparando pontuação e motor
  const tituloNormalizado = titulo
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d+)\.(\d+)/g, "$1-$2") // 1.0 -> 1-0
    .toLowerCase();

  // 2. Extrai ou valida [marca]
  let marcaSlug = "";
  if (isMarcaValida(marca)) {
    marcaSlug = gerarSlug(marca!);
  } else {
    // Tenta identificar marca automotiva conhecida no próprio título
    for (const m of MARCAS_AUTOMOTIVAS) {
      const reg = new RegExp(`\\b${m}\\b`, "i");
      if (reg.test(tituloNormalizado)) {
        marcaSlug = m.replace(/\s+/g, "-");
        break;
      }
    }
  }

  // 3. Extrai [nome-da-peca]
  let pecaSlug = "";
  for (const np of NOMES_PECAS) {
    const npNorm = np.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (tituloNormalizado.includes(npNorm)) {
      pecaSlug = gerarSlug(np);
      break;
    }
  }

  // Se não encontrou na lista pré-definida de peças, extrai o início do título limpando ruídos
  if (!pecaSlug) {
    const tLimpo = tituloNormalizado
      .replace(/^auto\s*pe[cç]as\s*/i, "")
      .replace(/^cod-ml\s*/i, "")
      .replace(/^\d+x?\s+/i, ""); // remove "4 ", "2 "

    const palavras = tLimpo.split(/[\s-]+/).filter(Boolean);
    const primeiras = palavras.slice(0, 4).join("-");
    pecaSlug = gerarSlug(primeiras);
  }

  // 4. Extrai [modelo-carro]
  const modelosEncontrados: string[] = [];

  // Se veio especificado modelo nos parâmetros
  if (modelo && typeof modelo === "string" && modelo.trim()) {
    const modSlug = gerarSlug(modelo);
    if (modSlug && !pecaSlug.includes(modSlug)) {
      modelosEncontrados.push(modSlug);
    }
  }

  // Identifica modelos no título preservando a ordem em que aparecem no texto
  const matchesModelos: Array<{ nome: string; index: number; length: number }> = [];
  for (const m of MODELOS_AUTOMOTIVOS) {
    const reg = new RegExp(`\\b${m}\\b`, "gi");
    let match;
    while ((match = reg.exec(tituloNormalizado)) !== null) {
      matchesModelos.push({
        nome: m.replace(/\s+/g, "-"),
        index: match.index,
        length: match[0].length,
      });
    }
  }

  // Ordena por posição no texto (e desempata pelos nomes mais longos primeiro)
  matchesModelos.sort((a, b) => a.index - b.index || b.length - a.length);

  // Evita duplicar modelos sobrepostos (ex: "onix plus" já cobre "onix")
  const spansOcupados: Array<{ start: number; end: number }> = [];
  for (const m of matchesModelos) {
    const start = m.index;
    const end = m.index + m.length;
    const sobrepoe = spansOcupados.some(
      (s) => (start >= s.start && start < s.end) || (end > s.start && end <= s.end)
    );
    if (!sobrepoe) {
      spansOcupados.push({ start, end });
      if (!modelosEncontrados.includes(m.nome) && !pecaSlug.includes(m.nome)) {
        modelosEncontrados.push(m.nome);
      }
    }
  }

  // Se ainda não encontrou modelos e veio parâmetro veículo
  if (modelosEncontrados.length === 0 && veiculo && typeof veiculo === "string" && veiculo.trim()) {
    const vSlug = gerarSlug(veiculo);
    for (const m of MODELOS_AUTOMOTIVOS) {
      const reg = new RegExp(`\\b${m}\\b`, "i");
      if (reg.test(vSlug) && !modelosEncontrados.includes(m.replace(/\s+/g, "-"))) {
        modelosEncontrados.push(m.replace(/\s+/g, "-"));
      }
    }
  }

  // Detecta motorizações no título (ex: 1-0, 1-4, 1-6, 16v, fire)
  const motorMatch = tituloNormalizado.match(/\b(1-0|1-4|1-6|1-8|2-0|16v|8v|fire|firefly|kappa|g3|g4|g5|g6)\b/g);
  if (motorMatch) {
    for (const mot of motorMatch) {
      if (!modelosEncontrados.includes(mot) && !pecaSlug.includes(mot)) {
        modelosEncontrados.push(mot);
      }
    }
  }

  const modeloCarroSlug = modelosEncontrados.slice(0, 4).join("-");

  // 5. Extrai [codigo-opcional] (apenas se for código de fábrica autêntico)
  let codigoSlug = "";
  if (isCodigoValido(codigo)) {
    const cSlug = gerarSlug(codigo!);
    if (cSlug && !pecaSlug.includes(cSlug) && !modeloCarroSlug.includes(cSlug) && cSlug !== marcaSlug) {
      codigoSlug = cSlug;
    }
  }

  // 6. Monta o slug ordenado: [nome-da-peca]-[marca]-[modelo-carro]-[codigo-opcional]
  const partes: string[] = [];

  if (pecaSlug) {
    partes.push(pecaSlug);
  }

  // Adiciona a marca apenas se não estiver já presente dentro do nome da peça
  if (marcaSlug && !pecaSlug.includes(marcaSlug)) {
    partes.push(marcaSlug);
  }

  if (modeloCarroSlug) {
    const tokensModelo = modeloCarroSlug.split("-").filter((tok) => {
      return !pecaSlug.split("-").includes(tok) && tok !== marcaSlug;
    });
    if (tokensModelo.length > 0) {
      partes.push(tokensModelo.join("-"));
    }
  }

  if (codigoSlug) {
    partes.push(codigoSlug);
  }

  const slugFinal = partes.join("-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return limparSlug(slugFinal);
}

/**
 * Gera um slug padronizado, limpo e semântico para SEO no formato:
 * [nome-da-peca]-[marca]-[modelo-carro]-[codigo-opcional]-[hash-se-informado]
 */
export function gerarSlugProduto(params: GerarSlugProdutoParams | string): string {
  if (typeof params === "string") {
    return limparSlug(params);
  }

  const baseSlug = gerarBaseSlugProduto(params);
  const { hash } = params;

  if (hash && typeof hash === "string" && hash.trim()) {
    const hashSlug = gerarSlug(hash).replace(/[^a-z0-9]/g, "").slice(-4);
    if (hashSlug && hashSlug.length >= 2) {
      return limparSlug(`${baseSlug}-${hashSlug}`);
    }
  }

  return baseSlug;
}

/**
 * Garante que a geração do slug verifique se o slug pretendido já existe no banco.
 * Se já existir e for de outro produto, acrescenta o hash identificador único apenas nesse caso.
 */
export async function gerarSlugUnicoNoBanco(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  params: GerarSlugProdutoParams,
  produtoIdAtual?: string | null,
  mlIdAtual?: string | null
): Promise<string> {
  const baseSlug = gerarBaseSlugProduto(params);

  // Consulta se o slug base já existe no banco
  let query = supabase.from("produtos_afiliados").select("id, ml_id, slug").eq("slug", baseSlug);

  if (produtoIdAtual) {
    query = query.neq("id", produtoIdAtual);
  }

  const { data: existente } = await query.limit(1).maybeSingle();

  // Se não existe ou é do mesmo produto (por ml_id), usa o slug limpo sem hash
  if (!existente || (mlIdAtual && existente.ml_id === mlIdAtual)) {
    return baseSlug;
  }

  // Colisão com outro produto: acrescenta identificador único
  const hashIdentificador =
    (mlIdAtual ? mlIdAtual.replace(/\D/g, "").slice(-4) : null) ||
    (params.hash ? params.hash.replace(/\D/g, "").slice(-4) : null) ||
    Date.now().toString().slice(-4);

  const slugComHash = `${baseSlug}-${hashIdentificador}`;

  // Verifica se o slug com hash também colide
  const { data: colidindoComHash } = await supabase
    .from("produtos_afiliados")
    .select("id")
    .eq("slug", slugComHash)
    .limit(1)
    .maybeSingle();

  if (!colidindoComHash || colidindoComHash.id === produtoIdAtual) {
    return slugComHash;
  }

  // Fallback extremo de colisão dupla
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${baseSlug}-${hashIdentificador}-${randomSuffix}`;
}

export { gerarSlug as generateSlug };
