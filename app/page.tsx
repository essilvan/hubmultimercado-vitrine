"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
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
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface ProdutoCard {
  id?: string;
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
  created_at?: string;
}

const PAGE_SIZE = 24;

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
  const [products, setProducts] = useState<ProdutoCard[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<string>("todos");
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  // Debounce da busca digitada para evitar queries desnecessárias
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setCurrentPage(1);
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Carrega lista única de categorias leves
  useEffect(() => {
    async function loadCategories() {
      try {
        const { data } = await supabase
          .from("produtos_afiliados")
          .select("categoria")
          .not("categoria", "is", null);

        if (data) {
          const cats = new Set<string>();
          data.forEach((p) => {
            if (p.categoria && p.categoria.trim()) {
              cats.add(p.categoria.trim());
            }
          });
          setAvailableCategories(Array.from(cats).sort());
        }
      } catch (err) {
        console.error("Erro ao carregar categorias únicas:", err);
      }
    }
    loadCategories();
  }, []);

  // Busca paginada no Supabase trazendo APENAS as colunas necessárias para os cards
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("produtos_afiliados")
        .select(
          "id, titulo, slug, codigo_fabricante, marca, categoria, veiculos_compativeis, codigo_oem, busca_ml, preco_estimado, preco_antigo, desconto_percentual, imagem_url, link_afiliado, created_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (activeCategory !== "todos") {
        query = query.eq("categoria", activeCategory);
      }

      if (debouncedQuery) {
        const q = debouncedQuery;
        // Filtro otimizado no Supabase por título, marca, código de fabricante, OEM ou compatibilidade
        query = query.or(
          `titulo.ilike.%${q}%,marca.ilike.%${q}%,codigo_fabricante.ilike.%${q}%,codigo_oem.ilike.%${q}%,veiculos_compativeis.ilike.%${q}%,busca_ml.ilike.%${q}%`
        );
      }

      const { data, count, error } = await query;

      if (error) {
        console.error("Erro na consulta paginada do Supabase:", error);
      } else {
        setProducts((data as ProdutoCard[]) || []);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, activeCategory, debouncedQuery]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    startTransition(() => {
      setCurrentPage(newPage);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 340, behavior: "smooth" });
      }
    });
  };

  // Gerador de páginas para a paginação numérica
  const renderPaginationButtons = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }

    return pages;
  };

  const startProductNumber = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endProductNumber = Math.min(totalCount, currentPage * PAGE_SIZE);

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
                onClick={() => {
                  setActiveCategory("todos");
                  setCurrentPage(1);
                }}
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
                  onClick={() => {
                    setActiveCategory(cat);
                    setCurrentPage(1);
                  }}
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
              {totalCount > 0 ? (
                <>
                  Exibindo {startProductNumber} - {endProductNumber} de {totalCount} {totalCount === 1 ? "peça" : "peças"}
                </>
              ) : (
                "Nenhuma peça encontrada"
              )}
            </span>
            {debouncedQuery && (
              <span className="text-xs text-zinc-500">
                para &quot;<strong>{debouncedQuery}</strong>&quot;
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
            <p className="text-sm text-zinc-500">Carregando peças em alta velocidade...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
              <Package className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
                Nenhum produto encontrado
              </h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Não localizamos peças para &quot;{debouncedQuery}&quot;. Tente buscar por modelo de veículo ou código da peça.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("todos");
                setCurrentPage(1);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition cursor-pointer"
            >
              Limpar Filtros de Busca
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((produto) => {
              // Determina link de afiliado oficial
              const buyUrl =
                produto.link_afiliado && produto.link_afiliado.trim()
                  ? produto.link_afiliado.trim()
                  : `/api/redirect?query=${encodeURIComponent(
                      produto.busca_ml || `${produto.marca} ${produto.codigo_fabricante}`
                    )}`;

              // Extração de valores de preço
              const precoAtual = formatPriceDisplay(produto.preco_estimado);
              const precoAntigo = produto.preco_antigo ? formatPriceDisplay(produto.preco_antigo) : null;
              const descontoPercentual = produto.desconto_percentual || null;

              return (
                <div
                  key={produto.id || produto.slug}
                  className="group flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-amber-400 dark:hover:border-amber-500/50 transition-all overflow-hidden"
                >
                  {/* Foto Real Otimizada com next/image */}
                  <div className="relative aspect-[16/10] bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center overflow-hidden border-b border-zinc-100 dark:border-zinc-800">
                    {produto.imagem_url ? (
                      <Image
                        src={produto.imagem_url}
                        alt={produto.titulo}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 text-zinc-400 p-6 text-center">
                        <Package className="w-10 h-10 text-zinc-300 dark:text-zinc-700 group-hover:text-amber-500 transition-colors" />
                        <span className="text-[11px] font-medium text-zinc-400">
                          {produto.marca} - {produto.categoria || "Autopeça"}
                        </span>
                      </div>
                    )}

                    {/* Marca oficial destacada no topo sobre a imagem */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10 pointer-events-none">
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
                      <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md text-xs font-black bg-emerald-600 text-white shadow-md z-10 pointer-events-none">
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
                        className="group-hover:text-amber-500 transition block"
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

                    {/* BLOCO DE PREÇO & CONVERSÃO */}
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
                              <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs px-1.5 py-0.5 rounded">
                                {descontoPercentual}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Preço atual com selo Full */}
                        {precoAtual ? (
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                                {precoAtual}
                              </span>
                              <span className="text-[11px] font-semibold text-zinc-500">
                                no Mercado Livre
                              </span>
                            </div>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-400 text-zinc-950 text-[10px] font-black">
                              <Zap className="w-3 h-3 fill-zinc-950" />
                              FULL
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                            <span>Pronta Entrega Oficial</span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-400 text-zinc-950 text-[10px] font-black">
                              <Zap className="w-3 h-3 fill-zinc-950" />
                              FULL
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Botões: Ver Oferta no Mercado Livre (Full) + Ver Detalhes */}
                      <div className="space-y-2">
                        <a
                          href={buyUrl}
                          target="_blank"
                          rel="nofollow sponsored"
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-zinc-950 font-black text-sm shadow-md hover:shadow-lg transition-all transform active:scale-[0.99] cursor-pointer"
                          title={`Ver Oferta de "${produto.titulo}" no Mercado Livre`}
                        >
                          <Zap className="w-4 h-4 fill-zinc-950 text-zinc-950" />
                          <span>Ver Oferta no Mercado Livre (Full)</span>
                          <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-80" />
                        </a>

                        <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1">
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-500" />
                            Garantia Oficial
                          </span>
                          <Link
                            href={`/peca/${produto.slug}`}
                            className="font-semibold text-zinc-600 dark:text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 transition"
                          >
                            Ver Ficha Técnica &rarr;
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* =========================================================================
            BARRA DE PAGINAÇÃO NAVEGÁVEL COM ALTO DESEMPENHO
        ========================================================================== */}
        {!isLoading && totalPages > 1 && (
          <nav
            aria-label="Paginação do Catálogo"
            className="pt-8 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-200 dark:border-zinc-800"
          >
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Página <strong className="text-zinc-900 dark:text-zinc-100">{currentPage}</strong> de{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">{totalPages}</strong> ({totalCount} peças no total)
            </div>

            <div className="flex items-center gap-1.5">
              {/* Botão Anterior */}
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              {/* Botões Numéricos */}
              <div className="flex items-center gap-1">
                {renderPaginationButtons().map((p, index) => {
                  if (typeof p === "string") {
                    return (
                      <span key={`dots-${index}`} className="px-2 text-xs text-zinc-400">
                        ...
                      </span>
                    );
                  }
                  const isCurrent = p === currentPage;
                  return (
                    <button
                      key={`page-${p}`}
                      type="button"
                      onClick={() => handlePageChange(p)}
                      className={`min-w-9 h-9 flex items-center justify-center text-xs font-bold rounded-xl transition ${
                        isCurrent
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm"
                          : "border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              {/* Botão Próxima */}
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <span>Próxima</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </nav>
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
