const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Carregar variáveis de ambiente de .env.local
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('Arquivo .env.local não encontrado!');
    return {};
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...vals] = trimmed.split('=');
    env[key.trim()] = vals.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Erro: NEXT_PUBLIC_SUPABASE_URL e chave do Supabase devem estar configurados no .env.local.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// 2. Array com os 12 produtos de alto giro
const produtosAltoGiro = [
  {
    titulo: 'Kit de Embreagem LuK 620 3236 00 - Hyundai HB20 1.0 12V 3Cil',
    slug: 'kit-embreagem-luk-620323600-hyundai-hb20-10',
    codigo_fabricante: '620 3236 00',
    marca: 'LuK',
    categoria: 'Embreagem',
    veiculos_compativeis: 'Hyundai HB20 1.0 12V 3Cil Kappa Flex (2012 a 2019) - Platô, Disco e Rolamento',
    codigo_oem: '41100-02800 / 41300-02800',
    preco_estimado: 489.90,
    busca_ml: 'LuK 620 3236 00 HB20 1.0',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_900609-MLB72900760431_112023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/luk-620-3236-00-hb20-1.0',
      link_destino: 'https://lista.mercadolivre.com.br/luk-620-3236-00-hb20-1.0',
    },
  },
  {
    titulo: 'Kit de Embreagem LuK 619 3015 00 - Chevrolet Onix / Prisma / Celta 1.0 1.4',
    slug: 'kit-embreagem-luk-619301500-onix-prisma-celta',
    codigo_fabricante: '619 3015 00',
    marca: 'LuK',
    categoria: 'Embreagem',
    veiculos_compativeis: 'Chevrolet Onix 1.0 e 1.4 (2012 a 2019), Prisma 1.0 e 1.4 (2013 a 2019), Celta 1.0 (2001 a 2016)',
    codigo_oem: '93325178 / 93332742',
    preco_estimado: 429.90,
    busca_ml: 'LuK 619 3015 00 Onix Celta',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_960533-MLB71746231908_092023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/luk-619-3015-00-onix',
      link_destino: 'https://lista.mercadolivre.com.br/luk-619-3015-00-onix',
    },
  },
  {
    titulo: 'Kit de Embreagem Sachs 6598 - VW Gol Fox Voyage Saveiro 1.0 1.6 8V EA111',
    slug: 'kit-embreagem-sachs-6598-vw-gol-fox-voyage',
    codigo_fabricante: '6598',
    marca: 'Sachs',
    categoria: 'Embreagem',
    veiculos_compativeis: 'Volkswagen Gol G5 G6 G7 (2008 a 2022), Fox 1.0/1.6 (2003 a 2021), Voyage (2008 a 2022), Saveiro 1.6',
    codigo_oem: '030198141BX',
    preco_estimado: 399.90,
    busca_ml: 'Sachs 6598 Gol Fox Voyage',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_668705-MLB54940251782_042023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/sachs-6598-gol-fox',
      link_destino: 'https://lista.mercadolivre.com.br/sachs-6598-gol-fox',
    },
  },
  {
    titulo: 'Par de Amortecedores Dianteiros Nakata HG41183 Pressurizados - Chevrolet Onix / Prisma',
    slug: 'par-amortecedor-dianteiro-nakata-hg41183-onix-prisma',
    codigo_fabricante: 'HG41183',
    marca: 'Nakata',
    categoria: 'Suspensão',
    veiculos_compativeis: 'Chevrolet Onix (2013 a 2019), Prisma (2013 a 2019) Joy, LT, LTZ 1.0 e 1.4',
    codigo_oem: '52088339 / 52088340 / 94748950',
    preco_estimado: 369.00,
    busca_ml: 'Nakata HG41183 Onix Prisma',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_688849-MLB71790691167_092023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/nakata-hg41183-onix',
      link_destino: 'https://lista.mercadolivre.com.br/nakata-hg41183-onix',
    },
  },
  {
    titulo: 'Amortecedor Dianteiro Monroe OESpectrum G7367 - Hyundai HB20 / HB20S 1.0 1.6',
    slug: 'amortecedor-dianteiro-monroe-g7367-hyundai-hb20',
    codigo_fabricante: 'G7367',
    marca: 'Monroe',
    categoria: 'Suspensão',
    veiculos_compativeis: 'Hyundai HB20 e HB20S 1.0 e 1.6 Flex (2012 a 2019)',
    codigo_oem: '54650-1S000 / 54660-1S000',
    preco_estimado: 349.90,
    busca_ml: 'Monroe G7367 HB20',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_908332-MLB72944747970_112023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/monroe-g7367-hb20',
      link_destino: 'https://lista.mercadolivre.com.br/monroe-g7367-hb20',
    },
  },
  {
    titulo: 'Par de Discos de Freio Dianteiro Ventilado Fremax BD4754 - VW Gol / Fox / Voyage G5 G6',
    slug: 'par-disco-freio-fremax-bd4754-vw-gol-fox',
    codigo_fabricante: 'BD4754',
    marca: 'Fremax',
    categoria: 'Freio',
    veiculos_compativeis: 'VW Gol G5 G6 G7 1.0 1.6 (2008 a 2022), Fox 1.0 1.6 (2003 a 2021), Voyage, Polo 1.6',
    codigo_oem: '5Z0615301B / 6QE615301',
    preco_estimado: 219.00,
    busca_ml: 'Fremax BD4754 Gol Fox',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_727976-MLB71790691219_092023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/fremax-bd4754-gol',
      link_destino: 'https://lista.mercadolivre.com.br/fremax-bd4754-gol',
    },
  },
  {
    titulo: 'Jogo de Velas de Ignição NGK Laser Iridium ILKAR7L11 - Hyundai HB20 1.0 12V 3Cil',
    slug: 'jogo-velas-ignicao-ngk-iridium-ilkar7l11-hb20-10',
    codigo_fabricante: 'ILKAR7L11',
    marca: 'NGK',
    categoria: 'Ignição',
    veiculos_compativeis: 'Hyundai HB20 1.0 12V 3Cil Kappa Flex (2012 a 2019), Kia Picanto 1.0 3Cil (2011 a 2018)',
    codigo_oem: '18846-11070',
    preco_estimado: 179.90,
    busca_ml: 'NGK Iridium ILKAR7L11 HB20 1.0',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_956795-MLB71929388301_092023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/ngk-iridium-ilkar7l11-hb20',
      link_destino: 'https://lista.mercadolivre.com.br/ngk-iridium-ilkar7l11-hb20',
    },
  },
  {
    titulo: 'Jogo de 4 Velas de Ignição NGK Green Plug BKR6E-D - Chevrolet Onix / Celta / Corsa / Palio',
    slug: 'jogo-velas-ignicao-ngk-bkr6e-d-onix-corsa-celta',
    codigo_fabricante: 'BKR6E-D',
    marca: 'NGK',
    categoria: 'Ignição',
    veiculos_compativeis: 'Chevrolet Onix 1.0/1.4, Prisma 1.0/1.4, Celta 1.0, Corsa Classic, Fiat Palio Fire 1.0/1.4',
    codigo_oem: '93230927 / 7083401',
    preco_estimado: 79.90,
    busca_ml: 'NGK BKR6E-D Onix Celta Palio',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_727443-MLB71899079998_092023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/ngk-bkr6e-d-onix-palio',
      link_destino: 'https://lista.mercadolivre.com.br/ngk-bkr6e-d-onix-palio',
    },
  },
  {
    titulo: 'Jogo de Pastilhas de Freio Dianteiro Cobreq N-384 - Chevrolet Onix / Prisma / Cobalt',
    slug: 'pastilha-freio-cobreq-n384-onix-prisma-cobalt',
    codigo_fabricante: 'N-384',
    marca: 'Cobreq',
    categoria: 'Freio',
    veiculos_compativeis: 'Chevrolet Onix 1.0 e 1.4 (2012 a 2019), Prisma 1.0 e 1.4 (2013 a 2019), Cobalt 1.4/1.8, Spin',
    codigo_oem: '94748947 / 95231012',
    preco_estimado: 84.90,
    busca_ml: 'Cobreq N-384 Onix Prisma',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_907471-MLB71833777551_092023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/cobreq-n384-onix',
      link_destino: 'https://lista.mercadolivre.com.br/cobreq-n384-onix',
    },
  },
  {
    titulo: 'Refil Bomba de Combustível Bosch F000TE154T Flex Universal 3.0 Bar',
    slug: 'refil-bomba-combustivel-bosch-f000te154t-flex-universal',
    codigo_fabricante: 'F000TE154T',
    marca: 'Bosch',
    categoria: 'Injeção Eletrônica',
    veiculos_compativeis: 'Universal Flex - Gol G4 G5 G6, Palio, Uno Fire, Celta, Fox, Fiesta, Onix 1.0/1.4 Flex',
    codigo_oem: '51806983 / 5U0919051A',
    preco_estimado: 159.90,
    busca_ml: 'Bomba Combustivel Bosch F000TE154T Flex',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_895240-MLB72944747971_112023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/bosch-f000te154t-bomba-flex',
      link_destino: 'https://lista.mercadolivre.com.br/bosch-f000te154t-bomba-flex',
    },
  },
  {
    titulo: 'Kit Correia Dentada e Tensor Contitech CT1065K1 - VW Gol Fox Voyage 1.0 1.6 8V EA111',
    slug: 'kit-correia-dentada-contitech-ct1065k1-vw-gol-fox-ea111',
    codigo_fabricante: 'CT1065K1',
    marca: 'Contitech',
    categoria: 'Motor',
    veiculos_compativeis: 'Volkswagen Gol G5 G6 G7, Fox, Voyage, Saveiro, SpaceFox - Motor 1.0 e 1.6 8V EA111 Total Flex',
    codigo_oem: '030198119F / 030109119AB',
    preco_estimado: 169.90,
    busca_ml: 'Contitech CT1065K1 Gol Fox EA111',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_977873-MLB71790691238_092023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/contitech-ct1065k1-gol-fox',
      link_destino: 'https://lista.mercadolivre.com.br/contitech-ct1065k1-gol-fox',
    },
  },
  {
    titulo: 'Filtro de Óleo Mann-Filter W 712/53 - VW Gol Fox Polo Up! Golf 1.0 1.6 EA111 / EA211',
    slug: 'filtro-oleo-mann-filter-w71253-vw-gol-fox-polo',
    codigo_fabricante: 'W 712/53',
    marca: 'Mann-Filter',
    categoria: 'Filtros',
    veiculos_compativeis: 'Volkswagen Gol G4 G5 G6 G7 1.0 1.6, Fox 1.0 1.6, Voyage, Polo 1.6, Up! 1.0 MPI/TSI, Golf',
    codigo_oem: '030115561AN / 04E115561H',
    preco_estimado: 39.90,
    busca_ml: 'Mann Filter W712/53 Gol Fox',
    imagem_url: 'https://http2.mlstatic.com/D_NQ_NP_895022-MLB72900760467_112023-O.webp',
    especificacoes: {
      link_ml: 'https://lista.mercadolivre.com.br/mann-filter-w712-53',
      link_destino: 'https://lista.mercadolivre.com.br/mann-filter-w712-53',
    },
  },
];

// 3. Execução do upsert no Supabase
async function runSeed() {
  console.log('🚀 Iniciando Ingestão dos 12 Produtos de Alto Giro...');
  console.log(`🔌 Conectado ao Supabase em: ${supabaseUrl}`);

  let sucessoCount = 0;
  let erroCount = 0;

  for (const produto of produtosAltoGiro) {
    process.stdout.write(`   Gravando [${produto.marca}] ${produto.codigo_fabricante} - ${produto.titulo}... `);

    const { data, error } = await supabase
      .from('produtos_afiliados')
      .upsert(produto, { onConflict: 'slug' })
      .select('id, slug');

    if (error) {
      process.stdout.write(`❌ ERRO: ${error.message}\n`);
      erroCount++;
    } else {
      process.stdout.write(`✅ OK (ID: ${data && data[0] ? data[0].id : 'salvo'})\n`);
      sucessoCount++;
    }
  }

  console.log('\n======================================================');
  console.log('🎉 Ingestão de Dados Concluída!');
  console.log(`   - Sucessos: ${sucessoCount} de ${produtosAltoGiro.length}`);
  if (erroCount > 0) {
    console.log(`   - Erros: ${erroCount}`);
  }
  console.log('======================================================\n');
}

runSeed().catch((err) => {
  console.error('Erro fatal no seed:', err);
  process.exit(1);
});
