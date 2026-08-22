// Leitor mínimo de .env.local — evita depender de pacote externo.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export function carregarEnv(arquivo = ".env.local") {
  const caminho = resolve(process.cwd(), arquivo);
  if (!existsSync(caminho)) return false;

  // remove BOM, que o Bloco de Notas adiciona ao salvar em UTF-8
  const texto = readFileSync(caminho, "utf8").replace(/^﻿/, "");

  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const igual = limpa.indexOf("=");
    if (igual === -1) continue;
    const chave = limpa.slice(0, igual).trim();
    let valor = limpa.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (!(chave in process.env)) process.env[chave] = valor;
  }
  return true;
}

const ehPlaceholder = (v) =>
  !v ||
  /^cole/i.test(v) ||
  v.includes("xxxxxxxx") ||
  v.includes("<") ||
  v.includes("sua-chave");

/** Diagnóstico específico: diz o que exatamente está faltando. */
export function exigirCredenciais() {
  const existe = carregarEnv();
  const caminho = resolve(process.cwd(), ".env.local");

  const falhar = (titulo, linhas) => {
    console.error(`\n\x1b[31m✖ ${titulo}\x1b[0m\n`);
    for (const l of linhas) console.error(`  ${l}`);
    console.error("");
    process.exit(1);
  };

  if (!existe) {
    // Armadilha clássica do Windows: o Bloco de Notas salva como .env.local.txt
    const parecidos = readdirSync(process.cwd())
      .filter(
        (f) =>
          f.toLowerCase().startsWith(".env.local") &&
          f !== ".env.local" &&
          !f.endsWith(".example"),
      )
      // .env.local.txt primeiro: é o erro mais provável
      .sort((a, b) => (a.endsWith(".txt") ? -1 : 0) - (b.endsWith(".txt") ? -1 : 0));

    const dicas = [
      "O arquivo .env.local não existe nesta pasta.",
      `Procurei em: ${caminho}`,
      "",
      "Crie assim, no PowerShell, dentro da pasta quiz-eleitoral:",
      "",
      "\x1b[1m  Copy-Item ENV-EXEMPLO.txt .env.local\x1b[0m",
      "\x1b[1m  notepad .env.local\x1b[0m",
      "",
    ];

    if (parecidos.length) {
      dicas.push(
        `\x1b[33mEncontrei ${parecidos.join(", ")} — o nome precisa ser exatamente .env.local\x1b[0m`,
        "",
        "Se foi o Bloco de Notas que renomeou, corrija com:",
        `\x1b[1m  Rename-Item ${parecidos[0]} .env.local\x1b[0m`,
        "",
      );
    }
    falhar("Arquivo .env.local não encontrado.", dicas);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const faltando = [];

  if (ehPlaceholder(url)) faltando.push("NEXT_PUBLIC_SUPABASE_URL");
  if (ehPlaceholder(chave)) faltando.push("SUPABASE_SERVICE_ROLE_KEY");

  if (faltando.length) {
    falhar("Falta preencher no .env.local: " + faltando.join(", "), [
      `Arquivo lido: ${caminho}`,
      "",
      "A chave secreta fica em:",
      "  Supabase › Project Settings › API Keys › Secret keys",
      "  Clique em Reveal e copie o valor que começa com \x1b[1msb_secret_\x1b[0m",
      "",
      "O arquivo precisa ficar assim, sem aspas e sem espaços em volta do = :",
      "",
      "  NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co",
      "  NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...",
      "  SUPABASE_SERVICE_ROLE_KEY=sb_secret_...",
      "",
      "\x1b[33mNunca cole a chave sb_secret_ em chat, e-mail ou print.\x1b[0m",
    ]);
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) {
    falhar("NEXT_PUBLIC_SUPABASE_URL parece inválida.", [
      `Valor lido: ${url}`,
      "",
      "O formato correto é https://identificador.supabase.co",
      "sem barra no final e sem caminho depois.",
    ]);
  }

  // A secreta começa com sb_secret_ (formato novo) ou eyJ (JWT, projetos antigos)
  const pareceSecreta = chave.startsWith("sb_secret_") || chave.startsWith("eyJ");
  if (!pareceSecreta) {
    falhar("SUPABASE_SERVICE_ROLE_KEY não parece ser a chave secreta.", [
      `Valor começa com: ${chave.slice(0, 16)}…`,
      "",
      "A chave secreta começa com \x1b[1msb_secret_\x1b[0m (ou eyJ, nos projetos antigos).",
      "A que começa com sb_publishable_ é a pública — ela vai na linha",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY, não nesta.",
      "",
      "Pegue a certa em: Project Settings › API Keys › Secret keys › Reveal",
    ]);
  }

  return { url, chave };
}

export const cores = {
  ok: (t) => `\x1b[32m${t}\x1b[0m`,
  erro: (t) => `\x1b[31m${t}\x1b[0m`,
  aviso: (t) => `\x1b[33m${t}\x1b[0m`,
  fraco: (t) => `\x1b[90m${t}\x1b[0m`,
  forte: (t) => `\x1b[1m${t}\x1b[0m`,
};
