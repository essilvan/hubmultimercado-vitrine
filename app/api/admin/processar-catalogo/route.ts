import { NextRequest, NextResponse } from "next/server";
import {
  extractTextFromPDF,
  parseCatalogText,
  parseSpreadsheet,
  detectBrand,
} from "@/lib/catalogo-parser";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const isDemo = formData.get("isDemo") === "true";
    const categoria = (formData.get("categoria") as string) || "Freio";
    const marcaSelecionada = (formData.get("marca") as string) || "auto";
    const tipoPeca = (formData.get("tipo_peca") as string) || "auto";

    let buffer: Buffer;
    let filename = "";

    if (isDemo) {
      // Carrega o arquivo demo fras-le.pdf em catalogos/
      const demoPath = path.resolve(process.cwd(), "catalogos/fras-le.pdf");
      if (!fs.existsSync(demoPath)) {
        return NextResponse.json(
          { success: false, error: "Arquivo de demonstração catalogos/fras-le.pdf não encontrado." },
          { status: 404 }
        );
      }
      buffer = fs.readFileSync(demoPath);
      filename = "fras-le.pdf";
    } else {
      if (!file) {
        return NextResponse.json(
          { success: false, error: "Nenhum arquivo enviado para processamento." },
          { status: 400 }
        );
      }

      filename = file.name || "catalogo";
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "";

    // 1. Processamento de PDF via pdf-parse
    if (ext === "pdf" || file?.type === "application/pdf") {
      const extractedText = await extractTextFromPDF(buffer);

      if (!extractedText || extractedText.trim().length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "O arquivo PDF não contém camadas de texto legíveis ou está protegido/escaneado em imagem pura.",
          },
          { status: 422 }
        );
      }

      const detected = detectBrand(extractedText, filename);
      const marcaFinal =
        marcaSelecionada && marcaSelecionada !== "auto"
          ? marcaSelecionada
          : detected;

      const items = parseCatalogText(
        extractedText,
        categoria,
        marcaFinal,
        tipoPeca
      );

      return NextResponse.json({
        success: true,
        source: "pdf",
        filename,
        brand: marcaFinal,
        category: categoria,
        count: items.length,
        items,
        message: `${items.length} itens extraídos com sucesso do catálogo ${marcaFinal}.`,
      });
    }

    // 2. Processamento de Planilhas (CSV, XLSX, XLS)
    if (
      ["xlsx", "xls", "csv"].includes(ext) ||
      file?.type.includes("spreadsheet") ||
      file?.type.includes("csv") ||
      file?.type.includes("excel")
    ) {
      const items = parseSpreadsheet(
        buffer,
        categoria,
        marcaSelecionada,
        tipoPeca
      );

      return NextResponse.json({
        success: true,
        source: "spreadsheet",
        filename,
        brand: marcaSelecionada,
        category: categoria,
        count: items.length,
        items,
        message: `${items.length} itens extraídos com sucesso da planilha.`,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "Formato de arquivo não suportado. Por favor, envie um arquivo PDF, XLSX ou CSV.",
      },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("Erro no processamento de catálogo:", error);
    const msg =
      error instanceof Error
        ? error.message
        : "Erro interno ao processar o catálogo.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
