"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import {
  Sparkles,
  Upload,
  Camera,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  RefreshCw,
  Zap,
  Wrench,
  ArrowRight,
  X,
  Tag,
  ShieldCheck,
  ShoppingBag,
  Package,
  Check,
  Copy,
  MessageSquare,
  CheckSquare,
  Square,
  Building2,
  Share2,
  LayoutGrid,
  List,
  BadgePercent,
  TrendingDown,
} from "lucide-react";

interface ItemOrcamento {
  codigo?: string | null;
  marca?: string | null;
  nome?: string;
  preco_fornecedor?: number | null | string;
  preco_ml?: number | null | string;
  preco?: number | null | string;
  price?: number | null | string;
  valor?: number | null | string;
  quantidade?: number;
  termo_busca?: string;
  peca_padronizada?: string;
  nome_peca?: string;
  posicao?: string | null;
  marcas_recomendadas?: string;
  termo_busca_ml?: string;
  termo_busca_mercadolivre?: string;
  confianca?: "alta" | "media" | "baixa";

  // Preços
  preco_real_ml?: number | null;
  preco_formatado?: string | null;
  preco_estimado?: number | null | string;

  // Links
  link?: string | null;
  link_ml?: string | null;
  linkAfiliado?: string | null;
  link_afiliado?: string | null;
  affiliate_link?: string | null;
  url?: string | null;
  permalink?: string | null;
  slug?: string | null;

  titulo_anuncio?: string | null;
  titulo?: string | null;
  link_anuncio?: string | null;
  tem_full?: boolean;
  imagem?: string | null;
  thumbnail?: string | null;
  imagem_url?: string | null;
  encontrado?: boolean;
  marca_recomendada?: string;
  query_busca?: string;
}

interface VeiculoOrcamento {
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  motorizacao?: string | null;
  placa?: string | null;
  nome_completo?: string | null;
}

interface OrcamentoResultado {
  veiculo?: VeiculoOrcamento | string;
  placa?: string | null;
  itens: ItemOrcamento[];
  observacoes_gerais?: string | null;
  veiculo_detectado?: string;
  total_estimado?: string;
  total_fornecedor?: number | null;
  total_fornecedor_formatado?: string | null;
}

const EXEMPLOS_PRONTOS = [
  "COFAP GP32965 - Amortecedor Dianteiro (R$ 340,00) | COBREQ N-1365 - Pastilha Dianteira (R$ 145,00)",
  "CONTITECH CT488K1 - Kit Correia Dentada (R$ 260,00) | NGK BKR6E - Jogo de Velas (R$ 110,00)",
  "TECFIL PSL55 - Filtro de Óleo (R$ 42,00) | FREMAX BD4742 - Par Disco de Freio (R$ 310,00)",
];

const ML_TOOL = process.env.NEXT_PUBLIC_ML_MATT_TOOL || "31976628";
const ML_WORD = process.env.NEXT_PUBLIC_ML_MATT_WORD || "hubmultimercado";

function formatarLinkAfiliadoFrontend(url: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("/")) return trimmed;

  const [baseWithoutHash] = trimmed.split("#");
  let baseWithQuery = baseWithoutHash;
  if (!baseWithQuery.includes("matt_tool")) {
    const sep = baseWithQuery.includes("?") ? "&" : "?";
    baseWithQuery = `${baseWithQuery}${sep}matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
  }
  return `${baseWithQuery}#matt_tool=${ML_TOOL}&matt_word=${ML_WORD}`;
}

const formatPrice = (val: any, fallback?: any): string => {
  let num: number;
  if (typeof val === "number") {
    num = val;
  } else {
    const cleaned = String(val ?? "").replace(/[^0-9.,]/g, "").replace(",", ".");
    num = parseFloat(cleaned);
  }
  if (isNaN(num) || num <= 0) {
    if (fallback) return formatPrice(fallback);
    return "R$ 0,00";
  }
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const getNumericPrice = (item: ItemOrcamento | undefined | null): number => {
  if (!item) return 0;
  const val =
    item.preco_ml ??
    item.preco ??
    item.price ??
    item.valor ??
    item.preco_fornecedor ??
    item.preco_estimado;

  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return isNaN(val) || val <= 0 ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.,]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? 0 : num;
};

const getItemAffiliateUrl = (item: ItemOrcamento): string => {
  const directUrl =
    item.linkAfiliado ||
    item.link_afiliado ||
    item.affiliate_link ||
    item.url ||
    item.permalink ||
    item.link_ml ||
    item.link ||
    item.link_anuncio;

  if (directUrl && typeof directUrl === "string" && directUrl.trim()) {
    const trimmed = directUrl.trim();
    if (trimmed.startsWith("/")) return trimmed;
    return formatarLinkAfiliadoFrontend(trimmed);
  }

  const codMarca = `${item.codigo || ""} ${item.marca || ""}`.trim() || item.nome || "";
  const searchUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(codMarca)}`;
  return formatarLinkAfiliadoFrontend(searchUrl);
};

function gerarTextoClienteFinal(
  resultado: OrcamentoResultado,
  itensSelecionados: number[],
  totalSelecionado: number
): string {
  let msg = `⚙️ *CONVERSÃO DE COTAÇÃO DE AUTOPEÇAS*\n`;
  msg += `📋 *Itens Selecionados (${itensSelecionados.length}):*\n\n`;

  const itensParaEnviar = resultado.itens.filter((_, idx) => itensSelecionados.includes(idx));

  if (itensParaEnviar.length === 0) {
    msg += `(Nenhuma peça selecionada)\n`;
  } else {
    itensParaEnviar.forEach((item, index) => {
      const qtd = Number(item.quantidade) || 1;
      const cod = item.codigo && item.codigo !== "S/ CÓDIGO" ? `[${item.codigo}] ` : "";
      const marca = item.marca && item.marca !== "Original" ? `${item.marca} ` : "";
      const nome = item.nome || item.peca_padronizada || "Peça";
      const precoML = getNumericPrice(item);
      const precoMLTexto = formatPrice(precoML);
      const precoForn = item.preco_fornecedor ? formatPrice(item.preco_fornecedor) : null;
      const link = getItemAffiliateUrl(item);

      msg += `${index + 1}. *${qtd}x ${cod}${marca}${nome}*\n`;
      if (precoForn) {
        msg += `   🏢 Preço Fornecedor: ${precoForn}\n`;
      }
      msg += `   🛒 Preço Mercado Livre: ${precoMLTexto}\n`;
      msg += `   🔗 Link: ${link}\n\n`;
    });

    if (totalSelecionado > 0) {
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `*TOTAL NO MERCADO LIVRE:* ${totalSelecionado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n`;
    }
  }

  msg += `\nCotado via *PeçasFinder* ⚡`;
  return msg;
}

function gerarTextoFornecedores(
  resultado: OrcamentoResultado,
  itensSelecionados: number[]
): string {
  const itensParaEnviar = resultado.itens.filter((_, idx) => itensSelecionados.includes(idx));

  let msg = `📋 COTAÇÃO DE AUTOPEÇAS POR CÓDIGO (PART NUMBER)\n\n`;
  msg += `Itens Solicitados:\n`;

  if (itensParaEnviar.length === 0) {
    msg += `(Nenhuma peça selecionada)\n`;
  } else {
    itensParaEnviar.forEach((item, index) => {
      const qtd = Number(item.quantidade) || 1;
      const cod = item.codigo && item.codigo !== "S/ CÓDIGO" ? `${item.codigo} ` : "";
      const marca = item.marca && item.marca !== "Original" ? `(${item.marca}) ` : "";
      const nome = item.nome || "Peça";
      msg += `${index + 1}. ${qtd}x ${cod}${marca}- ${nome}\n`;
    });
  }

  msg += `\nFavor informar disponibilidade e valores de balcão. Obrigado!`;
  return msg;
}

export default function OrcamentoPage() {
  const [texto, setTexto] = useState("");
  const [imagem, setImagem] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [resultado, setResultado] = useState<OrcamentoResultado | null>(null);
  const [itensSelecionados, setItensSelecionados] = useState<number[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [avisoPopupsBloqueados, setAvisoPopupsBloqueados] = useState(false);
  const [copiadoCliente, setCopiadoCliente] = useState(false);
  const [copiadoFornecedor, setCopiadoFornecedor] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErro("Por favor, selecione um arquivo de imagem válido (.jpg, .png, .webp).");
      return;
    }
    setImagem(file);
    setErro(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagemPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setImagem(null);
    setImagemPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!texto.trim() && !imagem) {
      setErro("Por favor, digite a lista com os códigos ou envie a foto/print do orçamento do fornecedor.");
      return;
    }

    setIsLoading(true);
    setErro(null);
    setAviso(null);
    setResultado(null);

    try {
      const formData = new FormData();
      if (texto.trim()) {
        formData.append("texto", texto.trim());
      }
      if (imagem) {
        formData.append("imagem", imagem);
      }

      const res = await fetch("/api/orcamento", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const erroTexto = await res.text();
        let mensagemErro = `Erro no servidor (${res.status}): ${erroTexto.slice(0, 100)}`;
        try {
          const parsed = JSON.parse(erroTexto);
          if (parsed?.error) {
            mensagemErro = parsed.error;
          }
        } catch {}
        throw new Error(mensagemErro);
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Não foi possível converter o orçamento.");
      }

      const itensRecebidos: ItemOrcamento[] = data.itens || data.data?.itens || [];
      const veiculoRecebido = data.veiculo || "Orçamento de Fornecedor";
      const totalRecebido = data.total_estimado || data.data?.total_estimado || "R$ 0,00";

      const orcamentoRetornado: OrcamentoResultado = {
        veiculo: veiculoRecebido,
        itens: itensRecebidos,
        total_estimado: totalRecebido,
        total_fornecedor: data.total_fornecedor ?? null,
        total_fornecedor_formatado: data.total_fornecedor_formatado ?? null,
      };

      setResultado(orcamentoRetornado);
      setItensSelecionados(itensRecebidos.map((_: any, i: number) => i));

      if (data.aviso) {
        setAviso(data.aviso);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Erro ao processar orçamento com IA.";
      setErro(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const totalGeralML = (resultado?.itens || []).reduce((acc, item) => {
    const qtd = Number(item.quantidade) || 1;
    const preco = getNumericPrice(item);
    return acc + qtd * preco;
  }, 0);

  const totalSelecionadoML = (resultado?.itens || []).reduce((acc, item, idx) => {
    if (!itensSelecionados.includes(idx)) return acc;
    const qtd = Number(item.quantidade) || 1;
    const preco = getNumericPrice(item);
    return acc + qtd * preco;
  }, 0);

  const totalSelecionadoFornecedor = (resultado?.itens || []).reduce((acc, item, idx) => {
    if (!itensSelecionados.includes(idx)) return acc;
    const qtd = Number(item.quantidade) || 1;
    const precoForn = typeof item.preco_fornecedor === "number" ? item.preco_fornecedor : 0;
    return acc + qtd * precoForn;
  }, 0);

  const diferencaEconomia = totalSelecionadoFornecedor > 0 && totalSelecionadoML > 0
    ? totalSelecionadoFornecedor - totalSelecionadoML
    : 0;

  const handleToggleItem = (idx: number) => {
    setItensSelecionados((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleToggleTodos = () => {
    if (!resultado?.itens) return;
    if (itensSelecionados.length === resultado.itens.length) {
      setItensSelecionados([]);
    } else {
      setItensSelecionados(resultado.itens.map((_, i) => i));
    }
  };

  const handleEnviarWhatsAppCliente = () => {
    if (!resultado) return;
    const msg = gerarTextoClienteFinal(resultado, itensSelecionados, totalSelecionadoML);
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handleCopiarCliente = async () => {
    if (!resultado) return;
    const msg = gerarTextoClienteFinal(resultado, itensSelecionados, totalSelecionadoML);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiadoCliente(true);
      setTimeout(() => setCopiadoCliente(false), 3000);
    } catch (err) {
      console.error("Erro ao copiar:", err);
    }
  };

  const handleEnviarWhatsAppFornecedores = () => {
    if (!resultado) return;
    const msg = gerarTextoFornecedores(resultado, itensSelecionados);
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handleCopiarFornecedores = async () => {
    if (!resultado) return;
    const msg = gerarTextoFornecedores(resultado, itensSelecionados);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiadoFornecedor(true);
      setTimeout(() => setCopiadoFornecedor(false), 3000);
    } catch (err) {
      console.error("Erro ao copiar:", err);
    }
  };

  const handleAbrirTodas = () => {
    if (!resultado?.itens || resultado.itens.length === 0) return;

    const itensParaAbrir = resultado.itens.filter((_, idx) =>
      itensSelecionados.length > 0 ? itensSelecionados.includes(idx) : true
    );

    itensParaAbrir.forEach((item, index) => {
      const urlFinal = getItemAffiliateUrl(item);

      if (urlFinal) {
        setTimeout(() => {
          try {
            const novaAba = window.open(urlFinal, "_blank", "noopener,noreferrer");
            if (!novaAba || novaAba.closed || typeof novaAba.closed === "undefined") {
              setAvisoPopupsBloqueados(true);
            }
          } catch {
            setAvisoPopupsBloqueados(true);
          }
        }, index * 250);
      }
    });

    if (itensParaAbrir.length > 1) {
      setTimeout(() => {
        setAvisoPopupsBloqueados(true);
      }, itensParaAbrir.length * 250 + 100);
    }
  };

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
                Conversor de Orçamento de Fornecedor
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              <span>Ver Vitrine</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 border-b border-zinc-200 dark:border-zinc-800/80 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-3.5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
            <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Conversor de Orçamento por Código (Part Number)
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-zinc-900 dark:text-white leading-tight">
            Importar Orçamento de Fornecedor / Autopeças (Por Código)
          </h1>

          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Envie a foto ou print da cotação do fornecedor OU cole a lista com códigos e marcas dos fabricantes. Encontramos as ofertas correspondentes com os melhores preços no Mercado Livre.
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Formulário Interativo de Cotação */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border-2 border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Opção 1: Upload de Foto / Print */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-amber-500" />
                    Opção 1: Foto / Print do Orçamento
                  </span>
                  <span className="text-[11px] font-normal text-zinc-400">Recomendado</span>
                </label>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center min-h-[220px] ${
                    isDragging
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20 scale-[0.99]"
                      : imagemPreview
                      ? "border-emerald-500/60 bg-emerald-50/10 dark:bg-emerald-950/10"
                      : "border-zinc-300 dark:border-zinc-700 hover:border-amber-400 bg-zinc-50/50 dark:bg-zinc-950/50"
                  }`}
                >
                  {imagemPreview ? (
                    <div className="space-y-3 w-full">
                      <div className="relative w-36 h-36 mx-auto rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-md">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imagemPreview}
                          alt="Pré-visualização do orçamento"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={handleClearImage}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-zinc-900/80 text-white hover:bg-red-600 transition"
                          title="Remover foto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Foto / Print anexado ({imagem?.name})</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          Arraste o print ou clique para escolher
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          Print do WhatsApp, tela do sistema ou papel de orçamento (JPG, PNG)
                        </p>
                      </div>

                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition cursor-pointer"
                        >
                          Arquivo
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-500 text-zinc-950 transition cursor-pointer flex items-center gap-1"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Tirar Foto</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Opção 2: Colar Lista com Códigos */}
              <div className="space-y-2.5 flex flex-col justify-between">
                <div className="space-y-2.5 flex-1 flex flex-col">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-500" />
                    Opção 2: Cole a Lista com Códigos (Part Numbers)
                  </label>

                  <textarea
                    rows={6}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Cole aqui a cotação do seu fornecedor. Exemplo:
COFAP GP32965 - Amortecedor Dianteiro (R$ 340,00)
COBREQ N-1365 - Pastilha Dianteira (R$ 145,00)
TECFIL PSL55 - Filtro de Óleo (R$ 42,00)"
                    className="w-full flex-1 p-3.5 text-xs sm:text-sm rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 focus:outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 transition resize-none placeholder:text-zinc-400 leading-relaxed font-mono"
                  />
                </div>

                {/* Exemplos Rápidos com Códigos Reais */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-zinc-400 block">
                    Ou teste um exemplo rápido com códigos de fábrica:
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {EXEMPLOS_PRONTOS.map((ex, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setTexto(ex)}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-amber-100 dark:hover:bg-amber-950/50 hover:text-amber-900 dark:hover:text-amber-300 transition cursor-pointer text-left line-clamp-1 font-mono border border-zinc-200 dark:border-zinc-700"
                      >
                        <span className="font-bold text-amber-600 dark:text-amber-400 mr-1.5">Ex {idx + 1}:</span>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Mensagem de Erro */}
            {erro && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
            )}

            {/* Mensagem de Aviso */}
            {aviso && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <span>{aviso}</span>
              </div>
            )}

            {/* Botão em Destaque: Converter Códigos para Mercado Livre */}
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-4 px-6 rounded-2xl font-black text-base flex items-center justify-center gap-2.5 shadow-xl transition-all transform active:scale-[0.99] cursor-pointer ${
                  isLoading
                    ? "bg-amber-600 text-zinc-950 opacity-90 cursor-wait"
                    : "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 shadow-amber-400/25 hover:shadow-2xl"
                }`}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Identificando códigos e localizando ofertas no Mercado Livre...</span>
                  </>
                ) : (
                  <>
                    <Tag className="w-5 h-5 fill-zinc-950" />
                    <span>Converter Códigos para o Mercado Livre</span>
                    <ArrowRight className="w-5 h-5 ml-1" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* =========================================================================
            ÁREA DE RESULTADOS DA CONVERSÃO
        ========================================================================== */}
        {resultado && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
            {/* Card de Resumo e Comparativo de Preços */}
            <div className="bg-gradient-to-r from-zinc-900 to-zinc-950 text-white rounded-3xl p-6 sm:p-8 border border-zinc-800 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Códigos de Fornecedor Identificados
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center flex-wrap gap-3">
                  <Tag className="w-7 h-7 text-amber-400 shrink-0" />
                  <span>{resultado.itens.length} Peças Prontas para Compra</span>
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400">
                  Cruzamos os Part Numbers dos fabricantes diretamente com os estoques do Mercado Livre.
                </p>

                {totalSelecionadoFornecedor > 0 && diferencaEconomia > 0 && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-xs text-emerald-300 font-bold mt-2">
                    <TrendingDown className="w-4 h-4 text-emerald-400" />
                    <span>Economia estimada no Mercado Livre: {formatPrice(diferencaEconomia)}</span>
                  </div>
                )}
              </div>

              <div className="bg-zinc-800/80 backdrop-blur rounded-2xl p-5 border border-zinc-700/80 text-left md:text-right shrink-0 flex flex-col justify-between">
                <div>
                  {totalSelecionadoFornecedor > 0 && (
                    <div className="mb-2 pb-2 border-b border-zinc-700/60">
                      <span className="text-[11px] text-zinc-400 block">Total Fornecedor</span>
                      <span className="text-sm font-bold text-zinc-300 font-mono line-through">
                        {formatPrice(totalSelecionadoFornecedor)}
                      </span>
                    </div>
                  )}

                  <span className="text-xs text-emerald-400 block font-bold uppercase tracking-wider">
                    Total Mercado Livre
                  </span>
                  <span className="text-3xl font-black text-emerald-400 font-mono block mt-0.5">
                    {totalSelecionadoML > 0 ? formatPrice(totalSelecionadoML) : (resultado.total_estimado || "R$ 0,00")}
                  </span>
                  <span className="text-[11px] text-zinc-400 mt-1 block">
                    {itensSelecionados.length} peças selecionadas
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-zinc-950 font-black text-xs transition shadow-lg hover:shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer transform active:scale-95"
                  title="Abrir checklist de fechamento"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Fechar Pedido Completo</span>
                </button>
              </div>
            </div>

            {/* Container da Tabela / Cards */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-amber-500" />
                    Tabela Comparativa de Peças (Por Código)
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Compare os valores informados pelo fornecedor com as melhores ofertas do Mercado Livre.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                  <div className="inline-flex rounded-xl p-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => setViewMode("table")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        viewMode === "table"
                          ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                      title="Visualização em Tabela"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Tabela</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("cards")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        viewMode === "cards"
                          ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                      title="Visualização em Cards"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Cards</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black transition shadow-md hover:shadow-lg cursor-pointer transform active:scale-95"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Fechar ({resultado.itens.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAbrirTodas}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold hover:opacity-90 transition shadow-sm cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir todas no ML</span>
                  </button>
                </div>
              </div>

              {/* VISÃO 1: TABELA COMPLETA COM AS COLUNAS SOLICITADAS */}
              {viewMode === "table" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        <th className="py-3.5 px-4 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={resultado.itens.length > 0 && itensSelecionados.length === resultado.itens.length}
                            onChange={handleToggleTodos}
                            className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                            title="Selecionar / Desmarcar todos"
                          />
                        </th>
                        <th className="py-3.5 px-3 w-16 text-center">QTD</th>
                        <th className="py-3.5 px-4 w-44">CÓDIGO / PART NUMBER</th>
                        <th className="py-3.5 px-4">MARCA & DESCRIÇÃO DA PEÇA</th>
                        <th className="py-3.5 px-4 w-40 text-right">PREÇO FORNECEDOR</th>
                        <th className="py-3.5 px-4 w-44 text-right">OFERTA MERCADO LIVRE</th>
                        <th className="py-3.5 px-4 w-40 text-center">COMPRAR NO ML</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
                      {resultado.itens.map((item, idx) => {
                        const isChecked = itensSelecionados.includes(idx);
                        const finalUrl = getItemAffiliateUrl(item);
                        const qtd = Number(item.quantidade) || 1;
                        const precoUnitML = getNumericPrice(item);
                        const subtotalML = qtd * precoUnitML;
                        const precoForn = typeof item.preco_fornecedor === "number" ? item.preco_fornecedor : null;
                        const tituloReal = item.titulo || item.titulo_anuncio || item.nome || "Peça";
                        const imagemReal = item.imagem || item.imagem_url || item.thumbnail;
                        const codigo = item.codigo && item.codigo !== "S/ CÓDIGO" ? item.codigo : null;
                        const marca = item.marca && item.marca !== "Original" ? item.marca : "Original / Homologada";

                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors ${
                              !isChecked ? "opacity-60 bg-zinc-50/30 dark:bg-zinc-950/20" : ""
                            }`}
                          >
                            {/* 1. Checkbox */}
                            <td className="py-3.5 px-4 text-center align-middle">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleItem(idx)}
                                className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                              />
                            </td>

                            {/* 2. QTD */}
                            <td className="py-3.5 px-3 text-center align-middle">
                              <span className="inline-block px-2 py-0.5 text-xs font-bold font-mono rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
                                {qtd}x
                              </span>
                            </td>

                            {/* 3. CÓDIGO / PART NUMBER (EM DESTAQUE COM BADGE) */}
                            <td className="py-3.5 px-4 align-middle">
                              {codigo ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-black bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 shadow-xs tracking-wider">
                                  <Tag className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                  <span>{codigo}</span>
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                                  S/ Código
                                </span>
                              )}
                            </td>

                            {/* 4. MARCA & DESCRIÇÃO DA PEÇA */}
                            <td className="py-3.5 px-4 align-middle">
                              <div className="flex items-center gap-3">
                                {imagemReal ? (
                                  <div className="w-11 h-11 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={imagemReal}
                                      alt={tituloReal}
                                      className="w-full h-full object-contain p-0.5"
                                    />
                                  </div>
                                ) : null}

                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100 leading-tight flex items-center flex-wrap gap-1.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
                                      {marca}
                                    </span>
                                    <span>{item.nome || item.peca_padronizada}</span>
                                  </div>

                                  {tituloReal && tituloReal !== (item.nome || item.peca_padronizada) && (
                                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 max-w-md">
                                      {tituloReal}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 5. PREÇO FORNECEDOR (SE INFORMADO) */}
                            <td className="py-3.5 px-4 align-middle text-right font-mono">
                              {precoForn !== null && precoForn > 0 ? (
                                <div>
                                  <span className="font-semibold text-xs text-zinc-600 dark:text-zinc-400 block leading-tight">
                                    {formatPrice(precoForn * qtd)}
                                  </span>
                                  {qtd > 1 && (
                                    <span className="text-[10px] text-zinc-400 block">
                                      {qtd}x de {formatPrice(precoForn)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-400 italic">
                                  Não informado
                                </span>
                              )}
                            </td>

                            {/* 6. PREÇO / OFERTA MERCADO LIVRE */}
                            <td className="py-3.5 px-4 align-middle text-right font-mono">
                              <div>
                                <span className="font-black text-sm text-emerald-600 dark:text-emerald-400 block leading-tight">
                                  {formatPrice(subtotalML > 0 ? subtotalML : (item.preco_estimado || 0))}
                                </span>
                                {qtd > 1 && precoUnitML > 0 && (
                                  <span className="text-[10px] text-zinc-400 block">
                                    {qtd}x de {formatPrice(precoUnitML)}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 7. BOTÃO COMPRAR NO ML (COM AFILIADO) */}
                            <td className="py-3.5 px-4 align-middle text-center">
                              <a
                                href={finalUrl}
                                target="_blank"
                                rel="noopener noreferrer sponsored"
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black transition cursor-pointer shadow-xs transform active:scale-95"
                                title={`Comprar ${codigo || item.nome} no Mercado Livre`}
                              >
                                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                                <span>Comprar no ML ↗</span>
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* VISÃO 2: CARDS DE PRODUTOS COM CÓDIGOS */}
              {viewMode === "cards" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 p-6 bg-zinc-50/40 dark:bg-zinc-950/30">
                  {resultado.itens.map((item, idx) => {
                    const isChecked = itensSelecionados.includes(idx);
                    const finalUrl = getItemAffiliateUrl(item);
                    const precoNum = getNumericPrice(item);
                    const precoForn = typeof item.preco_fornecedor === "number" ? item.preco_fornecedor : null;
                    const tituloReal = item.titulo || item.titulo_anuncio || item.nome || "Peça";
                    const imagemReal = item.imagem || item.imagem_url || item.thumbnail;
                    const codigo = item.codigo && item.codigo !== "S/ CÓDIGO" ? item.codigo : null;
                    const marca = item.marca && item.marca !== "Original" ? item.marca : "Original";

                    return (
                      <div
                        key={idx}
                        className={`bg-white dark:bg-zinc-900 border rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-200 group ${
                          isChecked
                            ? "border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20"
                            : "border-zinc-200 dark:border-zinc-800 opacity-70"
                        }`}
                      >
                        <div>
                          {/* Cabeçalho: Badge Código + Checkbox */}
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleItem(idx)}
                                className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500 shrink-0"
                              />
                              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                {item.nome}
                              </span>
                            </label>

                            {codigo && (
                              <span className="px-2 py-0.5 text-[11px] font-mono font-black rounded-md bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                                {codigo}
                              </span>
                            )}
                          </div>

                          {/* Foto */}
                          <div className="w-full h-40 rounded-xl bg-white dark:bg-zinc-950 flex items-center justify-center overflow-hidden border border-zinc-100 dark:border-zinc-800/80 mb-3 relative group-hover:border-emerald-500/30 transition-colors">
                            {imagemReal ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={imagemReal}
                                alt={tituloReal}
                                className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-zinc-400 gap-1.5 p-4">
                                <Package className="w-10 h-10 opacity-30 text-amber-500" />
                                <span className="text-[11px] text-zinc-400 text-center font-medium">
                                  Oferta ativa no Mercado Livre
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Marca & Título */}
                          <div className="mb-2">
                            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                              Marca: <strong className="text-zinc-800 dark:text-zinc-200">{marca}</strong>
                            </span>
                            <h4 className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 line-clamp-2 mt-1 leading-snug">
                              {tituloReal}
                            </h4>
                          </div>
                        </div>

                        {/* Comparativo de Preço e Botão */}
                        <div className="pt-3 mt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            {precoForn ? (
                              <div>
                                <span className="text-[10px] text-zinc-400 block">Fornecedor:</span>
                                <span className="font-mono font-semibold text-zinc-500 line-through">
                                  {formatPrice(precoForn)}
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className="text-[10px] text-zinc-400 block">Fornecedor:</span>
                                <span className="text-[11px] text-zinc-400 italic">S/ preço</span>
                              </div>
                            )}

                            <div className="text-right">
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                                Mercado Livre:
                              </span>
                              <div className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
                                {formatPrice(precoNum)}
                              </div>
                            </div>
                          </div>

                          <a
                            href={finalUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs flex items-center justify-center gap-1.5 transition shadow-md hover:shadow-emerald-500/25 cursor-pointer transform active:scale-95"
                          >
                            <ShoppingBag className="w-4 h-4 shrink-0" />
                            <span>Comprar no Mercado Livre ↗</span>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rodapé da Tabela: Ações e Compartilhamento */}
              <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800 space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleToggleTodos}
                      className="text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1.5 cursor-pointer"
                    >
                      {itensSelecionados.length === resultado.itens.length ? (
                        <CheckSquare className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-400" />
                      )}
                      <span>
                        {itensSelecionados.length === resultado.itens.length
                          ? "Desmarcar todos"
                          : "Selecionar todos"}
                      </span>
                    </button>
                    <span className="text-zinc-300 dark:text-zinc-700">|</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      <strong className="text-zinc-900 dark:text-white font-mono">{itensSelecionados.length}</strong> de{" "}
                      <strong className="font-mono">{resultado.itens.length}</strong> selecionadas
                    </span>
                    {totalSelecionadoML > 0 && (
                      <>
                        <span className="text-zinc-300 dark:text-zinc-700">|</span>
                        <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          Total ML: {formatPrice(totalSelecionadoML)}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black transition shadow-xs cursor-pointer flex items-center gap-1.5 transform active:scale-95"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Fechar Pedido ({resultado.itens.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAbrirTodas}
                      className="px-3.5 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold hover:opacity-90 transition shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir todas no ML</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setResultado(null);
                        setTexto("");
                        handleClearImage();
                        setIsModalOpen(false);
                        setAvisoPopupsBloqueados(false);
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      Fazer Nova Importação
                    </button>
                  </div>
                </div>

                {/* Aviso caso o navegador bloqueie pop-ups */}
                {avisoPopupsBloqueados && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>
                        Se apenas uma aba abriu, permita pop-ups neste site para abrir todas as peças de uma vez.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAvisoPopupsBloqueados(false)}
                      className="p-1 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Compartilhamento Lado a Lado */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  {/* Opção 1: WhatsApp com Links para Cliente */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Share2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">
                            Compartilhar Cotação Convertida
                          </h4>
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Com Códigos, Preços e Links de Compra
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        Lista detalhada com códigos dos fabricantes, preços e links diretos para comprar no Mercado Livre.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleEnviarWhatsAppCliente}
                        className="flex-1 py-2.5 px-3.5 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition cursor-pointer transform active:scale-95"
                      >
                        <MessageSquare className="w-4 h-4 text-zinc-950 fill-zinc-950 shrink-0" />
                        <span>Enviar WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopiarCliente}
                        className="flex-1 py-2.5 px-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer transform active:scale-95"
                      >
                        {copiadoCliente ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-emerald-600 dark:text-emerald-400">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 text-zinc-500 shrink-0" />
                            <span>Copiar Texto</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Opção 2: Cotação de Balcão (B2B) */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">
                            Enviar para Autopeças / Balcão
                          </h4>
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                            Cotação B2B por Part Number
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        Lista limpa apenas com os códigos e marcas dos fabricantes, pronta para solicitar preços em distribuidores.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleEnviarWhatsAppFornecedores}
                        className="flex-1 py-2.5 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition cursor-pointer transform active:scale-95"
                      >
                        <MessageSquare className="w-4 h-4 text-white fill-white shrink-0" />
                        <span>Cotar no Balcão</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopiarFornecedores}
                        className="flex-1 py-2.5 px-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer transform active:scale-95"
                      >
                        {copiadoFornecedor ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-emerald-600 dark:text-emerald-400">Lista Copiada!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 text-zinc-500 shrink-0" />
                            <span>Copiar Lista</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Modal Interativo de Fechamento */}
        {isModalOpen && resultado && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/75 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-zinc-50/70 dark:bg-zinc-950/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2">
                      <span>Fechar Pedido de Peças</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {resultado.itens.length} itens convertidos
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Compre com segurança diretamente nos anúncios oficiais do Mercado Livre
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                {resultado.itens.map((item, idx) => {
                  const isChecked = itensSelecionados.includes(idx);
                  const finalUrl = getItemAffiliateUrl(item);
                  const precoML = getNumericPrice(item);
                  const precoForn = typeof item.preco_fornecedor === "number" ? item.preco_fornecedor : null;
                  const codigo = item.codigo && item.codigo !== "S/ CÓDIGO" ? item.codigo : null;

                  return (
                    <div
                      key={idx}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                        isChecked
                          ? "bg-white dark:bg-zinc-800/70 border-emerald-500/40 shadow-sm"
                          : "bg-zinc-50/50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 opacity-60"
                      }`}
                    >
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        <label className="flex items-center cursor-pointer pt-1 sm:pt-0 shrink-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleItem(idx)}
                            className="w-5 h-5 rounded-md border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                          />
                        </label>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-1.5">
                            {codigo && (
                              <span className="px-2 py-0.5 text-xs font-mono font-black rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                {codigo}
                              </span>
                            )}
                            <span className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">
                              {item.marca && item.marca !== "Original" ? `${item.marca} - ` : ""}
                              {item.nome}
                            </span>
                            {item.quantidade && item.quantidade > 1 ? (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200">
                                {item.quantidade}x
                              </span>
                            ) : null}
                          </div>

                          {precoForn && (
                            <p className="text-[11px] text-zinc-400 mt-1">
                              Fornecedor: <strong className="text-zinc-500 line-through">{formatPrice(precoForn)}</strong>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pl-8 sm:pl-0 shrink-0">
                        <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                          {formatPrice(precoML * (item.quantidade || 1))}
                        </span>

                        <a
                          href={finalUrl}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition shadow-xs"
                        >
                          <span>Comprar no ML ↗</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-5 sm:p-6 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-zinc-400 block font-medium">Total Selecionado no ML</span>
                  <span className="text-2xl font-black text-emerald-500 font-mono">
                    {formatPrice(totalSelecionadoML)}
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleAbrirTodas}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-xs transition"
                  >
                    Abrir Todas no ML
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold text-xs transition"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-8 px-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
        <div className="max-w-7xl mx-auto space-y-2">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            PeçasFinder - Conversor de Orçamentos de Fornecedor por Código
          </p>
          <p>
            Encontre peças originais com base no código do fabricante e compre direto no Mercado Livre.
          </p>
        </div>
      </footer>
    </div>
  );
}
