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

// Gerador de slug amigável em kebab-case
export function generateSlug(text: string): string {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
