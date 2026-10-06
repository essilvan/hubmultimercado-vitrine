import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Zap,
  Tag,
  ShieldCheck,
  Truck,
  RotateCcw,
  CheckCircle2,
  Car,
  ExternalLink,
  ChevronRight,
  Package,
  Wrench,
  Layers,
  Sparkles,
  Info,
  FileCheck,
  FileText,
  Hash,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatarLinkAfiliado, MODELOS_CONHECIDOS } from "@/lib/mercadolivre";

export const revalidate = 3600; // Revalidação a cada 1 hora para SEO dinâmico

/**
 * Pré-renderiza os produtos mais recentes/acessados para resposta instantânea
 */
export async function generateStaticParams() {
  try {
    const { data } = await supabase
      .from("produtos_afiliados")
      .select("slug")
      .order("created_at", { ascending: false })
      .limit(50);

    return (data || []).map((item) => ({
      slug: item.slug,
    }));
  } catch (err) {
    console.error("Erro ao gerar static params para produtos:", err);
    return [];
  }
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export interface DadosTecnicosDb {
  codigo_fabricante?: string;
  marca?: string;
  modelo?: string;
  mpn?: string;
  numero_peca?: string;
  codigo_oem?: string;
  posicao?: string;
  lado?: string;
  diametro?: string;
  estrias?: string;
  conteudo?: string;
  medidas?: string;
  material?: string;
  composicao?: string;
  tipo_veiculo?: string;
  garantia?: string;
  [key: string]: string | undefined;
}

export interface ProdutoDb {
  id: string;
  titulo: string;
  slug: string;
  codigo_fabricante: string;
  marca: string;
  categoria?: string | null;
  veiculos_compativeis?: string | null;
  codigo_oem?: string | null;
  busca_ml?: string | null;
  preco_estimado?: number | string | null;
  preco_antigo?: string | null;
  desconto_percentual?: string | null;
  imagem_url?: string | null;
  link_afiliado?: string | null;
  descricao?: string | null;
  aplicacao?: string[] | string | null;
  palavras_chave?: string[] | string | null;
  especificacoes?: {
    preco?: string;
    preco_antigo?: string;
    desconto_percentual?: string;
    link_afiliado?: string;
    link_ml?: string;
    link_destino?: string;
    marca?: string;
    modelo?: string;
    mpn?: string;
    numero_peca?: string;
    codigo_oem?: string;
    posicao?: string;
    lado?: string;
    medidas?: string;
    composicao?: string;
    aplicacao?: string[];
    compatibility?: string;
    dados_tecnicos?: DadosTecnicosDb;
    descricao_completa?: string;
    palavras_chave?: string[];
    atributos_ml?: Record<string, string | undefined>;
    [key: string]: unknown;
  } | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Busca o produto no Supabase pelo slug
 */
async function getProduto(slug: string): Promise<ProdutoDb | null> {
  try {
    const { data, error } = await supabase
      .from("produtos_afiliados")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data as ProdutoDb;
  } catch (err) {
    console.error("Erro ao buscar produto por slug:", err);
    return null;
  }
}

/**
 * Busca produtos relacionados para links internos de SEO
 */
async function getProdutosRelacionados(categoria?: string | null, currentSlug?: string): Promise<ProdutoDb[]> {
  try {
    let query = supabase.from("produtos_afiliados").select("*").limit(4);
    if (categoria) {
      query = query.eq("categoria", categoria);
    }
    if (currentSlug) {
      query = query.neq("slug", currentSlug);
    }
    const { data } = await query;
    return (data as ProdutoDb[]) || [];
  } catch {
    return [];
  }
}

/**
 * Extrai o valor numérico do preço
 */
function extrairValorNumerico(preco: number | string | null | undefined): number {
  if (!preco) return 0;
  if (typeof preco === "number") return preco;
  const str = String(preco).replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Formata o preço para moeda BRL
 */
function formatarPreco(val: number | string | null | undefined): string {
  if (!val) return "";
  const str = String(val).trim();
  if (str.startsWith("R$")) return str.replace(/\u00a0/g, " ");
  const num = typeof val === "number" ? val : parseFloat(str.replace(/\./g, "").replace(",", "."));
  if (isNaN(num)) return str;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

/**
 * Extrai os principais modelos compatíveis para os metadados de SEO
 */
function extrairModelosPrincipais(
  aplicacao?: string[] | string | null,
  veiculosCompativeis?: string | null
): string {
  if (Array.isArray(aplicacao) && aplicacao.length > 0) {
    const modelosUnicos = new Set<string>();
    for (const linha of aplicacao) {
      for (const m of MODELOS_CONHECIDOS) {
        if (new RegExp(`\\b${m}\\b`, "i").test(linha)) {
          modelosUnicos.add(m);
        }
      }
    }
    if (modelosUnicos.size > 0) {
      return Array.from(modelosUnicos).slice(0, 4).join(", ");
    }
    const primeiras = aplicacao
      .slice(0, 3)
      .map((l) =>
        l
          .replace(/^(?:FIAT|CHEVROLET|GM|VW|VOLKSWAGEN|FORD|RENAULT|HYUNDAI|TOYOTA|HONDA)\s+/i, "")
          .split(/[\(\/]/)[0]
          .trim()
      );
    const filtradas = primeiras.filter(Boolean);
    if (filtradas.length > 0) {
      return filtradas.join(", ");
    }
  } else if (typeof aplicacao === "string" && aplicacao.trim()) {
    const linhas = aplicacao.split("\n").filter(Boolean);
    if (linhas.length > 0) {
      return extrairModelosPrincipais(linhas, veiculosCompativeis);
    }
  }

  if (veiculosCompativeis) {
    const limpo = veiculosCompativeis
      .replace(/^Compatível com\s*/i, "")
      .replace(/^Consulte.*$/i, "")
      .trim();
    if (limpo) {
      const parts = limpo.split(/\s*(?:\/|,|;)\s*/).filter(Boolean);
      return parts.slice(0, 4).join(", ");
    }
  }

  return "Diversos Modelos";
}

/**
 * Normaliza a lista de veículos compatíveis
 */
function normalizarListaAplicacao(produto: ProdutoDb): string[] {
  if (Array.isArray(produto.aplicacao) && produto.aplicacao.length > 0) {
    return produto.aplicacao;
  }
  if (typeof produto.aplicacao === "string" && produto.aplicacao.trim()) {
    return produto.aplicacao
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }
  if (Array.isArray(produto.especificacoes?.aplicacao) && produto.especificacoes.aplicacao.length > 0) {
    return produto.especificacoes.aplicacao;
  }
  if (produto.especificacoes?.compatibility) {
    return produto.especificacoes.compatibility
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }
  if (produto.veiculos_compativeis) {
    return produto.veiculos_compativeis
      .replace(/^Compatível com\s*/i, "")
      .split(/\/|,|;|\|/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [];
}

/**
 * Normaliza as palavras-chave do produto
 */
function normalizarPalavrasChave(produto: ProdutoDb): string[] {
  if (Array.isArray(produto.palavras_chave) && produto.palavras_chave.length > 0) {
    return produto.palavras_chave;
  }
  if (typeof produto.palavras_chave === "string" && produto.palavras_chave.trim()) {
    return produto.palavras_chave
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  if (Array.isArray(produto.especificacoes?.palavras_chave) && produto.especificacoes.palavras_chave.length > 0) {
    return produto.especificacoes.palavras_chave;
  }
  return [];
}

/**
 * 3. METADADOS DINÂMICOS PARA ALTO DESEMPENHO EM SEO
 * Padrão solicitado:
 * - title: "[Nome da Peça] - [Código Fabricante] | Compatível com [Modelos Principais]"
 * - description: Resumo com marca, código, veículos compatíveis e aviso de pronta entrega/frete rápido.
 * - openGraph e twitter: dados completos incluindo imagem principal e tags.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const produto = await getProduto(slug);

  if (!produto) {
    return {
      title: "Peça Não Encontrada | Catálogo de Autopeças",
      description: "A peça automotiva que você procura não foi encontrada ou o anúncio foi descontinuado.",
      robots: { index: false, follow: false },
    };
  }

  const dadosTecnicos = produto.especificacoes?.dados_tecnicos || {};
  const codigoDestaque =
    dadosTecnicos.mpn ||
    dadosTecnicos.codigo_fabricante ||
    produto.codigo_fabricante ||
    "COD-ML";
  const marcaDestaque = dadosTecnicos.marca || produto.marca || "Auto Peças";

  // Modelos principais
  const modelosStr = extrairModelosPrincipais(
    produto.aplicacao || produto.especificacoes?.aplicacao,
    produto.veiculos_compativeis
  );

  // Nome da peça limpo a partir do título
  const nomePeca = produto.titulo
    .replace(/\s*-\s*R\$.*$/i, "")
    .replace(/\s*\|\s*.*$/i, "")
    .replace(/\s*-\s*Mercado\s*Livre.*$/i, "")
    .trim();

  // Formato exato solicitado: "[Nome da Peça] - [Código Fabricante] | Compatível com [Modelos Principais]"
  const title = `${nomePeca} - ${codigoDestaque} | Compatível com ${modelosStr}`;

  // Resumo com marca, código, veículos compatíveis e aviso de pronta entrega/frete rápido
  const description = `Compre ${nomePeca} da marca ${marcaDestaque}, código ${codigoDestaque}. Compatível com ${modelosStr}. Pronta entrega e frete rápido Mercado Livre Full com garantia e nota fiscal.`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://catalogopecas.com.br";
  const pageUrl = `${siteUrl}/produto/${produto.slug}`;

  const keywords = normalizarPalavrasChave(produto);

  return {
    title,
    description,
    keywords: keywords.length > 0 ? keywords.slice(0, 30).join(", ") : undefined,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Catálogo Online de Autopeças",
      locale: "pt_BR",
      type: "article",
      tags: keywords.slice(0, 20),
      images: produto.imagem_url
        ? [
            {
              url: produto.imagem_url,
              width: 800,
              height: 800,
              alt: title,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: produto.imagem_url ? [produto.imagem_url] : [],
    },
  };
}

export default async function ProdutoSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const produto = await getProduto(slug);

  if (!produto) {
    notFound();
  }

  const produtosRelacionados = await getProdutosRelacionados(produto.categoria, produto.slug);

  // Link de Afiliado com Parâmetros Oficiais do Mercado Livre
  const directLink =
    produto.link_afiliado ||
    produto.especificacoes?.link_afiliado ||
    produto.especificacoes?.link_ml ||
    produto.especificacoes?.link_destino;

  const urlAfiliadoComMattTool = directLink
    ? formatarLinkAfiliado(directLink)
    : `/api/redirect?query=${encodeURIComponent(
        produto.busca_ml || `${produto.marca} ${produto.codigo_fabricante}`
      )}`;

  const precoNumerico = extrairValorNumerico(produto.preco_estimado);
  const precoExibicao = formatarPreco(produto.preco_estimado);
  const precoAntigoExibicao = formatarPreco(
    produto.preco_antigo || produto.especificacoes?.preco_antigo
  );
  const desconto =
    produto.desconto_percentual || produto.especificacoes?.desconto_percentual;

  // Dados técnicos estruturados
  const dadosTecnicos = (produto.especificacoes?.dados_tecnicos || {}) as DadosTecnicosDb;
  const codigoFabricanteDestaque =
    dadosTecnicos.mpn ||
    dadosTecnicos.codigo_fabricante ||
    dadosTecnicos.numero_peca ||
    produto.codigo_fabricante ||
    "COD-ML";
  const marcaDestaque = dadosTecnicos.marca || produto.marca || "Auto Peças";
  const modeloDestaque = dadosTecnicos.modelo || (produto.especificacoes?.modelo as string) || undefined;
  const oemDestaque = dadosTecnicos.codigo_oem || produto.codigo_oem || undefined;
  const ladoDestaque = dadosTecnicos.lado || (produto.especificacoes?.lado as string) || undefined;
  const posicaoDestaque = dadosTecnicos.posicao || (produto.especificacoes?.posicao as string) || undefined;
  const medidasDestaque = dadosTecnicos.medidas || dadosTecnicos.diametro || (produto.especificacoes?.medidas as string) || undefined;
  const materialDestaque = dadosTecnicos.material || dadosTecnicos.composicao || (produto.especificacoes?.composicao as string) || undefined;

  // Lista normalizada de veículos compatíveis / aplicação
  const listaVeiculos = normalizarListaAplicacao(produto);

  // Palavras-chave normalizadas
  const palavrasChaveList = normalizarPalavrasChave(produto);

  // Descrição limpa completa
  const descricaoTexto =
    produto.descricao ||
    produto.especificacoes?.descricao_completa ||
    null;

  // Montagem de propriedades técnicas adicionais para Schema.org
  const additionalProperty: Array<{ "@type": string; name: string; value: string }> = [];
  if (codigoFabricanteDestaque) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Código do Fabricante / MPN",
      value: codigoFabricanteDestaque,
    });
  }
  if (oemDestaque) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Código OEM",
      value: oemDestaque,
    });
  }
  if (posicaoDestaque) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Posição",
      value: posicaoDestaque,
    });
  }
  if (ladoDestaque) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Lado",
      value: ladoDestaque,
    });
  }
  if (medidasDestaque) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Medidas / Diâmetro",
      value: medidasDestaque,
    });
  }
  if (dadosTecnicos.estrias) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Estrias",
      value: dadosTecnicos.estrias,
    });
  }
  if (materialDestaque) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Composição / Material",
      value: materialDestaque,
    });
  }
  if (dadosTecnicos.conteudo) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Conteúdo da Embalagem",
      value: dadosTecnicos.conteudo,
    });
  }
  if (listaVeiculos.length > 0) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Compatibilidade de Veículos",
      value: listaVeiculos.slice(0, 10).join(" | "),
    });
  }

  /**
   * DADOS ESTRUTURADOS SCHEMA.ORG (JSON-LD)
   * Estrutura oficial Schema.org "Product" com offers, brand, mpn, sku, priceCurrency BRL e availability
   */
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: produto.titulo,
    image: produto.imagem_url ? [produto.imagem_url] : undefined,
    description:
      descricaoTexto?.slice(0, 320) ||
      `Peça automotiva original ${marcaDestaque} código de fábrica ${codigoFabricanteDestaque}. Compatível com ${
        listaVeiculos[0] || produto.veiculos_compativeis || "diversos modelos"
      }.`,
    brand: {
      "@type": "Brand",
      name: marcaDestaque,
    },
    mpn: codigoFabricanteDestaque,
    sku: codigoFabricanteDestaque,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: precoNumerico > 0 ? precoNumerico : undefined,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url: urlAfiliadoComMattTool,
      seller: {
        "@type": "Organization",
        name: "Mercado Livre",
      },
    },
    ...(additionalProperty.length > 0 ? { additionalProperty } : {}),
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Schema.org Rich Snippets JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Top Header / Breadcrumb Bar */}
      <nav aria-label="Breadcrumb" className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <ol className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 overflow-x-auto no-scrollbar">
            <li>
              <Link href="/" className="hover:text-amber-500 font-medium transition flex items-center gap-1">
                <span>Início</span>
              </Link>
            </li>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
            {produto.categoria && (
              <>
                <li>
                  <Link href={`/?categoria=${encodeURIComponent(produto.categoria)}`} className="hover:text-amber-500 font-medium transition whitespace-nowrap">
                    {produto.categoria}
                  </Link>
                </li>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              </>
            )}
            <li className="font-semibold text-zinc-900 dark:text-zinc-200 truncate max-w-[200px] sm:max-w-xs" aria-current="page">
              {codigoFabricanteDestaque}
            </li>
          </ol>

          <div className="flex items-center gap-2">
            <Link
              href="/orcamento"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cotação com IA</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12 pb-28 lg:pb-12">
        {/* =========================================================================
            BLOCO SUPERIOR: FOTO, PREÇO, SELO FULL E CTA DE COMPRA
        ========================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* COLUNA ESQUERDA: GALERIA E FOTO DE ALTA RESOLUÇÃO */}
          <div className="lg:col-span-6 space-y-4">
            <div className="relative aspect-square w-full rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 flex items-center justify-center shadow-sm overflow-hidden group">
              {produto.imagem_url ? (
                <Image
                  src={produto.imagem_url}
                  alt={produto.titulo}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain p-6 group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-400 gap-3">
                  <Package className="w-20 h-20 text-zinc-300 dark:text-zinc-700" />
                  <span className="text-sm font-medium">Imagem em Alta Resolução</span>
                </div>
              )}

              {/* Selos flutuantes na foto */}
              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-zinc-900/90 text-white backdrop-blur shadow-sm">
                  {marcaDestaque}
                </span>
                {desconto && (
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-md">
                    {desconto}
                  </span>
                )}
              </div>

              {/* Selo Full */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-yellow-400 text-zinc-950 shadow-md z-10">
                <Zap className="w-3.5 h-3.5 fill-zinc-950 text-zinc-950" />
                <span>FULL</span>
              </div>
            </div>

            {/* Garantias e Benefícios do Envio */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                <Truck className="w-5 h-5 text-emerald-500 mb-1" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Envio Full</span>
                <span className="text-[10px] text-zinc-500">Entrega rápida</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                <ShieldCheck className="w-5 h-5 text-blue-500 mb-1" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Peça Genuína</span>
                <span className="text-[10px] text-zinc-500">Garantia oficial</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                <RotateCcw className="w-5 h-5 text-amber-500 mb-1" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">30 Dias</span>
                <span className="text-[10px] text-zinc-500">Devolução grátis</span>
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA: TÍTULO, PREÇO E CTA DE COMPRA */}
          <div className="lg:col-span-6 space-y-6">
            {/* Badges de Categoria, Código MPN e OEM */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Cód: {codigoFabricanteDestaque}
              </span>

              {oemDestaque && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  OEM: {oemDestaque}
                </span>
              )}

              {produto.categoria && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  <Layers className="w-3.5 h-3.5 text-zinc-400" />
                  {produto.categoria}
                </span>
              )}
            </div>

            {/* Título Principal H1 Otimizado para SEO */}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white leading-tight tracking-tight">
              {produto.titulo}
            </h1>

            {/* Selo de Frete Full em Destaque */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-500/20">
              <div className="w-9 h-9 rounded-lg bg-yellow-400 text-zinc-950 flex items-center justify-center font-black shadow-sm shrink-0">
                <Zap className="w-5 h-5 fill-zinc-950" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <span>Entrega com Mercado Livre FULL</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Estoque verificado com pronta entrega e o envio mais rápido do país.
                </div>
              </div>
            </div>

            {/* Bloco de Preço */}
            {precoExibicao ? (
              <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2 shadow-xs">
                {precoAntigoExibicao && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400 dark:text-zinc-500 line-through">
                      {precoAntigoExibicao}
                    </span>
                    {desconto && (
                      <span className="px-2 py-0.5 rounded text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                        {desconto}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                    {precoExibicao}
                  </span>
                  <span className="text-xs text-zinc-500">no Mercado Livre</span>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-1">
                  Parcele em até 12x no cartão com compra 100% garantida pelo Mercado Pago.
                </p>
              </div>
            ) : null}

            {/* BOTÃO PRINCIPAL COM LINK DE AFILIADO */}
            <div className="space-y-3 pt-2">
              <a
                href={urlAfiliadoComMattTool}
                target="_blank"
                rel="nofollow sponsored"
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-zinc-950 font-black text-base shadow-lg hover:shadow-xl transition-all transform active:scale-[0.99] cursor-pointer"
                title={`Ver Oferta de ${produto.titulo} no Mercado Livre`}
              >
                <Zap className="w-5 h-5 fill-zinc-950 text-zinc-950" />
                <span>Ver Oferta no Mercado Livre (Full)</span>
                <ExternalLink className="w-4 h-4 opacity-80" />
              </a>

              <p className="text-[11px] text-center text-zinc-500 dark:text-zinc-400">
                Você será redirecionado para a página oficial do produto no Mercado Livre com link oficial verificado.
              </p>
            </div>

            {/* CARD DE IDENTIFICAÇÃO DO CÓDIGO ORIGINAL */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white p-4.5 sm:p-5 shadow-inner">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400 flex items-center gap-1.5">
                    <Tag className="w-3 h-3" />
                    Código Original de Fábrica / MPN
                  </span>
                  <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider text-white select-all">
                    {codigoFabricanteDestaque}
                  </div>
                </div>

                <div className="sm:text-right text-xs text-zinc-300 space-y-0.5">
                  <span className="text-[10px] block text-zinc-400 uppercase font-semibold">
                    Fabricante Oficial
                  </span>
                  <span className="font-black text-sm text-white">
                    {marcaDestaque}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-zinc-700/60 text-[11px] text-zinc-300 flex items-center gap-2">
                <FileCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Referência técnica padrão para consulta em catálogos e compatibilidade.</span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            4. SEÇÃO VISUAL (UI/UX): FICHA TÉCNICA E VEÍCULOS COMPATÍVEIS / APLICAÇÃO
        ========================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-6">
          {/* FICHA TÉCNICA E ESPECIFICAÇÕES COMPLETAS (COLUNA 7) */}
          <section className="lg:col-span-7 space-y-6">
            <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                      Ficha Técnica do Componente
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Especificações originais do fabricante e medidas técnicas
                    </p>
                  </div>
                </div>

                <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  100% Original
                </span>
              </div>

              {/* Tabela Estruturada de Ficha Técnica */}
              <div className="overflow-hidden rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                <table className="w-full text-left text-xs border-collapse">
                  <tbody>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/20">
                      <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400 w-1/3">
                        Fabricante / Marca
                      </th>
                      <td className="py-3 px-4 font-bold text-zinc-900 dark:text-zinc-100">
                        {marcaDestaque}
                      </td>
                    </tr>

                    <tr className="border-b border-zinc-100 dark:border-zinc-800/80">
                      <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                        Código do Fabricante (MPN)
                      </th>
                      <td className="py-3 px-4 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {codigoFabricanteDestaque}
                      </td>
                    </tr>

                    {oemDestaque && (
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/20">
                        <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                          Código Original OEM
                        </th>
                        <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                          {oemDestaque}
                        </td>
                      </tr>
                    )}

                    {modeloDestaque && (
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80">
                        <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                          Modelo da Peça
                        </th>
                        <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                          {modeloDestaque}
                        </td>
                      </tr>
                    )}

                    {posicaoDestaque && (
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/20">
                        <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                          Posição no Veículo
                        </th>
                        <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                          {posicaoDestaque}
                        </td>
                      </tr>
                    )}

                    {ladoDestaque && (
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80">
                        <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                          Lado de Montagem
                        </th>
                        <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                          {ladoDestaque}
                        </td>
                      </tr>
                    )}

                    {medidasDestaque && (
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/20">
                        <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                          Medidas / Diâmetro
                        </th>
                        <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                          {medidasDestaque}
                        </td>
                      </tr>
                    )}

                    {dadosTecnicos.estrias && (
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80">
                        <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                          Quantidade de Estrias
                        </th>
                        <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                          {dadosTecnicos.estrias}
                        </td>
                      </tr>
                    )}

                    {materialDestaque && (
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/20">
                        <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                          Composição / Material
                        </th>
                        <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                          {materialDestaque}
                        </td>
                      </tr>
                    )}

                    {dadosTecnicos.tipo_veiculo && (
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80">
                        <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                          Tipo de Veículo
                        </th>
                        <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                          {dadosTecnicos.tipo_veiculo}
                        </td>
                      </tr>
                    )}

                    {produto.categoria && (
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/20">
                        <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                          Categoria
                        </th>
                        <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                          {produto.categoria}
                        </td>
                      </tr>
                    )}

                    <tr className="border-b border-zinc-100 dark:border-zinc-800/80">
                      <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                        Condição do Item
                      </th>
                      <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                        Novo / 100% Lacrado
                      </td>
                    </tr>

                    <tr>
                      <th className="py-3 px-4 font-semibold text-zinc-500 dark:text-zinc-400">
                        Garantia Oficial
                      </th>
                      <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                        {dadosTecnicos.garantia || "90 Dias contra defeitos de fabricação"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {dadosTecnicos.conteudo && (
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs">
                  <span className="font-bold text-amber-900 dark:text-amber-300 block mb-1">
                    Conteúdo da Embalagem:
                  </span>
                  <p className="text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed">
                    {dadosTecnicos.conteudo}
                  </p>
                </div>
              )}
            </div>

            {/* DESCRIÇÃO COMPLETA DO PRODUTO (QUANDO DISPONÍVEL) */}
            {descricaoTexto && (
              <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                      Descrição do Produto
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Informações completas e detalhadas fornecidas pelo fabricante
                    </p>
                  </div>
                </div>

                <div className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-normal whitespace-pre-line max-h-[500px] overflow-y-auto pr-2">
                  {descricaoTexto}
                </div>
              </div>
            )}
          </section>

          {/* VEÍCULOS COMPATÍVEIS / APLICAÇÃO (COLUNA 5) */}
          <section className="lg:col-span-5 space-y-6">
            <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Car className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                      Veículos Compatíveis / Aplicação
                    </h2>
                    <p className="text-xs text-zinc-500">
                      {listaVeiculos.length > 0
                        ? `${listaVeiculos.length} ${listaVeiculos.length === 1 ? "aplicação mapeada" : "aplicações mapeadas"}`
                        : "Consulte pelo código original"}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Encaixe Preciso
                </span>
              </div>

              {listaVeiculos.length > 0 ? (
                <ul className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {listaVeiculos.map((veiculo, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 hover:border-blue-400/50 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 leading-relaxed">
                        {veiculo}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {produto.veiculos_compativeis || "Consulte a compatibilidade com seu veículo pelo código do fabricante."}
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/60 text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed">
                  Recomendamos sempre confirmar o ano, modelo e motorização do veículo antes da instalação.
                </span>
              </div>
            </div>

            {/* PALAVRAS-CHAVE E TERMOS DE COMPATIBILIDADE */}
            {palavrasChaveList.length > 0 && (
              <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  <Hash className="w-4 h-4 text-amber-500" />
                  <span>Termos Relacionados & Aplicações</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {palavrasChaveList.slice(0, 25).map((kw, i) => (
                    <span
                      key={i}
                      className="inline-block px-2.5 py-1 text-[11px] rounded-lg bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-800 capitalize"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* =========================================================================
            PRODUTOS RELACIONADOS / LINKS INTERNOS PARA SEO
        ========================================================================== */}
        {produtosRelacionados.length > 0 && (
          <section className="pt-8 border-t border-zinc-200 dark:border-zinc-800 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                  Outras Peças Recomendadas
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Peças da mesma categoria e compatíveis
                </p>
              </div>
              <Link href="/" className="text-xs font-semibold text-amber-500 hover:underline">
                Ver Todo o Catálogo &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {produtosRelacionados.map((item) => (
                <Link
                  key={item.id || item.slug}
                  href={`/produto/${item.slug}`}
                  className="group flex flex-col p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-amber-400 dark:hover:border-amber-500 transition shadow-xs"
                >
                  <div className="relative aspect-square w-full rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center p-3 mb-3 overflow-hidden">
                    {item.imagem_url ? (
                      <Image
                        src={item.imagem_url}
                        alt={item.titulo}
                        fill
                        sizes="(max-width: 640px) 100vw, 25vw"
                        className="object-contain p-2 group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-zinc-400" />
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                    {item.marca} - {item.codigo_fabricante}
                  </span>
                  <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2 mt-1 mb-2">
                    {item.titulo}
                  </h3>
                  {item.preco_estimado && (
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-auto">
                      {formatarPreco(item.preco_estimado)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* =========================================================================
          BARRA FIXA DE CONVERSÃO NO RODAPÉ EM TELAS MOBILE (STICKY BOTTOM CTA)
      ========================================================================== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-3 shadow-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {produto.imagem_url ? (
            <div className="relative w-11 h-11 rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0 overflow-hidden border border-zinc-200 dark:border-zinc-700">
              <Image
                src={produto.imagem_url}
                alt={produto.titulo}
                fill
                sizes="44px"
                className="object-contain p-1"
              />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-400">
              <Package className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            {precoExibicao ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400 leading-tight">
                  {precoExibicao}
                </span>
                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-black bg-yellow-400 text-zinc-950">
                  <Zap className="w-2.5 h-2.5 fill-zinc-950" />
                  FULL
                </span>
              </div>
            ) : (
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                Pronta Entrega
              </span>
            )}
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[130px] sm:max-w-[180px]">
              {codigoFabricanteDestaque} • {marcaDestaque}
            </p>
          </div>
        </div>

        <a
          href={urlAfiliadoComMattTool}
          target="_blank"
          rel="nofollow sponsored"
          className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-zinc-950 font-black text-xs shadow-md transition-transform active:scale-95"
          title={`Comprar ${produto.titulo} no Mercado Livre`}
        >
          <Zap className="w-3.5 h-3.5 fill-zinc-950 text-zinc-950" />
          <span>Ver Oferta</span>
          <ExternalLink className="w-3 h-3 opacity-80" />
        </a>
      </div>
    </div>
  );
}
