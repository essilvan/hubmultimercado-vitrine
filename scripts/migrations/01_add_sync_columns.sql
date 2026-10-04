-- Migração para suporte a preços antigos, descontos e sincronização automática
ALTER TABLE produtos_afiliados ADD COLUMN IF NOT EXISTS preco_antigo TEXT;
ALTER TABLE produtos_afiliados ADD COLUMN IF NOT EXISTS desconto_percentual TEXT;
ALTER TABLE produtos_afiliados ADD COLUMN IF NOT EXISTS ultima_sincronizacao TIMESTAMPTZ;
ALTER TABLE produtos_afiliados ADD COLUMN IF NOT EXISTS link_afiliado TEXT;
