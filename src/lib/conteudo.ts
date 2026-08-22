// =====================================================================
// Carrega o conteúdo público (temas, perguntas, dependências).
//
// Enquanto a Supabase não estiver configurada, lê do JSON local — assim
// `npm run dev` funciona no primeiro minuto, antes de qualquer conta criada.
// Depois de configurar o .env.local, passa a ler do banco automaticamente.
// =====================================================================

import type { Conteudo, Dependencia, Pergunta, Tema } from "./tipos";
import { clientePublico } from "./supabase";
import fallback from "@/data/conteudo-fallback.json";

/** Revalida a cada hora. Na prática quem responde é o cache de borda (Regra 1). */
export const revalidate = 3600;

export async function carregarConteudo(): Promise<{
  conteudo: Conteudo;
  origem: "supabase" | "local";
}> {
  const sb = clientePublico();

  if (sb) {
    const [temas, perguntas, deps] = await Promise.all([
      sb.from("themes").select("id,slug,name,description,icon").order("sort_order"),
      sb
        .from("questions")
        .select("id,code,theme_id,statement,explanation,depth_level")
        .order("id"),
      sb
        .from("question_dependencies")
        .select("parent_question_id,required_answer,child_question_id"),
    ]);

    if (!temas.error && !perguntas.error && temas.data?.length) {
      return {
        origem: "supabase",
        conteudo: {
          temas: temas.data.map(
            (t): Tema => ({
              id: t.id,
              slug: t.slug,
              nome: t.name,
              descricao: t.description,
              icone: t.icon,
            }),
          ),
          perguntas: (perguntas.data ?? []).map(
            (q): Pergunta => ({
              id: q.id,
              codigo: q.code,
              tema_id: q.theme_id,
              enunciado: q.statement,
              explicacao: q.explanation,
              nivel: q.depth_level,
            }),
          ),
          dependencias: (deps.data ?? []).map(
            (d): Dependencia => ({
              pai: d.parent_question_id,
              resposta: d.required_answer,
              filho: d.child_question_id,
            }),
          ),
        },
      };
    }
  }

  return { origem: "local", conteudo: fallback as unknown as Conteudo };
}
