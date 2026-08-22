// =====================================================================
// Clientes Supabase.
//
// REGRA DE OURO DAS CHAVES:
//   NEXT_PUBLIC_SUPABASE_ANON_KEY  → pode aparecer no navegador. Limitada pelo RLS.
//   SUPABASE_SERVICE_ROLE_KEY      → NUNCA no navegador. Ignora todo o RLS.
//
// Se a service_role vazar, o banco inteiro vaza junto. Ela só é lida aqui,
// dentro de uma função que só roda no servidor.
// =====================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** true quando o projeto ainda não foi conectado à Supabase. */
export const semSupabase = !url || !anonKey;

/**
 * Cliente público. Enxerga apenas o que as políticas de RLS permitem:
 * perguntas publicadas, candidatos deferidos, posições revisadas, agregados.
 */
export function clientePublico(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

/**
 * Cliente administrativo. Ignora o RLS.
 *
 * Só pode ser chamado em código de servidor (route handlers, server components,
 * scripts). Lança erro se a chave não existir, em vez de falhar silenciosamente.
 */
export function clienteServidor(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
