import { NextRequest, NextResponse } from "next/server";
import { obterHeadersApiML } from "@/lib/mercadolivre";

export const dynamic = "force-dynamic";

/**
 * Formata o texto de busca em um slug limpo separado por hífens.
 */
function formatSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // Substitui pontuações e espaços por hífen
    .replace(/^-+|-+$/g, ""); // Remove hífens sobrando no início e fim
}

export async function GET(request: NextRequest) {
  // Extrai os parâmetros da requisição
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const directUrl = searchParams.get("url");

  // Identificadores de afiliado do ambiente ou padrão solicitado
  const mattTool = process.env.ML_MATT_TOOL || "31976628";
  const mattWord = process.env.ML_MATT_WORD || "hubmultimercado";

  // 1. CASO URL DIRETA: Se for 'url' direta (ou 'query' contendo link direto http/https)
  const targetDirect =
    directUrl ||
    (query && (query.startsWith("http://") || query.startsWith("https://"))
      ? query
      : null);

  if (targetDirect) {
    const cleanUrl = targetDirect.trim();
    const separator = cleanUrl.includes("?") ? "&" : "?";
    const urlFinal = `${cleanUrl}${separator}matt_tool=${mattTool}&matt_word=${mattWord}&forceInApp=true`;
    return NextResponse.redirect(urlFinal, 307);
  }

  // 2. CASO QUERY: Pesquisa da IA de orçamento ou catálogo
  if (query && query.trim()) {
    const queryTexto = query.trim();

    try {
      const headers = await obterHeadersApiML();
      // Faz requisição à API pública do Mercado Livre
      const res = await fetch(
        `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(
          queryTexto
        )}&shipping_highlighted=fulfillment&limit=1`,
        {
          headers,
          next: { revalidate: 60 },
        }
      );

      if (res.status === 429 || res.status === 403) {
        console.error("Bloqueio/Rate Limit ML:", res.statusText || `${res.status}`);
      }

      if (res.ok) {
        const json = await res.json();
        const primeiroItem = json.results && json.results[0];

        // Se encontrar o item específico, extrai o permalink oficial e anexa tags de afiliado
        if (primeiroItem && primeiroItem.permalink) {
          const separator = primeiroItem.permalink.includes("?") ? "&" : "?";
          const linkAfiliado = `${primeiroItem.permalink}${separator}matt_tool=${mattTool}&matt_word=${mattWord}&forceInApp=true`;
          return NextResponse.redirect(linkAfiliado, 307);
        }
      }
    } catch (error) {
      console.error("Erro ao consultar API do Mercado Livre:", error);
    }

    // Fallback de segurança: Se a API não devolver resultados específicos, redireciona para a lista limpa com slug formatado por hífens
    const slug = formatSlug(queryTexto);
    if (slug) {
      const fallbackUrl = `https://lista.mercadolivre.com.br/${slug}?matt_tool=${mattTool}&matt_word=${mattWord}&forceInApp=true`;
      return NextResponse.redirect(fallbackUrl, 307);
    }
  }

  // Redireciona para home se nenhum parâmetro válido for informado
  return NextResponse.redirect(new URL("/", request.url));
}
