#!/usr/bin/env node
// =====================================================================
// npm run importar:tse
//
// Carrega partidos e candidaturas a partir da base oficial de dados
// abertos do TSE (consulta_cand_2026).
//
// A fonte é sempre o arquivo do TSE. Nada aqui é inferido nem inventado:
// cada candidato entra com o SQ_CANDIDATO oficial como chave, e o
// registration_status vem do campo de deferimento do próprio TSE.
//
// Opções:
//   --arquivo <caminho>   usa um .zip ou .csv já baixado, em vez de baixar
//   --uf SP,RJ            importa só estas UFs (padrão: todas)
//   --limite 500          importa no máximo N candidatos (útil para testar)
//   --validar             lê e mostra o resumo, sem escrever no banco
// =====================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { exigirCredenciais, cores } from "./env.mjs";
import { listarZip, extrairZip } from "./lib/zip.mjs";
import { lerCsvTse, acessor } from "./lib/csv.mjs";

const { ok, erro, aviso, fraco, forte } = cores;

const URL_TSE =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip";
const ELEICAO = 2026;

const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const arquivoLocal = opcao("--arquivo");
const ufsFiltro = opcao("--uf")?.split(",").map((u) => u.trim().toUpperCase());
const limite = opcao("--limite") ? Number(opcao("--limite")) : null;
const soValidar = args.includes("--validar");

// Só importamos os cargos que o quiz compara. Vice e suplente ficam de fora.
const CARGOS = {
  1: "presidente",
  3: "governador",
  5: "senador",
  6: "deputado_federal",
  7: "deputado_estadual",
  8: "deputado_distrital",
};

// Situação do registro, direto do campo do TSE
function situacao(detalhe) {
  const d = (detalhe ?? "").toUpperCase();
  if (d.startsWith("DEFERIDO")) return "approved";
  if (d.startsWith("INDEFERIDO") || d.includes("CANCELAD") || d.includes("IMPUGNAD")) return "rejected";
  if (d.includes("RENÚNCIA") || d.includes("RENUNCIA") || d.includes("FALECID")) return "withdrawn";
  return "pending";
}

const COLUNAS = [
  "SQ_CANDIDATO", "NM_CANDIDATO", "NM_URNA_CANDIDATO",
  "CD_CARGO", "SG_UF", "NR_PARTIDO", "SG_PARTIDO", "NM_PARTIDO",
];

// ---------------------------------------------------------------------
// 1. Obter o arquivo
// ---------------------------------------------------------------------
async function obterArquivo() {
  if (arquivoLocal) {
    const caminho = resolve(process.cwd(), arquivoLocal);
    if (!existsSync(caminho)) {
      console.error(erro(`✖ Arquivo não encontrado: ${caminho}`));
      process.exit(1);
    }
    console.log(fraco(`  usando arquivo local: ${basename(caminho)}`));
    return { buffer: readFileSync(caminho), nome: basename(caminho) };
  }

  const cache = resolve(process.cwd(), ".cache-tse");
  const destino = resolve(cache, "consulta_cand_2026.zip");
  if (existsSync(destino)) {
    console.log(fraco(`  usando cópia em cache: .cache-tse/consulta_cand_2026.zip`));
    console.log(fraco(`  (apague a pasta .cache-tse para baixar de novo)`));
    return { buffer: readFileSync(destino), nome: "consulta_cand_2026.zip" };
  }

  console.log(`  baixando de ${fraco(URL_TSE)}`);
  const resposta = await fetch(URL_TSE);
  if (!resposta.ok) {
    console.error(erro(`✖ O TSE respondeu ${resposta.status}.`));
    console.error(
      fraco(
        "  Baixe o arquivo manualmente em dadosabertos.tse.jus.br/dataset/candidatos-2026\n" +
          "  e rode: npm run importar:tse -- --arquivo caminho/consulta_cand_2026.zip",
      ),
    );
    process.exit(1);
  }
  const buffer = Buffer.from(await resposta.arrayBuffer());
  mkdirSync(cache, { recursive: true });
  writeFileSync(destino, buffer);
  console.log(fraco(`  ${(buffer.length / 1_048_576).toFixed(1)} MB salvos em .cache-tse/`));
  return { buffer, nome: "consulta_cand_2026.zip" };
}

// ---------------------------------------------------------------------
// 2. Extrair os CSVs
// ---------------------------------------------------------------------
function extrairCsvs({ buffer, nome }) {
  if (nome.toLowerCase().endsWith(".csv")) {
    return [{ nome, conteudo: buffer }];
  }
  const entradas = listarZip(buffer).filter((e) => e.nome.toLowerCase().endsWith(".csv"));
  if (entradas.length === 0) {
    console.error(erro("✖ Nenhum CSV encontrado dentro do ZIP."));
    process.exit(1);
  }
  const escolhidas = ufsFiltro
    ? entradas.filter((e) => ufsFiltro.some((uf) => e.nome.toUpperCase().includes(`_${uf}.CSV`)))
    : entradas;

  if (escolhidas.length === 0) {
    console.error(erro(`✖ Nenhum CSV para as UFs ${ufsFiltro.join(", ")}.`));
    console.error(fraco(`  Arquivos no ZIP: ${entradas.map((e) => e.nome).join(", ")}`));
    process.exit(1);
  }
  console.log(fraco(`  ${escolhidas.length} arquivo(s) CSV no pacote`));
  return escolhidas.map((e) => ({ nome: e.nome, conteudo: extrairZip(buffer, e) }));
}

// ---------------------------------------------------------------------
// 3. Ler e mapear
// ---------------------------------------------------------------------
function processar(csvs) {
  const partidos = new Map();
  const candidatos = new Map();
  const porCargo = new Map();
  let ignorados = 0;

  for (const csv of csvs) {
    const { cabecalho, linhas } = lerCsvTse(csv.conteudo);
    if (linhas.length === 0) continue;

    let campo;
    try {
      campo = acessor(cabecalho, COLUNAS);
    } catch (e) {
      console.error(erro(`✖ ${csv.nome}: ${e.message}`));
      process.exit(1);
    }

    for (const linha of linhas) {
      const codCargo = Number(campo(linha, "CD_CARGO"));
      const cargo = CARGOS[codCargo];
      if (!cargo) { ignorados++; continue; }

      const sq = campo(linha, "SQ_CANDIDATO");
      if (!sq || candidatos.has(sq)) continue;

      const numeroPartido = Number(campo(linha, "NR_PARTIDO"));
      const siglaPartido = campo(linha, "SG_PARTIDO");
      if (Number.isInteger(numeroPartido) && siglaPartido && !partidos.has(numeroPartido)) {
        partidos.set(numeroPartido, {
          id: numeroPartido,
          tse_number: numeroPartido,
          acronym: siglaPartido,
          name: campo(linha, "NM_PARTIDO") ?? siglaPartido,
        });
      }

      const uf = campo(linha, "SG_UF");
      candidatos.set(sq, {
        election_id: ELEICAO,
        tse_id: sq,
        legal_name: campo(linha, "NM_CANDIDATO") ?? "",
        ballot_name: campo(linha, "NM_URNA_CANDIDATO") ?? campo(linha, "NM_CANDIDATO") ?? "",
        office: cargo,
        state: cargo === "presidente" || uf === "BR" ? null : uf,
        party_id: Number.isInteger(numeroPartido) ? numeroPartido : null,
        registration_status: situacao(
          campo(linha, "DS_DETALHE_SITUACAO_CAND") ?? campo(linha, "DS_SITUACAO_CANDIDATURA"),
        ),
      });

      porCargo.set(cargo, (porCargo.get(cargo) ?? 0) + 1);
      if (limite && candidatos.size >= limite) break;
    }
    if (limite && candidatos.size >= limite) break;
  }

  return {
    partidos: [...partidos.values()].sort((a, b) => a.id - b.id),
    candidatos: [...candidatos.values()],
    porCargo,
    ignorados,
  };
}

// ---------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------
console.log(forte("\nImportação de candidaturas — TSE 2026"));

const arquivo = await obterArquivo();
const csvs = extrairCsvs(arquivo);
const { partidos, candidatos, porCargo, ignorados } = processar(csvs);

console.log(forte("\nLido"));
console.log(`  ${partidos.length} partidos`);
console.log(`  ${candidatos.length} candidaturas`);
for (const [cargo, n] of [...porCargo].sort((a, b) => b[1] - a[1])) {
  console.log(fraco(`    ${cargo.padEnd(20)} ${n}`));
}
const deferidos = candidatos.filter((c) => c.registration_status === "approved").length;
console.log(
  `  ${deferidos} deferidas ` +
    fraco(`(só estas aparecem no site — é o que a política de RLS permite)`),
);
if (ignorados) console.log(fraco(`  ${ignorados} linhas ignoradas (vice e suplente)`));

if (candidatos.length === 0) {
  console.log(aviso("\nNada para importar."));
  process.exit(0);
}

if (soValidar) {
  console.log(fraco("\nModo --validar: nada foi escrito no banco.\n"));
  process.exit(0);
}

const { url, chave } = exigirCredenciais();
const sb = createClient(url, chave, { auth: { persistSession: false } });

async function enviarEmLotes(tabela, linhas, conflito, tamanho = 500) {
  process.stdout.write(`  ${tabela}… `);
  for (let i = 0; i < linhas.length; i += tamanho) {
    const { error } = await sb
      .from(tabela)
      .upsert(linhas.slice(i, i + tamanho), { onConflict: conflito });
    if (error) {
      console.log(erro("falhou"));
      console.error(erro(`\n✖ ${error.message}`));
      if (error.details) console.error(fraco(`  ${error.details}`));
      process.exit(1);
    }
    process.stdout.write(fraco("."));
  }
  console.log(ok(` ok (${linhas.length})`));
}

console.log(forte("\nEnviando para a Supabase"));
await enviarEmLotes("parties", partidos, "id");
await enviarEmLotes("candidates", candidatos, "election_id,tse_id");

console.log(ok("\n✓ Pronto."));
console.log(
  fraco(
    "  Próximo passo: carregar os planos de governo (PDF) e extrair as propostas,\n" +
      "  que viram claims com fonte e página — nunca texto gerado sem documento.\n",
  ),
);
