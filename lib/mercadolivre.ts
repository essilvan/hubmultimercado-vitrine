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

export interface ProdutoMLExtraido {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  thumbnail: string;
  pictures: string[];
  permalink: string;
  linkAfiliado: string;
  attributes: {
    marca?: string;
    modelo?: string;
    numero_peca?: string;
    oem?: string;
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
    especificacoes: {
      ml_id: string;
      link_ml: string;
      link_afiliado: string;
      link_destino: string;
      marca: string;
      preco: string;
      preco_antigo?: string | null;
      desconto_percentual?: string | null;
      atributos_ml?: Record<string, string | undefined>;
      ultima_sincronizacao?: string;
    };
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
 * Consulta a API do Mercado Livre buscando pelo menor preço real com entrega Full
 * @param query Código ou descrição da peça (ex: "SYL 1092" ou "LUK 620 3268 00 HB20")
 */
export async function buscarProdutoML(query: string): Promise<ProdutoMLExtraido | null> {
  const queryLimpa = query.trim();
  if (!queryLimpa) return null;

  // 1. Consulta à API Oficial do Mercado Livre com ordenação por menor preço e Full
  try {
    const apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(
      queryLimpa
    )}&shipping_highlighted=fulfillment&sort=price_asc&limit=5`;

    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const json = await res.json();
      const results: MLSearchResultItem[] = json.results || [];

      // Seleciona o item com menor preço real válido (> 0) e permalink
      const itensValidos = results.filter((it) => it && it.price > 0 && it.permalink);
      const itemEscolhido = itensValidos[0];

      if (itemEscolhido) {
        return processarItemML(itemEscolhido, queryLimpa);
      }
    }
  } catch (err) {
    console.warn("Aviso na chamada direta da API do Mercado Livre:", err);
  }

  // 2. Fallback de Segurança Inteligente com ordenação por menor preço e Full
  try {
    const fallbackSlug = gerarSlug(queryLimpa);

    // Tenta primeiro filtrar por Envio Full e Menor Preço (_OrderId_PRICE_ASC_Envio_Full)
    let searchUrl = `https://lista.mercadolivre.com.br/${fallbackSlug}_OrderId_PRICE_ASC_Envio_Full`;
    let htmlRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    let html = htmlRes.ok ? await htmlRes.text() : "";
    let allHrefs = [...html.matchAll(/href=["'](https:\/\/[^"']*(?:mercadolivre\.com\.br\/[^\/]+\/up\/MLBU|produto\.mercadolivre\.com\.br\/MLB-|mercadolivre\.com\.br\/p\/MLB)[^"']*)["']/gi)].map(m => m[1]);

    // Se o filtro estrito de Full não tiver produtos, busca ordenado por menor preço
    if (allHrefs.length === 0) {
      searchUrl = `https://lista.mercadolivre.com.br/${fallbackSlug}_OrderId_PRICE_ASC`;
      htmlRes = await fetch(searchUrl, {
        headers: {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });
      if (htmlRes.ok) {
        html = await htmlRes.text();
        allHrefs = [...html.matchAll(/href=["'](https:\/\/[^"']*(?:mercadolivre\.com\.br\/[^\/]+\/up\/MLBU|produto\.mercadolivre\.com\.br\/MLB-|mercadolivre\.com\.br\/p\/MLB)[^"']*)["']/gi)].map(m => m[1]);
      }
    }

    if (allHrefs.length > 0) {
      const cleanProductUrl = allHrefs[0].split("#")[0].split("?")[0];
      const idMatch = cleanProductUrl.match(/MLB-?(\d+)/i) || cleanProductUrl.match(/MLBU-?(\d+)/i);
      const mlbId = idMatch ? `MLB${idMatch[1]}` : "MLB-PRODUTO";

      let title = queryLimpa;
      let highResImg = "";
      let priceNum = 0;
      let originalPriceNum: number | null = null;
      let brandFound: string | null = null;

      try {
        const prodRes = await fetch(cleanProductUrl, {
          headers: {
            "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          },
        });

        if (prodRes.ok) {
          const prodHtml = await prodRes.text();

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

      return processarItemML(fallbackItem, queryLimpa);
    }
  } catch (fallbackErr) {
    console.error("Erro no fallback de busca do Mercado Livre:", fallbackErr);
  }

  return null;
}

/**
 * Processa e estrutura o item da API do Mercado Livre
 */
function processarItemML(item: MLSearchResultItem, queryOriginal: string): ProdutoMLExtraido {
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

  // Extração de atributos específicos (Marca, Modelo, Número de Peça, OEM)
  const attrs: Record<string, string | undefined> = {};
  if (Array.isArray(item.attributes)) {
    for (const attr of item.attributes) {
      if (!attr.value_name) continue;
      const key = attr.id ? attr.id.toUpperCase() : attr.name.toUpperCase();
      attrs[key] = attr.value_name;
    }
  }

  // Extração da Marca com prioridade absoluta para BRAND dos atributos do anúncio
  const attrMarca = item.attributes?.find(
    (a: any) => a.id === "BRAND" || a.name?.toLowerCase() === "marca"
  )?.value_name;

  let marca = attrMarca ? attrMarca.trim() : null;
  if (!marca) {
    marca = deduzirMarca(queryOriginal) || deduzirMarca(item.title) || "Auto Peças";
  }

  const numeroPeca =
    attrs["PART_NUMBER"] ||
    attrs["NUMERO_DE_PECA"] ||
    attrs["CODIGO_DE_FABRICANTE"] ||
    deduzirCodigo(item.title, marca);

  const oem = attrs["OEM"] || attrs["CODIGO_OEM"] || null;
  const modelo = attrs["MODEL"] || attrs["MODELO"] || undefined;

  // 1. Preço atual de venda: item.price (ex: 31.92). Formate sempre com duas casas decimais: "R$ 31,92"
  const precoNumerico = Number(item.price) || 0;
  const precoFormatado = precoNumerico > 0 ? formatarPrecoBRL(precoNumerico) : "";

  // 2. Preço antigo/original: item.original_price. Se existir e for maior que item.price, formate como "R$ 39,90"
  const precoOriginalNumerico =
    item.original_price && Number(item.original_price) > precoNumerico
      ? Number(item.original_price)
      : null;

  const precoOriginalFormatado = precoOriginalNumerico
    ? formatarPrecoBRL(precoOriginalNumerico)
    : null;

  // 3. Desconto percentual: Se houver 'original_price', calcule:
  // const desconto = Math.round(((item.original_price - item.price) / item.original_price) * 100);
  // desconto_percentual = `${desconto}% OFF`;
  let descontoPercentual: string | null = null;
  if (precoOriginalNumerico && precoOriginalNumerico > precoNumerico) {
    const desconto = Math.round(((precoOriginalNumerico - precoNumerico) / precoOriginalNumerico) * 100);
    if (desconto > 0) {
      descontoPercentual = `${desconto}% OFF`;
    }
  }

  const categoria = deduzirCategoria(item.title);
  const veiculos = deduzirVeiculos(item.title);
  const slug = gerarSlug(item.title) || `peca-${item.id.toLowerCase()}`;

  return {
    id: item.id,
    title: item.title,
    price: precoNumerico,
    original_price: precoOriginalNumerico,
    thumbnail: thumbnail,
    pictures: pictures,
    permalink: permalink,
    linkAfiliado: linkAfiliado,
    attributes: {
      marca,
      modelo,
      numero_peca: numeroPeca,
      oem: oem || undefined,
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
      preco: precoFormatado, // "R$ 31,92"
      preco_estimado: precoFormatado, // "R$ 31,92"
      preco_antigo: precoOriginalFormatado, // "R$ 39,90" ou null
      desconto_percentual: descontoPercentual, // "20% OFF" ou null
      imagem_url: thumbnail,
      link_afiliado: linkAfiliado,
      especificacoes: {
        ml_id: item.id,
        link_ml: permalink,
        link_afiliado: linkAfiliado,
        link_destino: linkAfiliado,
        marca: marca,
        preco: precoFormatado,
        preco_antigo: precoOriginalFormatado,
        desconto_percentual: descontoPercentual,
        atributos_ml: attrs,
        ultima_sincronizacao: new Date().toISOString(),
      },
    },
  };
}
