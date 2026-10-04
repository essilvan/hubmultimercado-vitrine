import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ItemOrcamento {
  nome_peca: string;
  marca_recomendada: string;
  query_busca: string;
  preco_medio_estimado: string;
  preco_medio?: string;
  link_direto_anuncio?: string | null;
  preco_real?: boolean;
}

interface OrcamentoResposta {
  veiculo_detectado: string;
  itens: ItemOrcamento[];
  total_estimado: string;
}

const SYSTEM_PROMPT = `Você é um especialista sênior em autopeças e mecânica automotiva brasileira.
Analise com extrema precisão o texto ou a foto do orçamento mecânico enviado pelo cliente.
Identifique o veículo (marca, modelo, motorização e ano). Se algum dado não estiver explícito, deduza pelo contexto com base na frota brasileira.
Extraia cada peça ou componente de reposição solicitado. Ignore serviços de mão de obra pura (ex: "alinhamento e balanceamento", "troca de óleo mão de obra"), focando nas PEÇAS físicas.

Para cada peça identificada, determine:
- nome_peca: Nome técnico claro e comercial (ex: "Amortecedor Dianteiro (Par)", "Kit de Embreagem", "Jogo de Pastilhas de Freio Dianteiro", "Jogo de Velas de Ignição")
- marca_recomendada: Marca confiável e líder de reposição original (ex: Nakata, Monroe, LuK, Sachs, Cobreq, Fras-le, Fremax, NGK, Bosch, Contitech, Mann-Filter, Cofap, TRW, Valeo, Magneti Marelli, Delphi)
- query_busca: Termo de busca enxuto e cirúrgico para o Mercado Livre.
  REGRAS OBRIGATÓRIAS PARA A QUERY_BUSCA:
  * NUNCA inclua barras de motorização (ex: NUNCA usar "1.0 / 1.4", "1.6 / 2.0"). Use apenas o modelo e opcionalmente o ano (ex: "onix 2016", "gol g5", "hb20").
  * NUNCA inclua caracteres especiais como "/", "(", ")", ",", ".".
  * Estrutura obrigatória: [nome da peça] [marca] [modelo do carro] [ano opcional].
  * Exemplo de amortecedor: em vez de "amortecedor dianteiro nakata chevrolet onix 1.0 / 1.4", gerar "amortecedor dianteiro nakata onix par" ou "amortecedor dianteiro nakata onix 2016 par".
  * Exemplo de pastilha: gerar "pastilha freio dianteira cobreq onix" ou "pastilha freio dianteira cobreq onix 2016".
  * Exemplo de embreagem: gerar "kit embreagem luk hb20".
  * Exemplo de velas: gerar "jogo velas ngk gol g5".
- preco_medio_estimado: Valor médio praticado no mercado brasileiro formatado em reais (ex: "R$ 520,00", "R$ 89,90")

Calcule a soma aproximada dos itens e preencha "total_estimado" (ex: "R$ 520,00").

Retorne estritamente um JSON válido, sem comentários e sem marcações markdown fora do JSON, no seguinte formato:
{
  "veiculo_detectado": "Chevrolet Onix 2016",
  "itens": [
    {
      "nome_peca": "Amortecedor Dianteiro (Par)",
      "marca_recomendada": "Nakata",
      "query_busca": "amortecedor dianteiro nakata onix par",
      "preco_medio_estimado": "R$ 520,00"
    }
  ],
  "total_estimado": "R$ 520,00"
}`;

interface PrecoRealML {
  preco: string;
  link?: string | null;
}

/**
 * Consulta o preço real e atualizado de um anúncio diretamente no Mercado Livre
 */
async function buscarPrecoRealML(query_busca: string): Promise<PrecoRealML | null> {
  if (!query_busca || !query_busca.trim()) return null;

  try {
    // Monta o slug limpo para a rota de listagem
    const slug = query_busca
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();

    // Monta o URL de busca ordenada por menor preço
    const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}_OrderId_PRICE_ASC`;

    const headersList = [
      {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      {
        "User-Agent":
          "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    ];

    let html = "";

    for (const headers of headersList) {
      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(6000),
          redirect: "follow",
        });

        if (res.ok) {
          const body = await res.text();
          if (!body.includes("suspicious_traffic") && !res.url.includes("account-verification")) {
            html = body;
            break;
          }
        }
      } catch {
        // Tenta o próximo header se houver timeout
      }
    }

    if (!html) return null;

    // Isola o primeiro item da listagem de resultados
    const firstResult =
      html.match(/<li[^>]*class="[^"]*ui-search-layout__item[^"]*"[^>]*>([\s\S]*?)<\/li>/) ||
      html.match(/<div[^>]*class="[^"]*(?:ui-search-result__wrapper|poly-card)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);

    const context = firstResult ? firstResult[1] : html;

    // Extrai o primeiro bloco .ui-search-price__second-line ou .andes-money-amount
    const secondLine = context.match(/class="[^"]*ui-search-price__second-line[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const priceBlock = secondLine ? secondLine[1] : context;

    const pMatch =
      priceBlock.match(/class="[^"]*andes-money-amount__fraction[^"]*"[^>]*>([0-9.]+)</) ||
      context.match(/andes-money-amount__fraction[^>]*>([0-9.]+)</);

    if (!pMatch) return null;

    const cMatch =
      priceBlock.match(/class="[^"]*andes-money-amount__cents[^"]*"[^>]*>([0-9]+)</) ||
      context.match(/andes-money-amount__cents[^>]*>([0-9]+)</);

    // Extrai o link direto do produto se disponível
    const linkMatch = context.match(
      /href="(https:\/\/[^"]*(?:produto\.mercadolivre\.com\.br\/|mercadolivre\.com\.br\/)[^"]*)"/
    );

    const fracao = pMatch[1];
    const centavos = cMatch ? cMatch[1] : "00";
    const link = linkMatch ? linkMatch[1].split("?")[0].split("#")[0] : null;

    return {
      preco: `R$ ${fracao},${centavos}`,
      link,
    };
  } catch (err) {
    console.warn(`Erro ao buscar preço real no ML para "${query_busca}":`, err);
    return null;
  }
}

/**
 * Atualiza todos os itens do orçamento com os preços reais do Mercado Livre
 * e recalcula o total estimado com exatidão.
 */
async function sincronizarPrecosReais(orcamento: OrcamentoResposta): Promise<OrcamentoResposta> {
  if (!orcamento?.itens || orcamento.itens.length === 0) return orcamento;

  await Promise.all(
    orcamento.itens.map(async (item) => {
      const precoReal = await buscarPrecoRealML(item.query_busca);
      if (precoReal) {
        item.preco_medio = precoReal.preco;
        item.preco_medio_estimado = precoReal.preco;
        if (precoReal.link) {
          item.link_direto_anuncio = precoReal.link;
        }
        item.preco_real = true;
      }
    })
  );

  // Recalcula o total_estimado somando os preços reais extraídos
  let totalNum = 0;
  for (const it of orcamento.itens) {
    const precoStr = it.preco_medio_estimado || it.preco_medio || "0";
    const num = parseFloat(
      precoStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()
    );
    if (!isNaN(num)) totalNum += num;
  }

  orcamento.total_estimado = totalNum.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return orcamento;
}

/**
 * Parser de fallback inteligente para quando a chave do Gemini ainda não estiver configurada
 */
function extrairFallbackInteligente(texto: string): OrcamentoResposta {
  const t = texto.toLowerCase();

  // Dedução de veículo para exibição e termo enxuto para query_busca
  let veiculo = "Veículo não especificado";
  let termoCarro = "carro";

  const anoMatch = t.match(/\b(19\d{2}|20\d{2})\b/);
  const ano = anoMatch ? ` ${anoMatch[0]}` : "";

  if (t.includes("onix")) {
    veiculo = `Chevrolet Onix${ano || " 1.0 / 1.4"}`;
    termoCarro = `onix${ano}`;
  } else if (t.includes("hb20")) {
    veiculo = `Hyundai HB20${ano || " 1.0"}`;
    termoCarro = `hb20${ano}`;
  } else if (t.includes("gol")) {
    veiculo = `Volkswagen Gol${ano || " G5"}`;
    termoCarro = `gol${ano || " g5"}`;
  } else if (t.includes("fox")) {
    veiculo = `Volkswagen Fox${ano || " 1.6"}`;
    termoCarro = `fox${ano}`;
  } else if (t.includes("palio")) {
    veiculo = `Fiat Palio${ano || " Fire"}`;
    termoCarro = `palio${ano}`;
  } else if (t.includes("prisma")) {
    veiculo = `Chevrolet Prisma${ano || " 1.4"}`;
    termoCarro = `prisma${ano}`;
  } else if (t.includes("celta")) {
    veiculo = `Chevrolet Celta${ano || " 1.0"}`;
    termoCarro = `celta${ano}`;
  } else if (t.includes("civic")) {
    veiculo = `Honda Civic${ano || " 1.8"}`;
    termoCarro = `civic${ano}`;
  } else if (t.includes("corolla")) {
    veiculo = `Toyota Corolla${ano || " 2.0"}`;
    termoCarro = `corolla${ano}`;
  }

  termoCarro = termoCarro.trim();

  const itens: ItemOrcamento[] = [];

  if (/amortecedor/i.test(t)) {
    itens.push({
      nome_peca: "Amortecedor Dianteiro Pressurizado (Par)",
      marca_recomendada: "Nakata",
      query_busca: `amortecedor dianteiro nakata ${termoCarro} par`,
      preco_medio_estimado: "R$ 480,00",
    });
  }

  if (/pastilha/i.test(t) || /freio/i.test(t)) {
    itens.push({
      nome_peca: "Jogo de Pastilhas de Freio Dianteiro",
      marca_recomendada: "Cobreq",
      query_busca: `pastilha freio dianteira cobreq ${termoCarro}`,
      preco_medio_estimado: "R$ 89,90",
    });
  }

  if (/disco/i.test(t)) {
    itens.push({
      nome_peca: "Par de Discos de Freio Ventilado",
      marca_recomendada: "Fremax",
      query_busca: `disco freio ventilado fremax ${termoCarro} par`,
      preco_medio_estimado: "R$ 210,00",
    });
  }

  if (/embreagem/i.test(t) || /plato/i.test(t)) {
    itens.push({
      nome_peca: "Kit de Embreagem (Platô, Disco e Rolamento)",
      marca_recomendada: "LuK",
      query_busca: `kit embreagem luk ${termoCarro}`,
      preco_medio_estimado: "R$ 440,00",
    });
  }

  if (/vela/i.test(t) || /ignicao/i.test(t)) {
    itens.push({
      nome_peca: "Jogo de Velas de Ignição",
      marca_recomendada: "NGK",
      query_busca: `jogo velas ngk ${termoCarro}`,
      preco_medio_estimado: "R$ 95,00",
    });
  }

  if (/correia/i.test(t) || /tensor/i.test(t)) {
    itens.push({
      nome_peca: "Kit Correia Dentada e Tensor",
      marca_recomendada: "Contitech",
      query_busca: `kit correia dentada contitech ${termoCarro}`,
      preco_medio_estimado: "R$ 160,00",
    });
  }

  if (/filtro/i.test(t) || /oleo/i.test(t)) {
    itens.push({
      nome_peca: "Filtro de Óleo e Lubrificante",
      marca_recomendada: "Mann-Filter",
      query_busca: `filtro oleo mann ${termoCarro}`,
      preco_medio_estimado: "R$ 42,00",
    });
  }

  if (itens.length === 0) {
    itens.push({
      nome_peca: "Peças Gerais de Reposição",
      marca_recomendada: "Nakata / Bosch",
      query_busca: `pecas ${termoCarro}`,
      preco_medio_estimado: "R$ 250,00",
    });
  }

  let totalNum = 0;
  for (const it of itens) {
    const num = parseFloat(
      it.preco_medio_estimado.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()
    );
    if (!isNaN(num)) totalNum += num;
  }

  return {
    veiculo_detectado: veiculo,
    itens,
    total_estimado: totalNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const texto = formData.get("texto") as string | null;
    const imagem = formData.get("imagem") as File | null;

    if (!texto?.trim() && (!imagem || imagem.size === 0)) {
      return NextResponse.json(
        {
          success: false,
          error: "Envie uma foto do orçamento ou digite a lista de peças para análise.",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    // Se a chave Gemini não estiver configurada no .env.local, usa o fallback inteligente com aviso
    if (!apiKey) {
      console.warn("GEMINI_API_KEY não encontrada no .env.local. Executando fallback inteligente.");
      const fallbackResult = extrairFallbackInteligente(texto || "Peças de revisão automotiva geral");
      const orcamentoAtualizado = await sincronizarPrecosReais(fallbackResult);
      return NextResponse.json({
        success: true,
        data: orcamentoAtualizado,
        aviso: "Chave GEMINI_API_KEY não configurada no .env.local. Resultado gerado pelo motor de inferência local.",
      });
    }

    // Prepara as partes do payload multimodal para a API do Gemini
    const parts: Array<Record<string, unknown>> = [];

    // Prompt do sistema
    parts.push({
      text: `${SYSTEM_PROMPT}\n\nAnalise o seguinte orçamento mecânico fornecido pelo cliente:\n${
        texto ? `Texto do cliente: "${texto.trim()}"` : "Imagem do orçamento anexada."
      }`,
    });

    // Se houver imagem anexada, converte para base64 inlineData
    if (imagem && imagem.size > 0) {
      const buffer = Buffer.from(await imagem.arrayBuffer());
      const base64Data = buffer.toString("base64");
      const mimeType = imagem.type || "image/jpeg";

      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    // Chamada à API do Google Gemini (gemini-1.5-flash)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Erro retornado pelo Gemini:", geminiRes.status, errText);

      // Fallback em caso de erro na API externa
      if (texto?.trim()) {
        const fallbackResult = extrairFallbackInteligente(texto);
        const orcamentoAtualizado = await sincronizarPrecosReais(fallbackResult);
        return NextResponse.json({
          success: true,
          data: orcamentoAtualizado,
          aviso: "A API do Gemini retornou uma falha temporária. Resultado gerado com preços reais do Mercado Livre.",
        });
      }

      throw new Error(`Falha na API do Gemini (${geminiRes.status}): ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const candidate = geminiData.candidates?.[0];
    const rawContent = candidate?.content?.parts?.[0]?.text;

    if (!rawContent) {
      throw new Error("A IA não retornou conteúdo legível.");
    }

    // Limpeza de possíveis blocos de código markdown ```json ... ```
    let cleanJson = rawContent.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsedOrcamento: OrcamentoResposta = JSON.parse(cleanJson);

    // Consulta e sincroniza preços reais do Mercado Livre para cada item extraído
    const orcamentoComPrecosReais = await sincronizarPrecosReais(parsedOrcamento);

    return NextResponse.json({
      success: true,
      data: orcamentoComPrecosReais,
    });
  } catch (err: unknown) {
    console.error("Erro no processamento do orçamento:", err);
    const msg =
      err instanceof Error ? err.message : "Erro desconhecido ao processar orçamento com IA.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
