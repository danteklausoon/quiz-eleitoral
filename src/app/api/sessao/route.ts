// =====================================================================
// POST /api/sessao — a ÚNICA escrita do fluxo do quiz (Regra 2).
//
// Esta rota é o portão do banco. Ela:
//   1. valida tudo que veio do cliente (nunca confie no navegador);
//   2. calcula o device_hash com sal do dia — NUNCA guarda IP em claro;
//   3. aplica rate limit;
//   4. decide se a sessão entra nos números públicos (is_counted);
//   5. grava uma linha, usando service_role.
//
// O RLS impede o `anon` de inserir direto. Tudo passa por aqui.
// =====================================================================

import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase";
import { UFS } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELEICAO = 2026;
const MAX_RESPOSTAS = 400;
const MIN_RESPOSTAS_PARA_CONTAR = 10;
const LIMITE_POR_HORA = 5;
const VERSAO_CONSENTIMENTO = "2026-08-v1";

/**
 * Sal do dia, mantido só em memória do processo.
 * Trocado a cada 24h e nunca gravado: depois disso o device_hash
 * deixa de ser reversível mesmo para quem tiver o banco em mãos.
 */
let salAtual = randomBytes(32).toString("hex");
let salTrocadoEm = Date.now();

function salDoDia(): string {
  if (Date.now() - salTrocadoEm > 86_400_000) {
    salAtual = randomBytes(32).toString("hex");
    salTrocadoEm = Date.now();
  }
  return salAtual;
}

function calcularDeviceHash(req: Request): string {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "desconhecido";
  const ua = req.headers.get("user-agent") ?? "";
  return createHash("sha256").update(`${ip}|${ua}|${salDoDia()}`).digest("hex");
}

type ParRespostas = [number, number];

interface CorpoRequisicao {
  respostas?: unknown;
  estado?: unknown;
  decadaNascimento?: unknown;
  temasPrioritarios?: unknown;
  completo?: unknown;
  consentimento?: unknown;
}

export async function POST(req: Request) {
  let corpo: CorpoRequisicao;
  try {
    corpo = (await req.json()) as CorpoRequisicao;
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }

  // ---- validação das respostas -------------------------------------
  const bruto = corpo.respostas;
  if (!Array.isArray(bruto)) {
    return NextResponse.json({ erro: "Campo 'respostas' precisa ser uma lista." }, { status: 400 });
  }
  if (bruto.length > MAX_RESPOSTAS) {
    return NextResponse.json({ erro: "Respostas demais em uma sessão." }, { status: 400 });
  }

  const respostas: ParRespostas[] = [];
  for (const item of bruto) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [id, valor] = item as [unknown, unknown];
    if (!Number.isInteger(id) || (id as number) < 1) continue;
    if (![0, 1, 2, 3].includes(valor as number)) continue;
    respostas.push([id as number, valor as number]);
  }
  if (respostas.length === 0) {
    return NextResponse.json({ erro: "Nenhuma resposta válida." }, { status: 400 });
  }

  // ---- validação do contexto declarado ------------------------------
  const estado =
    typeof corpo.estado === "string" && (UFS as readonly string[]).includes(corpo.estado)
      ? corpo.estado
      : null;

  // Década, não data de nascimento: dado grosseiro de propósito.
  const decada =
    Number.isInteger(corpo.decadaNascimento) &&
    (corpo.decadaNascimento as number) >= 1920 &&
    (corpo.decadaNascimento as number) <= 2020
      ? (corpo.decadaNascimento as number)
      : null;

  const temas = Array.isArray(corpo.temasPrioritarios)
    ? corpo.temasPrioritarios.filter((t): t is number => Number.isInteger(t)).slice(0, 5)
    : [];

  const deviceHash = calcularDeviceHash(req);
  const sb = clienteServidor();

  // Sem Supabase configurada: a rota responde OK para não travar o
  // desenvolvimento, mas avisa que nada foi gravado.
  if (!sb) {
    return NextResponse.json({
      ok: true,
      gravado: false,
      aviso: "Supabase não configurada. Preencha o .env.local para gravar de verdade.",
    });
  }

  // ---- rate limit ---------------------------------------------------
  const umaHoraAtras = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await sb
    .from("submission_log")
    .select("*", { count: "exact", head: true })
    .eq("device_hash", deviceHash)
    .gte("created_at", umaHoraAtras);

  const dentroDoLimite = (count ?? 0) < LIMITE_POR_HORA;
  if (!dentroDoLimite) {
    return NextResponse.json(
      { erro: "Muitas sessões enviadas em pouco tempo. Tente novamente mais tarde." },
      { status: 429 },
    );
  }

  // ---- decisão de integridade ---------------------------------------
  // Só entra nos números públicos o que passou nas checagens.
  // Em produção, some aqui a verificação do token do Cloudflare Turnstile.
  const contabilizar =
    respostas.length >= MIN_RESPOSTAS_PARA_CONTAR && corpo.completo === true;

  // ---- gravação: UMA linha por sessão -------------------------------
  const { data, error } = await sb
    .from("quiz_sessions")
    .insert({
      election_id: ELEICAO,
      device_hash: deviceHash,
      state: estado,
      birth_decade: decada,
      priority_themes: temas,
      answers: { v: 1, a: respostas },
      answer_count: respostas.length,
      completed: corpo.completo === true,
      is_counted: contabilizar,
      share_code: corpo.completo === true ? gerarCodigo() : null,
      consent_version: corpo.consentimento === true ? VERSAO_CONSENTIMENTO : null,
      consented_at: corpo.consentimento === true ? new Date().toISOString() : null,
    })
    .select("id, share_code")
    .single();

  if (error) {
    console.error("[/api/sessao] falha ao gravar:", error.message);
    return NextResponse.json({ erro: "Não foi possível salvar agora." }, { status: 500 });
  }

  await sb.from("submission_log").insert({ device_hash: deviceHash });

  return NextResponse.json({
    ok: true,
    gravado: true,
    contabilizada: contabilizar,
    codigoCompartilhamento: data?.share_code ?? null,
  });
}

/** Código curto para app.com.br/r/xxxxxx */
function gerarCodigo(): string {
  return randomBytes(4).toString("hex");
}
