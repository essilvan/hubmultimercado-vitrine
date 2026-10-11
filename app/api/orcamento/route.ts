import { NextRequest, NextResponse } from "next/server";
import { buscarPrecoMercadoLivre, isTituloCompativel, type OfertaRealML } from "@/lib/mercadolivre";

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
  preco?: number | null;
  preco_real_ml?: number | null;
  preco_formatado?: string | null;
  link?: string | null;
  link_ml?: string | null;
  marca?: string | null;
  titulo_anuncio?: string | null;
  link_anuncio?: string | null;
  tem_full?: boolean;
  thumbnail?: string | null;
  preco_original?: number | null;

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
   - Gere no campo "termo_busca_mercadolivre" uma query de busca SEMPRE prefixando o modelo, motorização e ano do carro: [Modelo] + [Motor] + [Ano] + [Nome Padronizado] + [Posição]. Exemplo: "Gol 1.6 2012 Kit de Embreagem". Não inclua stop-words nem frases compridas.

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

export type { OfertaRealML };

/**
 * Atualiza os itens com os preços reais do Mercado Livre e formata os dados para o frontend
 */
async function sincronizarPrecosReais(orcamento: OrcamentoResposta): Promise<OrcamentoResposta> {
  if (!orcamento?.itens || orcamento.itens.length === 0) return orcamento;

  const veiculo = orcamento.veiculo || {
    marca: null,
    modelo: null,
    ano: null,
    motorizacao: null,
    placa: null,
  };

  // Formata veiculo_detectado com antecedência para passar para as buscas de preços reais
  if (!orcamento.veiculo_detectado) {
    const partes = [veiculo.marca, veiculo.modelo, veiculo.motorizacao, veiculo.ano].filter(Boolean);
    orcamento.veiculo_detectado = partes.length > 0 ? partes.join(" ") : "Veículo Detectado";
  }

  const modeloCarro = veiculo.modelo || "";
  const motorCarro = veiculo.motorizacao || "";
  const anoCarro = veiculo.ano || "";
  const veiculoNome = orcamento.veiculo_detectado || modeloCarro;

  await Promise.all(
    orcamento.itens.map(async (item) => {
      // Normalização de campos de compatibilidade
      if (!item.nome_peca) item.nome_peca = item.peca_padronizada;
      if (!item.marca_recomendada)
        item.marca_recomendada = item.marca_preferencial || "Original / Homologada";

      // OBRIGATÓRIO: A montagem da query de busca SEMPRE deve prefixar o modelo, motorização e ano do carro.
      // Exemplo correto: `${veiculo.modelo} ${veiculo.motorizacao || ''} ${veiculo.ano || ''} ${item.peca_padronizada} ${item.posicao || ''}`.trim()
      const peca = item.peca_padronizada || item.nome_peca || item.termo_lido || "";
      const pos = item.posicao || "";

      let queryObrigatoria = `${modeloCarro} ${motorCarro} ${anoCarro} ${peca} ${pos}`
        .replace(/\s+/g, " ")
        .trim();

      if (!queryObrigatoria) {
        queryObrigatoria = peca;
      }

      item.termo_busca_mercadolivre = queryObrigatoria;
      item.query_busca = queryObrigatoria;

      let oferta = await buscarPrecoMercadoLivre(queryObrigatoria, veiculoNome);

      // Filtro de compatibilidade no retorno da busca: se o título contiver palavras de modelos concorrentes/incompatíveis,
      // descarta esse resultado e tenta uma busca mais restrita ou descarta a oferta
      if (oferta && !isTituloCompativel(oferta.titulo, modeloCarro || veiculoNome)) {
        console.warn(`[Incompatível descartado]: Anúncio "${oferta.titulo}" para carro "${veiculoNome}". Tentando busca restrita...`);
        const buscaRestrita = `"${modeloCarro}" ${peca}`.trim();
        const ofertaRestrita = await buscarPrecoMercadoLivre(buscaRestrita, veiculoNome);
        if (ofertaRestrita && isTituloCompativel(ofertaRestrita.titulo, modeloCarro || veiculoNome)) {
          oferta = ofertaRestrita;
        } else {
          // Descarte por incompatibilidade confirmada
          oferta = null as any;
        }
      }

      const urlCanonicaML =
        oferta?.link_ml ||
        oferta?.link ||
        `https://lista.mercadolivre.com.br/${encodeURIComponent(queryObrigatoria)}`;

      if (oferta && typeof oferta.preco === "number" && oferta.preco > 0) {
        const precoNum = Number(oferta.preco);
        const precoFormatado = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(Number(precoNum.toFixed(2)));

        item.preco = precoNum;
        item.preco_formatado = precoFormatado;
        item.link = oferta.link;
        item.link_ml = urlCanonicaML;
        item.marca = oferta.marca;

        // Campos complementares e legados para compatibilidade total
        item.preco_real_ml = precoNum;
        item.preco_medio = precoFormatado;
        item.preco_medio_estimado = precoFormatado;
        item.titulo_anuncio = oferta.titulo;
        item.link_anuncio = oferta.link;
        item.link_direto_anuncio = urlCanonicaML;
        item.tem_full = oferta.tem_full;
        item.thumbnail = oferta.thumbnail;
        item.preco_original = oferta.original_price ? Number(oferta.original_price) : null;
        item.preco_real = true;
      } else {
        item.link_ml = urlCanonicaML;
        item.link = urlCanonicaML;
        item.link_anuncio = urlCanonicaML;
        item.link_direto_anuncio = urlCanonicaML;
      }
    })
  );

  // Recalcula o total_estimado somando estritamente os subtotais:
  // subtotal = (Number(item.quantidade) || 1) * (Number(item.preco) || 0)
  // itens.reduce((acc, item) => acc + ((Number(item.quantidade) || 1) * (Number(item.preco) || 0)), 0)
  const totalNum = (orcamento.itens || []).reduce((acc, it) => {
    const preco = Number(it.preco ?? it.preco_real_ml) || 0;
    const qtd = Number(it.quantidade) || 1;
    return acc + (qtd * preco);
  }, 0);

  if (totalNum > 0) {
    orcamento.total_estimado = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(totalNum.toFixed(2)));
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

  if (t.includes("kwid")) {
    marca = "Renault";
    modelo = "Kwid";
    motorizacao = "1.0";
    termoCarro = `kwid 1.0 ${ano || ""}`.trim();
  } else if (t.includes("sandero")) {
    marca = "Renault";
    modelo = "Sandero";
    motorizacao = "1.0 / 1.6";
    termoCarro = `sandero ${ano || ""}`.trim();
  } else if (t.includes("duster")) {
    marca = "Renault";
    modelo = "Duster";
    motorizacao = "1.6 / 2.0";
    termoCarro = `duster ${ano || ""}`.trim();
  } else if (t.includes("clio")) {
    marca = "Renault";
    modelo = "Clio";
    motorizacao = "1.0 / 1.6";
    termoCarro = `clio ${ano || ""}`.trim();
  } else if (t.includes("mobi")) {
    marca = "Fiat";
    modelo = "Mobi";
    motorizacao = "1.0 Fire";
    termoCarro = `mobi ${ano || ""}`.trim();
  } else if (t.includes("argo")) {
    marca = "Fiat";
    modelo = "Argo";
    motorizacao = "1.0 / 1.3";
    termoCarro = `argo ${ano || ""}`.trim();
  } else if (t.includes("onix")) {
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
      termo_busca_mercadolivre: `${modelo} ${motorizacao} ${ano || ""} Amortecedor Dianteiro Par`.trim(),
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
      termo_busca_mercadolivre: `${modelo} ${motorizacao} ${ano || ""} Jogo Pastilha Freio Dianteira`.trim(),
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
      termo_busca_mercadolivre: `${modelo} ${motorizacao} ${ano || ""} Par Disco Freio Ventilado`.trim(),
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
      termo_busca_mercadolivre: `${modelo} ${motorizacao} ${ano || ""} Kit Embreagem LuK`.trim(),
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
      termo_busca_mercadolivre: `${modelo} ${motorizacao} ${ano || ""} Jogo Velas Ignicao NGK`.trim(),
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
      termo_busca_mercadolivre: `${modelo} ${motorizacao} ${ano || ""} Kit Correia Dentada Tensor`.trim(),
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
      termo_busca_mercadolivre: `${modelo} ${motorizacao} ${ano || ""} Filtro Oleo Mann`.trim(),
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
      termo_busca_mercadolivre: `${modelo} ${motorizacao} ${ano || ""} Pecas Revisao`.trim(),
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

    const temTexto = Boolean(texto && texto.trim().length > 0);
    const temImagem = Boolean(imagem && typeof imagem.size === "number" && imagem.size > 0);

    if (!temTexto && !temImagem) {
      return NextResponse.json(
        {
          success: false,
          error: "Envie uma foto do orçamento ou digite a lista de peças para análise.",
        },
        { status: 400 }
      );
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();

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

    // Prepara as partes do payload para o Gemini
    const parts: Array<Record<string, unknown>> = [];

    // Se o input for apenas TEXTO (sem arquivo de foto), envie diretamente como prompt de texto para o modelo do Gemini,
    // sem tentar processar inlineData/base64 de imagem vazia.
    if (temImagem && imagem) {
      const buffer = Buffer.from(await imagem.arrayBuffer());
      const base64Data = buffer.toString("base64");
      const mimeType = imagem.type || "image/jpeg";

      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });

      parts.push({
        text: temTexto
          ? `Orçamento mecânico fornecido pelo cliente:\n${texto!.trim()}`
          : "Transcreva, higienize e estruture com precisão todas as peças deste orçamento mecânico.",
      });
    } else {
      // Input exclusivamente de TEXTO
      parts.push({
        text: `Orçamento mecânico fornecido pelo cliente:\n${texto!.trim()}`,
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

    // Chamada aos modelos Gemini com 'gemini-2.0-flash' e 'gemini-1.5-pro'
    const modelsToTry = [
      process.env.GEMINI_MODEL,
      "gemini-2.0-flash",
      "gemini-1.5-pro",
    ].filter(Boolean) as string[];

    let rawContent: string | null = null;
    let lastError: string | null = null;

    for (const model of modelsToTry) {
      try {
        console.log(`[Gemini Request] Tentando modelo: ${model}`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
          signal: AbortSignal.timeout(25000),
        });

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const candidate = geminiData.candidates?.[0];
          rawContent = candidate?.content?.parts?.[0]?.text || null;
          if (rawContent) {
            console.log(`[Gemini Sucesso] Resposta obtida via modelo: ${model}`);
            break;
          } else {
            console.warn(`[Gemini Aviso] Modelo ${model} retornou sem parts de texto válidas.`);
          }
        } else {
          lastError = await geminiRes.text();
          console.error(`[ERRO GEMINI API] Modelo ${model} falhou com status ${geminiRes.status}:`, lastError);
        }
      } catch (err) {
        lastError = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack || ""}` : String(err);
        console.error(`[ERRO GEMINI CATCH] Falha durante requisição para o modelo ${model}:`, lastError);
      }
    }

    if (!rawContent) {
      console.error("[ERRO CRÍTICO GEMINI] Todos os modelos Gemini falharam. Mensagem detalhada:", lastError);

      if (temTexto) {
        console.warn("[FALLBACK LOCAL ATIVADO] Acionando inferência local devido a falha da API Gemini.");
        const fallbackResult = extrairFallbackInteligente(texto!);
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
    const stackTrace = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack || ""}` : String(err);
    console.error("[ERRO PROCESSAMENTO ORÇAMENTO CATCH]:", stackTrace);
    const msg =
      err instanceof Error ? err.message : "Erro desconhecido ao processar orçamento com IA.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
