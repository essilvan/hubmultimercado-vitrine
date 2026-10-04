import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Credenciais do Supabase ausentes no servidor.");
  }

  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Nenhum arquivo de imagem enviado." },
        { status: 400 }
      );
    }

    const fileExt = file.name.split(".").pop()?.toLowerCase() || "webp";
    const sanitizedExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(fileExt)
      ? fileExt
      : "webp";
    const fileName = `catalogo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${sanitizedExt}`;
    const filePath = `pecas/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const supabase = getSupabaseClient();

    const { error: uploadError } = await supabase.storage
      .from("pecas-imagens")
      .upload(filePath, buffer, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });

    if (uploadError) {
      console.error("Erro no Supabase Storage:", uploadError);
      return NextResponse.json(
        {
          success: false,
          error: `Erro ao enviar para o Supabase Storage: ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("pecas-imagens")
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      publicUrl: urlData.publicUrl,
      fileName,
    });
  } catch (error: unknown) {
    console.error("Erro no upload de imagem:", error);
    const msg =
      error instanceof Error ? error.message : "Erro desconhecido ao enviar imagem.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
