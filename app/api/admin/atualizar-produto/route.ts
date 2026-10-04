import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Variáveis do Supabase não configuradas no servidor.");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, imagem_url, link_ml, preco_estimado, titulo, veiculos_compativeis } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID do produto é obrigatório para atualização." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Busca o produto existente para preservar outras propriedades de especificações
    const { data: existing, error: fetchErr } = await supabase
      .from("produtos_afiliados")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr && fetchErr.code !== "PGRST116") {
      console.warn("Erro ao buscar produto atual:", fetchErr);
    }

    const existingSpecs =
      existing && typeof existing.especificacoes === "object" && existing.especificacoes
        ? existing.especificacoes
        : {};

    const updatePayload: Record<string, unknown> = {};

    if (imagem_url !== undefined) {
      updatePayload.imagem_url = imagem_url;
    }

    if (link_ml !== undefined) {
      const cleanLink = typeof link_ml === "string" ? link_ml.trim() : "";
      updatePayload.especificacoes = {
        ...existingSpecs,
        link_ml: cleanLink,
        link_destino: cleanLink,
      };
    }

    if (preco_estimado !== undefined) {
      updatePayload.preco_estimado = preco_estimado;
    }

    if (titulo !== undefined) {
      updatePayload.titulo = titulo;
    }

    if (veiculos_compativeis !== undefined) {
      updatePayload.veiculos_compativeis = veiculos_compativeis;
    }

    const { data: updated, error: updateError } = await supabase
      .from("produtos_afiliados")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Erro ao atualizar produto no Supabase:", updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      product: updated,
    });
  } catch (err: unknown) {
    console.error("Erro interno ao atualizar produto:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido ao atualizar produto.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
