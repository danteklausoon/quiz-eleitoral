// =====================================================================
// Leitor de CSV no formato do TSE:
//   separador ";", aspas duplas, codificação ISO-8859-1 (latin1).
// =====================================================================

/** Divide uma linha respeitando aspas. */
function dividirLinha(linha, sep) {
  const campos = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; }
        else dentroDeAspas = false;
      } else atual += c;
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === sep) {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  return campos;
}

/**
 * Analisa um CSV do TSE.
 * @returns {{ cabecalho: string[], linhas: string[][] }}
 */
export function lerCsvTse(buffer, { separador = ";", codificacao = "latin1" } = {}) {
  const texto = buffer.toString(codificacao).replace(/^﻿/, "");
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) return { cabecalho: [], linhas: [] };

  const cabecalho = dividirLinha(linhas[0], separador).map((c) => c.trim().toUpperCase());
  const dados = [];
  for (let i = 1; i < linhas.length; i++) {
    dados.push(dividirLinha(linhas[i], separador));
  }
  return { cabecalho, linhas: dados };
}

/** Cria um acessor por nome de coluna, com erro claro se faltar alguma. */
export function acessor(cabecalho, obrigatorias = []) {
  const indice = new Map(cabecalho.map((c, i) => [c, i]));
  const faltando = obrigatorias.filter((c) => !indice.has(c));
  if (faltando.length) {
    throw new Error(
      `Colunas ausentes no CSV: ${faltando.join(", ")}\n` +
        `Colunas encontradas: ${cabecalho.join(", ")}`,
    );
  }
  return (linha, coluna) => {
    const i = indice.get(coluna);
    if (i === undefined) return null;
    const v = (linha[i] ?? "").trim();
    return v === "" || v === "#NULO#" || v === "#NULO" || v === "-1" ? null : v;
  };
}
