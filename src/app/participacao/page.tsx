// =====================================================================
// Regra 5 — esta tela NUNCA faz COUNT(*) ao vivo.
//
// Ela lê a tabela stats_by_state, que tem no máximo 28 linhas e é
// recalculada pelo pg_cron a cada 5 minutos. O número pode estar alguns
// minutos atrasado: é um contador de participação, não um saldo bancário.
// =====================================================================

import { clientePublico } from "@/lib/supabase";
import type { ParticipacaoEstado } from "@/lib/tipos";

export const revalidate = 60;
export const metadata = { title: "Participação" };

export default async function PaginaParticipacao() {
  const sb = clientePublico();
  let linhas: ParticipacaoEstado[] = [];
  let conectado = false;

  if (sb) {
    const { data, error } = await sb
      .from("stats_by_state")
      .select("state, sessions_completed, answers_total")
      .order("sessions_completed", { ascending: false });
    if (!error && data) {
      linhas = data as ParticipacaoEstado[];
      conectado = true;
    }
  }

  const totalSessoes = linhas.reduce((s, l) => s + Number(l.sessions_completed ?? 0), 0);
  const totalRespostas = linhas.reduce((s, l) => s + Number(l.answers_total ?? 0), 0);

  return (
    <main className="container">
      <p className="rotulo">Participação</p>
      <h1>Quantas pessoas já responderam</h1>

      {!conectado && (
        <p className="aviso">
          <strong>Sem dados ainda.</strong> Esta tela lê a tabela <code>stats_by_state</code> da
          Supabase. Conecte o projeto no <code>.env.local</code> e agende a rotina{" "}
          <code>refresh_participation_stats()</code> no pg_cron.
        </p>
      )}

      {conectado && (
        <>
          <p className="deck">
            {totalSessoes.toLocaleString("pt-BR")} testes concluídos ·{" "}
            {totalRespostas.toLocaleString("pt-BR")} respostas registradas.
          </p>

          <div className="tabela-wrap" style={{ marginTop: 26 }}>
            <table>
              <thead>
                <tr>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Testes concluídos</th>
                  <th style={{ textAlign: "right" }}>Respostas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.state}>
                    <td>{l.state === "ZZ" ? "Não informado" : l.state}</td>
                    <td className="n">
                      {Number(l.sessions_completed).toLocaleString("pt-BR")}
                    </td>
                    <td className="n">{Number(l.answers_total).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Como estes números são apurados</h2>
      <p style={{ color: "var(--ink-2)" }}>
        Só entram na contagem os testes com pelo menos 10 respostas, concluídos e que passaram nas
        checagens de integridade. Isso evita que um script infle o número de um estado. Os valores
        são recalculados a cada poucos minutos, então podem estar ligeiramente atrasados.
      </p>
    </main>
  );
}
