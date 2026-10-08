import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  extrairDescricaoHtml,
  extrairTabelaEspecificacoesHtml,
  extrairDadosDescricaoML,
  extrairItemIdML,
  consultarDetalhesItemML,
  obterDescricaoItemML,
  gerarPalavrasChave,
  obterImagemAltaResolucao,
} from "@/lib/mercadolivre";
import { gerarSlugProduto, limparSlug, gerarSlug as generateSlug } from "@/lib/slug";

export const runtime = "nodejs";

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

function isValidMercadoLivreUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString.trim());
    const hostname = parsed.hostname.toLowerCase();

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


function formatBrl(val: number | string | null | undefined): string | null {
  if (val === null || val === undefined || val === "") return null;
  const str = String(val).trim();
  if (str.startsWith("R$")) return str.replace(/\u00a0/g, " ");
  const num = typeof val === "number" ? val : parseFloat(str.replace(/\./g, "").replace(",", "."));
  if (isNaN(num)) return null;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

// Lista de marcas automotivas conhecidas
const MARCAS_CONHECIDAS = [
  "Cobreq",
  "Fras-le",
  "LuK",
  "Sachs",
  "Nakata",
  "Monroe",
  "Fremax",
  "NGK",
  "Bosch",
  "Continental",
  "Contitech",
  "Mann-Filter",
  "Mann",
  "TRW",
  "Magneti Marelli",
  "Marelli",
  "Valeo",
  "Cofap",
  "Dayco",
  "Hipper Freios",
  "Willtec",
  "Tecfil",
  "Fram",
  "Wega",
  "Mahle",
  "Delphi",
  "Varga",
  "Gates",
  "Urba",
  "Schadek",
  "Sabó",
  "VDO",
  "KYB",
  "Kayaba",
  "Weidmuller",
];

function deduzirMarca(titulo: string): string {
  for (const marca of MARCAS_CONHECIDAS) {
    const regex = new RegExp(`\\b${marca}\\b`, "i");
    if (regex.test(titulo)) {
      return marca;
    }
  }
  return "Auto Peças";
}

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

  return marca !== "Auto Peças" ? `${marca}-PEC` : "COD-ML";
}

function deduzirCategoria(titulo: string): string {
  const t = titulo.toLowerCase();
  if (/pastilha|disco|freio|sapata|lona|tambor|fluido/i.test(t)) return "Freio";
  if (/embreagem|plato|disco embreagem|atuador/i.test(t)) return "Embreagem";
  if (/amortecedor|suspens|mola|batente|coxim|bieleta|pivo|bandeja/i.test(t)) return "Suspensão";
  if (/vela|ignicao|bobina|cabo de vela/i.test(t)) return "Ignição";
  if (/correia|tensor|correia dentada|motor|valvula|junta/i.test(t)) return "Motor";
  if (/bomba|combustivel|bico|injetor|injecao/i.test(t)) return "Injeção Eletrônica";
  if (/filtro/i.test(t)) return "Filtros";
  return "Autopeças";
}

function deduzirVeiculos(titulo: string): string {
  const marcasCarros = [
    "Onix",
    "Prisma",
    "HB20",
    "HB20S",
    "Gol",
    "Fox",
    "Voyage",
    "Saveiro",
    "Palio",
    "Uno",
    "Celta",
    "Corsa",
    "Cobalt",
    "Spin",
    "Cruze",
    "Fiesta",
    "Ka",
    "EcoSport",
    "Civic",
    "Fit",
    "Corolla",
    "Sandero",
    "Logan",
    "Duster",
    "Polo",
    "Golf",
    "Up!",
  ];

  const encontrados: string[] = [];
  for (const carro of marcasCarros) {
    const reg = new RegExp(`\\b${carro}\\b`, "i");
    if (reg.test(titulo)) {
      encontrados.push(carro);
    }
  }

  if (encontrados.length > 0) {
    return `Compatível com ${encontrados.join(" / ")}`;
  }
  return "Consulte compatibilidade do veículo no anúncio";
}

function parseAriaPrice(str: string | null | undefined): string | null {
  if (!str) return null;
  const match = str.match(/(\d+)\s*reais(?:\s*com\s*(\d+)\s*centavos)?/i);
  if (!match) return null;
  const fracao = match[1];
  const centavos = match[2] ? match[2].padStart(2, "0") : "00";
  return `R$ ${fracao},${centavos}`;
}

/**
 * Extrator de preços com prioridade para JSON-LD (offers.price) e container ui-pdp-price__second-line
 */
function extrairPrecosMercadoLivre(html: string): {
  precoEstimado: string | null;
  precoAntigo: string | null;
  descontoPercentual: string | null;
} {
  let precoEstimadoStr: string | null = null;
  let precoAntigoStr: string | null = null;
  let descontoPercentual: string | null = null;

  // 1. JSON-LD: prioridade máxima para offers.price ou offers[0].price (preço promocional final)
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

  // 2. Container do preço em destaque (.ui-pdp-price__second-line)
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
      // Dá prioridade ao container visual da página
      precoEstimadoStr = `R$ ${fracao},${centavos}`;
    }
  }

  // 3. Preço antigo: container .ui-pdp-price__original-value
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

  // 4. Suporte para landing pages de afiliados / sociais via aria-label ("Agora: XX reais" e "Antes: YY reais")
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

  // Se não localizou o desconto textual mas temos preço antigo e preço estimado, calcula
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

  // Fallbacks de preço atual caso ainda não tenha sido definido
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

  // Validação: Preço antigo não deve ser igual ao preço estimado
  if (precoAntigoStr && precoEstimadoStr && precoAntigoStr === precoEstimadoStr) {
    precoAntigoStr = null;
  }

  return {
    precoEstimado: precoEstimadoStr,
    precoAntigo: precoAntigoStr,
    descontoPercentual,
  };
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
            "O link informado não é válido ou não pertence ao Mercado Livre (ex: https://produto.mercadolivre.com.br/... ou https://meli.la/...).",
        },
        { status: 400 }
      );
    }

    // 1. Efetuar fetch com cabeçalhos simulando navegador, com fallback para preview bot para contornar antibot
    let html = "";
    let finalUrl = trimmedUrl;

    try {
      const res = await fetch(trimmedUrl, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (res.url) {
        finalUrl = res.url;
      }

      if (res.ok) {
        const bodyText = await res.text();
        if (!res.url.includes("account-verification") && !bodyText.includes("suspicious-traffic")) {
          html = bodyText;
        }
      }
    } catch (fetchErr) {
      console.warn("Primeira tentativa de fetch com navegador habitual:", fetchErr);
    }

    // Se a primeira tentativa foi bloqueada por desafio ou retornou vazia, utiliza agente preview
    if (!html) {
      try {
        const botRes = await fetch(trimmedUrl, {
          redirect: "follow",
          headers: {
            "User-Agent":
              "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
        });

        if (botRes.url) {
          finalUrl = botRes.url;
        }

        if (botRes.ok) {
          html = await botRes.text();
        }
      } catch (botErr) {
        console.warn("Tentativa alternativa de fetch:", botErr);
      }
    }

    if (!html) {
      return NextResponse.json(
        {
          success: false,
          error: "Falha ao acessar o anúncio do Mercado Livre. Verifique se o link está ativo e acessível.",
        },
        { status: 422 }
      );
    }

    // 2. Extração do ID do item MLB (da URL original, final redirecionada ou do HTML)
    let mlbId =
      extrairItemIdML(trimmedUrl) ||
      extrairItemIdML(finalUrl);

    if (!mlbId) {
      const mlbMatchInHtml =
        html.match(/"item_id":\s*"(MLB\d+)"/i) ||
        html.match(/item_id=(MLB\d+)/i) ||
        html.match(/\b(MLB-?\d{8,14})\b/i);

      if (mlbMatchInHtml && mlbMatchInHtml[1]) {
        mlbId = mlbMatchInHtml[1].replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      }
    }

    // 3. Consulta tanto os detalhes do item (/items/{id}) quanto a descrição (/items/{id}/description) na API do ML
    let itemApi: any = null;
    let descApi: string | null = null;

    if (mlbId) {
      try {
        const [detalhesRes, descRes] = await Promise.all([
          consultarDetalhesItemML(mlbId).catch((err) => {
            console.error(`[importar-link-ml] Erro ao consultar detalhes do item ${mlbId}:`, err);
            return null;
          }),
          obterDescricaoItemML(mlbId).catch((err) => {
            console.error(`[importar-link-ml] Erro ao consultar descrição do item ${mlbId}:`, err);
            return null;
          }),
        ]);
        itemApi = detalhesRes;
        descApi = descRes;
        if (!descApi) {
          console.warn(`[importar-link-ml] Descrição da API ML não retornou para ${mlbId}. Tentando obter via HTML.`);
        }
      } catch (apiErr) {
        console.error(`[importar-link-ml] Aviso ao consultar endpoints do Mercado Livre para o item: ${mlbId}`, apiErr);
      }
    }

    // Se a página for um landing page social ou não tiver tabelas de especificações, busca o HTML direto do produto no Mercado Livre
    let pdpHtml = html;
    if (mlbId && (finalUrl.includes("/social/") || !html.includes("<tr"))) {
      try {
        const cleanMlb = mlbId.startsWith("MLB-") ? mlbId : mlbId.replace(/^MLB/i, "MLB-");
        const pdpRes = await fetch(`https://produto.mercadolivre.com.br/${cleanMlb}`, {
          headers: {
            "User-Agent":
              "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
        });
        if (pdpRes.ok) {
          const directHtml = await pdpRes.text();
          if (directHtml.length > 5000 && directHtml.includes("<tr")) {
            pdpHtml = directHtml;
          }
        }
      } catch (pdpErr) {
        console.warn("[importar-link-ml] Aviso ao buscar HTML direto do produto:", pdpErr);
      }
    }

    // 4. Extração do Título
    const titleMatch =
      pdpHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      pdpHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
      html.match(/<title>([^<]+)<\/title>/i);

    let rawTitle = itemApi?.title || (titleMatch && titleMatch[1] ? titleMatch[1].trim() : "");
    rawTitle = rawTitle
      .replace(/\s*-\s*R\$\s*[\d.,]+\s*$/i, "")
      .replace(/\s*\|\s*Mercado\s*Livre.*$/i, "")
      .replace(/\s*-\s*Mercado\s*Livre.*$/i, "")
      .replace(/&amp;/g, "&")
      .trim();

    if (!rawTitle) {
      const urlMatch = trimmedUrl.match(/MLB-?\d*-?([a-zA-Z0-9-]+)(?:-_JM|\?|$)/i);
      if (urlMatch && urlMatch[1]) {
        rawTitle = urlMatch[1]
          .split("-")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      } else {
        rawTitle = "Produto Mercado Livre Importado";
      }
    }

    // 5. Extração da Imagem em Alta Resolução
    let imageUrl: string | null = null;
    if (itemApi?.thumbnail) {
      imageUrl = obterImagemAltaResolucao(itemApi.thumbnail);
    } else if (itemApi?.pictures && itemApi.pictures.length > 0) {
      imageUrl = obterImagemAltaResolucao(itemApi.pictures[0]?.secure_url || itemApi.pictures[0]?.url);
    }

    if (!imageUrl) {
      const ogImageMatch =
        pdpHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        pdpHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

      if (ogImageMatch && ogImageMatch[1]) {
        imageUrl = obterImagemAltaResolucao(ogImageMatch[1].trim().replace(/&amp;/g, "&"));
      } else {
        const jsonLdImgMatch = pdpHtml.match(/"image":\s*"([^"]+)"/i) || html.match(/"image":\s*"([^"]+)"/i);
        if (jsonLdImgMatch && jsonLdImgMatch[1]) {
          imageUrl = obterImagemAltaResolucao(jsonLdImgMatch[1].replace(/\\u002F/g, "/"));
        } else {
          const mlstaticMatch = pdpHtml.match(/https:\/\/http2\.mlstatic\.com\/D_[^"'\s\)]+/i) || html.match(/https:\/\/http2\.mlstatic\.com\/D_[^"'\s\)]+/i);
          if (mlstaticMatch) {
            imageUrl = obterImagemAltaResolucao(mlstaticMatch[0].replace(/&amp;/g, "&"));
          }
        }
      }
    }

    if (imageUrl && imageUrl.startsWith("//")) {
      imageUrl = `https:${imageUrl}`;
    }

    // 6. Extração de Preços (Atual promocional, Original e Desconto)
    const { precoEstimado, precoAntigo, descontoPercentual } = extrairPrecosMercadoLivre(pdpHtml.includes("<tr") ? pdpHtml : html);

    let precoEstimadoFormatado = precoEstimado;
    if (!precoEstimadoFormatado && itemApi?.price && itemApi.price > 0) {
      precoEstimadoFormatado = formatBrl(itemApi.price);
    }

    let precoAntigoFormatado = precoAntigo;
    if (!precoAntigoFormatado && itemApi?.original_price && itemApi.original_price > (itemApi.price || 0)) {
      precoAntigoFormatado = formatBrl(itemApi.original_price);
    }

    // 7. Descrição Completa (plain_text da API oficial com fallback para HTML limpo)
    const descricaoHtmlLimpa = extrairDescricaoHtml(pdpHtml) || extrairDescricaoHtml(html);
    const descricaoCompleta = (descApi && descApi.trim()) ? descApi.trim() : (descricaoHtmlLimpa || "");

    // 8. Atributos Técnicos (mesclagem de attributes da API e da tabela HTML do produto)
    const tabelaAttrs = extrairTabelaEspecificacoesHtml(pdpHtml);
    const combinedAttrs: Record<string, string | undefined> = { ...tabelaAttrs };

    if (Array.isArray(itemApi?.attributes)) {
      for (const attr of itemApi.attributes) {
        if (!attr) continue;
        const val = (attr.value_name || (attr as any).value || "").trim();
        if (!val) continue;

        const idKey = (attr.id || "").toUpperCase().trim();
        const nameKey = (attr.name || "").trim();
        if (idKey) combinedAttrs[idKey] = val;
        if (nameKey) combinedAttrs[nameKey] = val;
      }
    }

    // Extração estruturada de aplicação e dados técnicos
    const { aplicacao, compatibility, dados_tecnicos } = extrairDadosDescricaoML(
      descricaoCompleta,
      combinedAttrs,
      rawTitle
    );

    // 1. Marca: prioridade máxima para atributo id 'BRAND' da API do Mercado Livre
    const brandAttrApi = Array.isArray(itemApi?.attributes)
      ? itemApi.attributes.find(
          (a: any) => (a?.id || "").toUpperCase().trim() === "BRAND" && (a?.value_name || a?.value)?.trim()
        )
      : null;
    const marcaFromApi = (brandAttrApi?.value_name || (brandAttrApi as any)?.value)?.trim();

    const marca =
      marcaFromApi ||
      combinedAttrs["BRAND"] ||
      combinedAttrs["MARCA"] ||
      combinedAttrs["Marca"] ||
      combinedAttrs["Fabricante"] ||
      (dados_tecnicos.marca && dados_tecnicos.marca !== "Auto Peças" ? dados_tecnicos.marca : null) ||
      (deduzirMarca(rawTitle) !== "Auto Peças" ? deduzirMarca(rawTitle) : null) ||
      "Auto Peças";

    // 2. Código do Fabricante: busca no array 'attributes' da API por 'PART_NUMBER', 'MPN' ou 'OEM'
    let codigoFromApi: string | null = null;
    if (Array.isArray(itemApi?.attributes)) {
      const partNumAttr = itemApi.attributes.find(
        (a: any) => (a?.id || "").toUpperCase().trim() === "PART_NUMBER" && (a?.value_name || a?.value)?.trim()
      );
      const mpnAttr = itemApi.attributes.find(
        (a: any) => (a?.id || "").toUpperCase().trim() === "MPN" && (a?.value_name || a?.value)?.trim()
      );
      const oemAttr = itemApi.attributes.find(
        (a: any) => (a?.id || "").toUpperCase().trim() === "OEM" && (a?.value_name || a?.value)?.trim()
      );

      codigoFromApi =
        (partNumAttr?.value_name || (partNumAttr as any)?.value)?.trim() ||
        (mpnAttr?.value_name || (mpnAttr as any)?.value)?.trim() ||
        (oemAttr?.value_name || (oemAttr as any)?.value)?.trim() ||
        null;
    }

    const modelo =
      dados_tecnicos.modelo ||
      combinedAttrs["MODEL"] ||
      combinedAttrs["MODELO"] ||
      undefined;

    const mpn =
      codigoFromApi ||
      dados_tecnicos.mpn ||
      combinedAttrs["MPN"] ||
      combinedAttrs["MANUFACTURER_PART_NUMBER"] ||
      combinedAttrs["PART_NUMBER"] ||
      combinedAttrs["CODIGO_DE_FABRICANTE"] ||
      combinedAttrs["CODIGO_FABRICANTE"];

    const numeroPeca =
      mpn ||
      dados_tecnicos.numero_peca ||
      combinedAttrs["NUMERO_DE_PECA"] ||
      combinedAttrs["NÚMERO DE PEÇA"] ||
      combinedAttrs["Número de peça"] ||
      combinedAttrs["PART_NUMBER"] ||
      combinedAttrs["PIECE_NUMBER"] ||
      dados_tecnicos.codigo_fabricante ||
      (deduzirCodigo(rawTitle, marca) !== "COD-ML" && !deduzirCodigo(rawTitle, marca).endsWith("-PEC")
        ? deduzirCodigo(rawTitle, marca)
        : null);

    const codigoFabricanteFinal = numeroPeca || (marca !== "Auto Peças" ? `${marca}-PEC` : "COD-ML");

    const oem =
      (codigoFromApi && combinedAttrs["OEM"]) ||
      dados_tecnicos.codigo_oem ||
      combinedAttrs["OEM"] ||
      combinedAttrs["OEM_PART_NUMBER"] ||
      combinedAttrs["CÓDIGO OEM"] ||
      combinedAttrs["CODIGO_OEM"] ||
      null;

    const lado =
      dados_tecnicos.lado ||
      combinedAttrs["SIDE"] ||
      combinedAttrs["LADO"] ||
      undefined;

    const posicao =
      dados_tecnicos.posicao ||
      combinedAttrs["POSITION"] ||
      combinedAttrs["POSIÇÃO"] ||
      combinedAttrs["POSICAO"] ||
      undefined;

    const categoria = deduzirCategoria(rawTitle);

    // Veículos compatíveis sintetizados
    let veiculos_compativeis = deduzirVeiculos(rawTitle);
    if (aplicacao.length > 0) {
      if (aplicacao.length === 1) {
        veiculos_compativeis = aplicacao[0].startsWith("Compatível") ? aplicacao[0] : `Compatível com ${aplicacao[0]}`;
      } else {
        veiculos_compativeis = `Compatível com ${aplicacao.slice(0, 4).join(" / ")}`;
      }
    }

    const busca_ml = `${marca} ${codigoFabricanteFinal}`.trim();

    // 9. Geração Automática da lista/array de 'palavras_chave' (keywords)
    const palavrasChave = gerarPalavrasChave({
      titulo: rawTitle,
      descricao: descricaoCompleta,
      marca,
      modelo,
      codigo_fabricante: codigoFabricanteFinal,
      codigo_oem: oem,
      aplicacao,
      categoria,
      atributos: combinedAttrs,
    });

    // 10. Geração de Slug semântico para SEO: [nome-da-peca]-[marca]-[modelo-carro]-[codigo-opcional]-[hash-unico]
    const slug = gerarSlugProduto({
      titulo: rawTitle,
      marca,
      modelo,
      veiculo: veiculos_compativeis,
      codigo: codigoFabricanteFinal,
      hash: Date.now().toString().slice(-4),
    });

    // 11. Gravação na Tabela produtos_afiliados do Supabase
    const supabase = getSupabaseClient();

    const dadosTecnicosCompletos = {
      ...dados_tecnicos,
      marca,
      modelo,
      mpn,
      numero_peca: numeroPeca,
      codigo_fabricante: codigoFabricanteFinal,
      codigo_oem: oem || undefined,
      lado,
      posicao,
      medidas: dados_tecnicos.medidas || dados_tecnicos.diametro,
      material: dados_tecnicos.material || dados_tecnicos.composicao,
      composicao: dados_tecnicos.composicao || dados_tecnicos.material,
    };

    const especificacoesJsonb = {
      ml_id: mlbId || undefined,
      link_afiliado: trimmedUrl,
      link_ml: trimmedUrl,
      link_destino: trimmedUrl,
      marca,
      modelo,
      mpn,
      numero_peca: numeroPeca,
      codigo_fabricante: codigoFabricanteFinal,
      codigo_oem: oem || undefined,
      lado,
      posicao,
      medidas: dadosTecnicosCompletos.medidas,
      composicao: dadosTecnicosCompletos.composicao,
      preco: precoEstimadoFormatado,
      preco_antigo: precoAntigoFormatado,
      desconto_percentual: descontoPercentual,
      aplicacao,
      compatibility,
      palavras_chave: palavrasChave,
      dados_tecnicos: dadosTecnicosCompletos,
      descricao_completa: descricaoCompleta || undefined,
      atributos_ml: combinedAttrs,
      ultima_sincronizacao: new Date().toISOString(),
    };

    const recordData: Record<string, unknown> = {
      titulo: rawTitle,
      slug,
      marca,
      codigo_fabricante: codigoFabricanteFinal,
      preco_estimado: precoEstimadoFormatado,
      imagem_url: imageUrl,
      busca_ml,
      categoria,
      veiculos_compativeis,
      codigo_oem: oem,
      descricao: descricaoCompleta || null,
      aplicacao: aplicacao,
      palavras_chave: palavrasChave,
      especificacoes: especificacoesJsonb,
      link_afiliado: trimmedUrl,
      preco_antigo: precoAntigoFormatado,
      desconto_percentual: descontoPercentual,
      updated_at: new Date().toISOString(),
    };

    // Tenta gravar com as colunas completas
    let insertResult = await supabase
      .from("produtos_afiliados")
      .upsert(recordData, { onConflict: "slug" })
      .select()
      .single();

    // Se houver restrição de tipo ou schema cache, faz tentativa adaptativa
    if (insertResult.error) {
      console.warn("Primeira tentativa de upsert no Supabase:", insertResult.error.message);

      // Tenta com aplicacao e palavras_chave como string se a coluna no banco for do tipo TEXT
      const recordAdaptativo = {
        ...recordData,
        aplicacao: Array.isArray(aplicacao) ? aplicacao.join("\n") : aplicacao,
        palavras_chave: Array.isArray(palavrasChave) ? palavrasChave.join(", ") : palavrasChave,
      };

      insertResult = await supabase
        .from("produtos_afiliados")
        .upsert(recordAdaptativo, { onConflict: "slug" })
        .select()
        .single();
    }

    // Se ainda houver erro de coluna inexistente, salva campos essenciais preservando tudo em 'especificacoes'
    if (insertResult.error) {
      const fallbackRecord: Record<string, unknown> = {
        titulo: rawTitle,
        slug,
        marca,
        codigo_fabricante: codigoFabricanteFinal,
        preco_estimado: precoEstimadoFormatado,
        imagem_url: imageUrl,
        busca_ml,
        categoria,
        veiculos_compativeis,
        codigo_oem: oem,
        descricao: descricaoCompleta || null,
        aplicacao: aplicacao,
        especificacoes: especificacoesJsonb,
        updated_at: new Date().toISOString(),
      };

      insertResult = await supabase
        .from("produtos_afiliados")
        .upsert(fallbackRecord, { onConflict: "slug" })
        .select()
        .single();
    }

    if (insertResult.error) {
      console.error("Erro ao gravar produto importado no Supabase:", insertResult.error);
      return NextResponse.json(
        {
          success: false,
          error: `Erro ao salvar no banco de dados: ${insertResult.error.message}`,
        },
        { status: 500 }
      );
    }

    const produtoRetornado = {
      ...insertResult.data,
      descricao: descricaoCompleta,
      aplicacao: aplicacao,
      palavras_chave: palavrasChave,
      codigo_fabricante: codigoFabricanteFinal,
      preco_antigo: (insertResult.data as Record<string, unknown>)?.preco_antigo || precoAntigoFormatado,
      desconto_percentual: (insertResult.data as Record<string, unknown>)?.desconto_percentual || descontoPercentual,
    };

    return NextResponse.json({
      success: true,
      produto: produtoRetornado,
      dadosExtraidos: {
        titulo: rawTitle,
        marca,
        modelo,
        codigo_fabricante: codigoFabricanteFinal,
        mpn,
        numero_peca: numeroPeca,
        codigo_oem: oem,
        lado,
        posicao,
        preco_estimado: precoEstimadoFormatado,
        preco_antigo: precoAntigoFormatado,
        desconto_percentual: descontoPercentual,
        imagem_url: imageUrl,
        categoria,
        slug,
        descricao: descricaoCompleta,
        aplicacao,
        palavras_chave: palavrasChave,
      },
    });
  } catch (error: unknown) {
    console.error("Erro interno ao importar produto do ML:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido ao importar link.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
