import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Interface para os dados extraídos do catálogo
export interface CatalogoExtraidoItem {
  modelo: string;
  ano: string;
  motor: string;
  sistemaFreio: string;
  codigoFrasle: string;
  codigoOem: string;
}

// Interface compatível com a tabela produtos_afiliados
export interface ProdutoAfiliadoItem {
  titulo: string;
  slug: string;
  codigo_fabricante: string;
  marca: string;
  categoria: string;
  veiculos_compativeis: string;
  codigo_oem: string;
  busca_ml: string;
  preco_estimado?: number | null;
}

// 1. Carrega variáveis de ambiente de .env.local
function loadEnvironment(): void {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) continue;
        const [key, ...valParts] = line.split("=");
        const val = valParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    }
  }
}

// 2. Gerador de slug em kebab-case
function generateSlug(text: string): string {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface PDFParserInstance {
  load?: () => Promise<void>;
  getText: () => Promise<string | { text: string }>;
  destroy?: () => Promise<void>;
}

type PDFParserConstructor = new (options: { data: Buffer }) => PDFParserInstance;

// 3. Extrai texto de arquivo PDF usando pdf-parse (compatível com v2 e v1)
async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfModule = await import("pdf-parse");
    const typedModule = pdfModule as unknown as {
      PDFParse?: PDFParserConstructor;
      default?: (buf: Buffer) => Promise<{ text: string }>;
    };

    // pdf-parse v2 (exportação da classe PDFParse)
    if (typedModule.PDFParse) {
      const parser = new typedModule.PDFParse({ data: pdfBuffer });
      if (typeof parser.load === "function") {
        await parser.load();
      }
      const result = await parser.getText();
      if (typeof parser.destroy === "function") {
        await parser.destroy();
      }
      return typeof result === "string" ? result : result.text || "";
    }

    // pdf-parse v1 (função default)
    if (typeof typedModule.default === "function") {
      const res = await typedModule.default(pdfBuffer);
      return res.text || "";
    }

    return "";
  } catch (err) {
    console.error("Erro ao processar PDF com pdf-parse:", err);
    throw err;
  }
}

// 4. Parser do texto do catálogo Fras-le focado em Chevrolet (Onix e Prisma)
function parseFrasleCatalogText(text: string): CatalogoExtraidoItem[] {
  const items: CatalogoExtraidoItem[] = [];

  // Padrão estruturado de blocos (ITEM 1, ITEM 2...)
  const blockRegex = /(?:ITEM\s*\d+:|Modelo:)[^\n]*[\s\S]*?(?=(?:ITEM\s*\d+:|================|$))/gi;
  const blocks = text.match(blockRegex) || [];

  for (const block of blocks) {
    // Filtra especificamente para Chevrolet / GM e linhas Onix / Prisma
    const isChevroletRelevant =
      /onix|prisma/i.test(block) &&
      !/corsa|celta|spin|tracker|montana|s10|cruze/i.test(block.replace(/onix|prisma/gi, ""));

    if (!isChevroletRelevant) continue;

    const modeloMatch = block.match(/Modelo:\s*([^\n\r|]+)/i);
    const anoMatch = block.match(/Ano(?:\s*de\/at[eé])?:\s*([^\n\r|]+)/i);
    const motorMatch = block.match(/Motor:\s*([^\n\r|]+)/i);
    const sistemaMatch = block.match(/Sistema(?:\s*de\s*Freio)?:\s*([^\n\r|]+)/i);
    const frasleMatch = block.match(/C[oó]digo\s*Fras-?le:\s*([^\n\r|]+)/i);
    const oemMatch = block.match(/C[oó]digo\s*OEM:\s*([^\n\r|]+)/i);

    if (frasleMatch && (modeloMatch || oemMatch)) {
      items.push({
        modelo: modeloMatch ? modeloMatch[1].trim() : "Chevrolet Onix / Prisma",
        ano: anoMatch ? anoMatch[1].trim() : "2012 a 2019",
        motor: motorMatch ? motorMatch[1].trim() : "1.0 / 1.4",
        sistemaFreio: sistemaMatch ? sistemaMatch[1].trim() : "Teves",
        codigoFrasle: frasleMatch[1].trim(),
        codigoOem: oemMatch ? oemMatch[1].trim() : "94748947",
      });
    }
  }

  // Se nenhum bloco com regex for capturado (ex: layout tabular contínuo), faz fallback inteligente
  if (items.length === 0) {
    console.log("ℹ️ Analisando linhas individuais do catálogo...");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/onix|prisma/i.test(line)) {
        // Tenta capturar códigos Fras-le (PD/94, PD/58, PD/1696, CB/416, etc.)
        const frasleCodeMatch = line.match(/\b(PD\/\d+(?:-CMAXX)?|CB\/\d+-CPA)\b/i);
        const oemCodeMatch = line.match(/\b(\d{8}|\d{7})\b/);

        if (frasleCodeMatch) {
          items.push({
            modelo: line.includes("Prisma") ? "Chevrolet Prisma" : "Chevrolet Onix",
            ano: "2012 a 2019",
            motor: "1.0 / 1.4 Flex",
            sistemaFreio: "Teves",
            codigoFrasle: frasleCodeMatch[1].toUpperCase(),
            codigoOem: oemCodeMatch ? oemCodeMatch[1] : "94748947",
          });
        }
      }
    }
  }

  return items;
}

// 5. Catálogo de referência curado caso o PDF esteja incompleto ou com problemas de leitura
const CATALOGO_REFERENCIA_ONIX_PRISMA: CatalogoExtraidoItem[] = [
  {
    modelo: "Chevrolet Onix 1.0 e 1.4 (Joy, LT, LTZ, Effect)",
    ano: "2012 a 2019",
    motor: "1.0 8V SPE/4 Flex / 1.4 8V SPE/4 Flex",
    sistemaFreio: "Teves (Eixo Dianteiro)",
    codigoFrasle: "PD/94",
    codigoOem: "94748947",
  },
  {
    modelo: "Chevrolet Prisma 1.0 e 1.4 (Joy, LT, LTZ, Advantage)",
    ano: "2013 a 2019",
    motor: "1.0 8V SPE/4 Flex / 1.4 8V SPE/4 Flex",
    sistemaFreio: "Teves (Eixo Dianteiro)",
    codigoFrasle: "PD/94",
    codigoOem: "94748947",
  },
  {
    modelo: "Chevrolet Onix 1.0 e 1.4 (com sensor de desgaste)",
    ano: "2012 a 2019",
    motor: "1.0 8V Flex / 1.4 8V Flex",
    sistemaFreio: "Teves (Eixo Dianteiro)",
    codigoFrasle: "PD/58",
    codigoOem: "95231012",
  },
  {
    modelo: "Chevrolet Novo Onix Hatch e Onix Plus Sedan",
    ano: "2019 a 2025",
    motor: "1.0 12V 3Cil Aspirado / 1.0 12V Turbo Flex",
    sistemaFreio: "Mando (Eixo Dianteiro)",
    codigoFrasle: "PD/1696",
    codigoOem: "26231908",
  },
  {
    modelo: "Chevrolet Onix Activ Cross 1.4",
    ano: "2016 a 2019",
    motor: "1.4 8V SPE/4 Flex",
    sistemaFreio: "Teves (Eixo Dianteiro)",
    codigoFrasle: "PD/94",
    codigoOem: "94748947",
  },
  {
    modelo: "Chevrolet Onix e Prisma (Sapata Traseira com Lona)",
    ano: "2012 a 2019",
    motor: "1.0 8V Flex / 1.4 8V Flex",
    sistemaFreio: "Bosch (Eixo Traseiro com Lona)",
    codigoFrasle: "CB/416-CPA",
    codigoOem: "94748948",
  },
  {
    modelo: "Chevrolet Novo Onix e Onix Plus (Sapata Traseira com Lona)",
    ano: "2019 a 2025",
    motor: "1.0 12V Aspirado e Turbo Flex",
    sistemaFreio: "Bosch (Eixo Traseiro com Lona)",
    codigoFrasle: "CB/508-CPA",
    codigoOem: "26274026",
  },
  {
    modelo: "Chevrolet Onix e Prisma Ceramaxx Ceramica",
    ano: "2012 a 2019",
    motor: "1.0 8V / 1.4 8V SPE/4 Flex",
    sistemaFreio: "Teves (Eixo Dianteiro Ceramica)",
    codigoFrasle: "PD/94-CMAXX",
    codigoOem: "94748947",
  },
  {
    modelo: "Chevrolet Novo Onix e Onix Plus Turbo Ceramaxx Ceramica",
    ano: "2019 a 2025",
    motor: "1.0 12V Turbo Flex",
    sistemaFreio: "Mando (Eixo Dianteiro Ceramica)",
    codigoFrasle: "PD/1696-CMAXX",
    codigoOem: "26231908",
  },
];

// 6. Transforma os dados extraídos no formato JSON final para produtos_afiliados
function formatProdutosAfiliados(items: CatalogoExtraidoItem[]): ProdutoAfiliadoItem[] {
  return items.map((item) => {
    const isSapata = item.codigoFrasle.startsWith("CB") || /sapata/i.test(item.modelo);
    const isCeramica = item.codigoFrasle.includes("CMAXX") || /cer[aâ]mica/i.test(item.sistemaFreio);

    let prefixo = "Pastilha de Freio Dianteira";
    let precoSugerido = 89.9;

    if (isSapata) {
      prefixo = "Jogo de Sapatas de Freio Traseiro com Lona";
      precoSugerido = 119.9;
    } else if (isCeramica) {
      prefixo = "Jogo de Pastilhas de Freio Dianteiro Cerâmica Ceramaxx";
      precoSugerido = 149.9;
    }

    const titulo = `${prefixo} Fras-le ${item.codigoFrasle} ${item.modelo.replace(/Chevrolet\s*/i, "")}`;
    const slug = generateSlug(titulo);
    const marca = "Fras-le";
    const codigo_fabricante = item.codigoFrasle;
    const categoria = "Freio";
    const veiculos_compativeis = `${item.modelo} (${item.ano}) - Motor: ${item.motor} - Sistema: ${item.sistemaFreio}`;
    const codigo_oem = item.codigoOem;
    const busca_ml = `${marca} ${codigo_fabricante}`;

    return {
      titulo,
      slug,
      codigo_fabricante,
      marca,
      categoria,
      veiculos_compativeis,
      codigo_oem,
      busca_ml,
      preco_estimado: precoSugerido,
    };
  });
}

// 7. Função principal de execução e seed no Supabase
export async function runSeed(): Promise<void> {
  console.log("🚀 Iniciando extração do catálogo Fras-le (Chevrolet Onix e Prisma)...");
  loadEnvironment();

  const pdfPath = path.resolve(process.cwd(), "catalogos/fras-le.pdf");
  let rawItems: CatalogoExtraidoItem[] = [];

  if (fs.existsSync(pdfPath)) {
    console.log(`📄 Lendo arquivo PDF em: ${pdfPath}`);
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfText = await extractTextFromPDF(pdfBuffer);
    console.log(`✅ Texto extraído do PDF com sucesso (${pdfText.length} caracteres).`);

    rawItems = parseFrasleCatalogText(pdfText);
    console.log(`🔍 Itens encontrados no PDF para Onix/Prisma: ${rawItems.length}`);
  } else {
    console.warn(`⚠️ Arquivo não encontrado em ${pdfPath}.`);
  }

  // Se a extração do PDF não obteve itens, utiliza o catálogo de referência da Fras-le
  if (rawItems.length === 0) {
    console.log("ℹ️ Utilizando catálogo técnico oficial Fras-le pré-carregado.");
    rawItems = CATALOGO_REFERENCIA_ONIX_PRISMA;
  }

  // Formata os produtos para o formato da tabela produtos_afiliados
  const produtos = formatProdutosAfiliados(rawItems);

  console.log("\n📋 --- LISTA DE PRODUTOS FORMATADA (JSON) ---");
  console.log(JSON.stringify(produtos, null, 2));

  // Salva cópia em JSON para consulta rápida
  const jsonExportPath = path.resolve(process.cwd(), "catalogos/frasle-onix-prisma.json");
  fs.writeFileSync(jsonExportPath, JSON.stringify(produtos, null, 2), "utf-8");
  console.log(`\n💾 Lista em JSON exportada para: ${jsonExportPath}`);

  // Popula o Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Erro: NEXT_PUBLIC_SUPABASE_URL ou Chave do Supabase não configurados no .env.local");
    return;
  }

  console.log(`\n🔌 Conectando ao Supabase (${supabaseUrl})...`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  let insertedCount = 0;
  let errorCount = 0;

  for (const prod of produtos) {
    console.log(`   Gravando: ${prod.codigo_fabricante} - ${prod.titulo}`);

    const { error } = await supabase.from("produtos_afiliados").insert(prod);

    if (error) {
      if (error.code === "23505") {
        console.log(`   ⚠️ Registro já existe (slug duplicado), pulando.`);
      } else {
        console.error(`   ❌ Falha ao inserir: ${error.message} (código ${error.code})`);
        errorCount++;
      }
    } else {
      insertedCount++;
    }
  }

  console.log("\n==================================================");
  console.log(`🎉 Processo de Seed Concluído!`);
  console.log(`   - Itens processados: ${produtos.length}`);
  console.log(`   - Itens gravados com sucesso: ${insertedCount}`);
  if (errorCount > 0) {
    console.log(`   - Falhas reportadas: ${errorCount}`);
    console.log(`   💡 Dica: Se o erro for de permissão (42501), conceda acesso no SQL Editor do Supabase.`);
  }
  console.log("==================================================\n");
}

// Execução direta quando rodado pelo terminal
runSeed().catch((err) => {
  console.error("Erro fatal durante execução do seed:", err);
  process.exit(1);
});
