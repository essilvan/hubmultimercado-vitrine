/**
 * Script para migrar e limpar slugs antigos no banco de dados Supabase.
 * Executa a higienização de prefixos genéricos ("auto-pecas-cod-ml-", "cod-ml-", repetições de marca)
 * e atualiza para o formato semântico oficial: [nome-da-peca]-[marca]-[modelo-carro]-[codigo-opcional]-[hash-unico].
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { gerarSlugProduto, limparSlug } from "../lib/slug.ts";

// Carrega variáveis do .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
let env: Record<string, string> = {};

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  env = content.split("\n").reduce((acc, line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [k, ...v] = trimmed.split("=");
      if (k && v.length) {
        acc[k.trim()] = v.join("=").trim();
      }
    }
    return acc;
  }, {} as Record<string, string>);
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Credenciais do Supabase não encontradas.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrarSlugs() {
  console.log("Iniciando auditoria e migração de slugs no Supabase...\n");

  const { data: produtos, error } = await supabase
    .from("produtos_afiliados")
    .select("id, titulo, slug, marca, codigo_fabricante, veiculos_compativeis")
    .order("created_at", { ascending: false });

  if (error || !produtos) {
    console.error("Erro ao buscar produtos:", error);
    process.exit(1);
  }

  console.log(`Total de produtos encontrados: ${produtos.length}\n`);

  let atualizados = 0;
  let jaLimpos = 0;

  for (const prod of produtos) {
    const slugAtual = prod.slug || "";
    // Tenta primeiro limpar o slug existente preservando o hash
    let slugNovo = limparSlug(slugAtual);

    // Se ainda contiver termos indesejados ou se puder ser reconstruído mais semanticamente:
    if (
      slugAtual.startsWith("auto-pecas") ||
      slugAtual.includes("cod-ml") ||
      /^[a-z0-9]+-[a-z0-9]+-(?:cod|pec)-/i.test(slugAtual) ||
      !slugNovo
    ) {
      slugNovo = gerarSlugProduto({
        titulo: prod.titulo,
        marca: prod.marca,
        veiculo: prod.veiculos_compativeis,
        codigo: prod.codigo_fabricante,
        hash: slugAtual.slice(-4),
      });
    }

    if (slugNovo !== slugAtual) {
      console.log(`[ATUALIZANDO] ID: ${prod.id}`);
      console.log(`   DE:   "${slugAtual}"`);
      console.log(`   PARA: "${slugNovo}"\n`);

      const { error: updateError } = await supabase
        .from("produtos_afiliados")
        .update({ slug: slugNovo })
        .eq("id", prod.id);

      if (updateError) {
        console.error(`   ERRO ao atualizar ${prod.id}:`, updateError.message);
      } else {
        atualizados++;
      }
    } else {
      jaLimpos++;
    }
  }

  console.log("--------------------------------------------------");
  console.log(`Migração concluída com sucesso!`);
  console.log(`Produtos atualizados: ${atualizados}`);
  console.log(`Produtos já conformes: ${jaLimpos}`);
}

migrarSlugs().catch(console.error);
