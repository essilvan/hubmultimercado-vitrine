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
  Building2,
  Share2,
  LayoutGrid,
  List,
} from "lucide-react";
import { formatarLinkAfiliado } from "@/lib/mercadolivre";

interface ItemOrcamento {
  nome?: string;
  termo_busca?: string;
  peca_padronizada?: string;
  quantidade?: number;
  posicao?: string | null;
  marcas_recomendadas?: string;
  termo_busca_ml?: string;

  termo_lido?: string;
  marca_preferencial?: string | null;
  termo_busca_mercadolivre?: string;
  confianca?: "alta" | "media" | "baixa";
  requer_confirmacao?: boolean;

  // Campos de enriquecimento de preço aceitando todas as variações
  preco?: number | null | string;
  price?: number | null | string;
  valor?: number | null | string;
  preco_ml?: number | null | string;
  preco_real_ml?: number | null;
  preco_formatado?: string | null;
  preco_estimado?: number | null | string;

  // Campos de links e afiliação direta
  link?: string | null;
  link_ml?: string | null;
  linkAfiliado?: string | null;
  link_afiliado?: string | null;
  affiliate_link?: string | null;
  url?: string | null;
  permalink?: string | null;
  slug?: string | null;

  marca?: string | null;
  titulo_anuncio?: string | null;
  titulo?: string | null;
  link_anuncio?: string | null;
  tem_full?: boolean;
  imagem?: string | null;
  thumbnail?: string | null;
  imagem_url?: string | null;
  encontrado?: boolean;
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
}

const EXEMPLOS_PRONTOS = [
  "Chevrolet Onix 1.0 2016: Troca de pastilhas de freio dianteiras e 2 amortecedores dianteiros",
  "Volkswagen Gol G5 1.6 2012: Kit de embreagem, jogo de velas e correia dentada com tensor",
  "Hyundai HB20 1.0 2018: Troca de discos de freio, pastilhas dianteiras e filtro de óleo",
  "Fiat Toro Freedom 2.0 Diesel 2018: Pastilha de freio dianteira e traseira",
];

/**
 * Garante a formatação do preço em Real brasileiro (BRL) tratando números, strings ou nulos
 */
const formatPrice = (val: any): string => {
  if (val === null || val === undefined || val === "") return "Consultar no Mercado Livre";
  let num: number;
  if (typeof val === "number") {
    num = val;
  } else {
    const cleaned = String(val).replace(/[^0-9.,]/g, "").replace(",", ".");
    num = parseFloat(cleaned);
  }
  return isNaN(num) || num <= 0
    ? "Consultar no Mercado Livre"
    : num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

/**
 * Formata valores monetários estritamente com 2 casas decimais e moeda BRL (compatibilidade)
 */
function formatarMoeda(valor: any): string {
  return formatPrice(valor);
}

/**
 * Extrai o valor numérico do preço aceitando todas as variações (preco ?? price ?? valor ?? preco_ml)
 */
const getNumericPrice = (item: ItemOrcamento | undefined | null): number => {
  if (!item) return 0;
  const val =
    item.preco ??
    item.price ??
    item.valor ??
    item.preco_ml ??
    item.preco_real_ml ??
    item.preco_estimado;

  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return isNaN(val) || val <= 0 ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.,]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? 0 : num;
};

/**
 * Retorna o link direto de afiliado do produto ou busca com tag de afiliado
 */
const getItemAffiliateUrl = (item: ItemOrcamento): string => {
  // a) Priorize sempre o link direto de afiliado retornado do produto
  const directUrl =
    item.linkAfiliado ||
    item.link_afiliado ||
    item.affiliate_link ||
    item.url ||
    item.permalink ||
    item.link_ml ||
    item.link ||
    item.link_anuncio ||
    item.link_direto_anuncio;

  if (directUrl && typeof directUrl === "string" && directUrl.trim()) {
    const trimmed = directUrl.trim();
    if (trimmed.startsWith("/")) return trimmed; // Rota interna /peca/[slug]
    return formatarLinkAfiliado(trimmed);
  }

  // b) Se o item tiver slug gravado no banco produtos_afiliados
  if (item.slug) {
    return `/peca/${item.slug}`;
  }

  // c) Se o item for gerado dinamicamente pela IA e não tiver link na base, monta a busca com tag de afiliado
  const termo =
    item.termo_busca ||
    item.termo_busca_ml ||
    item.termo_busca_mercadolivre ||
    item.query_busca ||
    item.peca_padronizada ||
    item.nome_peca ||
    item.nome ||
    "";

  const searchUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(termo)}_ItemCondition_2230284`;
  return formatarLinkAfiliado(searchUrl);
};

/**
 * Extrai nome canônico de exibição do veículo a partir de string ou objeto
 */
const getVeiculoDisplay = (res: OrcamentoResultado | null): string => {
  if (!res) return "Veículo Detectado";
  if (typeof res.veiculo === "string" && res.veiculo.trim()) {
    return res.veiculo.trim();
  }
  if (res.veiculo && typeof res.veiculo === "object") {
    const v = res.veiculo as any;
    if (v.nome_completo) return v.nome_completo;
    const partes = [v.marca, v.modelo, v.motorizacao, v.ano].filter(Boolean);
    if (partes.length > 0) return partes.join(" ");
  }
  return res.veiculo_detectado || "Veículo Detectado";
};

/**
 * Extrai placa identificada do veículo
 */
const getPlacaDisplay = (res: OrcamentoResultado | null): string | null => {
  if (!res) return null;
  if (res.placa && typeof res.placa === "string" && res.placa.trim() && res.placa !== "null") {
    return res.placa.trim().toUpperCase();
  }
  if (res.veiculo && typeof res.veiculo === "object") {
    const p = (res.veiculo as any).placa;
    if (p && typeof p === "string" && p.trim() && p !== "null") {
      return p.trim().toUpperCase();
    }
  }
  return null;
};

/**
 * BOTÃO 1: Gera texto limpo e estruturado para a Visão Cliente Final (com preços e links)
 */
function gerarTextoClienteFinal(
  resultado: OrcamentoResultado,
  itensSelecionados: number[],
  totalSelecionado: number
): string {
  const veiculoTexto = getVeiculoDisplay(resultado);
  const placa = getPlacaDisplay(resultado);
  const placaTexto = placa ? ` | Placa: ${placa}` : "";

  let msg = `🚗 *ORÇAMENTO DE PEÇAS*\n`;
  msg += `*Veículo:* ${veiculoTexto}${placaTexto}\n\n`;
  msg += `📋 *Itens Selecionados (${itensSelecionados.length}):*\n\n`;

  const itensParaEnviar = resultado.itens.filter((_, idx) => itensSelecionados.includes(idx));

  if (itensParaEnviar.length === 0) {
    msg += `(Nenhuma peça selecionada)\n`;
  } else {
    itensParaEnviar.forEach((item, index) => {
      const qtd = Number(item.quantidade) || 1;
      const nome = item.titulo_anuncio || item.nome || item.peca_padronizada || item.nome_peca || "Peça";
      const precoNum = getNumericPrice(item);
      const precoTexto = precoNum > 0
        ? precoNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "Consultar no Mercado Livre";
      const link = getItemAffiliateUrl(item);

      msg += `${index + 1}. *${qtd}x ${nome}*\n`;
      msg += `   💰 Preço: ${precoTexto}\n`;
      msg += `   🔗 Link: ${link}\n\n`;
    });

    if (totalSelecionado > 0) {
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `*TOTAL ESTIMADO:* ${totalSelecionado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n`;
    }
  }

  msg += `\nCotado via *PeçasFinder* ⚡`;
  return msg;
}

/**
 * BOTÃO 2: Gera lista técnica SEM PREÇOS, SEM LINKS e SEM TEXTO PUBLICITÁRIO para cotação B2B de balcão
 */
function gerarTextoFornecedores(
  resultado: OrcamentoResultado,
  itensSelecionados: number[]
): string {
  const veiculoTexto = getVeiculoDisplay(resultado);
  const placa = getPlacaDisplay(resultado);
  const placaTexto = placa ? `Placa: ${placa}\n` : "";

  const itensParaEnviar = resultado.itens.filter((_, idx) => itensSelecionados.includes(idx));

  let msg = `📋 COTAÇÃO DE PEÇAS\n`;
  msg += `Veículo: ${veiculoTexto}\n`;
  if (placaTexto) msg += placaTexto;
  msg += `\nItens Solicitados:\n`;

  if (itensParaEnviar.length === 0) {
    msg += `(Nenhuma peça selecionada)\n`;
  } else {
    itensParaEnviar.forEach((item, index) => {
      const qtd = Number(item.quantidade) || 1;
      const nome = item.nome || item.peca_padronizada || item.nome_peca || "Peça";
      msg += `${index + 1}. ${qtd}x ${nome}\n`;
    });
  }

  msg += `\nFavor informar disponibilidade e valores. Obrigado!`;
  return msg;
}

/**
 * Gera uma busca consolidada de kit completo para o Mercado Livre
 */
function gerarQueryKitCompleto(resultado: OrcamentoResultado): string {
  if (!resultado?.itens || resultado.itens.length === 0) return "";

  const veiculoTexto = getVeiculoDisplay(resultado);

  // Agrupa os componentes principais identificados
  const componentesChave: string[] = [];

  for (const item of resultado.itens) {
    const nome = (item.nome || item.peca_padronizada || item.nome_peca || "").toLowerCase();

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
    return `${termo} ${veiculoTexto}`.trim().replace(/\s+/g, " ");
  }

  return `kit pecas ${veiculoTexto}`.trim().replace(/\s+/g, " ");
}

export default function OrcamentoPage() {
  const [texto, setTexto] = useState("");
  const [imagem, setImagem] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [resultado, setResultado] = useState<OrcamentoResultado | null>(null);
  const [itensSelecionados, setItensSelecionados] = useState<number[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoPopup, setAvisoPopup] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalFechamentoAberto = isModalOpen;
  const setModalFechamentoAberto = setIsModalOpen;
  const [avisoPopupsBloqueados, setAvisoPopupsBloqueados] = useState(false);
  const [copiadoCliente, setCopiadoCliente] = useState(false);
  const [copiadoFornecedor, setCopiadoFornecedor] = useState(false);

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

      if (!res.ok) {
        const erroTexto = await res.text();
        let mensagemErro = `Erro no servidor (${res.status}): ${erroTexto.slice(0, 100)}`;
        try {
          const parsed = JSON.parse(erroTexto);
          if (parsed?.error) {
            mensagemErro = parsed.error;
          }
        } catch {
          // Mantém mensagem formatada com o status e trecho da resposta
        }
        throw new Error(mensagemErro);
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Não foi possível analisar o orçamento.");
      }

      const itensRecebidos: ItemOrcamento[] = data.itens || data.data?.itens || [];
      const veiculoRecebido = data.veiculo || data.data?.veiculo || data.data?.veiculo_detectado || "Veículo Detectado";
      const placaRecebida = data.placa || data.data?.placa || null;
      const totalRecebido = data.total_estimado || data.data?.total_estimado || "Consultar no Mercado Livre";

      const orcamentoRetornado: OrcamentoResultado = {
        veiculo: veiculoRecebido,
        veiculo_detectado: typeof veiculoRecebido === "string" ? veiculoRecebido : undefined,
        placa: placaRecebida,
        itens: itensRecebidos,
        total_estimado: totalRecebido,
      };

      setResultado(orcamentoRetornado);
      // Inicializa com todos os itens marcados por padrão
      setItensSelecionados(itensRecebidos.map((_: any, i: number) => i));

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

  // Recálculo dinâmico baseado na soma numérica de (quantidade * preço) de cada item
  const totalGeral = (resultado?.itens || []).reduce((acc, item) => {
    const qtd = Number(item.quantidade) || 1;
    const preco = typeof item.preco === "number" && item.preco > 0 ? item.preco : getNumericPrice(item);
    return acc + (qtd * preco);
  }, 0);

  const totalSelecionado = (resultado?.itens || []).reduce((acc, item, idx) => {
    if (!itensSelecionados.includes(idx)) return acc;
    const qtd = Number(item.quantidade) || 1;
    const preco = typeof item.preco === "number" && item.preco > 0 ? item.preco : getNumericPrice(item);
    return acc + (qtd * preco);
  }, 0);

  const totalFormatado =
    totalSelecionado > 0 ? formatPrice(totalSelecionado) : "Consulte o valor";

  const totalGeralFormatado =
    totalGeral > 0 ? formatPrice(totalGeral) : "Consulte o valor";

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

  // Handlers para Compartilhamento (Visão Cliente Final)
  const handleEnviarWhatsAppCliente = () => {
    if (!resultado) return;
    const msg = gerarTextoClienteFinal(resultado, itensSelecionados, totalSelecionado);
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handleCopiarCliente = async () => {
    if (!resultado) return;
    const msg = gerarTextoClienteFinal(resultado, itensSelecionados, totalSelecionado);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiadoCliente(true);
      setTimeout(() => setCopiadoCliente(false), 3000);
    } catch (err) {
      console.error("Erro ao copiar orçamento:", err);
    }
  };

  // Handlers para Envio a Fornecedores (Visão Balcão / Cotação B2B)
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
      console.error("Erro ao copiar lista para fornecedores:", err);
    }
  };

  // BOTÃO 3: "VER KIT COMPLETO NO MERCADO LIVRE"
  // Ao clicar, abre diretamente em nova aba a busca unificada com os termos principais e parâmetro de afiliado
  const handleVerKitCompleto = () => {
    if (!resultado?.itens || resultado.itens.length === 0) return;
    const veiculoTexto = getVeiculoDisplay(resultado);
    const itensEscolhidos = resultado.itens.filter((_, idx) =>
      itensSelecionados.length > 0 ? itensSelecionados.includes(idx) : true
    );
    const termoKit = `${veiculoTexto} kit ${itensEscolhidos
      .map((i) => i.nome || i.peca_padronizada || i.nome_peca)
      .join(" ")}`.replace(/\s+/g, " ").trim();
    const urlKit = formatarLinkAfiliado(`https://lista.mercadolivre.com.br/${encodeURIComponent(termoKit)}`);
    window.open(urlKit, "_blank");
  };

  // BOTÃO 4: "ABRIR TODAS EM ABAS SEPARADAS"
  // Para evitar o bloqueio de pop-ups dos navegadores com intervalo sutil
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
        }, index * 250); // intervalo sutil de 250ms para evitar bloqueio agressivo de pop-up
      }
    });

    if (itensParaAbrir.length > 1) {
      setTimeout(() => {
        setAvisoPopupsBloqueados(true);
      }, itensParaAbrir.length * 250 + 100);
    }
  };

  const handleClick = handleAbrirTodas;

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
                  <span>{getVeiculoDisplay(resultado)}</span>
                  {getPlacaDisplay(resultado) && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono font-bold bg-zinc-800 text-amber-300 border border-zinc-700 shadow-xs">
                      Placa: {getPlacaDisplay(resultado)}
                    </span>
                  )}
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400">
                  Detectamos <strong>{resultado.itens.length}</strong> peças mecânicas no orçamento.
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
                    {totalSelecionado > 0 ? totalFormatado : (totalGeral > 0 ? totalGeralFormatado : (resultado.total_estimado || "Consultar no Mercado Livre"))}
                  </span>
                  <span className="text-[11px] text-zinc-400 mt-1 block">
                    Preços e anúncios oficiais do Mercado Livre
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-zinc-950 font-black text-xs transition shadow-lg hover:shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer transform active:scale-95"
                  title="Abrir checklist de fechamento de orçamento"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Fechar Orçamento Completo</span>
                </button>
              </div>
            </div>

            {/* Container de Produtos (Cards ou Tabela) */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-amber-500" />
                    Peças Identificadas e Ofertas do Mercado Livre
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Preços e anúncios oficiais consultados na categoria de autopeças (MLB1747).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                  {/* Seletor de visualização Cards vs Tabela */}
                  <div className="inline-flex rounded-xl p-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
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
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black transition shadow-md hover:shadow-lg cursor-pointer transform active:scale-95"
                    title="Abrir checklist de fechamento de orçamento com opções de WhatsApp"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Fechar ({resultado.itens.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleVerKitCompleto}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold transition shadow-md hover:shadow-lg cursor-pointer transform active:scale-95"
                    title="Pesquisar todas as peças agrupadas em um kit completo no Mercado Livre"
                  >
                    <Package className="w-4 h-4 text-zinc-950" />
                    <span>Kit Completo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAbrirTodas}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold hover:opacity-90 transition shadow-sm cursor-pointer"
                    title="Abre as peças individualmente em abas do navegador"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir todas</span>
                  </button>
                </div>
              </div>

              {/* VISÃO 1: CARDS DE PRODUTOS */}
              {viewMode === "cards" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 p-6 bg-zinc-50/40 dark:bg-zinc-950/30">
                  {resultado.itens.map((item, idx) => {
                    const isChecked = itensSelecionados.includes(idx);
                    const finalUrl = item.linkAfiliado || item.link_afiliado || getItemAffiliateUrl(item);
                    const precoNum = typeof item.preco === "number" && item.preco > 0 ? item.preco : getNumericPrice(item);
                    const tituloReal = item.titulo || item.titulo_anuncio || item.nome || item.peca_padronizada || "Peça Automotiva";
                    const nomePeca = item.nome || item.peca_padronizada || "Peça";
                    const imagemReal = item.imagem || item.imagem_url || item.thumbnail;

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
                          {/* Cabeçalho do Card: Checkbox + Nome Canônico */}
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleItem(idx)}
                                className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500 shrink-0"
                              />
                              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate" title={nomePeca}>
                                {nomePeca}
                              </span>
                            </label>
                            {item.tem_full && (
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1 shrink-0">
                                <Zap className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                                <span>Full</span>
                              </span>
                            )}
                          </div>

                          {/* Imagem Real do Anúncio Oficial do Mercado Livre */}
                          <div className="w-full h-44 rounded-xl bg-white dark:bg-zinc-950 flex items-center justify-center overflow-hidden border border-zinc-100 dark:border-zinc-800/80 mb-3 relative group-hover:border-emerald-500/30 transition-colors">
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
                                <Wrench className="w-10 h-10 opacity-30 text-amber-500" />
                                <span className="text-[11px] text-zinc-400 text-center font-medium">
                                  Foto sob consulta no ML
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Título Real do Anúncio Oficial */}
                          <h4
                            className="font-bold text-sm text-zinc-900 dark:text-zinc-100 line-clamp-2 min-h-[2.5rem] leading-snug"
                            title={tituloReal}
                          >
                            {tituloReal}
                          </h4>
                        </div>

                        <div className="pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                          {/* Preço Formatado em Real */}
                          <div className="mb-3">
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                              Preço Oficial ML
                            </span>
                            {precoNum > 0 ? (
                              <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                                {precoNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </div>
                            ) : (
                              <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1">
                                Consultar no Mercado Livre
                              </div>
                            )}
                          </div>

                          {/* Botão de Ação Direto com Tag de Afiliado */}
                          <a
                            href={finalUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs flex items-center justify-center gap-1.5 transition shadow-md hover:shadow-emerald-500/25 cursor-pointer transform active:scale-95"
                            title={`Comprar "${tituloReal}" no Mercado Livre`}
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

              {/* VISÃO 2: TABELA DE PEÇAS */}
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
                        <th className="py-3.5 px-3 w-16 text-center">Qtd</th>
                        <th className="py-3.5 px-4">Nome da Peça / Anúncio Oficial</th>
                        <th className="py-3.5 px-4 w-44">Marca</th>
                        <th className="py-3.5 px-4 w-36 text-right">Preço</th>
                        <th className="py-3.5 px-4 w-36 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
                      {resultado.itens.map((item, idx) => {
                        const isChecked = itensSelecionados.includes(idx);
                        const finalUrl = item.linkAfiliado || item.link_afiliado || getItemAffiliateUrl(item);
                        const marcaNome =
                          item.marca ||
                          item.marcas_recomendadas ||
                          item.marca_preferencial ||
                          item.marca_recomendada ||
                          "Original / Homologada";
                        const qtd = Number(item.quantidade) || 1;
                        const precoUnit = typeof item.preco === "number" && item.preco > 0 ? item.preco : getNumericPrice(item);
                        const subtotal = qtd * precoUnit;
                        const tituloReal = item.titulo || item.titulo_anuncio || item.nome || item.peca_padronizada || "Peça";
                        const imagemReal = item.imagem || item.imagem_url || item.thumbnail;

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

                            {/* 2. Qtd */}
                            <td className="py-3.5 px-3 text-center align-middle">
                              <span className="inline-block px-2 py-0.5 text-xs font-bold font-mono rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
                                {qtd}x
                              </span>
                            </td>

                            {/* 3. Nome da Peça e Anúncio */}
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
                                    <span>{item.nome || item.peca_padronizada}</span>
                                    {item.posicao && (
                                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                                        {item.posicao}
                                      </span>
                                    )}
                                    {item.tem_full && (
                                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-0.5">
                                        <Zap className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                                        <span>Full</span>
                                      </span>
                                    )}
                                  </div>

                                  {tituloReal && tituloReal !== (item.nome || item.peca_padronizada) && (
                                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 max-w-md">
                                      {tituloReal}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 4. Marca */}
                            <td className="py-3.5 px-4 align-middle">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80">
                                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                <span className="truncate max-w-[130px]">{marcaNome}</span>
                              </span>
                            </td>

                            {/* 5. Preço formatado */}
                            <td className="py-3.5 px-4 align-middle text-right font-mono">
                              {precoUnit > 0 ? (
                                <div>
                                  <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 block leading-tight">
                                    {formatPrice(subtotal)}
                                  </span>
                                  {qtd > 1 && (
                                    <span className="text-[10px] text-zinc-400 block">
                                      {qtd}x de {formatPrice(precoUnit)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-400 font-sans">
                                  Consultar no Mercado Livre
                                </span>
                              )}
                            </td>

                            {/* 6. Botão Comprar com Tag de Afiliado */}
                            <td className="py-3.5 px-4 align-middle text-center">
                              <a
                                href={finalUrl}
                                target="_blank"
                                rel="noopener noreferrer sponsored"
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-emerald-500 hover:text-zinc-950 dark:bg-zinc-800 dark:hover:bg-emerald-400 dark:hover:text-zinc-950 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition cursor-pointer border border-zinc-200 dark:border-zinc-700 group"
                                title={`Comprar "${tituloReal}" no Mercado Livre`}
                              >
                                <span>Comprar ↗</span>
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Rodapé da Tabela: Resumo e Compartilhamento Lado a Lado */}
              <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800 space-y-6">
                {/* Linha superior com status de seleção e botões auxiliares */}
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
                    {totalSelecionado > 0 && (
                      <>
                        <span className="text-zinc-300 dark:text-zinc-700">|</span>
                        <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          Total: {totalFormatado}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black transition shadow-xs cursor-pointer flex items-center gap-1.5 transform active:scale-95"
                      title="Abrir checklist de fechamento de orçamento"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Fechar Orçamento ({resultado.itens.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleVerKitCompleto}
                      className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5 transform active:scale-95"
                      title="Pesquisar todas as peças agrupadas em um kit completo no Mercado Livre"
                    >
                      <Package className="w-4 h-4 text-zinc-950" />
                      <span>Ver Kit Completo no ML</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAbrirTodas}
                      className="px-3.5 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold hover:opacity-90 transition shadow-xs cursor-pointer flex items-center gap-1.5"
                      title="Abre as peças individualmente em abas do navegador"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir todas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setResultado(null);
                        setTexto("");
                        handleClearImage();
                        setAvisoPopup(false);
                        setIsModalOpen(false);
                        setAvisoPopupsBloqueados(false);
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      Fazer Nova Cotação
                    </button>
                  </div>
                </div>

                {/* Aviso simples e direto caso o navegador bloqueie pop-ups */}
                {avisoPopupsBloqueados && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>
                        Se apenas uma aba abriu, permita pop-ups neste site para abrir todas as peças de uma vez.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAvisoPopupsBloqueados(false)}
                      className="p-1 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition cursor-pointer shrink-0"
                      title="Fechar aviso"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Bloco de Compartilhamento Lado a Lado: Cliente Final vs Fornecedores (B2B) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  {/* BOTÃO 1: Compartilhar Orçamento (Visão Cliente Final) */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Share2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">
                            Compartilhar Orçamento
                          </h4>
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Visão Cliente Final
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        Lista detalhada com dados do veículo, preços unitários, links diretos de compra e total estimado.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleEnviarWhatsAppCliente}
                        className="flex-1 py-2.5 px-3.5 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition cursor-pointer transform active:scale-95"
                        title="Enviar orçamento detalhado com preços e links via WhatsApp"
                      >
                        <MessageSquare className="w-4 h-4 text-zinc-950 fill-zinc-950 shrink-0" />
                        <span>Enviar WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopiarCliente}
                        className="flex-1 py-2.5 px-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer transform active:scale-95"
                        title="Copiar orçamento com preços e links para a área de transferência"
                      >
                        {copiadoCliente ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-emerald-600 dark:text-emerald-400">Orçamento Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 text-zinc-500 shrink-0" />
                            <span>Copiar Orçamento</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* BOTÃO 2: Enviar para Fornecedores (Visão Balcão / Cotação B2B) */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">
                            Enviar para Fornecedores
                          </h4>
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                            Visão Balcão / Cotação B2B
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        Lista limpa sem preços e sem links comerciais, formatada exatamente para cotar em autopeças.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleEnviarWhatsAppFornecedores}
                        className="flex-1 py-2.5 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition cursor-pointer transform active:scale-95"
                        title="Enviar cotação limpa sem preços para fornecedores via WhatsApp"
                      >
                        <MessageSquare className="w-4 h-4 text-white fill-white shrink-0" />
                        <span>Cotar via WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopiarFornecedores}
                        className="flex-1 py-2.5 px-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer transform active:scale-95"
                        title="Copiar lista de cotação sem preços para a área de transferência"
                      >
                        {copiadoFornecedor ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-emerald-600 dark:text-emerald-400">Lista Copiada!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 text-zinc-500 shrink-0" />
                            <span>Copiar Lista para Fornecedores</span>
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

        {/* =========================================================================
            MODAL INTERATIVO: FECHAR ORÇAMENTO COMPLETO
        ========================================================================== */}
        {isModalOpen && resultado && (
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
                      {getVeiculoDisplay(resultado)}
                      {getPlacaDisplay(resultado) ? ` • Placa: ${getPlacaDisplay(resultado)}` : ""}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="Fechar modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Barra de Seleção / Contagem */}
              <div className="px-6 py-3 bg-zinc-100/70 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
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

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleVerKitCompleto}
                    className="font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    title="Ver kit unificado no Mercado Livre"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Kit Completo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAbrirTodas}
                    className="font-bold text-zinc-600 dark:text-zinc-400 hover:underline flex items-center gap-1 cursor-pointer"
                    title="Abrir abas de todas as peças"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir todas</span>
                  </button>

                  <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                    <strong className="text-zinc-900 dark:text-white font-mono">{itensSelecionados.length}</strong> de{" "}
                    <strong className="font-mono">{resultado.itens.length}</strong> selecionadas
                  </span>
                </div>
              </div>

              {/* Lista Scrollável de Itens com Checkbox, Foto, Título Real e Preço Real */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                {resultado.itens.map((item, idx) => {
                  const isChecked = itensSelecionados.includes(idx);
                  const finalUrl = item.linkAfiliado || item.link_afiliado || getItemAffiliateUrl(item);
                  const imagemReal = item.imagem || item.imagem_url || item.thumbnail;
                  const tituloReal = item.titulo || item.titulo_anuncio || item.nome || item.peca_padronizada || "Peça";

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
                          {imagemReal ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imagemReal}
                              alt={tituloReal}
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
                              {item.nome || item.peca_padronizada}
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
                          {tituloReal && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-1">
                              {tituloReal}
                            </p>
                          )}

                          <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2">
                            <span>
                              Marca:{" "}
                              <strong className="text-zinc-700 dark:text-zinc-300 font-medium">
                                {item.marca || item.marca_preferencial || item.marca_recomendada || "Original / Homologada"}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Preço e Botão Individual Comprar / Ver no ML */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pl-8 sm:pl-0 shrink-0">
                        <div className="text-right">
                          {(() => {
                            const qtd = Number(item.quantidade) || 1;
                            const precoUnit = getNumericPrice(item);
                            const subtotal = qtd * precoUnit;

                            return (
                              <>
                                <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400 block leading-tight">
                                  {subtotal > 0
                                    ? formatPrice(subtotal)
                                    : "Consultar no Mercado Livre"}
                                </span>
                                {qtd > 1 && precoUnit > 0 ? (
                                  <span className="text-[10px] text-zinc-400 block">
                                    {qtd}x de {formatPrice(precoUnit)}
                                  </span>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>

                        <a
                          href={finalUrl}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-500 hover:text-zinc-950 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition shadow-xs cursor-pointer group"
                          title="Comprar este produto diretamente no Mercado Livre"
                        >
                          <span>Comprar no Mercado Livre ↗</span>
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

                {/* Bloco de Compartilhamento Lado a Lado: Cliente Final vs Fornecedores (B2B) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                  {/* BOTÃO 1: Compartilhar Orçamento (Visão Cliente Final) */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Share2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white leading-tight">
                            Compartilhar Orçamento
                          </h4>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Visão Cliente Final
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                        Preços unitários, links diretos de compra e total estimado.
                      </p>
                    </div>

                    <div className="flex items-stretch gap-2">
                      <button
                        type="button"
                        onClick={handleEnviarWhatsAppCliente}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer transform active:scale-95"
                        title="Enviar orçamento detalhado com preços e links via WhatsApp"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-zinc-950 fill-zinc-950 shrink-0" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopiarCliente}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer transform active:scale-95"
                        title="Copiar orçamento com preços e links para a área de transferência"
                      >
                        {copiadoCliente ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="text-emerald-600 dark:text-emerald-400">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* BOTÃO 2: Enviar para Fornecedores (Visão Balcão / Cotação B2B) */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white leading-tight">
                            Enviar para Fornecedores
                          </h4>
                          <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                            Visão Balcão / Cotação B2B
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                        Lista limpa sem preços e sem links para balcão de autopeças.
                      </p>
                    </div>

                    <div className="flex items-stretch gap-2">
                      <button
                        type="button"
                        onClick={handleEnviarWhatsAppFornecedores}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer transform active:scale-95"
                        title="Enviar cotação limpa sem preços para fornecedores via WhatsApp"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-white fill-white shrink-0" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopiarFornecedores}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer transform active:scale-95"
                        title="Copiar lista de cotação sem preços para a área de transferência"
                      >
                        {copiadoFornecedor ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="text-emerald-600 dark:text-emerald-400">Copiada!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
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
                    const finalUrl = getItemAffiliateUrl(item);
                    const precoItem = getNumericPrice(item);
                    return (
                      <a
                        key={idx}
                        href={finalUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs transition"
                      >
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate pr-2">
                          {idx + 1}. {item.peca_padronizada || item.nome_peca}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0">
                          <span>{precoItem > 0 ? formatPrice(precoItem) : "Ver Peça"}</span>
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
