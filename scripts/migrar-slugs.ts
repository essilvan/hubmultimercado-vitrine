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
    .select("id, titulo, slug, marca, codigo_fabricante, veiculos_compativeis, especificacoes, ml_id")
    .order("created_at", { ascending: false });

  if (error || !produtos) {
    console.error("Erro ao buscar produtos:", error);
    process.exit(1);
  }

  console.log(`Total de produtos encontrados: ${produtos.length}\n`);

  let atualizados = 0;
  let jaLimpos = 0;
  const slugsOcupados = new Set<string>();

  // Primeiro indexa slugs de produtos que já são válidos (<=80 chars, sem x27, etc)
  for (const prod of produtos) {
    if (
      prod.slug &&
      prod.slug.length <= 80 &&
      !prod.slug.includes("x27") &&
      !/(?:19|20)?\d{2}-(?:19|20)?\d{2}-(?:19|20)?\d{2}/.test(prod.slug)
    ) {
      slugsOcupados.add(prod.slug);
    }
  }

  for (const prod of produtos) {
    const slugAtual = prod.slug || "";
    let slugNovo = "";

    const precisaHigienizacao =
      !slugAtual ||
      slugAtual.length > 80 ||
      slugAtual.length > 100 ||
      slugAtual.includes("x27") ||
      slugAtual.startsWith("auto-pecas") ||
      slugAtual.includes("cod-ml") ||
      /(?:19|20)?\d{2}-(?:19|20)?\d{2}-(?:19|20)?\d{2}/.test(slugAtual);

    if (precisaHigienizacao) {
      // Reconstrói um slug limpo e semântico
      slugNovo = gerarSlugProduto({
        titulo: prod.titulo,
        marca: prod.marca,
        veiculo: prod.veiculos_compativeis,
        codigo: prod.codigo_fabricante,
      });

      // Se colidir com outro produto, acrescenta sufixo identificador único
      if (slugsOcupados.has(slugNovo)) {
        const hash = (prod.ml_id ? prod.ml_id.replace(/\D/g, "").slice(-4) : null) || prod.id.replace(/\D/g, "").slice(-4) || "01";
        slugNovo = `${slugNovo.slice(0, 75)}-${hash}`;
      }
    } else {
      slugNovo = limparSlug(slugAtual);
    }

    if (slugNovo !== slugAtual || !slugAtual) {
      console.log(`[ATUALIZANDO] ID: ${prod.id}`);
      console.log(`   DE (${slugAtual.length}):   "${slugAtual}"`);
      console.log(`   PARA (${slugNovo.length}): "${slugNovo}"\n`);

      // Atualiza especificações com lista de slugs antigos para redirect
      const especificacoesAtuais = prod.especificacoes || {};
      const slugsAntigos = Array.isArray(especificacoesAtuais.slugs_antigos)
        ? [...especificacoesAtuais.slugs_antigos]
        : [];

      if (slugAtual && !slugsAntigos.includes(slugAtual)) {
        slugsAntigos.push(slugAtual);
      }

      const { error: updateError } = await supabase
        .from("produtos_afiliados")
        .update({
          slug: slugNovo,
          especificacoes: {
            ...especificacoesAtuais,
            slugs_antigos: slugsAntigos,
          },
        })
        .eq("id", prod.id);

      if (updateError) {
        console.error(`   ERRO ao atualizar ${prod.id}:`, updateError.message);
      } else {
        atualizados++;
        slugsOcupados.add(slugNovo);
      }
    } else {
      jaLimpos++;
      slugsOcupados.add(slugNovo);
    }
  }

  console.log("--------------------------------------------------");
  console.log(`Migração concluída com sucesso!`);
  console.log(`Produtos atualizados: ${atualizados}`);
  console.log(`Produtos já conformes: ${jaLimpos}`);
}

migrarSlugs().catch(console.error);
