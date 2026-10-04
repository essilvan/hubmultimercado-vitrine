import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function isValidMercadoLivreUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString.trim());
    const hostname = parsed.hostname.toLowerCase();

    // Validação de domínios do Mercado Livre e afiliados
    const isMlDomain =
      hostname === "mercadolivre.com.br" ||
      hostname.endsWith(".mercadolivre.com.br") ||
      hostname === "mercadolivre.com" ||
      hostname.endsWith(".mercadolivre.com") ||
      hostname === "meli.la" ||
      hostname.endsWith(".meli.la") ||
      hostname.includes("mercadolivre") ||
      parsed.pathname.includes("MLB") ||
      parsed.search.includes("MLB");

    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";

    return isHttp && isMlDomain;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json(
        { success: false, error: "O link do anúncio é obrigatório." },
        { status: 400 }
      );
    }

    const trimmedUrl = url.trim();

    if (!isValidMercadoLivreUrl(trimmedUrl)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "O link informado não pertence ao Mercado Livre (mercadolivre.com.br, mercadolivre.com ou link mlb).",
        },
        { status: 400 }
      );
    }

    // Requisição fetch à página do produto simulando navegador habitual
    const response = await fetch(trimmedUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Falha ao acessar o Mercado Livre (Código HTTP: ${response.status})`,
        },
        { status: 422 }
      );
    }

    const html = await response.text();

    // 1. Extrai o URL da imagem através da meta tag Open Graph <meta property="og:image" content="..." />
    const ogImageMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);

    let imageUrl: string | null = null;

    if (ogImageMatch && ogImageMatch[1]) {
      imageUrl = ogImageMatch[1].trim().replace(/&amp;/g, "&");
    } else {
      // Fallback 1: JSON-LD "image": "..."
      const jsonLdMatch = html.match(/"image":\s*"([^"]+)"/i);
      if (jsonLdMatch && jsonLdMatch[1] && jsonLdMatch[1].startsWith("http")) {
        imageUrl = jsonLdMatch[1].replace(/\\u002F/g, "/");
      } else {
        // Fallback 2: Primeira imagem de produto CDN do ML encontrada na página
        const mlstaticMatch = html.match(/https:\/\/http2\.mlstatic\.com\/D_[^"'\s\)]+/i);
        if (mlstaticMatch) {
          imageUrl = mlstaticMatch[0].replace(/&amp;/g, "&");
        }
      }
    }

    if (imageUrl) {
      if (imageUrl.startsWith("//")) {
        imageUrl = `https:${imageUrl}`;
      }

      return NextResponse.json({
        success: true,
        imagem_url: imageUrl,
      });
    }

    return NextResponse.json(
      { success: false, error: "Imagem não localizada no anúncio do Mercado Livre" },
      { status: 404 }
    );
  } catch (error: unknown) {
    console.error("Erro na extração de foto do Mercado Livre:", error);
    const msg =
      error instanceof Error ? error.message : "Erro interno ao extrair foto do ML.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
