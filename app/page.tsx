"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Zap,
  Tag,
  Package,
  Wrench,
  X,
  ExternalLink,
  RefreshCw,
  SlidersHorizontal,
  Car,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface ProdutoAfiliado {
  id?: string;
  titulo: string;
  slug: string;
  codigo_fabricante: string;
  marca: string;
  categoria?: string | null;
  veiculos_compativeis?: string | null;
  codigo_oem?: string | null;
  busca_ml?: string | null;
  preco?: number | string | null;
  preco_estimado?: number | string | null;
  preco_antigo?: string | null;
  desconto_percentual?: string | null;
  imagem_url?: string | null;
  link_afiliado?: string | null;
  especificacoes?: {
    preco?: string;
    preco_antigo?: string;
    desconto_percentual?: string;
    link_afiliado?: string;
    link_ml?: string;
    link_destino?: string;
    [key: string]: unknown;
  } | null;
  created_at?: string;
}

function formatPriceDisplay(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const str = String(value).trim();
  if (str.startsWith("R$")) return str.replace(/\u00a0/g, " ");
  const num = typeof value === "number" ? value : parseFloat(str.replace(/\./g, "").replace(",", "."));
  if (isNaN(num)) return str;
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).replace(/\u00a0/g, " ");
}

export default function Home() {
  const [products, setProducts] = useState<ProdutoAfiliado[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("todos");

  // Carrega produtos dinamicamente do Supabase
  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("produtos_afiliados")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Falha ao buscar produtos no Supabase:", error);
      } else if (data) {
        setProducts(data as ProdutoAfiliado[]);
      }
    } catch (err) {
      console.error("Erro de conexão ao carregar vitrine:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Lista única de categorias para filtros rápidos
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.categoria?.trim()) cats.add(p.categoria.trim());
    });
    return Array.from(cats);
  }, [products]);

  // Filtro de busca em tempo real
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      if (activeCategory !== "todos" && item.categoria?.toLowerCase() !== activeCategory.toLowerCase()) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();

      const matchTitulo = item.titulo?.toLowerCase().includes(q);
      const matchMarca = item.marca?.toLowerCase().includes(q);
      const matchCodigoFab = item.codigo_fabricante?.toLowerCase().includes(q);
      const matchCodigoOem = item.codigo_oem?.toLowerCase().includes(q);
      const matchVeiculos = item.veiculos_compativeis?.toLowerCase().includes(q);
      const matchBuscaMl = item.busca_ml?.toLowerCase().includes(q);
      const matchCategoria = item.categoria?.toLowerCase().includes(q);

      return (
        matchTitulo ||
        matchMarca ||
        matchCodigoFab ||
        matchCodigoOem ||
        matchVeiculos ||
        matchBuscaMl ||
        matchCategoria
      );
    });
  }, [products, searchQuery, activeCategory]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center text-zinc-950 font-bold shadow-sm group-hover:scale-105 transition-transform">
              <Wrench className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight block leading-tight text-zinc-900 dark:text-white">
                Peças<span className="text-amber-500">Finder</span>
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block leading-none font-medium">
                Catálogo Técnico de Autopeças
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5">
            <Link
              href="/orcamento"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-zinc-950 shadow-sm transition-all hover:scale-105"
            >
              <Sparkles className="w-3.5 h-3.5 fill-zinc-950" />
              <span>Cotação com IA</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero & Search Header */}
      <section className="bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 border-b border-zinc-200 dark:border-zinc-800/80 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
            <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            Envio Rápido Mercado Livre Full
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Encontre a Peça Certa para o seu Veículo
          </h1>
          <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            Consulte códigos de fabricante, referências OEM e compre direto no Mercado Livre com garantia e entrega rápida.
          </p>

          {/* Campo de Busca */}
          <div className="pt-3 max-w-2xl mx-auto">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-amber-500 transition-colors">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por carro (HB20, Onix, Gol), código (620 3236 00, HG41183) ou marca..."
                className="w-full pl-12 pr-10 py-3.5 text-sm sm:text-base rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm focus:outline-none focus:border-amber-400 dark:focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 transition placeholder:text-zinc-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filtros Rápidos de Categoria */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveCategory("todos")}
                className={`px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
                  activeCategory === "todos"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold"
                    : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Todas as Peças
              </button>
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
                    activeCategory.toLowerCase() === cat.toLowerCase()
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold"
                      : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Banner Cotação Inteligente com IA */}
            <div className="pt-4">
              <Link
                href="/orcamento"
                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-semibold transition group shadow-sm"
              >
                <span className="w-6 h-6 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
                  ✨
                </span>
                <span>
                  Recebeu um orçamento da oficina mecânica?{" "}
                  <strong className="underline underline-offset-2">Cote as peças com IA em segundos ➔</strong>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Grid Principal da Vitrine */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-zinc-500" />
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {filteredProducts.length}{" "}
              {filteredProducts.length === 1 ? "peça disponível" : "peças disponíveis"}
            </span>
            {searchQuery && (
              <span className="text-xs text-zinc-500">
                para &quot;<strong>{searchQuery}</strong>&quot;
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchProducts}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              title="Recarregar catálogo do Supabase"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-amber-500" : ""}`}
              />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Exibição em Grid */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
            <p className="text-sm text-zinc-500">Carregando catálogo técnico do Supabase...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
              <Package className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
                Nenhum produto encontrado
              </h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Não localizamos peças para &quot;{searchQuery}&quot;. Tente buscar por modelo de veículo ou código da peça.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("todos");
              }}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition cursor-pointer"
            >
              Limpar Filtros de Busca
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((produto) => {
              // Determina link de compra
              const directAffiliateLink =
                produto.link_afiliado ||
                produto.especificacoes?.link_afiliado ||
                produto.especificacoes?.link_ml ||
                produto.especificacoes?.link_destino;

              const buyUrl =
                directAffiliateLink && directAffiliateLink.trim()
                  ? directAffiliateLink.trim()
                  : `/api/redirect?query=${encodeURIComponent(
                      produto.busca_ml || `${produto.marca} ${produto.codigo_fabricante}`
                    )}`;

              // Extração de valores de preço
              const precoAtual =
                formatPriceDisplay(produto.preco) ||
                formatPriceDisplay(produto.preco_estimado) ||
                null;

              const precoAntigo =
                (produto.preco_antigo && formatPriceDisplay(produto.preco_antigo)) ||
                (produto.especificacoes?.preco_antigo &&
                  formatPriceDisplay(produto.especificacoes.preco_antigo)) ||
                null;

              const descontoPercentual =
                produto.desconto_percentual ||
                produto.especificacoes?.desconto_percentual ||
                null;

              return (
                <div
                  key={produto.id || produto.slug}
                  className="group flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-amber-400 dark:hover:border-amber-500/50 transition-all overflow-hidden"
                >
                  {/* Foto Real Importada da Peça */}
                  <div className="relative aspect-[16/10] bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center overflow-hidden border-b border-zinc-100 dark:border-zinc-800">
                    {produto.imagem_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={produto.imagem_url}
                        alt={produto.titulo}
                        className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                          const fallback = (e.target as HTMLElement).parentElement?.querySelector(".img-fallback");
                          if (fallback) fallback.classList.remove("hidden");
                        }}
                      />
                    ) : null}

                    <div
                      className={`img-fallback flex flex-col items-center justify-center gap-2 text-zinc-400 p-6 text-center ${
                        produto.imagem_url ? "hidden" : "flex"
                      }`}
                    >
                      <Package className="w-10 h-10 text-zinc-300 dark:text-zinc-700 group-hover:text-amber-500 transition-colors" />
                      <span className="text-[11px] font-medium text-zinc-400">
                        {produto.marca} - {produto.categoria || "Autopeça"}
                      </span>
                    </div>

                    {/* Marca oficial destacada no topo sobre a imagem */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                      <span className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-amber-400 text-zinc-950 shadow-md">
                        {produto.marca}
                      </span>
                      {produto.categoria && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/90 dark:bg-zinc-900/90 text-zinc-700 dark:text-zinc-300 backdrop-blur-sm border border-zinc-200/50 dark:border-zinc-700/50">
                          {produto.categoria}
                        </span>
                      )}
                    </div>

                    {/* Selo de desconto flutuante sobre a imagem */}
                    {descontoPercentual && (
                      <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md text-xs font-black bg-green-600 text-white shadow-md z-10">
                        {descontoPercentual}
                      </div>
                    )}
                  </div>

                  {/* Detalhes do Produto */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2.5">
                      {/* Código da Peça e OEM */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <Tag className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          Cód: {produto.codigo_fabricante}
                        </span>

                        {produto.codigo_oem && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                            OEM: {produto.codigo_oem}
                          </span>
                        )}
                      </div>

                      {/* Título com link para a página de SEO */}
                      <Link
                        href={`/peca/${produto.slug}`}
                        className="group-hover:text-amber-500 transition"
                      >
                        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
                          {produto.titulo}
                        </h2>
                      </Link>

                      {/* Carros Compatíveis */}
                      {produto.veiculos_compativeis && (
                        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                          <div className="flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
                            <Car className="w-3.5 h-3.5 text-blue-500" />
                            <span>Compatibilidade:</span>
                          </div>
                          <p className="line-clamp-2 leading-relaxed">
                            {produto.veiculos_compativeis}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* BLOCO DE PREÇO ATUALIZADO */}
                    <div className="space-y-3 pt-2">
                      <div className="p-3.5 rounded-xl bg-zinc-50/90 dark:bg-zinc-950/80 border border-zinc-200/70 dark:border-zinc-800 space-y-1.5">
                        {/* Se houver preço antigo ou desconto percentual */}
                        {(precoAntigo || descontoPercentual) && (
                          <div className="flex items-center gap-2">
                            {precoAntigo && (
                              <span className="line-through text-gray-400 text-xs">
                                {precoAntigo}
                              </span>
                            )}
                            {descontoPercentual && (
                              <span className="bg-green-100 text-green-700 font-bold text-xs px-1.5 py-0.5 rounded">
                                {descontoPercentual}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Preço atual em destaque grande em verde */}
                        {precoAtual ? (
                          <div className="flex items-baseline gap-2">
                            <span className="text-xl font-bold text-green-600">
                              {precoAtual}
                            </span>
                            <span className="text-[11px] font-semibold text-zinc-500">
                              no Mercado Livre
                            </span>
                          </div>
                        ) : null}
                      </div>

                      {/* Botões: Comprar no Mercado Livre (Full) + Ver Detalhes */}
                      <div className="space-y-2">
                        <a
                          href={buyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-zinc-950 font-bold text-sm shadow-md hover:shadow-lg transition-all transform active:scale-[0.99] cursor-pointer"
                          title={`Comprar "${produto.titulo}" no Mercado Livre com envio Full`}
                        >
                          <Zap className="w-4 h-4 fill-zinc-950 text-zinc-950" />
                          <span>Comprar no Mercado Livre (Full)</span>
                          <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-80" />
                        </a>

                        <Link
                          href={`/peca/${produto.slug}`}
                          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 transition"
                        >
                          <span>Ver detalhes e ficha técnica completa</span>
                          <span>&rarr;</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-8 px-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
        <div className="max-w-7xl mx-auto space-y-2">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            PeçasFinder - Catálogo Técnico & Afiliados Oficiais
          </p>
          <p>
            Preços promocionais e links com redirecionamento otimizado para o app oficial e Mercado Livre Full.
          </p>
        </div>
      </footer>
    </div>
  );
}
