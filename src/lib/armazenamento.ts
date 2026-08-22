"use client";

// =====================================================================
// Regra 2 — o quiz roda inteiro no dispositivo.
//
// Nada vai ao servidor enquanto a pessoa responde: sem spinner entre
// perguntas, funciona offline, e o banco recebe UMA escrita por sessão
// em vez de uma por resposta.
// =====================================================================

import type { EstadoQuiz, Resposta, RespostasCompactas } from "./tipos";

const CHAVE = "quiz-eleitoral:v1";

function novoEstado(): EstadoQuiz {
  return {
    sessaoId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Math.random()).slice(2),
    temasPrioritarios: [],
    estado: null,
    respostas: {},
    iniciadoEm: new Date().toISOString(),
  };
}

export function lerEstado(): EstadoQuiz {
  if (typeof window === "undefined") return novoEstado();
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return novoEstado();
    const dados = JSON.parse(bruto) as EstadoQuiz;
    if (!dados.sessaoId || typeof dados.respostas !== "object") return novoEstado();
    return dados;
  } catch {
    return novoEstado();
  }
}

export function gravarEstado(estado: EstadoQuiz): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    // Modo privado ou armazenamento cheio: o quiz continua funcionando
    // em memória, só não sobrevive a um recarregamento da página.
  }
}

export function limparEstado(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    /* sem ação */
  }
}

/** Regra 3 — converte para o formato compacto antes de enviar. */
export function compactar(respostas: Record<number, Resposta>): RespostasCompactas {
  return {
    v: 1,
    a: Object.entries(respostas)
      .map(([id, r]) => [Number(id), r] as [number, Resposta])
      .sort((x, y) => x[0] - y[0]),
  };
}
