"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { gravarEstado, lerEstado } from "@/lib/armazenamento";
import {
  ROTULO_RESPOSTA,
  UFS,
  type Conteudo,
  type EstadoQuiz,
  type Resposta,
} from "@/lib/tipos";

const OPCOES: Resposta[] = [1, 0, 2];
const TAMANHO_BLOCO = 5;
const MAX_PRIORIDADES = 5;

type Fase = "prioridades" | "perguntas" | "pausa";

export default function QuizCliente({ conteudo }: { conteudo: Conteudo }) {
  const router = useRouter();

  const [pronto, setPronto] = useState(false);
  const [estado, setEstado] = useState<EstadoQuiz | null>(null);
  const [fase, setFase] = useState<Fase>("prioridades");
  const [fila, setFila] = useState<number[]>([]);
  const [indice, setIndice] = useState(0);
  const [inicioBloco, setInicioBloco] = useState(0);
  const [explicando, setExplicando] = useState(false);

  const porId = useMemo(
    () => new Map(conteudo.perguntas.map((p) => [p.id, p])),
    [conteudo.perguntas],
  );
  const temaPorId = useMemo(
    () => new Map(conteudo.temas.map((t) => [t.id, t])),
    [conteudo.temas],
  );

  // Recupera o rascunho do aparelho (Regra 2: o quiz vive no localStorage)
  useEffect(() => {
    const salvo = lerEstado();
    setEstado(salvo);
    if (Object.keys(salvo.respostas).length > 0) {
      setFase("perguntas");
      setFila(montarFila(conteudo, salvo.temasPrioritarios, salvo.respostas));
    }
    setPronto(true);
  }, [conteudo]);

  useEffect(() => {
    if (estado) gravarEstado(estado);
  }, [estado]);

  if (!pronto || !estado) {
    return <p style={{ color: "var(--ink-3)" }}>Carregando…</p>;
  }

  const respondidas = Object.keys(estado.respostas).length;

  // ------------------------------------------------------------------
  // Fase 1 — prioridades e estado
  // ------------------------------------------------------------------
  if (fase === "prioridades") {
    const alternarTema = (id: number) => {
      setEstado((e) => {
        if (!e) return e;
        const jaTem = e.temasPrioritarios.includes(id);
        const novos = jaTem
          ? e.temasPrioritarios.filter((t) => t !== id)
          : e.temasPrioritarios.length < MAX_PRIORIDADES
            ? [...e.temasPrioritarios, id]
            : e.temasPrioritarios;
        return { ...e, temasPrioritarios: novos };
      });
    };

    return (
      <>
        <h1>O que é mais importante para você?</h1>
        <p className="deck">
          Escolha até {MAX_PRIORIDADES} temas — eles vêm primeiro no seu quiz. Você também pode
          pular esta etapa e responder tudo na ordem.
        </p>

        <div className="grade-temas" style={{ marginTop: 26 }}>
          {conteudo.temas.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tema-chip"
              aria-pressed={estado.temasPrioritarios.includes(t.id)}
              onClick={() => alternarTema(t.id)}
            >
              {t.nome}
              <small>{t.descricao ?? ""}</small>
            </button>
          ))}
        </div>

        <h2>Em qual estado você vota?</h2>
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>
          Serve só para compor o número de participação por estado. Não pedimos localização.
        </p>
        <select
          value={estado.estado ?? ""}
          onChange={(ev) =>
            setEstado((e) => (e ? { ...e, estado: ev.target.value || null } : e))
          }
          style={{
            padding: "11px 12px",
            border: "1px solid var(--rule)",
            borderRadius: "var(--raio)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontSize: 15,
            fontFamily: "inherit",
            minWidth: 220,
          }}
        >
          <option value="">Prefiro não informar</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>

        <div className="acoes">
          <button
            type="button"
            className="botao"
            onClick={() => {
              setFila(montarFila(conteudo, estado.temasPrioritarios, estado.respostas));
              setIndice(0);
              setInicioBloco(0);
              setFase("perguntas");
            }}
          >
            Começar o quiz
          </button>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------
  // Fase 3 — pausa a cada 5 perguntas
  // ------------------------------------------------------------------
  if (fase === "pausa") {
    const idAtual = fila[indice];
    const temaAtual = idAtual ? porId.get(idAtual)?.tema_id : undefined;
    const nomeTema = temaAtual ? temaPorId.get(temaAtual)?.nome : null;
    const acabou = indice >= fila.length;

    return (
      <>
        <h1>Você respondeu {respondidas} perguntas.</h1>
        {!acabou && nomeTema && (
          <p className="deck">A próxima rodada continua em {nomeTema}.</p>
        )}
        <div className="acoes">
          {!acabou && (
            <button
              type="button"
              className="botao"
              onClick={() => {
                setInicioBloco(indice);
                setFase("perguntas");
              }}
            >
              Responder mais {TAMANHO_BLOCO}
            </button>
          )}
          {!acabou && temaAtual !== undefined && (
            <button
              type="button"
              className="botao secundario"
              onClick={() => {
                const proximo = pularTema(fila, porId, indice, temaAtual);
                setIndice(proximo);
                setInicioBloco(proximo);
                setFase(proximo >= fila.length ? "pausa" : "perguntas");
              }}
            >
              Próximo tema →
            </button>
          )}
          <button
            type="button"
            className="botao secundario"
            onClick={() => router.push("/resultado")}
          >
            Ver meu resultado
          </button>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------
  // Fase 2 — perguntas
  // ------------------------------------------------------------------
  const idAtual = fila[indice];
  const pergunta = idAtual ? porId.get(idAtual) : undefined;

  if (!pergunta) {
    return (
      <>
        <h1>Você respondeu tudo por aqui.</h1>
        <p className="deck">São {respondidas} respostas registradas neste aparelho.</p>
        <div className="acoes">
          <button type="button" className="botao" onClick={() => router.push("/resultado")}>
            Ver meu resultado
          </button>
        </div>
      </>
    );
  }

  const tema = temaPorId.get(pergunta.tema_id);
  const noBloco = indice - inicioBloco;

  const responder = (valor: Resposta) => {
    const novasRespostas = { ...estado.respostas, [pergunta.id]: valor };
    setEstado({ ...estado, respostas: novasRespostas });
    setExplicando(false);

    // Perguntas adaptativas: o aprofundamento entra logo depois da entrada
    const filho = conteudo.dependencias.find(
      (d) => d.pai === pergunta.id && d.resposta === valor,
    );
    let novaFila = fila;
    if (filho && !fila.includes(filho.filho) && porId.has(filho.filho)) {
      novaFila = [...fila.slice(0, indice + 1), filho.filho, ...fila.slice(indice + 1)];
      setFila(novaFila);
    }

    const proximo = indice + 1;
    setIndice(proximo);
    if (proximo - inicioBloco >= TAMANHO_BLOCO || proximo >= novaFila.length) {
      setFase("pausa");
    }
  };

  return (
    <>
      <div className="barra-progresso" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (indice / Math.max(fila.length, 1)) * 100)}%` }} />
      </div>

      <div className="cartao">
        <div className="pergunta-tema">{tema?.nome ?? "Pergunta"}</div>
        <div className="pergunta-contador">
          Pergunta {noBloco + 1} de {TAMANHO_BLOCO} nesta rodada · {respondidas} respondidas no total
          {pergunta.nivel > 1 && " · aprofundamento"}
        </div>

        <p className="pergunta-enunciado">{pergunta.enunciado}</p>

        <div className="opcoes">
          {OPCOES.map((v) => (
            <button
              key={v}
              type="button"
              className="opcao"
              data-v={v}
              aria-pressed={estado.respostas[pergunta.id] === v}
              onClick={() => responder(v)}
            >
              <span className="marcador" aria-hidden="true" />
              {ROTULO_RESPOSTA[v]}
            </button>
          ))}
        </div>

        {pergunta.explicacao && !explicando && (
          <button type="button" className="link-explicar" onClick={() => setExplicando(true)}>
            Quero entender esta pergunta
          </button>
        )}

        {explicando && pergunta.explicacao && (
          <div className="explicacao">
            <strong>Por que estamos perguntando isso?</strong>
            {pergunta.explicacao}
          </div>
        )}
      </div>

      <div className="acoes">
        <button
          type="button"
          className="botao secundario"
          onClick={() => {
            const proximo = indice + 1;
            setIndice(proximo);
            setExplicando(false);
            if (proximo - inicioBloco >= TAMANHO_BLOCO || proximo >= fila.length) {
              setFase("pausa");
            }
          }}
        >
          Pular esta pergunta
        </button>
        <button
          type="button"
          className="botao secundario"
          onClick={() => router.push("/resultado")}
        >
          Parar e ver o resultado
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// Monta a ordem das perguntas: temas prioritários primeiro,
// e dentro de cada tema as perguntas de entrada (nível 1).
// ---------------------------------------------------------------------
function montarFila(
  conteudo: Conteudo,
  prioridades: number[],
  respostas: Record<number, Resposta>,
): number[] {
  const peso = (temaId: number) => {
    const i = prioridades.indexOf(temaId);
    return i === -1 ? 100 + temaId : i;
  };

  return conteudo.perguntas
    .filter((p) => p.nivel === 1 && respostas[p.id] === undefined)
    .sort((a, b) => peso(a.tema_id) - peso(b.tema_id) || a.id - b.id)
    .map((p) => p.id);
}

function pularTema(
  fila: number[],
  porId: Map<number, { tema_id: number }>,
  indice: number,
  temaAtual: number,
): number {
  let i = indice;
  while (i < fila.length && porId.get(fila[i])?.tema_id === temaAtual) i++;
  return i;
}
