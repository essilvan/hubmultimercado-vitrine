"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import {
  Sparkles,
  Upload,
  Camera,
  FileText,
  Car,
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
} from "lucide-react";

interface ItemOrcamento {
  termo_lido?: string;
  peca_padronizada: string;
  quantidade?: number;
  posicao?: string | null;
  marca_preferencial?: string | null;
  termo_busca_mercadolivre?: string;
  confianca?: "alta" | "media" | "baixa";
  requer_confirmacao?: boolean;
  // Campos de enriquecimento de preço REAL do Mercado Livre
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

interface VeiculoOrcamento {
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  motorizacao?: string | null;
  placa?: string | null;
}

interface OrcamentoResultado {
  veiculo?: VeiculoOrcamento;
  itens: ItemOrcamento[];
  observacoes_gerais?: string | null;
  veiculo_detectado?: string;
  total_estimado?: string;
}

const EXEMPLOS_PRONTOS = [
  "Chevrolet Onix 1.0 2016: Troca de pastilhas de freio dianteiras e 2 amortecedores dianteiros",
  "Volkswagen Gol G5 1.6 2012: Kit de embreagem, jogo de velas e correia dentada com tensor",
  "Hyundai HB20 1.0 2018: Troca de discos de freio, pastilhas dianteiras e filtro de óleo",
];

/**
 * Gera uma busca consolidada de kit completo para o Mercado Livre
 */
function gerarQueryKitCompleto(resultado: OrcamentoResultado): string {
  if (!resultado?.itens || resultado.itens.length === 0) return "";

  const veiculo = resultado.veiculo;
  const modelo = veiculo?.modelo || "";
  const ano = veiculo?.ano || "";
  const motor = veiculo?.motorizacao || "";

  // Agrupa os componentes principais identificados
  const componentesChave: string[] = [];

  for (const item of resultado.itens) {
    const nome = (item.peca_padronizada || item.nome_peca || "").toLowerCase();

    if (nome.includes("amortecedor") && !componentesChave.includes("amortecedores")) {
      componentesChave.push("amortecedores");
    } else if (nome.includes("pastilha") && !componentesChave.includes("pastilhas")) {
      componentesChave.push("pastilhas");
    } else if (nome.includes("disco") && !componentesChave.includes("discos")) {
      componentesChave.push("discos");
    } else if (nome.includes("embreagem") && !componentesChave.includes("kit embreagem")) {
      componentesChave.push("kit embreagem");
    } else if (nome.includes("correia") && !componentesChave.includes("kit correia dentada")) {
      componentesChave.push("kit correia dentada");
    } else if (
      nome.includes("tensor") &&
      !componentesChave.includes("kit correia dentada") &&
      !componentesChave.includes("tensor")
    ) {
      componentesChave.push("tensor");
    } else if (nome.includes("vela") && !componentesChave.includes("velas")) {
      componentesChave.push("velas");
    } else if (nome.includes("filtro") && !componentesChave.includes("filtros")) {
      componentesChave.push("filtros");
    } else if (nome.includes("bucha") && !componentesChave.includes("buchas")) {
      componentesChave.push("buchas");
    } else if ((nome.includes("pivo") || nome.includes("pivô")) && !componentesChave.includes("pivos")) {
      componentesChave.push("pivos");
    } else if (nome.includes("bieleta") && !componentesChave.includes("bieletas")) {
      componentesChave.push("bieletas");
    } else if (nome.includes("coxim") && !componentesChave.includes("coxim")) {
      componentesChave.push("coxim");
    } else if (nome.includes("bomba") && !componentesChave.includes("bomba")) {
      componentesChave.push("bomba");
    }
  }

  if (componentesChave.length > 0) {
    const lista = componentesChave.slice(0, 3).join(" ");
    const termo = lista.startsWith("kit") ? lista : `kit ${lista}`;
    return `${termo} ${modelo} ${ano}`.trim().replace(/\s+/g, " ");
  }

  return `kit pecas ${modelo} ${motor} ${ano}`.trim().replace(/\s+/g, " ");
}

export default function OrcamentoPage() {
  const [texto, setTexto] = useState("");
  const [imagem, setImagem] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [resultado, setResultado] = useState<OrcamentoResultado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoPopup, setAvisoPopup] = useState(false);
  const [modalFechamentoAberto, setModalFechamentoAberto] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<number[]>([]);
  const [copiadoFeedback, setCopiadoFeedback] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Manipulação de Arquivo de Imagem
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

  // Drag and Drop
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

  // Envio para a API com IA
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!texto.trim() && !imagem) {
      setErro("Por favor, digite a lista de peças ou envie uma foto do orçamento.");
      return;
    }

    setIsLoading(true);
    setErro(null);
    setAviso(null);
    setResultado(null);
    setAvisoPopup(false);

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

      const data = await res.json();

      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error || "Não foi possível analisar o orçamento.");
      }

      const orcamentoRetornado = data.data as OrcamentoResultado;
      setResultado(orcamentoRetornado);
      // Inicializa com todos os itens marcados por padrão
      setItensSelecionados(orcamentoRetornado.itens.map((_, i) => i));

      if (data.aviso) {
        setAviso(data.aviso);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error ? err.message : "Erro ao processar orçamento com IA.";
      setErro(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Recálculo dinâmico baseado estritamente nos itens selecionados com preços reais do Mercado Livre
  const totalSelecionado = (resultado?.itens || []).reduce((acc, item, idx) => {
    if (!itensSelecionados.includes(idx)) return acc;
    const preco = item.preco_real_ml || 0;
    const qtd = item.quantidade || 1;
    return acc + preco * qtd;
  }, 0);

  const totalFormatado =
    totalSelecionado > 0
      ? totalSelecionado.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })
      : "Sob Consulta";

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

  // Gera o texto estruturado para envio no WhatsApp e cópia para a área de transferência
  const gerarTextoCotacao = () => {
    if (!resultado) return "";
    const veic = resultado.veiculo;
    const veicTexto = veic
      ? [veic.marca, veic.modelo, veic.motorizacao, veic.ano].filter(Boolean).join(" ")
      : resultado.veiculo_detectado || "Veículo não especificado";

    const placaTexto = veic?.placa ? ` | Placa: ${veic.placa}` : "";

    let textoMsg = `🚗 *Orçamento de Peças - ${veicTexto}${placaTexto}*\n\n`;
    textoMsg += `📋 *Peças Selecionadas (${itensSelecionados.length} itens):*\n`;

    const itensParaEnviar = resultado.itens.filter((_, idx) => itensSelecionados.includes(idx));

    if (itensParaEnviar.length === 0) {
      textoMsg += `(Nenhuma peça selecionada)\n`;
    } else {
      itensParaEnviar.forEach((item, index) => {
        const qtd = item.quantidade && item.quantidade > 1 ? `${item.quantidade}x ` : "1x ";
        const pos = item.posicao ? ` (${item.posicao})` : "";
        const marca =
          item.marca_preferencial || item.marca_recomendada
            ? ` - Marca: ${item.marca_preferencial || item.marca_recomendada}`
            : "";
        const precoUnit =
          item.preco_formatado ||
          (item.preco_real_ml
            ? item.preco_real_ml.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : "");
        const precoTxt = precoUnit ? ` - ${precoUnit}` : "";
        const link = item.link_anuncio || item.link_direto_anuncio;
        const linkTxt = link ? `\n   🔗 ${link}` : "";

        textoMsg += `${index + 1}. *${qtd}${item.peca_padronizada || item.nome_peca}*${pos}${marca}${precoTxt}${linkTxt}\n`;
      });
    }

    if (totalSelecionado > 0) {
      textoMsg += `\n💰 *Total Estimado das Peças Selecionadas:* ${totalFormatado}\n`;
    }

    textoMsg += `\nCotado com preços reais e frete Full no Mercado Livre via PeçasFinder`;
    return textoMsg;
  };

  const handleEnviarWhatsApp = () => {
    const msg = gerarTextoCotacao();
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handleCopiarLista = async () => {
    const msg = gerarTextoCotacao();
    try {
      await navigator.clipboard.writeText(msg);
      setCopiadoFeedback(true);
      setTimeout(() => setCopiadoFeedback(false), 3000);
    } catch (err) {
      console.error("Erro ao copiar para a área de transferência:", err);
    }
  };

  // Abre a pesquisa de kit completo consolidado em uma única aba (nunca bloqueado por pop-up)
  const handleVerKitCompleto = () => {
    if (!resultado) return;
    const queryKit = gerarQueryKitCompleto(resultado);
    const url = `/api/redirect?query=${encodeURIComponent(queryKit)}`;
    window.open(url, "_blank");
  };

  // Abre todas as peças individuais com proteção e detecção de bloqueio de pop-ups
  const handleClick = () => {
    if (!resultado?.itens || resultado.itens.length === 0) return;

    let bloqueado = false;
    let abertas = 0;

    resultado.itens.forEach((item) => {
      const termo =
        item.termo_busca_mercadolivre ||
        item.query_busca ||
        item.peca_padronizada ||
        item.nome_peca ||
        "";
      const url = `/api/redirect?query=${encodeURIComponent(termo)}`;

      try {
        const novaAba = window.open(url, "_blank");
        if (!novaAba || novaAba.closed || typeof novaAba.closed === "undefined") {
          bloqueado = true;
        } else {
          abertas++;
        }
      } catch {
        bloqueado = true;
      }
    });

    // Se o navegador bloqueou após a primeira aba ou impediu a abertura
    if (bloqueado || (resultado.itens.length > 1 && abertas < resultado.itens.length)) {
      setAvisoPopup(true);
    }
  };

  const handleAbrirTodas = handleClick;

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
                Cotação Inteligente com IA
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
      <section className="bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 border-b border-zinc-200 dark:border-zinc-800/80 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
            <Sparkles className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            Inteligência Artificial Automotiva Gemini
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-zinc-900 dark:text-white leading-tight">
            Cote as Peças do seu Orçamento em Segundos
          </h1>

          <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Envie a foto do orçamento do seu mecânico ou digite a lista de peças. Nossa IA encontra os códigos certos e os melhores preços no Mercado Livre.
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Formulário Interativo de Cotação */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border-2 border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Opção A: Upload de Foto */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-amber-500" />
                    Opção 1: Foto do Orçamento
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
                        <span>Foto anexada com sucesso ({imagem?.name})</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          Arraste a foto ou clique para escolher
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          Papel da oficina, nota ou print do WhatsApp (JPG, PNG)
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

                  {/* Inputs ocultos */}
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

              {/* Opção B: Digitação do Texto */}
              <div className="space-y-2.5 flex flex-col justify-between">
                <div className="space-y-2.5 flex-1 flex flex-col">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-500" />
                    Opção 2: Digite a Lista de Peças
                  </label>

                  <textarea
                    rows={6}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Exemplo:
Carro: Onix 1.4 2017
Peças:
- 2 amortecedores dianteiros
- 1 jogo de pastilhas de freio
- Kit de embreagem"
                    className="w-full flex-1 p-3.5 text-xs sm:text-sm rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 focus:outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 transition resize-none placeholder:text-zinc-400 leading-relaxed"
                  />
                </div>

                {/* Exemplos Rápidos */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-zinc-400 block">
                    Ou teste um exemplo rápido:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {EXEMPLOS_PRONTOS.map((ex, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setTexto(ex)}
                        className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer text-left line-clamp-1"
                      >
                        Ex {idx + 1}: {ex.slice(0, 32)}...
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

            {/* Botão em Destaque: Analisar Orçamento com IA */}
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
                    <span>Analisando orçamento e consultando Mercado Livre com IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 fill-zinc-950" />
                    <span>Analisar Orçamento com IA</span>
                    <ArrowRight className="w-5 h-5 ml-1" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* =========================================================================
            ÁREA DE RESULTADOS DA COTAÇÃO INTELIGENTE
        ========================================================================== */}
        {resultado && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
            {/* Card de Resumo e Veículo Identificado */}
            <div className="bg-gradient-to-r from-zinc-900 to-zinc-950 text-white rounded-3xl p-6 sm:p-8 border border-zinc-800 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Veículo Identificado com IA
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center flex-wrap gap-3">
                  <Car className="w-7 h-7 text-amber-400 shrink-0" />
                  <span>
                    {resultado.veiculo
                      ? [
                          resultado.veiculo.marca,
                          resultado.veiculo.modelo,
                          resultado.veiculo.motorizacao,
                          resultado.veiculo.ano,
                        ]
                          .filter(Boolean)
                          .join(" ") || "Veículo não especificado"
                      : resultado.veiculo_detectado || "Veículo Detectado"}
                  </span>
                  {resultado.veiculo?.placa && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-zinc-800 text-amber-300 border border-zinc-700">
                      Placa: {resultado.veiculo.placa}
                    </span>
                  )}
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400">
                  Detectamos <strong>{resultado.itens.length}</strong> peças no orçamento fornecido.
                </p>

                {resultado.observacoes_gerais && (
                  <div className="p-3 rounded-xl bg-zinc-800/80 border border-zinc-700/80 text-xs text-zinc-300 flex items-start gap-2 mt-2">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{resultado.observacoes_gerais}</span>
                  </div>
                )}
              </div>

              <div className="bg-zinc-800/80 backdrop-blur rounded-2xl p-5 border border-zinc-700/80 text-left md:text-right shrink-0 flex flex-col justify-between">
                <div>
                  <span className="text-xs text-zinc-400 block font-medium">Total com Preços Reais ML</span>
                  <span className="text-3xl font-black text-emerald-400 font-mono block mt-0.5">
                    {resultado.total_estimado || "Sob Consulta"}
                  </span>
                  <span className="text-[11px] text-zinc-400 mt-1 block">
                    Preços reais sincronizados do Mercado Livre
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setModalFechamentoAberto(true)}
                  className="mt-4 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-zinc-950 font-black text-xs transition shadow-lg hover:shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer transform active:scale-95"
                  title="Abrir checklist de fechamento de orçamento"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Fechar Orçamento Completo</span>
                </button>
              </div>
            </div>

            {/* Tabela Organizada com as Peças Extraídas */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-amber-500" />
                    Peças Identificadas e Recomendações
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Preços reais consultados em anúncios novos com frete Full no Mercado Livre.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setModalFechamentoAberto(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black transition shadow-md hover:shadow-lg cursor-pointer transform active:scale-95"
                    title="Abrir checklist de fechamento de orçamento com opções de WhatsApp"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Fechar Orçamento ({resultado.itens.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleVerKitCompleto}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold transition shadow-md hover:shadow-lg cursor-pointer transform active:scale-95"
                    title="Pesquisar todas as peças agrupadas em um kit completo no Mercado Livre"
                  >
                    <Package className="w-4 h-4 text-zinc-950" />
                    <span>Ver Kit Completo no Mercado Livre</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClick}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold hover:opacity-90 transition shadow-sm cursor-pointer"
                    title="Abre as peças individualmente em abas do navegador"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir todas em abas separadas</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <th className="py-4 px-6">Peça e Anúncio Encontrado</th>
                      <th className="py-4 px-6 w-48">Marca Recomendada</th>
                      <th className="py-4 px-6 w-40 text-right">Preço Real ML</th>
                      <th className="py-4 px-6 w-52 text-center">Melhor Oferta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
                    {resultado.itens.map((item, idx) => {
                      const termoBusca =
                        item.termo_busca_mercadolivre ||
                        item.query_busca ||
                        item.peca_padronizada ||
                        item.nome_peca ||
                        "";
                      const directUrl =
                        item.link_anuncio ||
                        item.link_direto_anuncio ||
                        `/api/redirect?query=${encodeURIComponent(termoBusca)}`;
                      const marcaNome =
                        item.marca_preferencial ||
                        item.marca_recomendada ||
                        "Original / Homologada";

                      return (
                        <tr
                          key={idx}
                          className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          {/* 1. Nome da Peça, Thumbnail e Detalhes do ML */}
                          <td className="py-4 px-6 align-middle">
                            <div className="flex items-start gap-3.5">
                              {item.thumbnail ? (
                                <div className="w-12 h-12 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={item.thumbnail}
                                    alt={item.titulo_anuncio || item.peca_padronizada}
                                    className="w-full h-full object-contain p-0.5"
                                  />
                                </div>
                              ) : null}

                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-zinc-900 dark:text-zinc-100 leading-snug flex items-center flex-wrap gap-2">
                                  <span>{item.peca_padronizada || item.nome_peca}</span>
                                  {item.quantidade && item.quantidade > 1 ? (
                                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                      {item.quantidade}x
                                    </span>
                                  ) : null}
                                  {item.posicao && (
                                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                                      {item.posicao}
                                    </span>
                                  )}
                                  {item.tem_full && (
                                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-0.5">
                                      <Zap className="w-3 h-3 fill-amber-500 text-amber-500" />
                                      <span>Full</span>
                                    </span>
                                  )}
                                </div>

                                {item.titulo_anuncio && item.titulo_anuncio !== item.peca_padronizada && (
                                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
                                    {item.titulo_anuncio}
                                  </div>
                                )}

                                {item.termo_lido && (
                                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                                    Lido no orçamento: &quot;{item.termo_lido}&quot;
                                  </div>
                                )}

                                {(item.requer_confirmacao || item.confianca === "baixa" || item.confianca === "media") && (
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <span
                                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                        item.confianca === "baixa" || item.requer_confirmacao
                                          ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                                          : "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                                      }`}
                                    >
                                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                      {item.requer_confirmacao
                                        ? "Requer confirmação com mecânico"
                                        : `Confiança ${item.confianca}`}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 2. Marca Recomendada */}
                          <td className="py-4 px-6 align-middle">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              {marcaNome}
                            </span>
                          </td>

                          {/* 3. Preço Real do Mercado Livre */}
                          <td className="py-4 px-6 align-middle text-right">
                            <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm block">
                              {item.preco_formatado || item.preco_medio || "Sob Consulta"}
                            </span>
                            {item.preco_real_ml ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800/80 mt-1">
                                ✓ Preço Real ML
                              </span>
                            ) : null}
                          </td>

                          {/* 4. Botão de Compra / Ver no ML */}
                          <td className="py-4 px-6 align-middle text-center">
                            <a
                              href={directUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-zinc-950 font-bold text-xs shadow-md hover:shadow-lg transition-all transform active:scale-95 cursor-pointer w-full"
                              title={`Ver "${item.peca_padronizada}" no Mercado Livre`}
                            >
                              <Zap className="w-3.5 h-3.5 fill-zinc-950" />
                              <span>{item.tem_full ? "Ver Anúncio Full ➔" : "Ver no Mercado Livre ➔"}</span>
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Rodapé da Área de Resultado */}
              <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-zinc-500">
                  Preços reais obtidos de anúncios ativos no Mercado Livre.
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setResultado(null);
                      setTexto("");
                      handleClearImage();
                      setAvisoPopup(false);
                      setModalFechamentoAberto(false);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    Fazer Nova Cotação
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalFechamentoAberto(true)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black transition shadow-md hover:shadow-lg cursor-pointer flex items-center gap-2 transform active:scale-95"
                    title="Abrir checklist de fechamento"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Fechar Orçamento Completo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleVerKitCompleto}
                    className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold transition shadow-md hover:shadow-lg cursor-pointer flex items-center gap-2 transform active:scale-95"
                    title="Pesquisar todas as peças agrupadas em um kit completo no Mercado Livre"
                  >
                    <Package className="w-4 h-4 text-zinc-950" />
                    <span>Ver Kit Completo no Mercado Livre</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClick}
                    className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold transition shadow-md cursor-pointer flex items-center gap-1.5"
                    title="Abre abas individuais para cada peça no Mercado Livre"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir todas as peças ({resultado.itens.length}) em abas separadas</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =========================================================================
            MODAL INTERATIVO: FECHAR ORÇAMENTO COMPLETO
        ========================================================================== */}
        {modalFechamentoAberto && resultado && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/75 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              {/* Header do Modal */}
              <div className="p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-zinc-50/70 dark:bg-zinc-950/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2">
                      <span>Fechar Orçamento Completo</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Preços Reais ML
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {resultado.veiculo
                        ? [
                            resultado.veiculo.marca,
                            resultado.veiculo.modelo,
                            resultado.veiculo.motorizacao,
                            resultado.veiculo.ano,
                          ]
                            .filter(Boolean)
                            .join(" ")
                        : resultado.veiculo_detectado || "Veículo Detectado"}
                      {resultado.veiculo?.placa ? ` • Placa: ${resultado.veiculo.placa}` : ""}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModalFechamentoAberto(false)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="Fechar modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Barra de Seleção / Contagem */}
              <div className="px-6 py-3 bg-zinc-100/70 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={handleToggleTodos}
                  className="font-bold text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 cursor-pointer transition"
                >
                  {itensSelecionados.length === resultado.itens.length ? (
                    <CheckSquare className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Square className="w-4 h-4 text-zinc-400" />
                  )}
                  <span>
                    {itensSelecionados.length === resultado.itens.length
                      ? "Desmarcar todos os itens"
                      : "Selecionar todos os itens"}
                  </span>
                </button>

                <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                  <strong className="text-zinc-900 dark:text-white font-mono">{itensSelecionados.length}</strong> de{" "}
                  <strong className="font-mono">{resultado.itens.length}</strong> peças selecionadas
                </span>
              </div>

              {/* Lista Scrollável de Itens com Checkbox, Foto, Título Real e Preço Real */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                {resultado.itens.map((item, idx) => {
                  const isChecked = itensSelecionados.includes(idx);
                  const termoBusca =
                    item.termo_busca_mercadolivre ||
                    item.query_busca ||
                    item.peca_padronizada ||
                    item.nome_peca ||
                    "";
                  const directLink =
                    item.link_anuncio ||
                    item.link_direto_anuncio ||
                    `/api/redirect?query=${encodeURIComponent(termoBusca)}`;

                  return (
                    <div
                      key={idx}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                        isChecked
                          ? "bg-white dark:bg-zinc-800/70 border-emerald-500/40 shadow-sm"
                          : "bg-zinc-50/50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 opacity-60"
                      }`}
                    >
                      {/* Checkbox + Thumbnail + Detalhes */}
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        <label className="flex items-center cursor-pointer pt-1 sm:pt-0 shrink-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleItem(idx)}
                            className="w-5 h-5 rounded-md border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                          />
                        </label>

                        {/* Thumbnail do Mercado Livre */}
                        <div className="w-14 h-14 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                          {item.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.thumbnail}
                              alt={item.titulo_anuncio || item.peca_padronizada}
                              className="w-full h-full object-contain p-1"
                            />
                          ) : (
                            <Package className="w-6 h-6 text-zinc-300" />
                          )}
                        </div>

                        {/* Textos e Tags */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-1.5">
                            <span className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">
                              {item.peca_padronizada || item.nome_peca}
                            </span>
                            {item.quantidade && item.quantidade > 1 ? (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200">
                                {item.quantidade}x
                              </span>
                            ) : null}
                            {item.posicao && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80">
                                {item.posicao}
                              </span>
                            )}
                            {item.tem_full && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-0.5">
                                <Zap className="w-3 h-3 fill-amber-500 text-amber-500" />
                                <span>Full</span>
                              </span>
                            )}
                          </div>

                          {/* Título real do anúncio encontrado no Mercado Livre */}
                          {item.titulo_anuncio && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-1">
                              {item.titulo_anuncio}
                            </p>
                          )}

                          <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2">
                            <span>
                              Marca:{" "}
                              <strong className="text-zinc-700 dark:text-zinc-300 font-medium">
                                {item.marca_preferencial || item.marca_recomendada || "Homologada"}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Preço e Botão Individual Comprar / Ver no ML */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pl-8 sm:pl-0 shrink-0">
                        <div className="text-right">
                          <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400 block leading-tight">
                            {item.preco_formatado ||
                              (item.preco_real_ml
                                ? item.preco_real_ml.toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })
                                : "Sob Consulta")}
                          </span>
                          {item.quantidade && item.quantidade > 1 && item.preco_real_ml ? (
                            <span className="text-[10px] text-zinc-400 block">
                              Total:{" "}
                              {(item.preco_real_ml * item.quantidade).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </span>
                          ) : null}
                        </div>

                        <a
                          href={directLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-500 hover:text-zinc-950 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition shadow-xs cursor-pointer group"
                          title="Abrir este produto diretamente no Mercado Livre"
                        >
                          <span>Ver no ML</span>
                          <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Sticky com Recálculo Dinâmico e Ferramentas */}
              <div className="p-5 sm:p-6 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                {/* Total Recalculado */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
                  <div>
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 block">
                      Total Selecionado ({itensSelecionados.length} peças)
                    </span>
                    <span className="text-xs text-zinc-400">
                      Preços reais sincronizados diretamente do Mercado Livre
                    </span>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-2xl sm:text-3xl font-black text-emerald-500 font-mono block leading-tight">
                      {totalFormatado}
                    </span>
                  </div>
                </div>

                {/* Feedback de Cópia */}
                {copiadoFeedback && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-2 animate-in fade-in duration-200">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Lista de peças e orçamento copiada com sucesso! Pronto para colar.</span>
                  </div>
                )}

                {/* Ações: Cotar WhatsApp + Copiar Lista */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleEnviarWhatsApp}
                    className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition cursor-pointer transform active:scale-95"
                    title="Enviar orçamento com as peças selecionadas no WhatsApp"
                  >
                    <MessageSquare className="w-4 h-4 text-zinc-950 fill-zinc-950" />
                    <span>Cotar via WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopiarLista}
                    className="w-full py-3.5 px-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer transform active:scale-95"
                    title="Copiar lista formatada para a área de transferência"
                  >
                    {copiadoFeedback ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span>Lista Copiada!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copiar Lista para Orçamento</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Aviso e Abertura Rápida caso o navegador bloqueie múltiplas abas */}
        {avisoPopup && resultado && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative">
              <button
                type="button"
                onClick={() => setAvisoPopup(false)}
                className="absolute top-5 right-5 p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-zinc-900 dark:text-white">
                    Bloqueador de Pop-ups Ativo
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    O seu navegador bloqueou a abertura automática de várias abas simultâneas por segurança.
                  </p>
                </div>
              </div>

              {/* Opção 1: Kit Completo em 1 única aba */}
              <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-500" />
                    Opção 1: Ver Kit Completo (1 única aba)
                  </span>
                  <span className="text-[10px] uppercase font-bold bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-300 px-2 py-0.5 rounded-full">
                    Recomendado
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Pesquisa consolidada com as peças agrupadas em um único pacote no Mercado Livre (não sofre bloqueio de pop-up):
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleVerKitCompleto();
                    setAvisoPopup(false);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow transition cursor-pointer"
                >
                  <Package className="w-4 h-4" />
                  <span>Ver Kit Completo no Mercado Livre</span>
                </button>
              </div>

              {/* Opção 2: Lista com links individuais de 1 clique */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                  Opção 2: Abrir cada peça manualmente:
                </span>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {resultado.itens.map((item, idx) => {
                    const termo =
                      item.termo_busca_mercadolivre ||
                      item.query_busca ||
                      item.peca_padronizada ||
                      item.nome_peca ||
                      "";
                    return (
                      <a
                        key={idx}
                        href={`/api/redirect?query=${encodeURIComponent(termo)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs transition"
                      >
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate pr-2">
                          {idx + 1}. {item.peca_padronizada || item.nome_peca}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0">
                          <span>Abrir peça</span>
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>

              <div className="pt-1 text-[11px] text-zinc-400 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
                <span>Dica: Permita pop-ups na barra de endereços para abrir todas direto.</span>
                <button
                  type="button"
                  onClick={() => setAvisoPopup(false)}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-8 px-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
        <div className="max-w-7xl mx-auto space-y-2">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            PeçasFinder - Cotação de Orçamentos com Inteligência Artificial
          </p>
          <p>
            Economize comprando as peças originais recomendadas diretamente no Mercado Livre Full.
          </p>
        </div>
      </footer>
    </div>
  );
}
