import { Metadata } from "next";
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
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatarLinkAfiliado } from "@/lib/mercadolivre";

export const revalidate = 3600; // Revalidação a cada 1 hora para SEO rápido e dinâmico

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface ProdutoDb {
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
  especificacoes?: {
    preco_antigo?: string;
    desconto_percentual?: string;
    link_afiliado?: string;
    link_ml?: string;
    link_destino?: string;
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
 * Busca produtos relacionados para retenção e links internos de SEO
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
 * Formata o preço para exibição amigável
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
 * Gera Metadados dinâmicos e otimizados para SEO Programático
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const produto = await getProduto(slug);

  if (!produto) {
    return {
      title: "Peça Não Encontrada | Catálogo de Autopeças",
      description: "A peça que você procura não foi encontrada ou foi descontinuada.",
      robots: { index: false, follow: false },
    };
  }

  const veiculos = produto.veiculos_compativeis || "diversos veículos";
  const title = `${produto.titulo} | Preço e Onde Comprar Original`;
  const description = `Compre ${produto.titulo} (${produto.codigo_fabricante}). Aplicação: ${veiculos}. Entrega rápida Mercado Livre Full.`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://catalogopecas.com.br";
  const pageUrl = `${siteUrl}/peca/${produto.slug}`;

  return {
    title,
    description,
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
      images: produto.imagem_url
        ? [
            {
              url: produto.imagem_url,
              width: 800,
              height: 800,
              alt: produto.titulo,
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

export default async function PecaSlugPage({ params }: PageProps) {
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

  // Schema.org Rich Snippets (JSON-LD)
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: produto.titulo,
    image: produto.imagem_url || undefined,
    description: `Código ${produto.codigo_fabricante} para ${
      produto.veiculos_compativeis || "diversos modelos"
    }`,
    sku: produto.codigo_fabricante,
    mpn: produto.codigo_fabricante,
    brand: {
      "@type": "Brand",
      name: produto.marca,
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: precoNumerico > 0 ? precoNumerico : undefined,
      availability: "https://schema.org/InStock",
      url: urlAfiliadoComMattTool,
      seller: {
        "@type": "Organization",
        name: "Mercado Livre",
      },
    },
  };

  // Separa lista de carros para a tabela de compatibilidade
  const listaVeiculos = produto.veiculos_compativeis
    ? produto.veiculos_compativeis
        .replace(/^Compatível com\s*/i, "")
        .split(/\/|,|;/)
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    : [];

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
              {produto.codigo_fabricante}
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* =========================================================================
              COLUNA ESQUERDA: GALERIA E FOTO DE ALTA RESOLUÇÃO
          ========================================================================== */}
          <div className="lg:col-span-6 space-y-4">
            <div className="relative aspect-square w-full rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 flex items-center justify-center shadow-sm overflow-hidden group">
              {produto.imagem_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={produto.imagem_url}
                  alt={produto.titulo}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-400 gap-3">
                  <Package className="w-20 h-20 text-zinc-300 dark:text-zinc-700" />
                  <span className="text-sm font-medium">Imagem em Alta Resolução</span>
                </div>
              )}

              {/* Selos flutuantes na foto */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-zinc-900/90 text-white backdrop-blur shadow-sm">
                  {produto.marca}
                </span>
                {desconto && (
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-md">
                    {desconto}
                  </span>
                )}
              </div>

              {/* Selo Full */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-yellow-400 text-zinc-950 shadow-md">
                <Zap className="w-3.5 h-3.5 fill-zinc-950 text-zinc-950" />
                <span>FULL</span>
              </div>
            </div>

            {/* Garantias e Segurança do Envio */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                <Truck className="w-5 h-5 text-emerald-500 mb-1" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Envio Full</span>
                <span className="text-[10px] text-zinc-500">Entrega rápida</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                <ShieldCheck className="w-5 h-5 text-blue-500 mb-1" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Peça Original</span>
                <span className="text-[10px] text-zinc-500">Garantia oficial</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                <RotateCcw className="w-5 h-5 text-amber-500 mb-1" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">30 Dias</span>
                <span className="text-[10px] text-zinc-500">Devolução grátis</span>
              </div>
            </div>
          </div>

          {/* =========================================================================
              COLUNA DIREITA: DETALHES, PREÇO, SELO FULL E CTA
          ========================================================================== */}
          <div className="lg:col-span-6 space-y-6">
            {/* Badges de Categoria e Código */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Código: {produto.codigo_fabricante}
              </span>

              {produto.codigo_oem && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  OEM: {produto.codigo_oem}
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
                  Estoque verificado com o envio mais rápido e seguro do país.
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
                  Parcele em até 12x no cartão com total garantia do Mercado Pago.
                </p>
              </div>
            ) : null}

            {/* BOTÃO PRINCIPAL COM REDIRECIONAMENTO DE AFILIADO */}
            <div className="space-y-3 pt-2">
              <a
                href={urlAfiliadoComMattTool}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-zinc-950 font-black text-base shadow-lg hover:shadow-xl transition-all transform active:scale-[0.99] cursor-pointer"
                title={`Comprar ${produto.titulo} no Mercado Livre`}
              >
                <Zap className="w-5 h-5 fill-zinc-950 text-zinc-950" />
                <span>Comprar no Mercado Livre (Full)</span>
                <ExternalLink className="w-4 h-4 opacity-80" />
              </a>

              <p className="text-[11px] text-center text-zinc-500 dark:text-zinc-400">
                Você será redirecionado para a página oficial do produto no Mercado Livre com link verificado.
              </p>
            </div>

            {/* TABELA DE COMPATIBILIDADE VEICULAR */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-sm text-zinc-900 dark:text-zinc-100">
                <Car className="w-4 h-4 text-blue-500" />
                <h2>Compatibilidade Veicular</h2>
              </div>

              {listaVeiculos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {listaVeiculos.map((carro, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{carro}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {produto.veiculos_compativeis || "Consulte a compatibilidade com seu veículo pelo código do fabricante."}
                </p>
              )}
            </div>

            {/* Ficha Técnica / Especificações Rápidas */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-sm text-zinc-900 dark:text-zinc-100">
                <Wrench className="w-4 h-4 text-amber-500" />
                <h3>Especificações Técnicas</h3>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40">
                  <span className="text-zinc-500 block text-[11px]">Marca</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">{produto.marca}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40">
                  <span className="text-zinc-500 block text-[11px]">Código da Peça</span>
                  <span className="font-bold font-mono text-zinc-800 dark:text-zinc-200">{produto.codigo_fabricante}</span>
                </div>
                {produto.codigo_oem && (
                  <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40">
                    <span className="text-zinc-500 block text-[11px]">Código OEM</span>
                    <span className="font-bold font-mono text-zinc-800 dark:text-zinc-200">{produto.codigo_oem}</span>
                  </div>
                )}
                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40">
                  <span className="text-zinc-500 block text-[11px]">Origem</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">100% Original Mercado Livre</span>
                </div>
              </div>
            </div>
          </div>
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
                  href={`/peca/${item.slug}`}
                  className="group flex flex-col p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-amber-400 dark:hover:border-amber-500 transition shadow-xs"
                >
                  <div className="aspect-square w-full rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center p-3 mb-3 overflow-hidden">
                    {item.imagem_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.imagem_url}
                        alt={item.titulo}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform"
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
    </div>
  );
}
