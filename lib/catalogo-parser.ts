import * as XLSX from "xlsx";
import { createRequire } from "node:module";
import type { ItemExtraidoCatalogo } from "./catalogo-types";
import { generateSlug } from "./catalogo-types";
export type { ItemExtraidoCatalogo };
export { generateSlug };

// 2. Extrai texto de PDF usando pdf-parse (compatível com v2 e v1)
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pdfModule: any;
    try {
      const requireDynamic = createRequire(process.cwd() + "/package.json");
      pdfModule = requireDynamic("pdf-parse");
    } catch {
      pdfModule = await import("pdf-parse");
    }

    if (pdfModule.PDFParse) {
      const parser = new pdfModule.PDFParse({ data: pdfBuffer });
      if (typeof parser.load === "function") {
        await parser.load();
      }
      const result = await parser.getText();
      if (typeof parser.destroy === "function") {
        await parser.destroy();
      }
      return typeof result === "string" ? result : result?.text || "";
    }

    if (typeof pdfModule.default === "function") {
      const res = await pdfModule.default(pdfBuffer);
      return res.text || "";
    }

    if (typeof pdfModule === "function") {
      const res = await pdfModule(pdfBuffer);
      return res.text || "";
    }

    return "";
  } catch (error) {
    console.error("Erro ao extrair texto do PDF:", error);
    throw new Error(
      `Falha na leitura do PDF: ${error instanceof Error ? error.message : "formato inválido"}`
    );
  }
}

// 3. Detecção automática de marca pelo texto ou nome do ficheiro
export function detectBrand(text: string, filename: string = ""): string {
  const haystack = `${filename} ${text.substring(0, 3000)}`.toLowerCase();

  if (haystack.includes("fras-le") || haystack.includes("frasle")) return "Fras-le";
  if (haystack.includes("cobreq")) return "Cobreq";
  if (haystack.includes("nakata")) return "Nakata";
  if (haystack.includes("ngk")) return "NGK";
  if (haystack.includes("bosch")) return "Bosch";
  if (haystack.includes("cofap")) return "Cofap";
  if (haystack.includes("fremax")) return "Fremax";
  if (haystack.includes("monroe")) return "Monroe";
  if (haystack.includes("trw")) return "TRW";
  if (haystack.includes("magneti") || haystack.includes("marelli")) return "Magneti Marelli";
  if (haystack.includes("valeo")) return "Valeo";
  if (haystack.includes("dayco")) return "Dayco";
  if (haystack.includes("gates")) return "Gates";
  if (haystack.includes("tecfil")) return "Tecfil";
  if (haystack.includes("wega")) return "Wega";
  if (haystack.includes("mann")) return "Mann-Filter";

  return "Fras-le";
}

// 4. Detecção e refinamento do tipo de peça
export function inferTipoPeca(
  categoria: string,
  contexto: string = "",
  codigo: string = ""
): string {
  const ctx = `${contexto} ${codigo}`.toLowerCase();

  if (ctx.includes("sapata") || ctx.includes("lona") || codigo.startsWith("CB/")) {
    return "Jogo de Sapatas de Freio";
  }
  if (ctx.includes("ceramix") || ctx.includes("ceramica") || ctx.includes("cmaxx")) {
    return "Jogo de Pastilhas de Freio Cerâmica";
  }
  if (ctx.includes("disco") || codigo.startsWith("BD") || codigo.startsWith("DF")) {
    return "Disco de Freio";
  }
  if (ctx.includes("pastilha") || codigo.startsWith("PD/") || codigo.startsWith("N-")) {
    return "Pastilha de Freio";
  }
  if (ctx.includes("amortecedor") || codigo.startsWith("HG") || codigo.startsWith("GP")) {
    return "Amortecedor";
  }
  if (ctx.includes("vela") || codigo.startsWith("BKR") || codigo.startsWith("LZKR")) {
    return "Vela de Ignição";
  }
  if (ctx.includes("cabo") && ctx.includes("ignicao")) {
    return "Jogo de Cabos de Ignição";
  }
  if (ctx.includes("bandeja") || ctx.includes("braco")) {
    return "Bandeja de Suspensão";
  }
  if (ctx.includes("filtro") && ctx.includes("oleo")) {
    return "Filtro de Óleo";
  }
  if (ctx.includes("filtro") && ctx.includes("ar")) {
    return "Filtro de Ar";
  }

  // Fallback baseado na categoria selecionada
  switch (categoria.toLowerCase()) {
    case "freio":
    case "travões / freio":
    case "travoes":
      return "Pastilha de Freio";
    case "suspensão":
    case "suspensao":
      return "Amortecedor";
    case "ignição":
    case "ignicao":
      return "Vela de Ignição";
    case "motor":
      return "Correia Dentada";
    case "filtros":
      return "Filtro de Linha";
    case "direção":
    case "direcao":
      return "Terminal de Direção";
    default:
      return "Peça Automotiva";
  }
}

// 5. Monta o objeto completo padronizado conforme especificação
export function buildItemObject(params: {
  index: number;
  tipoPeca: string;
  marca: string;
  codigo: string;
  veiculo: string;
  categoria: string;
  codigoOem?: string | null;
  motor?: string;
  ano?: string;
  sistema?: string;
  imagemUrl?: string | null;
  linkDestino?: string | null;
  precoEstimado?: number | null;
}): ItemExtraidoCatalogo {
  const {
    index,
    tipoPeca,
    marca,
    codigo,
    veiculo,
    categoria,
    codigoOem,
    motor,
    ano,
    sistema,
    imagemUrl,
    linkDestino,
    precoEstimado,
  } = params;

  const codigoLimpo = codigo.trim();
  const veiculoLimpo = veiculo.trim() || "Aplicação Universal / Multiveículos";

  // Requisito 2: titulo: `${tipo_peca} ${marca} ${codigo} - ${veiculo}`
  const titulo = `${tipoPeca} ${marca} ${codigoLimpo} - ${veiculoLimpo}`;
  const slug = generateSlug(`${titulo}-${index}`);
  const buscaMl = `${marca} ${codigoLimpo}`.trim();

  // Monta descrição rica de veículos compatíveis
  let veiculosCompativeis = veiculoLimpo;
  const detalhesExtra: string[] = [];
  if (ano && !veiculoLimpo.includes(ano)) detalhesExtra.push(`Anos: ${ano}`);
  if (motor) detalhesExtra.push(`Motor: ${motor}`);
  if (sistema) detalhesExtra.push(`Sistema: ${sistema}`);
  if (detalhesExtra.length > 0) {
    veiculosCompativeis = `${veiculoLimpo} (${detalhesExtra.join(" | ")})`;
  }

  // Sugestão de preço padrão conforme tipo de peça caso não fornecido
  let precoFinal = precoEstimado || null;
  if (!precoFinal) {
    if (tipoPeca.includes("Pastilha")) precoFinal = 89.9;
    else if (tipoPeca.includes("Sapata")) precoFinal = 119.9;
    else if (tipoPeca.includes("Cerâmica")) precoFinal = 149.9;
    else if (tipoPeca.includes("Amortecedor")) precoFinal = 189.9;
    else if (tipoPeca.includes("Vela")) precoFinal = 69.9;
  }

  const linkFinal = linkDestino ? linkDestino.trim() : null;

  return {
    id: `item-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
    titulo,
    slug,
    codigo_fabricante: codigoLimpo,
    marca,
    categoria,
    tipo_peca: tipoPeca,
    veiculos_compativeis: veiculosCompativeis,
    codigo_oem: codigoOem ? codigoOem.trim() : null,
    busca_ml: buscaMl,
    link_destino: linkFinal,
    link_ml: linkFinal,
    imagem_url: imagemUrl ? imagemUrl.trim() : "",
    preco_estimado: precoFinal,
  };
}

// 6. Parser estruturado e regex para texto de catálogos PDF
export function parseCatalogText(
  text: string,
  selectedCategory: string = "Freio",
  selectedBrand: string = "auto",
  selectedPartType: string = "auto"
): ItemExtraidoCatalogo[] {
  const items: ItemExtraidoCatalogo[] = [];
  const marca =
    selectedBrand && selectedBrand !== "auto"
      ? selectedBrand
      : detectBrand(text);

  // ESTRATÉGIA 1: Blocos estruturados (ex: Catálogos Fras-le, Nakata, Cobreq com "ITEM 1:", "Modelo:", etc.)
  const blockRegex =
    /(?:ITEM\s*\d+:|Modelo:)[^\n]*[\s\S]*?(?=(?:ITEM\s*\d+:|================|$))/gi;
  const blocks = text.match(blockRegex) || [];

  if (blocks.length > 0) {
    let idx = 1;
    for (const block of blocks) {
      const modeloMatch = block.match(/Modelo:\s*([^\n\r|]+)/i);
      const anoMatch = block.match(/Ano(?:\s*de\/at[eé])?:\s*([^\n\r|]+)/i);
      const motorMatch = block.match(/Motor:\s*([^\n\r|]+)/i);
      const sistemaMatch = block.match(
        /Sistema(?:\s*de\s*(?:Freio|Suspens[aã]o))?:\s*([^\n\r|]+)/i
      );
      const codigoMatch = block.match(
        /C[oó]digo(?:\s*(?:Fras-?le|Cobreq|Nakata|NGK|Fabricante|Pe[çc]a))?:\s*([^\n\r|]+)/i
      );
      const oemMatch = block.match(/C[oó]digo\s*OEM:\s*([^\n\r|]+)/i);

      if (codigoMatch) {
        const codigo = codigoMatch[1].trim();
        const veiculo = modeloMatch ? modeloMatch[1].trim() : "Aplicação Automotiva";
        const tipoPeca =
          selectedPartType && selectedPartType !== "auto"
            ? selectedPartType
            : inferTipoPeca(selectedCategory, `${block} ${veiculo}`, codigo);

        items.push(
          buildItemObject({
            index: idx++,
            tipoPeca,
            marca,
            codigo,
            veiculo,
            categoria: selectedCategory,
            codigoOem: oemMatch ? oemMatch[1].trim() : null,
            motor: motorMatch ? motorMatch[1].trim() : undefined,
            ano: anoMatch ? anoMatch[1].trim() : undefined,
            sistema: sistemaMatch ? sistemaMatch[1].trim() : undefined,
          })
        );
      }
    }
  }

  // ESTRATÉGIA 2: Se nenhum bloco estruturado for encontrado ou catálogo estiver em formato tabular contínuo
  if (items.length === 0) {
    const lines = text.split("\n");
    let idx = 1;
    const seenCodes = new Set<string>();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.length < 10) continue;

      // Padrões de Códigos de Peça Automotivos:
      // Fras-le: PD/94, CB/416, FD/50
      // Cobreq: N-384, N-377, 0443-N
      // Nakata: HG 33014, NKF 1234, SK 102
      // NGK: BKR6E, BKR6E-D, LZKR6B-10E
      // Genérico: [A-Z]{1,4}[-/]?[0-9]{2,6}
      const codeMatch = line.match(
        /\b(PD\/\d+(?:-[A-Z0-9]+)?|CB\/\d+(?:-[A-Z0-9]+)?|FD\/\d+|N-\d{2,4}(?:-[A-Z0-9]+)?|0\d{3}-[A-Z0-9]+|NKF\s*\d+|HG\s*\d+|SK\s*\d+|BKR\w*(?:-[A-Z0-9]+)?|LZKR\w*(?:-[A-Z0-9]+)?|[A-Z]{1,3}[-/]?[0-9]{2,5}(?:-[A-Z0-9]+)?)\b/i
      );

      if (codeMatch) {
        const codigo = codeMatch[1].trim().toUpperCase();

        // Evita códigos duplicados no mesmo parse se já tiver sido capturado na mesma linha
        const oemMatch = line.match(/\b(\d{7,10})\b/);
        const yearMatch = line.match(
          /\b((?:19|20)\d{2}\s*(?:a|-|\/|\.\.|at[eé])\s*(?:19|20)?\d{2}|(?:19|20)\d{2}\s*(?:em\s*diante|\.\.|\+)|(?:19|20)\d{2})\b/i
        );

        // Extrai o veículo removendo o código e o OEM da linha
        let veiculoLimpo = line
          .replace(codeMatch[0], "")
          .replace(/C[oó]digo\s*OEM:?/i, "")
          .replace(/ITEM\s*\d+:?/i, "")
          .trim();

        if (oemMatch) {
          veiculoLimpo = veiculoLimpo.replace(oemMatch[0], "").trim();
        }

        // Se o veículo extraído for muito curto ou genérico, tenta limpar pontuações
        veiculoLimpo = veiculoLimpo
          .replace(/^[-|:;,\s]+|[-|:;,\s]+$/g, "")
          .replace(/\s{2,}/g, " ");

        if (!veiculoLimpo || veiculoLimpo.length < 3) {
          veiculoLimpo = `Veículo compatível ${marca}`;
        }

        const uniqueKey = `${codigo}_${veiculoLimpo.substring(0, 20)}`;
        if (!seenCodes.has(uniqueKey)) {
          seenCodes.add(uniqueKey);

          const tipoPeca =
            selectedPartType && selectedPartType !== "auto"
              ? selectedPartType
              : inferTipoPeca(selectedCategory, line, codigo);

          items.push(
            buildItemObject({
              index: idx++,
              tipoPeca,
              marca,
              codigo,
              veiculo: veiculoLimpo,
              categoria: selectedCategory,
              codigoOem: oemMatch ? oemMatch[1].trim() : null,
              ano: yearMatch ? yearMatch[1].trim() : undefined,
            })
          );
        }
      }
    }
  }

  return items;
}

// 7. Parser para ficheiros XLSX, XLS e CSV
export function parseSpreadsheet(
  buffer: Buffer,
  selectedCategory: string = "Freio",
  selectedBrand: string = "auto",
  selectedPartType: string = "auto"
): ItemExtraidoCatalogo[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const worksheet = workbook.Sheets[sheetName];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
  });

  const items: ItemExtraidoCatalogo[] = [];
  let idx = 1;

  for (const row of rawRows) {
    // Normaliza as chaves do objeto para busca sem case/acentos
    const normalizedRow: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const cleanKey = key
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
      normalizedRow[cleanKey] = String(value).trim();
    }

    // Busca Código da Peça
    const codigo =
      normalizedRow["codigo"] ||
      normalizedRow["codigo_fabricante"] ||
      normalizedRow["cod"] ||
      normalizedRow["referencia"] ||
      normalizedRow["ref"] ||
      normalizedRow["part_number"] ||
      normalizedRow["partnumber"] ||
      normalizedRow["codigo_peca"] ||
      "";

    if (!codigo) continue;

    // Busca Veículo / Aplicação
    const veiculo =
      normalizedRow["veiculo"] ||
      normalizedRow["veiculos"] ||
      normalizedRow["veiculos_compativeis"] ||
      normalizedRow["modelo"] ||
      normalizedRow["modelos"] ||
      normalizedRow["aplicacao"] ||
      normalizedRow["aplicacoes"] ||
      normalizedRow["carro"] ||
      "Aplicação Universal";

    // Busca Marca
    const marcaRow =
      normalizedRow["marca"] ||
      normalizedRow["fabricante"] ||
      (selectedBrand && selectedBrand !== "auto" ? selectedBrand : "Fras-le");

    // Busca OEM
    const oem =
      normalizedRow["codigo_oem"] ||
      normalizedRow["oem"] ||
      normalizedRow["original"] ||
      normalizedRow["num_original"] ||
      null;

    // Busca Categoria
    const categoria =
      normalizedRow["categoria"] || selectedCategory || "Freio";

    // Busca Tipo de Peça
    const tipoPeca =
      normalizedRow["tipo_peca"] ||
      normalizedRow["tipo"] ||
      (selectedPartType && selectedPartType !== "auto"
        ? selectedPartType
        : inferTipoPeca(categoria, `${veiculo} ${codigo}`, codigo));

    // Busca Imagem URL
    const imagemUrl =
      normalizedRow["imagem_url"] ||
      normalizedRow["imagem"] ||
      normalizedRow["foto"] ||
      "";

    // Busca Preço
    const precoRaw =
      normalizedRow["preco"] ||
      normalizedRow["preco_estimado"] ||
      normalizedRow["valor"];
    const precoEstimado = precoRaw
      ? parseFloat(precoRaw.replace(/[^\d.,]/g, "").replace(",", "."))
      : null;

    // Detalhes extras
    const ano = normalizedRow["ano"] || normalizedRow["anos"];
    const motor = normalizedRow["motor"] || normalizedRow["motorizacao"];

    items.push(
      buildItemObject({
        index: idx++,
        tipoPeca,
        marca: marcaRow,
        codigo,
        veiculo,
        categoria,
        codigoOem: oem,
        ano: ano || undefined,
        motor: motor || undefined,
        imagemUrl: imagemUrl || undefined,
        precoEstimado: !isNaN(Number(precoEstimado)) ? precoEstimado : null,
      })
    );
  }

  return items;
}
