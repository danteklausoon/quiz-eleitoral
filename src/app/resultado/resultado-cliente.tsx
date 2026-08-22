"use client";

// =====================================================================
// Regra 7 — o resultado é calculado AQUI, no aparelho.
//
// Nenhuma consulta ao banco para montar esta tela. As respostas políticas
// da pessoa não precisam sair do dispositivo para ela ver o resultado —
// que é exatamente o que a LGPD pede para dado sensível.
//
// O envio ao servidor é opcional e explícito, no botão do fim da página.
// =====================================================================

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { compactar, lerEstado, limparEstado } from "@/lib/armazenamento";
import type { Conteudo, EstadoQuiz, Resposta } from "@/lib/tipos";

interface ResumoTema {
  id: number;
  nome: string;
  sim: number;
  nao: number;
  naoSei: number;
  total: number;
}

type StatusEnvio = "parado" | "enviando" | "ok" | "erro";

export default function ResultadoCliente({ conteudo }: { conteudo: Conteudo }) {
  const [estado, setEstado] = useState<EstadoQuiz | null>(null);
  const [envio, setEnvio] = useState<StatusEnvio>("parado");
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    setEstado(lerEstado());
  }, []);

  const resumo = useMemo<ResumoTema[]>(() => {
    if (!estado) return [];
    const porId = new Map(conteudo.perguntas.map((p) => [p.id, p]));
    const acc = new Map<number, ResumoTema>();

    for (const [idTexto, resposta] of Object.entries(estado.respostas)) {
      const pergunta = porId.get(Number(idTexto));
      if (!pergunta) continue;
      const tema = conteudo.temas.find((t) => t.id === pergunta.tema_id);
      if (!tema) continue;

      const atual =
        acc.get(tema.id) ??
        { id: tema.id, nome: tema.nome, sim: 0, nao: 0, naoSei: 0, total: 0 };

      const v = resposta as Resposta;
      if (v === 1) atual.sim++;
      else if (v === 0) atual.nao++;
      else atual.naoSei++;
      atual.total++;

      acc.set(tema.id, atual);
    }

    return [...acc.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  }, [estado, conteudo]);

  if (!estado) return <p style={{ color: "var(--ink-3)" }}>Carregando…</p>;

  const total = Object.keys(estado.respostas).length;

  if (total === 0) {
    return (
      <>
        <h1>Ainda não há respostas neste aparelho.</h1>
        <p className="deck">Responda algumas perguntas para ver o seu perfil de respostas.</p>
        <div className="acoes">
          <Link href="/quiz" className="botao">
            Começar o quiz
          </Link>
        </div>
      </>
    );
  }

  const enviar = async () => {
    setEnvio("enviando");
    setMensagem(null);
    try {
      const resposta = await fetch("/api/sessao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          respostas: compactar(estado.respostas).a,
          estado: estado.estado,
          temasPrioritarios: estado.temasPrioritarios,
          completo: true,
          consentimento: true,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setEnvio("erro");
        setMensagem(dados?.erro ?? "Não foi possível enviar agora.");
        return;
      }
      setEnvio("ok");
      setMensagem(
        dados.gravado
          ? "Suas respostas entraram na estatística de participação, sem qualquer identificação."
          : "Recebido — mas a Supabase ainda não está conectada, então nada foi gravado.",
      );
      setEstado({ ...estado, enviadoEm: new Date().toISOString() });
    } catch {
      setEnvio("erro");
      setMensagem("Sem conexão. Suas respostas continuam salvas no aparelho.");
    }
  };

  return (
    <>
      <p className="rotulo">Seu perfil de respostas</p>
      <h1>Você respondeu {total} perguntas.</h1>
      <p className="deck">
        Este resultado vem só das suas respostas. Sem rótulo de direita, esquerda, conservador ou
        progressista — e calculado aqui no seu aparelho.
      </p>

      <div style={{ marginTop: 32 }}>
        {resumo.map((t) => (
          <div key={t.id} className="barra-tema">
            <div className="barra-tema-topo">
              <b>{t.nome}</b>
              <span>
                {t.total} {t.total === 1 ? "resposta" : "respostas"}
              </span>
            </div>
            <div
              className="medidor"
              role="img"
              aria-label={`${t.nome}: ${t.sim} sim, ${t.nao} não, ${t.naoSei} não sei`}
            >
              <i className="s" style={{ width: `${(t.sim / t.total) * 100}%` }} />
              <i className="n" style={{ width: `${(t.nao / t.total) * 100}%` }} />
              <i className="d" style={{ width: `${(t.naoSei / t.total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="legenda">
        <span>
          <i style={{ background: "var(--sim)" }} />
          SIM
        </span>
        <span>
          <i style={{ background: "var(--nao)" }} />
          NÃO
        </span>
        <span>
          <i style={{ background: "var(--neutro)" }} />
          NÃO SEI
        </span>
      </div>

      <h2>Próximo passo: as candidaturas</h2>
      <p style={{ color: "var(--ink-2)" }}>
        A comparação com as candidaturas entra na Fase 2, quando o banco eleitoral estiver
        carregado com propostas e histórico legislativo — cada associação ligada ao documento
        oficial que a originou.
      </p>

      <h2>Ajudar na estatística é opcional</h2>
      <p style={{ color: "var(--ink-2)" }}>
        Nada foi enviado até aqui. Se quiser, você pode contribuir com o número de participação do
        seu estado. Enviamos apenas as respostas, o estado e a data — sem nome, sem e-mail, sem
        endereço de IP guardado.
      </p>

      <div className="acoes">
        <button
          type="button"
          className="botao"
          onClick={enviar}
          disabled={envio === "enviando" || envio === "ok"}
        >
          {envio === "enviando"
            ? "Enviando…"
            : envio === "ok"
              ? "Enviado"
              : "Contribuir com a estatística"}
        </button>
        <Link href="/quiz" className="botao secundario">
          Responder mais perguntas
        </Link>
        <button
          type="button"
          className="botao secundario"
          onClick={() => {
            limparEstado();
            setEstado(lerEstado());
          }}
        >
          Apagar minhas respostas
        </button>
      </div>

      {mensagem && (
        <p className="aviso" style={{ marginTop: 22 }}>
          {mensagem}
        </p>
      )}
    </>
  );
}
