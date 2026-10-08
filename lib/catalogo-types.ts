export interface ItemExtraidoCatalogo {
  id: string;
  titulo: string;
  slug: string;
  codigo_fabricante: string;
  marca: string;
  categoria: string;
  tipo_peca: string;
  veiculos_compativeis: string;
  codigo_oem?: string | null;
  busca_ml: string;
  link_destino?: string | null;
  link_ml?: string | null;
  imagem_url?: string | null;
  preco_estimado?: number | null;
}

// Gerador e utilitários de slug integrados com o módulo canônico
export { gerarSlug as generateSlug, gerarSlugProduto, limparSlug } from "./slug";

