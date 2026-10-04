"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  ExternalLink,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Database,
  ArrowUpRight,
  Package,
  Wrench,
  Check,
  Save,
  Tag,
  Car,
  X,
  PlusCircle,
  Link as LinkIcon,
  RotateCw,
  Clock,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface AdminProduct {
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
  ultima_sincronizacao?: string | null;
  especificacoes?: {
    preco_antigo?: string;
    desconto_percentual?: string;
    link_afiliado?: string;
    link_ml?: string;
    link_destino?: string;
    ultima_sincronizacao?: string;
    [key: string]: unknown;
  } | null;
  created_at?: string;
}

interface Toast {
  type: "success" | "error" | "info";
  title?: string;
  message: string;
}

function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) return "Pendente";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Pendente";
  }
}

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Agora";
    if (diffMin < 60) return `Há ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `Há ${diffDays}d`;
  } catch {
    return "";
  }
}

export default function AdminPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [filterSemFoto, setFilterSemFoto] = useState(false);

  // --- Estado do Importador Inteligente por Código via API do ML ---
  const [searchCodeQuery, setSearchCodeQuery] = useState("");
  const [isSearchingCode, setIsSearchingCode] = useState(false);
  const [importMode, setImportMode] = useState<"codigo" | "link">("codigo");

  // --- Estado do Importador Rápido por Link ---
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // --- Estado de Sincronização em Lote de Preços ---
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);

  // Armazena links editados localmente por ID de produto
  const [editedLinks, setEditedLinks] = useState<Record<string, string>>({});

  // Estados de loading por linha
  const [extractingMap, setExtractingMap] = useState<Record<string, boolean>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

  // Feedback Toast
  const [toast, setToast] = useState<Toast | null>(null);

  // Auto-dismiss do Toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Carregar todos os produtos cadastrados no Supabase
  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("produtos_afiliados")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao carregar produtos:", error);
        setToast({
          type: "error",
          title: "Erro no Banco",
          message: `Falha ao carregar produtos: ${error.message}`,
        });
      } else if (data) {
        setProducts(data as AdminProduct[]);
        const links: Record<string, string> = {};
        for (const item of data as AdminProduct[]) {
          const directLink =
            item.link_afiliado ||
            item.especificacoes?.link_afiliado ||
            item.especificacoes?.link_ml ||
            item.especificacoes?.link_destino ||
            "";
          links[item.id] = directLink;
        }
        setEditedLinks(links);
      }
    } catch (err: unknown) {
      console.error(err);
      setToast({
        type: "error",
        message: "Erro de conexão ao consultar produtos no Supabase.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // 0. BUSCA E CADASTRO INTELIGENTE POR CÓDIGO VIA API DO MERCADO LIVRE (1 CLIQUE)
  const handleBuscarCadastrarML = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanQuery = searchCodeQuery.trim();

    if (!cleanQuery) {
      setToast({
        type: "error",
        title: "Código Vazio",
        message: "Por favor, digite o código ou nome da peça (ex: LUK 620 3268 00 HB20).",
      });
      return;
    }

    setIsSearchingCode(true);

    try {
      const res = await fetch("/api/admin/buscar-ml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cleanQuery, autoSave: true }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.produto) {
        throw new Error(data.error || "Não foi possível localizar o produto no Mercado Livre.");
      }

      const novoProduto = data.produto as AdminProduct;

      // Adiciona o novo produto ao topo da lista sem recarregar a página
      setProducts((prev) => [
        novoProduto,
        ...prev.filter((p) => p.id !== novoProduto.id && p.slug !== novoProduto.slug),
      ]);

      const directLink =
        novoProduto.link_afiliado ||
        novoProduto.especificacoes?.link_afiliado ||
        novoProduto.especificacoes?.link_ml ||
        "";
      setEditedLinks((prev) => ({ ...prev, [novoProduto.id]: directLink }));

      setSearchCodeQuery("");

      setToast({
        type: "success",
        title: "Produto Cadastrado via API do ML!",
        message: `"${novoProduto.titulo}" (${novoProduto.codigo_fabricante}) com foto e slug cadastrados em 1 clique!`,
      });
    } catch (err: unknown) {
      console.error("Erro na busca/cadastro via API ML:", err);
      const msg = err instanceof Error ? err.message : "Falha ao buscar produto via API do Mercado Livre.";
      setToast({
        type: "error",
        title: "Erro na Busca API ML",
        message: msg,
      });
    } finally {
      setIsSearchingCode(false);
    }
  };

  // 1. IMPORTAÇÃO RÁPIDA VIA LINK DO MERCADO LIVRE
  const handleImportProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = importUrl.trim();

    if (!cleanUrl) {
      setToast({
        type: "error",
        title: "Link Inválido",
        message: "Por favor, cole um link do anúncio do Mercado Livre.",
      });
      return;
    }

    setIsImporting(true);

    try {
      const res = await fetch("/api/admin/importar-link-ml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.produto) {
        throw new Error(data.error || "Não foi possível extrair dados do anúncio.");
      }

      const novoProduto = data.produto as AdminProduct;

      // Adiciona o novo produto ao topo da lista sem recarregar a página
      setProducts((prev) => [
        novoProduto,
        ...prev.filter((p) => p.id !== novoProduto.id && p.slug !== novoProduto.slug),
      ]);

      const directLink =
        novoProduto.link_afiliado ||
        novoProduto.especificacoes?.link_afiliado ||
        cleanUrl;
      setEditedLinks((prev) => ({ ...prev, [novoProduto.id]: directLink }));

      setImportUrl("");

      setToast({
        type: "success",
        title: "Produto Importado com Sucesso!",
        message: `"${novoProduto.titulo}" cadastrado com preço ${novoProduto.preco_estimado || ""}!`,
      });
    } catch (err: unknown) {
      console.error("Erro na importação:", err);
      const msg = err instanceof Error ? err.message : "Falha ao importar link do Mercado Livre.";
      setToast({
        type: "error",
        title: "Erro na Importação",
        message: msg,
      });
    } finally {
      setIsImporting(false);
    }
  };

  // 2. SINCRONIZAR TODOS OS PREÇOS AGORA VIA CRON ENDPOINT
  const handleSyncAllPrices = async () => {
    setIsSyncingAll(true);
    setSyncStatusText("Sincronizando preços em tempo real com o Mercado Livre (respeitando intervalo de 800ms)...");

    try {
      const res = await fetch("/api/cron/sync-precos", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha na sincronização dos preços.");
      }

      setToast({
        type: "success",
        title: "Sincronização Concluída!",
        message: `${data.atualizados} de ${data.total_processados} produtos foram atualizados com os preços e descontos mais recentes do Mercado Livre.`,
      });

      // Recarrega os dados na tela instantaneamente
      await loadProducts();
    } catch (err: unknown) {
      console.error("Erro na sincronização:", err);
      const msg = err instanceof Error ? err.message : "Erro ao sincronizar preços com o Mercado Livre.";
      setToast({
        type: "error",
        title: "Erro na Sincronização",
        message: msg,
      });
    } finally {
      setIsSyncingAll(false);
      setSyncStatusText(null);
    }
  };

  // Alteração no campo de link da tabela
  const handleLinkChange = (id: string, value: string) => {
    setEditedLinks((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  // 3. Extrair Foto do Mercado Livre para uma linha existente
  const handlePuxarFoto = async (item: AdminProduct) => {
    const rawLink = editedLinks[item.id] || "";
    const cleanLink = rawLink.trim();

    if (!cleanLink) {
      setToast({
        type: "error",
        title: "Link Obrigatório",
        message: "Por favor, insira o link do produto no Mercado Livre antes de puxar a foto.",
      });
      return;
    }

    setExtractingMap((prev) => ({ ...prev, [item.id]: true }));

    try {
      const res = await fetch("/api/admin/extrair-foto-ml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanLink }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.imagem_url) {
        throw new Error(data.error || "Não foi possível extrair a imagem do link fornecido.");
      }

      const novaImagemUrl = data.imagem_url;

      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                imagem_url: novaImagemUrl,
                link_afiliado: cleanLink,
                especificacoes: {
                  ...(p.especificacoes || {}),
                  link_afiliado: cleanLink,
                  link_ml: cleanLink,
                  link_destino: cleanLink,
                },
              }
            : p
        )
      );

      await fetch("/api/admin/atualizar-produto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          imagem_url: novaImagemUrl,
          link_ml: cleanLink,
        }),
      });

      setToast({
        type: "success",
        title: "Foto Atualizada & Salva!",
        message: `A imagem da peça ${item.codigo_fabricante} foi extraída e gravada com sucesso!`,
      });
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Erro ao puxar foto do Mercado Livre.";
      setToast({
        type: "error",
        title: "Falha na Operação",
        message: msg,
      });
    } finally {
      setExtractingMap((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  // 4. Salvar link manualmente para uma linha existente
  const handleSalvarLink = async (item: AdminProduct) => {
    const rawLink = editedLinks[item.id] || "";
    const cleanLink = rawLink.trim();

    setSavingMap((prev) => ({ ...prev, [item.id]: true }));

    try {
      const res = await fetch("/api/admin/atualizar-produto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          link_ml: cleanLink,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao salvar link no banco.");
      }

      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                link_afiliado: cleanLink,
                especificacoes: {
                  ...(p.especificacoes || {}),
                  link_afiliado: cleanLink,
                  link_ml: cleanLink,
                  link_destino: cleanLink,
                },
              }
            : p
        )
      );

      setToast({
        type: "success",
        title: "Link Salvo!",
        message: `Link do Mercado Livre gravado com sucesso para ${item.codigo_fabricante}.`,
      });
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Falha ao gravar link.";
      setToast({ type: "error", message: msg });
    } finally {
      setSavingMap((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  // Produtos filtrados pela busca
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      if (filterSemFoto && item.imagem_url) return false;

      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase().trim();

      return (
        item.titulo?.toLowerCase().includes(q) ||
        item.codigo_fabricante?.toLowerCase().includes(q) ||
        item.marca?.toLowerCase().includes(q) ||
        item.codigo_oem?.toLowerCase().includes(q) ||
        item.veiculos_compativeis?.toLowerCase().includes(q) ||
        item.categoria?.toLowerCase().includes(q)
      );
    });
  }, [products, searchFilter, filterSemFoto]);

  const totalComFoto = products.filter((p) => !!p.imagem_url).length;
  const totalSemFoto = products.length - totalComFoto;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`flex items-start gap-3 p-4 rounded-xl shadow-2xl border backdrop-blur-md ${
              toast.type === "success"
                ? "bg-emerald-950/95 border-emerald-500/50 text-emerald-100"
                : toast.type === "error"
                ? "bg-red-950/95 border-red-500/50 text-red-100"
                : "bg-blue-950/95 border-blue-500/50 text-blue-100"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : toast.type === "error" ? (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            ) : (
              <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-sm">
              {toast.title && <div className="font-bold mb-0.5">{toast.title}</div>}
              <div>{toast.message}</div>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Painel Administrativo de Produtos
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Supabase Live
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Importação rápida e sincronização automática de preços diária
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Botão Sincronizar Todos os Preços Agora */}
            <button
              onClick={handleSyncAllPrices}
              disabled={isSyncingAll}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg border transition shadow-sm cursor-pointer ${
                isSyncingAll
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300 cursor-wait"
                  : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white border-blue-500 shadow-blue-500/20"
              }`}
              title="Executa varredura em todos os anúncios para atualizar preços atuais e descontos"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncingAll ? "animate-spin text-amber-400" : ""}`} />
              <span>{isSyncingAll ? "Sincronizando..." : "🔄 Sincronizar Todos os Preços Agora"}</span>
            </button>

            <button
              onClick={loadProducts}
              disabled={isLoading || isSyncingAll}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              title="Recarregar dados do banco"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
              <span>Recarregar</span>
            </button>

            <Link
              href="/orcamento"
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm cursor-pointer"
              title="Testar Cotação Inteligente de Orçamentos com IA"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cotação IA</span>
            </Link>

            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold transition shadow-sm cursor-pointer"
            >
              <span>Ver Vitrine</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Barra de Progresso / Status de Sincronização */}
      {isSyncingAll && (
        <div className="bg-blue-950/80 border-b border-blue-500/30 px-4 py-3 animate-in fade-in duration-300">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs text-blue-200 font-medium">
              <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
              <span>{syncStatusText}</span>
            </div>
            <span className="text-[11px] font-mono text-blue-300 bg-blue-900/60 px-2 py-0.5 rounded border border-blue-700/50">
              Aguarde a conclusão...
            </span>
          </div>
        </div>
      )}

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* =========================================================================
            DESTAQUE NO TOPO: IMPORTADOR RÁPIDO DE LINK DO MERCADO LIVRE
        ========================================================================== */}
        <section className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-850 border-2 border-emerald-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-4xl space-y-5">
            {/* Header com Alternador de Modos */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-400 to-yellow-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/20">
                  <Zap className="w-5 h-5 fill-slate-950" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      Importador Inteligente do Mercado Livre
                    </h2>
                    <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-emerald-500/20 text-emerald-300 uppercase tracking-wider border border-emerald-500/30">
                      API Oficial & Vitrine
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Cadastre autopeças na vitrine em 1 clique com foto de alta resolução, preços e SEO
                  </p>
                </div>
              </div>

              {/* Botões de Alternância de Modo */}
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setImportMode("codigo")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    importMode === "codigo"
                      ? "bg-amber-400 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Por Código / Peça</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode("link")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    importMode === "link"
                      ? "bg-emerald-500 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Por Link Direto</span>
                </button>
              </div>
            </div>

            {/* MODO 1: BUSCA POR CÓDIGO DA PEÇA VIA API DO ML (1 CLIQUE) */}
            {importMode === "codigo" && (
              <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Digite apenas o <strong>código da peça</strong> ou nome (ex: <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded text-xs">LUK 620 3268 00 HB20</code>). A API do Mercado Livre localiza o anúncio oficial Full, carrega a foto em alta qualidade, calcula o slug e cadastra o produto na vitrine em 1 clique.
                </p>

                <form onSubmit={handleBuscarCadastrarML} className="space-y-3">
                  <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider">
                    Código ou Nome da Peça para Busca na API
                  </label>

                  <div className="flex flex-col sm:flex-row items-stretch gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={searchCodeQuery}
                        onChange={(e) => setSearchCodeQuery(e.target.value)}
                        placeholder="Ex: LUK 620 3268 00 HB20, Cobreq N-358 Gol, Monroe SP030..."
                        disabled={isSearchingCode}
                        className="w-full px-4 py-3.5 text-sm rounded-xl bg-slate-950 border-2 border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 transition shadow-inner"
                      />
                      {searchCodeQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchCodeQuery("")}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSearchingCode || !searchCodeQuery.trim()}
                      className={`flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm tracking-tight transition-all shadow-lg cursor-pointer ${
                        isSearchingCode
                          ? "bg-amber-500 text-slate-950 opacity-90 cursor-wait"
                          : !searchCodeQuery.trim()
                          ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                          : "bg-amber-400 hover:bg-yellow-400 active:bg-amber-500 text-slate-950 hover:scale-[1.02] shadow-amber-400/25"
                      }`}
                      title="Consulta a API do Mercado Livre e cadastra o produto imediatamente na vitrine"
                    >
                      {isSearchingCode ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Consultando API e Cadastrando...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 fill-slate-950 text-slate-950" />
                          <span>Buscar e Cadastrar via API do ML</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Exemplos Rápidos de Consulta */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[11px] text-slate-500">Exemplos rápidos:</span>
                    {["LUK 620 3268 00 HB20", "Cobreq N-358 Gol", "Nakata HG 31139", "Bosch 0250202022"].map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => setSearchCodeQuery(ex)}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition cursor-pointer"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </form>
              </div>
            )}

            {/* MODO 2: IMPORTAÇÃO POR LINK DIRETO DO ANÚNCIO */}
            {importMode === "link" && (
              <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Cole o link direto do anúncio do Mercado Livre (link comum ou de afiliado <code className="bg-slate-800 text-emerald-300 px-1.5 py-0.5 rounded text-xs">meli.la</code>). O sistema fará a raspagem e cadastro automático com foto e preço.
                </p>

                <form onSubmit={handleImportProduct} className="space-y-3">
                  <label className="block text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    Cole o link do anúncio do Mercado Livre
                  </label>

                  <div className="flex flex-col sm:flex-row items-stretch gap-3">
                    <div className="relative flex-1">
                      <input
                        type="url"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://produto.mercadolivre.com.br/MLB-... ou https://meli.la/..."
                        disabled={isImporting}
                        className="w-full px-4 py-3.5 text-sm rounded-xl bg-slate-950 border-2 border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/20 transition shadow-inner"
                      />
                      {importUrl && (
                        <button
                          type="button"
                          onClick={() => setImportUrl("")}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isImporting || !importUrl.trim()}
                      className={`flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm tracking-tight transition-all shadow-lg cursor-pointer ${
                        isImporting
                          ? "bg-emerald-600 text-slate-950 opacity-90 cursor-wait"
                          : !importUrl.trim()
                          ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                          : "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 hover:scale-[1.02] shadow-emerald-500/25"
                      }`}
                    >
                      {isImporting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                          <span>A extrair dados do anúncio...</span>
                        </>
                      ) : (
                        <>
                          <PlusCircle className="w-4 h-4" />
                          <span>Importar Produto para a Vitrine</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </section>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400">Total de Peças Cadastradas</span>
              <div className="text-2xl font-black text-white mt-1">{products.length}</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
              <Database className="w-5 h-5" />
            </div>
          </div>

          <div
            onClick={() => setFilterSemFoto(false)}
            className={`bg-slate-900 border rounded-xl p-4 flex items-center justify-between cursor-pointer transition ${
              !filterSemFoto ? "border-emerald-500/40 bg-emerald-950/10" : "border-slate-800 hover:border-slate-700"
            }`}
          >
            <div>
              <span className="text-xs font-medium text-slate-400">Com Foto Extraída</span>
              <div className="text-2xl font-black text-emerald-400 mt-1">{totalComFoto}</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div
            onClick={() => setFilterSemFoto(!filterSemFoto)}
            className={`bg-slate-900 border rounded-xl p-4 flex items-center justify-between cursor-pointer transition ${
              filterSemFoto ? "border-amber-500/60 bg-amber-950/20" : "border-slate-800 hover:border-slate-700"
            }`}
          >
            <div>
              <span className="text-xs font-medium text-slate-400">Sem Foto</span>
              <div className="text-2xl font-black text-amber-400 mt-1">{totalSemFoto}</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ImageIcon className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Search & Counter Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar por código, marca, modelo ou título..."
              className="w-full pl-10 pr-8 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-slate-400">
            <span>
              Exibindo <strong>{filteredProducts.length}</strong> de {products.length} produtos
            </span>
            {filterSemFoto && (
              <button
                onClick={() => setFilterSemFoto(false)}
                className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/30"
              >
                Limpar filtro
              </button>
            )}
          </div>
        </div>

        {/* Tabela Limpa de Produtos Cadastrados */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-sm text-slate-400">Carregando catálogo do banco Supabase...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Package className="w-12 h-12 text-slate-600 mx-auto" />
              <div className="text-base font-bold text-white">Nenhum produto encontrado</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Não há produtos correspondentes à busca atual. Cole um link do Mercado Livre no topo para adicionar.
              </p>
              <button
                onClick={() => {
                  setSearchFilter("");
                  setFilterSemFoto(false);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                Limpar Filtros
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4 w-24 text-center">Foto</th>
                    <th className="py-3.5 px-4 w-40">Código / Marca</th>
                    <th className="py-3.5 px-4 min-w-[240px]">Título / Veículos</th>
                    <th className="py-3.5 px-4 w-32 text-right">Preço</th>
                    <th className="py-3.5 px-3 w-32 text-center">Última Sinc.</th>
                    <th className="py-3.5 px-4 min-w-[320px]">Link do Mercado Livre & Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {filteredProducts.map((item) => {
                    const isExtracting = !!extractingMap[item.id];
                    const isSaving = !!savingMap[item.id];
                    const currentLink =
                      editedLinks[item.id] ||
                      item.link_afiliado ||
                      item.especificacoes?.link_afiliado ||
                      item.especificacoes?.link_ml ||
                      "";
                    const hasLink = !!currentLink.trim();

                    const ultimaSinc =
                      item.ultima_sincronizacao ||
                      item.especificacoes?.ultima_sincronizacao ||
                      null;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-800/40 transition-colors group"
                      >
                        {/* 1. Foto / Miniatura */}
                        <td className="py-4 px-4 align-middle">
                          <div className="w-20 h-20 rounded-xl bg-slate-950 border border-slate-800 p-1 relative flex items-center justify-center overflow-hidden mx-auto shadow-sm group-hover:border-slate-700 transition">
                            {item.imagem_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={item.imagem_url}
                                alt={item.titulo}
                                className="w-full h-full object-contain rounded-lg"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                  const fallback = (e.target as HTMLElement).parentElement?.querySelector(".img-empty");
                                  if (fallback) fallback.classList.remove("hidden");
                                }}
                              />
                            ) : null}

                            <div
                              className={`img-empty flex flex-col items-center justify-center text-slate-600 gap-1 ${
                                item.imagem_url ? "hidden" : "flex"
                              }`}
                            >
                              <ImageIcon className="w-6 h-6 text-slate-600" />
                              <span className="text-[9px] uppercase font-bold text-slate-500">
                                Sem foto
                              </span>
                            </div>

                            {item.imagem_url && (
                              <div
                                className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-950"
                                title="Foto vinculada"
                              />
                            )}
                          </div>
                        </td>

                        {/* 2. Código e Marca */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              <Tag className="w-3 h-3 text-amber-400" />
                              {item.codigo_fabricante}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300">
                                {item.marca}
                              </span>
                              {item.categoria && (
                                <span className="text-[11px] text-slate-400">
                                  • {item.categoria}
                                </span>
                              )}
                            </div>
                            {item.codigo_oem && (
                              <div className="text-[11px] font-mono text-slate-400">
                                OEM: <span className="text-slate-300">{item.codigo_oem}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 3. Título e Veículos Compatíveis */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1.5">
                            <div className="font-semibold text-white leading-snug line-clamp-2">
                              {item.titulo}
                            </div>
                            {item.veiculos_compativeis && (
                              <div className="flex items-start gap-1.5 text-xs text-slate-400">
                                <Car className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-2 leading-relaxed">
                                  {item.veiculos_compativeis}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 4. Preço */}
                        <td className="py-4 px-4 align-top text-right">
                          {item.preco_estimado ? (
                            <div className="space-y-0.5">
                              {(item.preco_antigo || item.especificacoes?.preco_antigo) && (
                                <div className="text-[11px] text-slate-500 line-through">
                                  {String(item.preco_antigo || item.especificacoes?.preco_antigo)}
                                </div>
                              )}
                              <div className="font-mono font-bold text-emerald-400 text-sm">
                                {String(item.preco_estimado)}
                              </div>
                              {(item.desconto_percentual || item.especificacoes?.desconto_percentual) && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  {String(item.desconto_percentual || item.especificacoes?.desconto_percentual)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">-</span>
                          )}
                        </td>

                        {/* 5. Última Sincronização */}
                        <td className="py-4 px-3 align-top text-center">
                          {ultimaSinc ? (
                            <div className="space-y-1">
                              <div className="inline-flex items-center gap-1 text-[11px] text-slate-300 font-mono">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>{formatDateDisplay(ultimaSinc)}</span>
                              </div>
                              <div className="text-[10px] text-emerald-400 font-medium">
                                {formatTimeAgo(ultimaSinc)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-medium italic">
                              Pendente
                            </span>
                          )}
                        </td>

                        {/* 6. Link Mercado Livre & Ação */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <input
                                  type="url"
                                  value={currentLink}
                                  onChange={(e) => handleLinkChange(item.id, e.target.value)}
                                  placeholder="Link do anúncio..."
                                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 font-mono"
                                />
                              </div>

                              {hasLink && (
                                <a
                                  href={currentLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-xs font-semibold shrink-0"
                                  title="Ver anúncio no Mercado Livre"
                                >
                                  <span>Ver Anúncio</span>
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handlePuxarFoto(item)}
                                disabled={isExtracting || !hasLink}
                                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer ${
                                  !hasLink
                                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                                    : isExtracting
                                    ? "bg-amber-600 text-slate-950 opacity-80"
                                    : "bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950"
                                }`}
                                title="Extrair foto atualizada do link informado"
                              >
                                {isExtracting ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Puxando...</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                                    <span>Puxar Foto</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSalvarLink(item)}
                                disabled={isSaving || !hasLink}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                                title="Salvar alteração do link no Supabase"
                              >
                                {isSaving ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                                ) : (
                                  <Save className="w-3 h-3 text-slate-400" />
                                )}
                                <span>Salvar Link</span>
                              </button>

                              {item.imagem_url && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium ml-auto">
                                  <Check className="w-3 h-3" />
                                  OK
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
