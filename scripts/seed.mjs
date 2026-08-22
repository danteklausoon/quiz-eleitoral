#!/usr/bin/env node
// =====================================================================
// npm run seed
//
// Lê os arquivos de content/, valida, e envia para a Supabase.
// Idempotente: pode rodar quantas vezes quiser. Perguntas são
// identificadas pelo `codigo`, então rodar de novo atualiza em vez
// de duplicar.
//
// Opções:
//   --validar          só valida, não escreve nada no banco
//   --revisor "Nome"   quem assina a revisão de neutralidade
// =====================================================================

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { exigirCredenciais, cores } from "./env.mjs";

const { ok, erro, aviso, fraco, forte } = cores;

const args = process.argv.slice(2);
const soValidar = args.includes("--validar");
// --local: regenera só o arquivo de fallback, sem tocar na Supabase.
// Os ids gerados são provisórios e valem apenas para o modo local;
// o `npm run seed` os substitui pelos ids reais do banco.
const soLocal = args.includes("--local");
const revisorPadrao =
  args[args.indexOf("--revisor") + 1] && args.includes("--revisor")
    ? args[args.indexOf("--revisor") + 1]
    : "equipe-editorial";

const RAIZ = process.cwd();
const DIR_CONTENT = resolve(RAIZ, "content");
const ELEICAO = { id: 2026, nome: "Eleições Gerais 2026", turno: 1, data: "2026-10-04" };

// Acrônimos de partido: nenhum pode aparecer no enunciado de uma pergunta.
const SIGLAS_PARTIDO =
  /\b(PT|PL|PSDB|MDB|PP|PDT|PSB|PSOL|PCdoB|PSD|PV|PRTB|PSTU|PCO|PRD|PMB|REDE|NOVO|DEM|PSC|PTB)\b/;

// ---------------------------------------------------------------------
// 1. Leitura
// ---------------------------------------------------------------------
function lerJson(caminho) {
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch (e) {
    console.error(erro(`✖ Não consegui ler ${caminho}`));
    console.error(fraco(`  ${e.message}`));
    process.exit(1);
  }
}

const temasArquivo = lerJson(join(DIR_CONTENT, "temas.json"));
const depsArquivo = lerJson(join(DIR_CONTENT, "dependencias.json"));

const arquivosPerguntas = readdirSync(join(DIR_CONTENT, "perguntas"))
  .filter((f) => f.endsWith(".json"))
  .sort();

const perguntas = [];
for (const arquivo of arquivosPerguntas) {
  const lista = lerJson(join(DIR_CONTENT, "perguntas", arquivo));
  if (!Array.isArray(lista)) {
    console.error(erro(`✖ ${arquivo} precisa conter uma lista de perguntas.`));
    process.exit(1);
  }
  for (const p of lista) perguntas.push({ ...p, _arquivo: arquivo });
}

const temas = temasArquivo.temas;
const subtemas = temasArquivo.subtemas;
const dependencias = depsArquivo.dependencias;

// ---------------------------------------------------------------------
// 2. Validação — falha antes de tocar no banco
// ---------------------------------------------------------------------
const problemas = [];
const alertas = [];

const slugsTema = new Set(temas.map((t) => t.slug));
const chavesSubtema = new Set(subtemas.map((s) => `${s.tema}/${s.slug}`));
const codigos = new Set();

for (const t of temas) {
  if (!Number.isInteger(t.id) || t.id < 1) problemas.push(`tema ${t.slug}: id inválido`);
}
for (const s of subtemas) {
  if (!slugsTema.has(s.tema)) problemas.push(`subtema ${s.slug}: tema "${s.tema}" não existe`);
}

for (const p of perguntas) {
  const onde = `${p._arquivo} › ${p.codigo ?? "(sem código)"}`;

  if (!p.codigo || !/^[A-Z]{3}-\d{3}$/.test(p.codigo)) {
    problemas.push(`${onde}: código deve seguir o padrão ABC-001`);
    continue;
  }
  if (codigos.has(p.codigo)) problemas.push(`${onde}: código repetido`);
  codigos.add(p.codigo);

  if (!slugsTema.has(p.tema)) problemas.push(`${onde}: tema "${p.tema}" não existe`);
  if (p.subtema && !chavesSubtema.has(`${p.tema}/${p.subtema}`)) {
    problemas.push(`${onde}: subtema "${p.subtema}" não existe no tema ${p.tema}`);
  }
  if (![1, 2, 3].includes(p.nivel)) problemas.push(`${onde}: nivel deve ser 1, 2 ou 3`);

  if (!p.enunciado || p.enunciado.length < 15) problemas.push(`${onde}: enunciado muito curto`);
  if (p.enunciado && !p.enunciado.trim().endsWith("?")) {
    alertas.push(`${onde}: enunciado não termina com "?"`);
  }
  if (p.enunciado && p.enunciado.length > 160) {
    alertas.push(`${onde}: enunciado com ${p.enunciado.length} caracteres — o ideal é abaixo de 160`);
  }
  if (!p.explicacao) alertas.push(`${onde}: sem explicação ("por que perguntamos isso?")`);

  // REGRA DE NEUTRALIDADE — bloqueia o seed, não é só aviso
  if (p.enunciado && SIGLAS_PARTIDO.test(p.enunciado)) {
    problemas.push(`${onde}: enunciado cita sigla de partido — viola a regra de neutralidade`);
  }
}

const nivel1PorTema = new Map();
for (const p of perguntas) {
  if (p.nivel === 1) nivel1PorTema.set(p.tema, (nivel1PorTema.get(p.tema) ?? 0) + 1);
}
for (const t of temas) {
  const n = nivel1PorTema.get(t.slug) ?? 0;
  if (n < 3) alertas.push(`tema ${t.slug}: só ${n} pergunta(s) de entrada`);
}

for (const d of dependencias) {
  if (!codigos.has(d.pai)) problemas.push(`dependência: pergunta pai "${d.pai}" não existe`);
  if (!codigos.has(d.filho)) problemas.push(`dependência: pergunta filho "${d.filho}" não existe`);
  if (![0, 1, 2, 3].includes(d.resposta)) problemas.push(`dependência ${d.pai}: resposta inválida`);
}

console.log(forte("\nConteúdo lido"));
console.log(`  ${temas.length} temas · ${subtemas.length} subtemas`);
console.log(
  `  ${perguntas.length} perguntas ` +
    fraco(
      `(${perguntas.filter((p) => p.nivel === 1).length} de entrada, ` +
        `${perguntas.filter((p) => p.nivel > 1).length} de aprofundamento)`,
    ),
);
console.log(`  ${dependencias.length} encadeamentos adaptativos`);

if (alertas.length) {
  console.log(aviso(`\n${alertas.length} alerta(s):`));
  for (const a of alertas.slice(0, 15)) console.log(aviso(`  · ${a}`));
  if (alertas.length > 15) console.log(fraco(`  … e mais ${alertas.length - 15}`));
}

if (problemas.length) {
  console.log(erro(`\n✖ ${problemas.length} erro(s) — nada foi enviado ao banco:`));
  for (const p of problemas) console.log(erro(`  · ${p}`));
  process.exit(1);
}

console.log(ok("\n✓ Validação passou."));

if (soValidar) {
  console.log(fraco("Modo --validar: nada foi escrito no banco.\n"));
  process.exit(0);
}

// ---------------------------------------------------------------------
// Escreve o arquivo que o app usa quando não há banco conectado.
// ---------------------------------------------------------------------
function gravarFallback(idPorCodigo, idTema) {
  const fallback = {
    _leia_me:
      "Gerado por `npm run seed`. Usado só quando a Supabase não está configurada. Não edite à mão.",
    temas: temas.map((t) => ({
      id: t.id,
      slug: t.slug,
      nome: t.nome,
      descricao: t.descricao ?? null,
      icone: t.icone ?? null,
    })),
    perguntas: perguntas
      .map((p) => ({
        id: idPorCodigo.get(p.codigo),
        codigo: p.codigo,
        tema_id: idTema.get(p.tema),
        enunciado: p.enunciado,
        explicacao: p.explicacao ?? null,
        nivel: p.nivel,
      }))
      .filter((p) => p.id != null)
      .sort((a, b) => a.id - b.id),
    dependencias: dependencias
      .map((d) => ({
        pai: idPorCodigo.get(d.pai),
        resposta: d.resposta,
        filho: idPorCodigo.get(d.filho),
      }))
      .filter((d) => d.pai != null && d.filho != null),
  };

  writeFileSync(
    resolve(RAIZ, "src/data/conteudo-fallback.json"),
    JSON.stringify(fallback, null, 1) + "\n",
  );
}

const mapaTema = new Map(temas.map((t) => [t.slug, t.id]));

if (soLocal) {
  // Ids provisórios, na ordem dos arquivos.
  const provisorios = new Map(perguntas.map((p, i) => [p.codigo, i + 1]));
  gravarFallback(provisorios, mapaTema);
  console.log(ok("✓ src/data/conteudo-fallback.json regenerado (modo local)."));
  console.log(
    fraco(
      "  Os ids aqui são provisórios e servem só para rodar sem banco.\n" +
        "  Depois de conectar a Supabase, rode `npm run seed` para gravar os ids reais.\n",
    ),
  );
  process.exit(0);
}

// ---------------------------------------------------------------------
// 3. Envio para a Supabase
// ---------------------------------------------------------------------
const { url, chave } = exigirCredenciais();
const sb = createClient(url, chave, { auth: { persistSession: false } });

const idTema = mapaTema;
const idSubtema = new Map(subtemas.map((s) => [`${s.tema}/${s.slug}`, s.id]));

async function passo(rotulo, fn) {
  process.stdout.write(`  ${rotulo}… `);
  const { error, count } = await fn();
  if (error) {
    console.log(erro("falhou"));
    console.error(erro(`\n✖ ${error.message}`));
    if (error.hint) console.error(fraco(`  dica: ${error.hint}`));
    process.exit(1);
  }
  console.log(ok(`ok${count != null ? ` (${count})` : ""}`));
}

console.log(forte("\nEnviando para a Supabase"));

await passo("eleição", () =>
  sb.from("elections").upsert(
    { id: ELEICAO.id, name: ELEICAO.nome, round: ELEICAO.turno, voting_date: ELEICAO.data, is_active: true },
    { onConflict: "id" },
  ),
);

await passo("temas", () =>
  sb.from("themes").upsert(
    temas.map((t, i) => ({
      id: t.id,
      slug: t.slug,
      name: t.nome,
      description: t.descricao ?? null,
      icon: t.icone ?? null,
      sort_order: i + 1,
      is_published: true,
    })),
    { onConflict: "id", count: "exact" },
  ),
);

await passo("subtemas", () =>
  sb.from("subthemes").upsert(
    subtemas.map((s) => ({
      id: s.id,
      theme_id: idTema.get(s.tema),
      slug: s.slug,
      name: s.nome,
    })),
    { onConflict: "id", count: "exact" },
  ),
);

const agora = new Date().toISOString();
await passo("perguntas", () =>
  sb.from("questions").upsert(
    perguntas.map((p) => ({
      code: p.codigo,
      theme_id: idTema.get(p.tema),
      subtheme_id: p.subtema ? (idSubtema.get(`${p.tema}/${p.subtema}`) ?? null) : null,
      statement: p.enunciado,
      explanation: p.explicacao ?? null,
      depth_level: p.nivel,
      answer_type: p.tipo_resposta ?? "yes_no_dk",
      status: p.status ?? "published",
      neutrality_reviewed_by: p.revisado_por ?? revisorPadrao,
      neutrality_reviewed_at: agora,
      updated_at: agora,
    })),
    { onConflict: "code", count: "exact" },
  ),
);

// Dependências dependem dos ids gerados pelo banco
const { data: linhas, error: erroBusca } = await sb.from("questions").select("id, code");
if (erroBusca) {
  console.error(erro(`\n✖ ${erroBusca.message}`));
  process.exit(1);
}
const idPorCodigo = new Map(linhas.map((l) => [l.code, l.id]));

await passo("encadeamentos", async () => {
  const del = await sb.from("question_dependencies").delete().gte("parent_question_id", 0);
  if (del.error) return del;
  return sb.from("question_dependencies").insert(
    dependencias.map((d) => ({
      parent_question_id: idPorCodigo.get(d.pai),
      required_answer: d.resposta,
      child_question_id: idPorCodigo.get(d.filho),
    })),
    { count: "exact" },
  );
});

// ---------------------------------------------------------------------
// 4. Regenera o arquivo de fallback com os ids REAIS do banco
// ---------------------------------------------------------------------
gravarFallback(idPorCodigo, idTema);

console.log(ok("\n✓ Pronto."));
console.log(fraco("  src/data/conteudo-fallback.json regenerado com os ids do banco."));

// ---------------------------------------------------------------------
// 5. Relatório: o que está no banco e não está mais nos arquivos
// ---------------------------------------------------------------------
const orfas = linhas.filter((l) => !codigos.has(l.code));
if (orfas.length) {
  console.log(
    aviso(
      `\n${orfas.length} pergunta(s) existem no banco mas não estão nos arquivos: ` +
        orfas.map((o) => o.code).join(", "),
    ),
  );
  console.log(
    fraco(
      "  Elas continuam publicadas. Para tirar do ar, mude o status para 'retired' no SQL Editor.",
    ),
  );
}
console.log("");
