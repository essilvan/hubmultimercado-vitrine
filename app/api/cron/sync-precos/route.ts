import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Permite tempo limite estendido para o processamento de todos os produtos
export const maxDuration = 300;

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Credenciais do Supabase não configuradas no servidor.");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  // Se CRON_SECRET não estiver configurado no .env, permite execução
  if (!cronSecret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.replace(/^Bearer\s+/i, "").trim() === cronSecret) {
    return true;
  }

  const customHeader = request.headers.get("x-cron-secret");
  if (customHeader && customHeader.trim() === cronSecret) {
    return true;
  }

  const { searchParams } = new URL(request.url);
  const secretQuery = searchParams.get("secret") || searchParams.get("key");
  if (secretQuery && secretQuery.trim() === cronSecret) {
    return true;
  }

  return false;
}

function formatBrl(val: number | string | null | undefined): string | null {
  if (val === null || val === undefined || val === "") return null;
  const str = String(val).trim();
  if (str.startsWith("R$")) return str.replace(/\u00a0/g, " ");
  const num = typeof val === "number" ? val : parseFloat(str.replace(/\./g, "").replace(",", "."));
  if (isNaN(num)) return null;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

function parseAriaPrice(str: string | null | undefined): string | null {
  if (!str) return null;
  const match = str.match(/(\d+)\s*reais(?:\s*com\s*(\d+)\s*centavos)?/i);
  if (!match) return null;
  const fracao = match[1];
  const centavos = match[2] ? match[2].padStart(2, "0") : "00";
  return `R$ ${fracao},${centavos}`;
}

function extrairPrecosMercadoLivre(html: string): {
  precoEstimado: string | null;
  precoAntigo: string | null;
  descontoPercentual: string | null;
} {
  let precoEstimadoStr: string | null = null;
  let precoAntigoStr: string | null = null;
  let descontoPercentual: string | null = null;

  // 1. JSON-LD: prioridade para offers.price ou offers[0].price
  try {
    const jsonLdScripts = html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );

    for (const match of jsonLdScripts) {
      if (!match[1]) continue;
      try {
        const parsed = JSON.parse(match[1].trim());
        const items = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of items) {
          if (!item) continue;
          const offers = item.offers;
          if (offers) {
            if (Array.isArray(offers) && offers.length > 0) {
              const p = offers[0].price !== undefined ? parseFloat(String(offers[0].price)) : null;
              if (p !== null && !isNaN(p) && p > 0) {
                const parts = p.toFixed(2).split(".");
                precoEstimadoStr = `R$ ${parts[0]},${parts[1]}`;
                break;
              }
            } else if (typeof offers === "object") {
              const p = offers.price !== undefined ? parseFloat(String(offers.price)) : null;
              if (p !== null && !isNaN(p) && p > 0) {
                const parts = p.toFixed(2).split(".");
                precoEstimadoStr = `R$ ${parts[0]},${parts[1]}`;
                break;
              }
            }
          }
        }
      } catch {
        // Ignora JSON inválido
      }
      if (precoEstimadoStr !== null) break;
    }
  } catch (err) {
    console.warn("Erro ao fazer parse dos blocos JSON-LD:", err);
  }

  // 2. Container do preço atual em destaque (.ui-pdp-price__second-line)
  const secondLineIdx = html.indexOf("ui-pdp-price__second-line");
  if (secondLineIdx !== -1) {
    const secondLineChunk = html.slice(secondLineIdx, secondLineIdx + 1500);
    const fracMatch = secondLineChunk.match(
      /class=["'][^"']*andes-money-amount__fraction[^"']*["'][^>]*>([0-9.,]+)<\/span>/i
    );
    const centsMatch = secondLineChunk.match(
      /class=["'][^"']*andes-money-amount__cents[^"']*["'][^>]*>([0-9]{2})<\/span>/i
    );

    if (fracMatch && fracMatch[1]) {
      const fracao = fracMatch[1].replace(/\./g, "").trim();
      const centavos = centsMatch && centsMatch[1] ? centsMatch[1].trim() : "00";
      precoEstimadoStr = `R$ ${fracao},${centavos}`;
    }
  }

  // 3. Preço original sem desconto (.ui-pdp-price__original-value)
  const origIdx = html.indexOf("ui-pdp-price__original-value");
  if (origIdx !== -1) {
    const origChunk = html.slice(origIdx, origIdx + 1500);
    const origFracMatch = origChunk.match(
      /class=["'][^"']*andes-money-amount__fraction[^"']*["'][^>]*>([0-9.,]+)<\/span>/i
    );
    const origCentsMatch = origChunk.match(
      /class=["'][^"']*andes-money-amount__cents[^"']*["'][^>]*>([0-9]{2})<\/span>/i
    );

    if (origFracMatch && origFracMatch[1]) {
      const origFrac = origFracMatch[1].replace(/\./g, "").trim();
      const origCents = origCentsMatch && origCentsMatch[1] ? origCentsMatch[1].trim() : "00";
      precoAntigoStr = `R$ ${origFrac},${origCents}`;
    }
  }

  // 4. Suporte para landing pages de afiliados via aria-label ("Agora: XX reais" e "Antes: YY reais")
  if (!precoEstimadoStr) {
    const agoraMatch = html.match(/aria-label=["']Agora:\s*([^"']+)["']/i);
    if (agoraMatch) {
      precoEstimadoStr = parseAriaPrice(agoraMatch[1]);
    }
  }

  if (!precoAntigoStr) {
    const antesMatch = html.match(/aria-label=["']Antes:\s*([^"']+)["']/i);
    if (antesMatch) {
      precoAntigoStr = parseAriaPrice(antesMatch[1]);
    }
  }

  // 5. Percentagem de Desconto: '.andes-money-amount__discount', '.ui-pdp-price__second-line__label' ou regex "XX% OFF"
  const discountMatch =
    html.match(/class=["'][^"']*(?:andes-money-amount__discount|ui-pdp-price__second-line__label)[^"']*["'][^>]*>([^<]*[0-9]{1,2}%\s*OFF[^<]*)<\/span>/i) ||
    html.match(/<span[^>]*class=["'][^"']*andes-money-amount__discount[^"']*["'][^>]*>([0-9]{1,2}%\s*OFF)<\/span>/i) ||
    html.match(/\b([0-9]{1,2}%\s*OFF)\b/i);

  if (discountMatch && discountMatch[1]) {
    descontoPercentual = discountMatch[1].trim().toUpperCase();
  }

  if (!descontoPercentual && precoAntigoStr && precoEstimadoStr) {
    const numAntigo = parseFloat(precoAntigoStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
    const numEstimado = parseFloat(precoEstimadoStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
    if (!isNaN(numAntigo) && !isNaN(numEstimado) && numAntigo > numEstimado) {
      const pct = Math.round(((numAntigo - numEstimado) / numAntigo) * 100);
      if (pct >= 5) {
        descontoPercentual = `${pct}% OFF`;
      }
    }
  }

  // Fallbacks de preço atual
  if (!precoEstimadoStr) {
    const metaPriceMatch =
      html.match(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']price["']/i) ||
      html.match(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i);

    if (metaPriceMatch && metaPriceMatch[1]) {
      const p = parseFloat(metaPriceMatch[1].replace(",", "."));
      if (!isNaN(p) && p > 0) precoEstimadoStr = formatBrl(p);
    }
  }

  if (precoAntigoStr && precoEstimadoStr && precoAntigoStr === precoEstimadoStr) {
    precoAntigoStr = null;
  }

  return {
    precoEstimado: precoEstimadoStr,
    precoAntigo: precoAntigoStr,
    descontoPercentual,
  };
}

async function fetchPageHtml(url: string): Promise<string | null> {
  // 1. Tenta fetch com User-Agent de navegador
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (res.ok) {
      const text = await res.text();
      if (!res.url.includes("account-verification") && !text.includes("suspicious-traffic")) {
        return text;
      }
    }
  } catch (err) {
    console.warn("Fetch navegador falhou, tentando fallback social bot:", err);
  }

  // 2. Fallback com User-Agent de preview social para contornar bloqueios de bots
  try {
    const botRes = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });
    if (botRes.ok) {
      return await botRes.text();
    }
  } catch (err) {
    console.warn("Fallback bot também falhou:", err);
  }

  return null;
}

export async function handleSync(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Acesso não autorizado. Token CRON_SECRET inválido." },
      { status: 401 }
    );
  }

  const supabase = getSupabaseClient();

  // 1. Buscar todos os produtos do Supabase
  const { data: produtos, error: fetchErr } = await supabase
    .from("produtos_afiliados")
    .select("*")
    .order("created_at", { ascending: false });

  if (fetchErr) {
    return NextResponse.json(
      { success: false, error: `Erro ao buscar produtos: ${fetchErr.message}` },
      { status: 500 }
    );
  }

  // 2. Filtrar produtos que possuem link do Mercado Livre preenchido
  const elegiveis = (produtos || []).filter((p) => {
    const link =
      p.link_afiliado ||
      p.especificacoes?.link_afiliado ||
      p.especificacoes?.link_ml ||
      p.especificacoes?.link_destino;

    return link && typeof link === "string" && (link.includes("mercadolivre.com") || link.includes("meli.la"));
  });

  const totalProcessados = elegiveis.length;
  let atualizados = 0;
  const erros: { id: string; titulo: string; error: string }[] = [];

  const nowIso = new Date().toISOString();

  // 3. Processar cada produto com delay de 800ms
  for (let i = 0; i < elegiveis.length; i++) {
    const prod = elegiveis[i];
    const link =
      prod.link_afiliado ||
      prod.especificacoes?.link_afiliado ||
      prod.especificacoes?.link_ml ||
      prod.especificacoes?.link_destino;

    try {
      const html = await fetchPageHtml(link);
      if (!html) {
        throw new Error("Não foi possível carregar o HTML da página do anúncio.");
      }

      const { precoEstimado, precoAntigo, descontoPercentual } = extrairPrecosMercadoLivre(html);

      if (!precoEstimado) {
        throw new Error("Preço não localizado na página do anúncio.");
      }

      // Prepara os dados de atualização
      const updatedSpecs = {
        ...(typeof prod.especificacoes === "object" && prod.especificacoes ? prod.especificacoes : {}),
        preco_antigo: precoAntigo,
        desconto_percentual: descontoPercentual,
        ultima_sincronizacao: nowIso,
      };

      // Tenta atualizar incluindo colunas top-level se existirem
      let updateRes = await supabase
        .from("produtos_afiliados")
        .update({
          preco_estimado: precoEstimado,
          preco_antigo: precoAntigo,
          desconto_percentual: descontoPercentual,
          ultima_sincronizacao: nowIso,
          especificacoes: updatedSpecs,
        })
        .eq("id", prod.id);

      // Se der erro de coluna não encontrada (PGRST204 ou 42703), grava apenas nas colunas existentes
      if (
        updateRes.error &&
        (updateRes.error.code === "42703" ||
          updateRes.error.code === "PGRST204" ||
          updateRes.error.message?.toLowerCase().includes("column") ||
          updateRes.error.message?.toLowerCase().includes("schema cache"))
      ) {
        updateRes = await supabase
          .from("produtos_afiliados")
          .update({
            preco_estimado: precoEstimado,
            especificacoes: updatedSpecs,
          })
          .eq("id", prod.id);
      }

      if (updateRes.error) {
        throw new Error(updateRes.error.message);
      }

      atualizados++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido ao sincronizar.";
      erros.push({
        id: prod.id,
        titulo: prod.titulo,
        error: msg,
      });
    }

    // Delay de 800ms entre requisições para respeitar os limites de taxa
    if (i < elegiveis.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  return NextResponse.json({
    success: true,
    total_processados: totalProcessados,
    atualizados,
    erros_count: erros.length,
    erros,
    timestamp: nowIso,
  });
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}
