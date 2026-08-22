import Link from "next/link";
import { carregarConteudo } from "@/lib/conteudo";

export const revalidate = 3600;

export default async function Home() {
  const { conteudo, origem } = await carregarConteudo();
  const entrada = conteudo.perguntas.filter((p) => p.nivel === 1).length;

  return (
    <main className="container">
      <h1>Descubra quais propostas combinam com as suas respostas.</h1>
      <p className="deck">
        {entrada} perguntas simples, cinco por vez, sobre {conteudo.temas.length} temas. Sem nome de
        candidato, sem nome de partido. Você pode pular qualquer uma e parar quando quiser.
      </p>

      <div className="acoes" style={{ marginTop: 28, marginBottom: 44 }}>
        <Link href="/quiz" className="botao">
          Começar
        </Link>
        <Link href="/participacao" className="botao secundario">
          Ver participação
        </Link>
      </div>

      {origem === "local" && (
        <p className="aviso">
          <strong>Modo local.</strong> O conteúdo está vindo do arquivo{" "}
          <code>src/data/conteudo-fallback.json</code> porque a Supabase ainda não foi conectada.
          Preencha o <code>.env.local</code> e o app passa a ler do banco automaticamente.
        </p>
      )}

      <h2>Os temas</h2>
      <div className="grade-temas">
        {conteudo.temas.map((t) => (
          <div key={t.id} className="tema-chip" style={{ cursor: "default" }}>
            {t.nome}
            <small>{conteudo.perguntas.filter((p) => p.tema_id === t.id).length} perguntas</small>
          </div>
        ))}
      </div>

      <h2>Como funciona</h2>
      <ol style={{ color: "var(--ink-2)", paddingLeft: "1.2em" }}>
        <li>
          Você responde <strong>SIM</strong>, <strong>NÃO</strong> ou <strong>NÃO SEI</strong> —
          e pode pedir para entender o assunto antes de decidir.
        </li>
        <li>
          Tudo fica salvo no seu aparelho enquanto você responde. Funciona sem internet e nada é
          enviado automaticamente.
        </li>
        <li>
          No fim, o resultado é montado a partir das <em>suas</em> respostas — sem rótulo de
          direita, esquerda, conservador ou progressista.
        </li>
        <li>
          Cada associação entre uma resposta e uma proposta é rastreável até o documento oficial
          de origem.
        </li>
      </ol>
    </main>
  );
}
