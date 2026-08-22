# Quiz Eleitoral — projeto base

Aplicação Next.js + PostgreSQL (Supabase) montada sobre a arquitetura definida em
`infraestrutura-banco-de-dados.md`.

**O que já está pronto e testado:**

- 5 migrations SQL validadas em um PostgreSQL real
- **150 perguntas neutras** em 15 temas, com explicação e 45 encadeamentos adaptativos
- Motor de quiz completo: blocos de 5, "não sei", "quero entender", perguntas condicionais
- Respostas guardadas no aparelho (funciona offline) e resultado calculado localmente
- `npm run seed` — publica o conteúdo no banco, validando a regra de neutralidade antes
- `npm run importar:tse` — carrega partidos e candidaturas da base oficial do TSE
- Row Level Security fechado em todas as tabelas, **inclusive nas partições**
- Rotinas de agregação e criação automática de partições

---

## Passo 0 — Instalar o que falta na sua máquina

**Node.js** — https://nodejs.org · versão **LTS**.
**Git** — https://git-scm.com/download/win · opções padrão.

Feche e reabra o PowerShell e confirme:

```powershell
node --version
git --version
```

## Passo 1 — Rodar o app (funciona antes de qualquer conta)

```powershell
cd $HOME\OneDrive\Desktop\QuizEleitoral\quiz-eleitoral
npm install
npm run dev
```

<http://localhost:3000>. Um aviso na home indica "modo local" — é o esperado até o Passo 4.
Para parar: `Ctrl + C`.

---

## Passo 2 — Criar o projeto na Supabase

1. <https://supabase.com> › crie a conta.
2. **New project**:
   - **Name:** `quiz-eleitoral`
   - **Database password:** senha forte, **guardada num gerenciador de senhas**. Não é recuperável.
   - **Region:** `South America (São Paulo)`
   - **Plan:** Free
3. Espere o projeto ficar verde (~2 min).

> O Free pausa o projeto após uma semana sem uso e dá 500 MB.
> Ótimo para desenvolver, **não use para lançar**. Antes de divulgar, migre para o Pro (US$ 25).

---

## Passo 3 — Criar as tabelas

**SQL Editor** › **New query**. Abra `supabase/TUDO-DE-UMA-VEZ.sql`, cole o arquivo inteiro e
clique em **Run**. É uma colagem só, com as 5 migrations na ordem certa.

Antes disso, em **Database › Extensions**, habilite `vector`. (O `pg_cron` pode ficar para o
Passo 7.)

No fim da execução aparecem duas consultas de conferência. **As duas precisam voltar vazias.**
Se alguma trouxer linhas, pare — o banco está exposto.

Se preferir ir arquivo por arquivo, os mesmos comandos estão em `supabase/migrations/`, e a
ordem importa:

| # | Arquivo | O que cria |
|---|---|---|
| 1 | `001_conteudo.sql` | Temas, subtemas, motor de perguntas versionado, área Entenda |
| 2 | `002_evidencia.sql` | Candidatos, fontes, claims e posições |
| 3 | `003_participacao.sql` | `quiz_sessions` particionada por mês |
| 4 | `004_agregados.sql` | Tabelas de estatística e as rotinas automáticas |
| 5 | `005_rls.sql` | **Row Level Security em tudo** |

Mensagens `NOTICE` são normais. Rodar de novo também é seguro: tudo usa `if not exists`.

> **Nunca pule a parte do RLS.** A chave publicável do projeto fica exposta no navegador — é
> assim que a Supabase funciona. Quem protege o banco é o RLS.

---

## Passo 4 — Conectar o app ao banco

**Project Settings › API** na Supabase. Depois, na pasta do projeto:

```powershell
Copy-Item ENV-EXEMPLO.txt .env.local
notepad .env.local
```

A URL e a chave publicável já vêm preenchidas no `ENV-EXEMPLO.txt`. Falta só a última linha:
em **Project Settings › API Keys › Secret keys**, revele a chave que começa com `sb_secret_`
e cole nela.

**Quais destes valores são segredo, e quais não são:**

| Valor | É segredo? | Por quê |
|---|---|---|
| URL do projeto | não | é o endereço público da API |
| `sb_publishable_…` | **não** | é feita para ficar no navegador; quem protege é o RLS |
| `sb_secret_…` | **sim** | ignora todo o RLS: é o banco inteiro |
| Senha do banco | **sim** | acesso direto ao PostgreSQL, por fora da API |

> A chave secreta nunca leva o prefixo `NEXT_PUBLIC_`, nunca aparece em código de frontend,
> nunca vai para o Git, e nunca é colada em chat, e-mail ou print. Se vazar, **Revoke** na
> Supabase e gere outra — leva dez segundos.
>
> O mesmo vale para a senha do banco: se ela for exposta, vá em
> **Project Settings › Database › Reset database password**.

---

## Passo 5 — Publicar as 150 perguntas

```powershell
npm run seed
```

O comando lê os arquivos de `content/`, **valida antes de escrever** e envia para a Supabase.
Você deve ver:

```
Conteúdo lido
  15 temas · 45 subtemas
  150 perguntas (105 de entrada, 45 de aprofundamento)
  45 encadeamentos adaptativos
✓ Validação passou.
```

Para conferir sem escrever nada no banco: `npm run seed:validar`.

**É seguro rodar quantas vezes quiser.** As perguntas são identificadas pelo `codigo`
(`SEG-001`), então rodar de novo atualiza em vez de duplicar — e cada alteração numa pergunta
já publicada vira uma linha em `question_revisions`, com data e versão.

### Como editar e ampliar as perguntas

Os arquivos ficam em `content/perguntas/`, agrupados por tema. Cada pergunta é:

```json
{ "codigo": "SEG-008", "tema": "seguranca", "subtema": "policiamento", "nivel": 1,
  "enunciado": "Pergunta simples terminando com interrogação?",
  "explicacao": "Por que perguntamos isso, e qual é o custo da escolha." }
```

Convenções: `nivel` 1 é pergunta de entrada, 2 é aprofundamento (aparece só para quem respondeu
a pergunta ligada em `content/dependencias.json`). O código segue `ABC-001` e **nunca deve
mudar depois de publicado** — ele é a identidade da pergunta entre versões.

O validador **bloqueia o envio** se encontrar código repetido, tema inexistente, enunciado curto
demais ou **sigla de partido no enunciado** — a regra de neutralidade virou código, não confia
só na revisão manual.

---

## Passo 6 — Importar as candidaturas do TSE

```powershell
npm run importar:tse
```

Baixa o pacote oficial `consulta_cand_2026` do Portal de Dados Abertos do TSE, lê os CSVs e
carrega **partidos** e **candidaturas**. O arquivo baixado fica em `.cache-tse/` para não ser
baixado de novo.

Opções úteis:

```powershell
npm run importar:tse -- --validar            # mostra o resumo, não escreve nada
npm run importar:tse -- --uf SP,RJ           # só estas UFs
npm run importar:tse -- --limite 200         # amostra pequena, para testar
npm run importar:tse -- --arquivo caminho\consulta_cand_2026.zip   # arquivo já baixado
```

O que o importador faz, e o que ele não faz:

- Importa só os cargos que o quiz compara: presidente, governador, senador, deputado federal,
  estadual e distrital. Vice e suplente ficam de fora.
- A chave de cada candidato é o `SQ_CANDIDATO` oficial do TSE. Rodar de novo atualiza.
- O `registration_status` vem do campo de deferimento do próprio TSE. **Só candidaturas
  deferidas aparecem no site** — é o que a política de RLS permite. Uma candidatura indeferida
  entra no banco mas não é exibida.
- Ele **não** cria propostas nem posições. Isso é o próximo passo, e depende de documento.

---

## Passo 7 — Ligar as rotinas automáticas

**Database › Extensions**: habilite `pg_cron`. Depois, no SQL Editor:

```sql
select cron.schedule('refresh-stats',     '*/5 * * * *', $$ select refresh_participation_stats(); $$);
select cron.schedule('create-partitions', '0 3 1 * *',   $$ select ensure_future_partitions();   $$);
select cron.schedule('purge-submissions', '0 4 * * *',   $$ select purge_submission_log();       $$);
```

---

## Passo 8 — Conferência de segurança (não pule)

```sql
-- 1. Alguma tabela sem RLS? Precisa voltar VAZIO.
select tablename from pg_tables
 where schemaname = 'public' and rowsecurity = false;

-- 2. Quem pode ler o quê
select tablename, policyname, cmd, roles
  from pg_policies where schemaname = 'public' order by tablename;

-- 3. As partições também estão protegidas? Precisa voltar VAZIO.
select c.relname from pg_class c
  join pg_inherits i on i.inhrelid = c.oid
  join pg_class p on p.oid = i.inhparent
 where p.relname = 'quiz_sessions' and c.relkind = 'r' and c.relrowsecurity = false;
```

A consulta 3 existe por um motivo específico: **RLS não é herdado pelas partições**. Ligar RLS
em `quiz_sessions` não protege `quiz_sessions_2026_08`, e a API REST expõe cada partição como
uma tabela própria. Sem esse cuidado, qualquer pessoa consultaria a partição direto e leria as
respostas políticas de todo mundo. A migration 005 e `ensure_future_partitions()` já tratam
disso — a consulta é só para você confirmar.

---

## Passo 9 — Versionar no GitHub

Use um PowerShell **normal**, não o "executar como administrador" — o de administrador abre em
`C:\Windows\System32`, e um `git init` ali cria um repositório no lugar errado.

```powershell
cd $HOME\OneDrive\Desktop\QuizEleitoral\quiz-eleitoral
git init
git add .
git status
```

Antes de rodar, confirme que o prompt termina em `...\quiz-eleitoral>`.

Olhe a lista do `git status`: **`.env.local` não pode aparecer nela.** Se aparecer, pare — o
segredo iria para o GitHub. Só então:

```powershell
git commit -m "projeto base: schema, RLS, 150 perguntas e importador do TSE"
```

Crie um repositório **privado** em <https://github.com/new> chamado `quiz-eleitoral`,
vazio — sem README, sem .gitignore, sem licença. Depois:

```powershell
git remote add origin https://github.com/danteklausoon/quiz-eleitoral.git
git branch -M main
git push -u origin main
```

No primeiro `push`, o Git para Windows abre uma janela do navegador para você entrar no GitHub.
Não é preciso criar token nem digitar senha.

Confirme que o segredo não vazou:

```powershell
git status --ignored | Select-String "env.local"
```

Precisa aparecer entre os ignorados. Se aparecer em "Changes to be committed", **pare** e me avise
antes do push.

---

## Passo 10 — Publicar na Vercel

### 10.1 — Conectar o GitHub

Em <https://vercel.com> › **Add New › Project** › **Import Git Repository**. Na primeira vez a
Vercel pede autorização no GitHub — autorize só o repositório `quiz-eleitoral`, não a conta
inteira.

A Vercel detecta o Next.js sozinho. Não mexa em Build Command nem em Output Directory.

### 10.2 — Cadastrar as variáveis de ambiente

Antes de clicar em Deploy, abra **Environment Variables** e cadastre as três, marcando
Production, Preview e Development:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

São os mesmos valores do `.env.local`. **Este é o único lugar, além do seu computador, onde a
chave `sb_secret_` deve existir.**

Se esquecer, o deploy funciona mas o site sobe em "modo local", lendo o JSON de fallback em vez
do banco. Cadastre e faça **Redeploy**.

### 10.3 — Região

O `vercel.json` já fixa `gru1` (São Paulo). O padrão da Vercel é `iad1` (Washington), o que
colocaria uma viagem às Américas entre a rota `/api/sessao` e o banco. Confira depois do deploy
em **Settings › Functions › Function Regions**.

### 10.4 — Domínio próprio

**Settings › Domains › Add Domain** → `quizeleitoral.com.br`. Aceite quando ela sugerir também
o `www`.

A Vercel mostra na tela os valores exatos a configurar. Leve-os para o painel do
<https://registro.br> em **DNS › Editar zona**:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` (raiz) | o IP que a Vercel mostrar |
| CNAME | `www` | o destino `.vercel-dns-###.com` que a Vercel mostrar |

**Use os valores que aparecem no seu painel, não valores copiados de tutorial** — a Vercel gera
um destino por projeto.

A alternativa é apontar os nameservers do Registro.br para os da Vercel. Dá menos trabalho
depois, mas transfere toda a zona DNS: se um dia você quiser e-mail no domínio, os registros MX
precisarão ser recriados lá.

A propagação leva de minutos a algumas horas. O certificado HTTPS a Vercel emite sozinha.

---

## Estrutura do projeto

```
quiz-eleitoral/
├─ content/                       ← o conteúdo editorial vive aqui
│  ├─ temas.json                  15 temas e 45 subtemas
│  ├─ dependencias.json           encadeamentos adaptativos
│  └─ perguntas/
│     ├─ 01-05.json               Segurança · Saúde · Educação · Economia · Impostos
│     ├─ 06-10.json               Emprego · Assistência · Infra · Habitação · Ambiente
│     └─ 11-15.json               Agricultura · Tecnologia · Justiça · Direitos · Exterior
│
├─ scripts/
│  ├─ seed.mjs                    npm run seed
│  ├─ importar-tse.mjs            npm run importar:tse
│  ├─ env.mjs                     leitura do .env.local
│  └─ lib/                        leitor de ZIP e de CSV do TSE, sem dependências
│
├─ supabase/
│  ├─ migrations/001…005.sql      o 005 é o mais importante: RLS
│  └─ seed.sql                    carga inicial em SQL (alternativa ao npm run seed)
│
├─ ENV-EXEMPLO.txt                modelo do .env.local
└─ src/
   ├─ app/
   │  ├─ page.tsx                 home
   │  ├─ quiz/                    motor do quiz (roda no aparelho)
   │  ├─ resultado/               perfil de respostas, calculado localmente
   │  ├─ participacao/            lê stats_by_state, nunca COUNT(*) ao vivo
   │  └─ api/sessao/route.ts      a única escrita do fluxo
   ├─ lib/                        supabase · conteúdo · armazenamento · tipos
   └─ data/conteudo-fallback.json regenerado pelo npm run seed
```

---

## Onde cada regra da arquitetura aparece no código

| Regra | Onde |
|---|---|
| 1 · Cache de borda | `next.config.ts` › `headers()` |
| 2 · Uma escrita por sessão | `src/lib/armazenamento.ts` + `api/sessao/route.ts` |
| 3 · Respostas compactas | `compactar()` em `armazenamento.ts`; coluna `answers` em 003 |
| 4 · Partições por mês | `003_participacao.sql` + `ensure_future_partitions()` |
| 5 · Agregado nunca ao vivo | `refresh_participation_stats()` + `app/participacao` |
| 6 · Pooler de conexões | porta **6543** em conexão direta (o SDK já usa o pooler) |
| 7 · Resultado na borda | `app/resultado/resultado-cliente.tsx` — zero consulta ao banco |

---

## Comandos do dia a dia

```powershell
npm run dev             # desenvolvimento em http://localhost:3000
npm run seed            # publica o conteúdo de content/ no banco
npm run seed:validar    # valida o conteúdo sem escrever nada
npm run importar:tse    # carrega partidos e candidaturas do TSE
npm run build           # verifica se tudo compila (rode antes de cada push)
```

---

## O que vem depois

1. **Planos de governo.** O TSE publica os PDFs por estado no mesmo portal. Baixar, guardar com
   hash, extrair texto e transformar em `claims` com fonte e página.
2. **Posições dos candidatos.** Ligar cada claim às perguntas em `candidate_positions`. A IA
   preenche; **um humano assina antes de publicar** — o banco recusa publicar sem revisor e sem
   evidência, por constraint.
3. Cards de compartilhamento e rota `/r/<codigo>`.
4. Cloudflare Turnstile na rota `/api/sessao`, antes de qualquer divulgação.
5. Área PRIVACIDADE com exportar e apagar dados.
6. Teste de carga com k6 simulando 10 mil sessões simultâneas.

E antes de publicar qualquer número agregado: conversar com um advogado eleitoral sobre as
regras do TSE para pesquisa de opinião.

---

## Fontes dos dados

- [Portal de Dados Abertos do TSE — Candidatos 2026](https://dadosabertos.tse.jus.br/dataset/candidatos-2026)
- Pacote usado pelo importador: `consulta_cand_2026.zip`
