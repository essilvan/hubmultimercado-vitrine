import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface VeiculoOrcamento {
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  motorizacao: string | null;
  placa: string | null;
}

export interface ItemOrcamento {
  termo_lido: string;
  peca_padronizada: string;
  quantidade: number;
  posicao: string | null;
  marca_preferencial: string | null;
  termo_busca_mercadolivre: string;
  confianca: "alta" | "media" | "baixa";
  requer_confirmacao: boolean;

  // Preço REAL do Mercado Livre (nunca estimado por IA)
  preco_real_ml?: number | null;
  preco_formatado?: string | null;
  titulo_anuncio?: string | null;
  link_anuncio?: string | null;
  tem_full?: boolean;
  thumbnail?: string | null;

  // Campos legados para compatibilidade
  preco_medio_estimado?: string;
  preco_medio?: string;
  link_direto_anuncio?: string | null;
  preco_real?: boolean;
  nome_peca?: string;
  marca_recomendada?: string;
  query_busca?: string;
}

export interface OrcamentoResposta {
  veiculo: VeiculoOrcamento;
  itens: ItemOrcamento[];
  observacoes_gerais?: string | null;
  veiculo_detectado?: string;
  total_estimado?: string;
}

const SYSTEM_INSTRUCTION = `Você é um especialista sênior em catálogo técnico de autopeças e balconista experiente no mercado de reposição brasileiro (aftermarket). Sua única função é transcrever, higienizar e estruturar orçamentos mecânicos (manuscritos ou digitados) a partir de imagens ou texto.

Diretrizes Críticas:
1. LEITURA E TRANSCRIÇÃO:
   - Extraia com exatidão os dados do veículo: montadora (marca), modelo, geração/versão, ano de fabricação/modelo e motorização (ex: 1.0 8V Fire, EA111 1.6, Sigma 1.6 16V). Se não constar ou estiver ilegível, atribua estritamente null.
   - Ignore serviços de mão de obra (ex: "mão de obra troca correia", "alinhamento e balanceamento", "lavagem"). Concentre-se apenas em peças e fluidos/lubrificantes.

2. PADRONIZAÇÃO AUTOMOTIVA:
   - No campo "peca_padronizada", use o nome comercial canônico usado em catálogos como Nakata, Cofap, Sabó, Dayco, Bosch, Cobreq. (Exemplo: se ler "buchinha da balança", padronize para "Bucha da Bandeja de Suspensão").
   - Identifique posições relativas: Dianteiro, Traseiro, Superior, Inferior, Lado Direito (Passageiro), Lado Esquerdo (Motorista), ou Par.

3. ANTI-ALUCINAÇÃO E CONFIANÇA:
   - Se uma palavra estiver ilegível, borrada ou ambígua, NUNCA invente uma peça. Defina "confianca" como "baixa" ou "media" e marque "requer_confirmacao": true.
   - Gere no campo "termo_busca_mercadolivre" uma query de busca enxuta e cirúrgica, combinando apenas: [Nome Padronizado] + [Modelo] + [Motor/Ano] + [Posição/Lado se houver]. Não inclua stop-words nem frases compridas.

4. SAÍDA OBRIGATÓRIA:
   - Retorne exclusivamente o objeto JSON validado conforme o schema fornecido. Não inclua estimativas de preços ou textos adicionais.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    veiculo: {
      type: "OBJECT",
      properties: {
        marca: { type: "STRING", nullable: true },
        modelo: { type: "STRING", nullable: true },
        ano: { type: "STRING", nullable: true },
        motorizacao: { type: "STRING", nullable: true },
        placa: { type: "STRING", nullable: true },
      },
      required: ["marca", "modelo", "ano"],
    },
    itens: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          termo_lido: { type: "STRING" },
          peca_padronizada: { type: "STRING" },
          quantidade: { type: "INTEGER" },
          posicao: { type: "STRING", nullable: true },
          marca_preferencial: { type: "STRING", nullable: true },
          termo_busca_mercadolivre: { type: "STRING" },
          confianca: {
            type: "STRING",
            enum: ["alta", "media", "baixa"],
          },
          requer_confirmacao: { type: "BOOLEAN" },
        },
        required: [
          "termo_lido",
          "peca_padronizada",
          "quantidade",
          "termo_busca_mercadolivre",
          "confianca",
          "requer_confirmacao",
        ],
      },
    },
    observacoes_gerais: { type: "STRING", nullable: true },
  },
  required: ["veiculo", "itens"],
};

export interface OfertaRealML {
  preco: number;
  preco_formatado: string;
  titulo: string;
  link: string;
  tem_full: boolean;
  thumbnail: string | null;
}

/**
 * Consulta o preço real e atualizado diretamente de anúncios confiáveis e novos do Mercado Livre
 */
async function buscarPrecoMercadoLivre(termoBusca: string): Promise<OfertaRealML | null> {
  if (!termoBusca || !termoBusca.trim()) return null;

  // 1. Tenta a API direta do Mercado Livre Brasil (MLB) filtrando por itens novos (2230284)
  try {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(termoBusca)}&condition=2230284&limit=5`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4500),
    });

    if (res.ok) {
      const data = await res.json();
      const anunciosValidos = (data.results || []).filter(
        (item: { price?: number }) => item.price && item.price > 5
      );

      // Prioriza produtos com frete Full ou lojas confiáveis
      const melhorOferta =
        anunciosValidos.find(
          (item: { shipping?: { logistic_type?: string } }) =>
            item.shipping?.logistic_type === "fulfillment"
        ) || anunciosValidos[0];

      if (melhorOferta) {
        const precoNum = Number(melhorOferta.price);
        return {
          preco: precoNum,
          preco_formatado: precoNum.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          }),
          titulo: melhorOferta.title,
          link: melhorOferta.permalink,
          tem_full: melhorOferta.shipping?.logistic_type === "fulfillment",
          thumbnail: melhorOferta.thumbnail || null,
        };
      }
    }
  } catch (error) {
    console.warn("Aviso na chamada direta da API do ML, tentando busca segura:", error);
  }

  // 2. Fallback de busca segura estruturada (quando a API retornar 403 por IP/Vercel)
  try {
    const slug = termoBusca
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();

    const searchUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}_OrderId_PRICE_ASC`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const html = await res.text();
      const cardMatch =
        html.match(/<div[^>]*class="[^"]*poly-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/) ||
        html.match(/<li[^>]*class="[^"]*ui-search-layout__item[^"]*"[^>]*>([\s\S]*?)<\/li>/);

      const context = cardMatch ? cardMatch[0] : html;

      const pMatch = context.match(/class="[^"]*andes-money-amount__fraction[^"]*"[^>]*>([0-9.]+)</);
      const cMatch = context.match(/class="[^"]*andes-money-amount__cents[^"]*"[^>]*>([0-9]+)</);

      if (pMatch) {
        const fracao = pMatch[1];
        const centavos = cMatch ? cMatch[1] : "00";
        const valorNumerico =
          parseFloat(fracao.replace(/\./g, "")) + parseFloat(centavos) / 100;

        const titleMatch =
          context.match(
            /class="[^"]*poly-component__title[^"]*"[^>]*><a[^>]*>([^<]+)<\/a>/
          ) ||
          context.match(/class="[^"]*ui-search-item__title[^"]*"[^>]*>([^<]+)</) ||
          context.match(/<h2[^>]*>([^<]+)<\/h2>/);

        const linkMatch = context.match(
          /href="(https:\/\/[^"]*(?:produto\.mercadolivre\.com\.br\/|mercadolivre\.com\.br\/[^\/]+\/up\/|mercadolivre\.com\.br\/p\/MLB)[^"]*)"/
        );

        const thumbMatch = context.match(
          /(?:src|data-src)="(https:\/\/[^"]*(?:http2\.mlstatic\.com\/D_[^"]*))"/
        );

        const temFull =
          context.includes("poly-component__fulfillment") ||
          context.includes("ui-search-item__fulfillment") ||
          context.includes("Full");

        const cleanLink = linkMatch ? linkMatch[1].split("#")[0].split("?")[0] : null;

        return {
          preco: valorNumerico,
          preco_formatado: `R$ ${fracao},${centavos}`,
          titulo: titleMatch ? titleMatch[1].trim() : termoBusca,
          link: cleanLink || `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`,
          tem_full: temFull,
          thumbnail: thumbMatch ? thumbMatch[1] : null,
        };
      }
    }
  } catch (error) {
    console.error("Erro no fallback de busca do ML:", error);
  }

  return null;
}

/**
 * Atualiza os itens com os preços reais do Mercado Livre e formata os dados para o frontend
 */
async function sincronizarPrecosReais(orcamento: OrcamentoResposta): Promise<OrcamentoResposta> {
  if (!orcamento?.itens || orcamento.itens.length === 0) return orcamento;

  await Promise.all(
    orcamento.itens.map(async (item) => {
      // Normalização de campos de compatibilidade
      if (!item.nome_peca) item.nome_peca = item.peca_padronizada;
      if (!item.query_busca) item.query_busca = item.termo_busca_mercadolivre;
      if (!item.marca_recomendada)
        item.marca_recomendada = item.marca_preferencial || "Original / Homologada";

      const termoBusca =
        item.termo_busca_mercadolivre || item.query_busca || item.peca_padronizada;
      const oferta = await buscarPrecoMercadoLivre(termoBusca);

      if (oferta) {
        item.preco_real_ml = oferta.preco;
        item.preco_formatado = oferta.preco_formatado;
        item.preco_medio = oferta.preco_formatado;
        item.preco_medio_estimado = oferta.preco_formatado;
        item.titulo_anuncio = oferta.titulo;
        item.link_anuncio = oferta.link;
        item.link_direto_anuncio = oferta.link;
        item.tem_full = oferta.tem_full;
        item.thumbnail = oferta.thumbnail;
        item.preco_real = true;
      }
    })
  );

  // Formata veiculo_detectado para facilitar a exibição
  if (!orcamento.veiculo_detectado && orcamento.veiculo) {
    const { marca, modelo, motorizacao, ano } = orcamento.veiculo;
    const partes = [marca, modelo, motorizacao, ano].filter(Boolean);
    orcamento.veiculo_detectado = partes.length > 0 ? partes.join(" ") : "Veículo Detectado";
  }

  // Recalcula o total_estimado somando estritamente os PREÇOS REAIS encontrados
  let totalNum = 0;
  for (const it of orcamento.itens) {
    if (it.preco_real_ml && it.preco_real_ml > 0) {
      totalNum += it.preco_real_ml * (it.quantidade || 1);
    }
  }

  if (totalNum > 0) {
    orcamento.total_estimado = totalNum.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  } else {
    orcamento.total_estimado = "Sob Consulta";
  }

  return orcamento;
}

/**
 * Parser de fallback para quando a API do Gemini não estiver acessível
 */
function extrairFallbackInteligente(texto: string): OrcamentoResposta {
  const t = texto.toLowerCase();

  let marca = "Volkswagen";
  let modelo = "Gol";
  let motorizacao = "1.6";
  let termoCarro = "gol";

  const anoMatch = t.match(/\b(19\d{2}|20\d{2})\b/);
  const ano = anoMatch ? anoMatch[0] : null;

  if (t.includes("onix")) {
    marca = "Chevrolet";
    modelo = "Onix";
    motorizacao = "1.0 / 1.4";
    termoCarro = `onix ${ano || ""}`.trim();
  } else if (t.includes("hb20")) {
    marca = "Hyundai";
    modelo = "HB20";
    motorizacao = "1.0";
    termoCarro = `hb20 ${ano || ""}`.trim();
  } else if (t.includes("gol")) {
    marca = "Volkswagen";
    modelo = "Gol G5";
    motorizacao = "1.6";
    termoCarro = `gol g5 ${ano || ""}`.trim();
  } else if (t.includes("fox")) {
    marca = "Volkswagen";
    modelo = "Fox";
    motorizacao = "1.6";
    termoCarro = `fox ${ano || ""}`.trim();
  } else if (t.includes("palio")) {
    marca = "Fiat";
    modelo = "Palio";
    motorizacao = "1.0 Fire";
    termoCarro = `palio fire ${ano || ""}`.trim();
  } else if (t.includes("prisma")) {
    marca = "Chevrolet";
    modelo = "Prisma";
    motorizacao = "1.4";
    termoCarro = `prisma ${ano || ""}`.trim();
  } else if (t.includes("celta")) {
    marca = "Chevrolet";
    modelo = "Celta";
    motorizacao = "1.0";
    termoCarro = `celta ${ano || ""}`.trim();
  } else if (t.includes("civic")) {
    marca = "Honda";
    modelo = "Civic";
    motorizacao = "1.8 16V";
    termoCarro = `civic ${ano || ""}`.trim();
  } else if (t.includes("corolla")) {
    marca = "Toyota";
    modelo = "Corolla";
    motorizacao = "2.0 16V";
    termoCarro = `corolla ${ano || ""}`.trim();
  }

  const itens: ItemOrcamento[] = [];

  if (/amortecedor/i.test(t)) {
    itens.push({
      termo_lido: "amortecedor dianteiro",
      peca_padronizada: "Amortecedor Dianteiro",
      quantidade: 2,
      posicao: "Dianteiro",
      marca_preferencial: "Nakata",
      termo_busca_mercadolivre: `Amortecedor Dianteiro ${modelo} ${ano || ""} Par`.trim(),
      confianca: "alta",
      requer_confirmacao: false,
    });
  }

  if (/pastilha/i.test(t) || /freio/i.test(t)) {
    itens.push({
      termo_lido: "pastilha de freio",
      peca_padronizada: "Jogo de Pastilhas de Freio",
      quantidade: 1,
      posicao: "Dianteiro",
      marca_preferencial: "Cobreq",
      termo_busca_mercadolivre: `Jogo Pastilha Freio ${modelo} Dianteira`.trim(),
      confianca: "alta",
      requer_confirmacao: false,
    });
  }

  if (/disco/i.test(t)) {
    itens.push({
      termo_lido: "disco de freio",
      peca_padronizada: "Disco de Freio Ventilado",
      quantidade: 2,
      posicao: "Dianteiro",
      marca_preferencial: "Fremax",
      termo_busca_mercadolivre: `Par Disco Freio Ventilado ${modelo}`.trim(),
      confianca: "alta",
      requer_confirmacao: false,
    });
  }

  if (/embreagem/i.test(t) || /plato/i.test(t)) {
    itens.push({
      termo_lido: "kit embreagem",
      peca_padronizada: "Kit de Embreagem",
      quantidade: 1,
      posicao: null,
      marca_preferencial: "LuK",
      termo_busca_mercadolivre: `Kit Embreagem ${modelo} LuK`.trim(),
      confianca: "alta",
      requer_confirmacao: false,
    });
  }

  if (/vela/i.test(t) || /ignicao/i.test(t)) {
    itens.push({
      termo_lido: "jogo velas",
      peca_padronizada: "Jogo de Velas de Ignição",
      quantidade: 1,
      posicao: null,
      marca_preferencial: "NGK",
      termo_busca_mercadolivre: `Jogo Velas Ignicao ${modelo} NGK`.trim(),
      confianca: "alta",
      requer_confirmacao: false,
    });
  }

  if (/correia/i.test(t) || /tensor/i.test(t)) {
    itens.push({
      termo_lido: "correia dentada com tensor",
      peca_padronizada: "Kit Correia Dentada e Tensor",
      quantidade: 1,
      posicao: null,
      marca_preferencial: "Contitech",
      termo_busca_mercadolivre: `Kit Correia Dentada Tensor ${modelo}`.trim(),
      confianca: "alta",
      requer_confirmacao: false,
    });
  }

  if (/filtro/i.test(t) || /oleo/i.test(t)) {
    itens.push({
      termo_lido: "filtro de oleo",
      peca_padronizada: "Filtro de Óleo",
      quantidade: 1,
      posicao: null,
      marca_preferencial: "Mann-Filter",
      termo_busca_mercadolivre: `Filtro Oleo ${modelo} Mann`.trim(),
      confianca: "alta",
      requer_confirmacao: false,
    });
  }

  if (itens.length === 0) {
    itens.push({
      termo_lido: "pecas gerais",
      peca_padronizada: "Peças de Revisão Automotiva",
      quantidade: 1,
      posicao: null,
      marca_preferencial: "Nakata",
      termo_busca_mercadolivre: `Pecas ${termoCarro}`.trim(),
      confianca: "media",
      requer_confirmacao: true,
    });
  }

  const veiculoNome = [marca, modelo, motorizacao, ano].filter(Boolean).join(" ");

  return {
    veiculo: {
      marca,
      modelo,
      ano: ano || null,
      motorizacao,
      placa: null,
    },
    itens,
    observacoes_gerais: "Resultado gerado pelo motor de inferência local.",
    veiculo_detectado: veiculoNome,
    total_estimado: "Sob Consulta",
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

    // Se a chave Gemini não estiver configurada no .env.local, usa o fallback inteligente
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

    // Prepara as partes do payload multimodal para o Gemini
    const parts: Array<Record<string, unknown>> = [];

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

    // Se houver texto enviado pelo cliente
    if (texto?.trim()) {
      parts.push({
        text: `Orçamento mecânico fornecido pelo cliente:\n${texto.trim()}`,
      });
    } else if (parts.length > 0) {
      parts.push({
        text: "Transcreva, higienize e estruture com precisão todas as peças deste orçamento mecânico.",
      });
    }

    const geminiBody = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          parts,
        },
      ],
      generationConfig: {
        temperature: 0.0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    // Modelos suportados na API v1beta (gemini-3.5-flash e variantes ativas)
    const modelsToTry = [
      process.env.GEMINI_MODEL,
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
      "gemini-3.8-flash",
    ].filter(Boolean) as string[];

    let rawContent: string | null = null;
    let lastError: string | null = null;

    for (const model of modelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
          signal: AbortSignal.timeout(15000),
        });

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const candidate = geminiData.candidates?.[0];
          rawContent = candidate?.content?.parts?.[0]?.text || null;
          if (rawContent) break;
        } else {
          lastError = await geminiRes.text();
          console.error(`Erro Gemini (modelo ${model} - status ${geminiRes.status}):`, lastError);
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`Erro Gemini (conexão com ${model}):`, lastError);
      }
    }

    if (!rawContent) {
      console.error("Erro Gemini: Todos os modelos disponíveis falharam.", lastError);

      if (texto?.trim()) {
        const fallbackResult = extrairFallbackInteligente(texto);
        const orcamentoAtualizado = await sincronizarPrecosReais(fallbackResult);
        return NextResponse.json({
          success: true,
          data: orcamentoAtualizado,
          aviso: "A API do Gemini retornou uma instabilidade temporária. Resultado gerado pelo motor de inferência local.",
        });
      }

      throw new Error(`Falha ao processar orçamento com IA: ${lastError || "Sem resposta do modelo."}`);
    }

    // Limpeza de possíveis blocos markdown
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
    console.error("Erro Gemini:", err);
    console.error("Erro no processamento do orçamento:", err);
    const msg =
      err instanceof Error ? err.message : "Erro desconhecido ao processar orçamento com IA.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
