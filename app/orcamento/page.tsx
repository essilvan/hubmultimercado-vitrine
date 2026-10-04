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
  ExternalLink,
  RefreshCw,
  Zap,
  Wrench,
  ArrowRight,
  X,
  Tag,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";

interface ItemOrcamento {
  nome_peca: string;
  marca_recomendada: string;
  query_busca: string;
  preco_medio_estimado: string;
  preco_medio?: string;
  link_direto_anuncio?: string | null;
  preco_real?: boolean;
}

interface OrcamentoResultado {
  veiculo_detectado: string;
  itens: ItemOrcamento[];
  total_estimado: string;
}

const EXEMPLOS_PRONTOS = [
  "Chevrolet Onix 1.0 2016: Troca de pastilhas de freio dianteiras e 2 amortecedores dianteiros",
  "Volkswagen Gol G5 1.6 2012: Kit de embreagem, jogo de velas e correia dentada com tensor",
  "Hyundai HB20 1.0 2018: Troca de discos de freio, pastilhas dianteiras e filtro de óleo",
];

export default function OrcamentoPage() {
  const [texto, setTexto] = useState("");
  const [imagem, setImagem] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [resultado, setResultado] = useState<OrcamentoResultado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

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

      setResultado(data.data as OrcamentoResultado);
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

  // Função handleClick que executa window.open() para cada item da lista individualmente com o link correspondente
  const handleClick = () => {
    if (!resultado?.itens || resultado.itens.length === 0) return;

    resultado.itens.forEach((item, index) => {
      const url = `/api/redirect?query=${encodeURIComponent(item.query_busca)}`;
      if (index === 0) {
        window.open(url, "_blank");
      } else {
        setTimeout(() => {
          window.open(url, "_blank");
        }, index * 250);
      }
    });
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
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3">
                  <Car className="w-7 h-7 text-amber-400 shrink-0" />
                  <span>{resultado.veiculo_detectado}</span>
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400">
                  Detectamos <strong>{resultado.itens.length}</strong> peças no orçamento fornecido.
                </p>
              </div>

              <div className="bg-zinc-800/80 backdrop-blur rounded-2xl p-5 border border-zinc-700/80 text-left md:text-right shrink-0">
                <span className="text-xs text-zinc-400 block font-medium">Total Médio Estimado</span>
                <span className="text-3xl font-black text-emerald-400 font-mono block mt-0.5">
                  {resultado.total_estimado}
                </span>
                <span className="text-[11px] text-zinc-400 mt-1 block">
                  Economize comprando direto no Mercado Livre
                </span>
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
                    Marcas homologadas com garantia e entrega rápida Mercado Livre Full.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleClick}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold hover:opacity-90 transition shadow-sm cursor-pointer self-start sm:self-auto"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir todas as peças no Mercado Livre</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <th className="py-4 px-6">Peça Solicitada</th>
                      <th className="py-4 px-6 w-48">Marca Recomendada</th>
                      <th className="py-4 px-6 w-36 text-right">Preço Médio</th>
                      <th className="py-4 px-6 w-60 text-center">Melhor Oferta Full</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
                    {resultado.itens.map((item, idx) => {
                      const redirectUrl = `/api/redirect?query=${encodeURIComponent(
                        item.query_busca
                      )}`;

                      return (
                        <tr
                          key={idx}
                          className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          {/* 1. Nome da Peça */}
                          <td className="py-4 px-6 align-middle">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                              {item.nome_peca}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                              Busca: &quot;{item.query_busca}&quot;
                            </div>
                          </td>

                          {/* 2. Marca Recomendada */}
                          <td className="py-4 px-6 align-middle">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              {item.marca_recomendada}
                            </span>
                          </td>

                          {/* 3. Preço Real / Estimado */}
                          <td className="py-4 px-6 align-middle text-right">
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm block">
                              {item.preco_medio_estimado || item.preco_medio}
                            </span>
                            {item.preco_real && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800/80 mt-1">
                                ✓ Preço Real ML
                              </span>
                            )}
                          </td>

                          {/* 4. Botão Verde Chamativo */}
                          <td className="py-4 px-6 align-middle text-center">
                            <a
                              href={`/api/redirect?query=${encodeURIComponent(item.query_busca)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-zinc-950 font-bold text-xs shadow-md hover:shadow-lg transition-all transform active:scale-95 cursor-pointer w-full"
                              title={`Buscar "${item.query_busca}" com envio Full no Mercado Livre`}
                            >
                              <Zap className="w-3.5 h-3.5 fill-zinc-950" />
                              <span>Comprar com Frete Full ➔</span>
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
                  Os valores são estimativas de mercado. Ao clicar, você será direcionado para anúncios oficiais com envio Full.
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setResultado(null);
                      setTexto("");
                      handleClearImage();
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    Fazer Nova Cotação
                  </button>

                  <button
                    type="button"
                    onClick={handleClick}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md cursor-pointer flex items-center gap-1.5"
                    title="Abre abas individuais para cada peça no Mercado Livre com o menor preço e frete Full"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir todas as peças ({resultado.itens.length}) em abas separadas</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
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
