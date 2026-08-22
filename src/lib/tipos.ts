// =====================================================================
// Tipos compartilhados entre servidor e cliente.
// =====================================================================

/** 1 = SIM · 0 = NÃO · 2 = NÃO SEI · 3 = QUERO ENTENDER */
export type Resposta = 0 | 1 | 2 | 3;

export const RESPOSTA_SIM: Resposta = 1;
export const RESPOSTA_NAO: Resposta = 0;
export const RESPOSTA_NAO_SEI: Resposta = 2;
export const RESPOSTA_ENTENDER: Resposta = 3;

export const ROTULO_RESPOSTA: Record<Resposta, string> = {
  1: "SIM",
  0: "NÃO",
  2: "NÃO SEI",
  3: "QUERO ENTENDER",
};

export interface Tema {
  id: number;
  slug: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
}

export interface Pergunta {
  id: number;
  codigo: string;
  tema_id: number;
  enunciado: string;
  explicacao: string | null;
  nivel: number; // 1 = entrada · 2 = aprofundamento
}

export interface Dependencia {
  pai: number;
  resposta: Resposta;
  filho: number;
}

export interface Conteudo {
  temas: Tema[];
  perguntas: Pergunta[];
  dependencias: Dependencia[];
}

/**
 * Regra 3 — formato compacto das respostas.
 * Um par [id_da_pergunta, resposta] por item: ~200 bytes por sessão
 * em vez dos ~2 KB de um objeto por resposta.
 */
export interface RespostasCompactas {
  v: 1;
  a: [number, Resposta][];
}

export interface EstadoQuiz {
  sessaoId: string;
  temasPrioritarios: number[];
  estado: string | null;
  respostas: Record<number, Resposta>;
  iniciadoEm: string;
  enviadoEm?: string;
}

export interface ParticipacaoEstado {
  state: string;
  sessions_completed: number;
  answers_total: number;
}

export const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
] as const;
