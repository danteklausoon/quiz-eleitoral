-- =====================================================================
-- SEED — conteúdo inicial
-- 1 eleição · 15 temas · 45 subtemas · 45 perguntas publicadas
--
-- REGRA DE NEUTRALIDADE aplicada a todas as perguntas:
-- sem nome de candidato, sem nome de partido, sem evento político,
-- sem acusação, sem elogio, sem indução de resposta.
--
-- Rode depois das migrations 001–005.
-- =====================================================================

insert into elections (id, name, round, voting_date, is_active) values
  (2026, 'Eleições Gerais 2026', 1, '2026-10-04', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- TEMAS
-- ---------------------------------------------------------------------
insert into themes (id, slug, name, description, icon, sort_order, is_published) values
  ( 1,'seguranca',    'Segurança',              'Polícia, criminalidade, sistema prisional, drogas e armas.',        'shield',   1, true),
  ( 2,'saude',        'Saúde',                  'SUS, hospitais, medicamentos, filas e prevenção.',                  'heart',    2, true),
  ( 3,'educacao',     'Educação',               'Escolas, universidades, ensino técnico e professores.',             'book',     3, true),
  ( 4,'economia',     'Economia',               'Crescimento, inflação, juros e produtividade.',                     'trending', 4, true),
  ( 5,'impostos',     'Impostos',               'Carga tributária, simplificação e quem paga o quê.',                'receipt',  5, true),
  ( 6,'emprego',      'Emprego e Renda',        'Salário, trabalho, informalidade e qualificação.',                  'briefcase',6, true),
  ( 7,'assistencia',  'Assistência Social',     'Programas sociais, pobreza e distribuição de renda.',               'hands',    7, true),
  ( 8,'infraestrutura','Infraestrutura',        'Estradas, ferrovias, portos, saneamento e energia.',                'road',     8, true),
  ( 9,'habitacao',    'Habitação',              'Moradia, financiamento e déficit habitacional.',                    'home',     9, true),
  (10,'ambiente',     'Meio Ambiente',          'Desmatamento, clima, preservação e licenciamento.',                 'leaf',    10, true),
  (11,'agricultura',  'Agricultura',            'Produtor rural, agronegócio, crédito e exportação.',                'wheat',   11, true),
  (12,'tecnologia',   'Tecnologia',             'Internet, inteligência artificial, dados e inovação.',              'chip',    12, true),
  (13,'justica',      'Justiça e Estado',       'Judiciário, corrupção, transparência e sistema eleitoral.',         'scale',   13, true),
  (14,'direitos',     'Direitos e Liberdades',  'Liberdade de expressão, privacidade e direitos individuais.',       'flag',    14, true),
  (15,'internacional','Relações Internacionais','Comércio exterior, acordos e posicionamento do país.',              'globe',   15, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- SUBTEMAS (3 por tema)
-- ---------------------------------------------------------------------
insert into subthemes (id, theme_id, slug, name) values
  (101, 1,'policiamento','Policiamento'),      (102, 1,'prisional','Sistema prisional'),   (103, 1,'drogas-armas','Drogas e armas'),
  (201, 2,'sus','Financiamento do SUS'),       (202, 2,'acesso','Acesso e filas'),         (203, 2,'prevencao','Prevenção'),
  (301, 3,'basica','Educação básica'),         (302, 3,'superior','Ensino superior'),      (303, 3,'tecnica','Ensino técnico'),
  (401, 4,'gasto-publico','Gasto público'),    (402, 4,'estado-mercado','Estado e mercado'),(403, 4,'inflacao','Inflação e juros'),
  (501, 5,'carga','Carga tributária'),         (502, 5,'progressividade','Progressividade'),(503, 5,'simplificacao','Simplificação'),
  (601, 6,'legislacao','Legislação trabalhista'),(602, 6,'informalidade','Informalidade'), (603, 6,'qualificacao','Qualificação'),
  (701, 7,'transferencia','Transferência de renda'),(702, 7,'contrapartida','Contrapartidas'),(703, 7,'focalizacao','Focalização'),
  (801, 8,'transporte','Transporte'),          (802, 8,'saneamento','Saneamento'),         (803, 8,'concessoes','Concessões'),
  (901, 9,'deficit','Déficit habitacional'),   (902, 9,'financiamento','Financiamento'),   (903, 9,'urbanizacao','Urbanização'),
  (1001,10,'desmatamento','Desmatamento'),     (1002,10,'licenciamento','Licenciamento'),  (1003,10,'energia','Transição energética'),
  (1101,11,'credito','Crédito rural'),         (1102,11,'familiar','Agricultura familiar'),(1103,11,'exportacao','Exportação'),
  (1201,12,'dados','Proteção de dados'),       (1202,12,'ia','Inteligência artificial'),   (1203,12,'conectividade','Conectividade'),
  (1301,13,'corrupcao','Combate à corrupção'), (1302,13,'transparencia','Transparência'),  (1303,13,'sistema-eleitoral','Sistema eleitoral'),
  (1401,14,'expressao','Liberdade de expressão'),(1402,14,'privacidade','Privacidade'),    (1403,14,'direitos-civis','Direitos civis'),
  (1501,15,'comercio','Comércio exterior'),    (1502,15,'blocos','Blocos e acordos'),      (1503,15,'soberania','Soberania e defesa')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- PERGUNTAS
-- depth_level 1 = pergunta de entrada · 2 = aprofundamento (mostra o custo da escolha)
-- ---------------------------------------------------------------------
insert into questions
  (code, theme_id, subtheme_id, statement, explanation, depth_level, status,
   neutrality_reviewed_by, neutrality_reviewed_at)
values
-- 01 SEGURANÇA -------------------------------------------------------
('SEG-001', 1, 101,
 'O governo deve aumentar o investimento em segurança pública?',
 'Segurança pública é financiada por estados e União. Aumentar o investimento significa destinar mais dinheiro do orçamento a policiamento, equipamentos e inteligência — dinheiro que sai de outras áreas ou de mais arrecadação.',
 1, 'published', 'equipe-editorial', now()),
('SEG-002', 1, 102,
 'O país deve construir mais presídios?',
 'O Brasil tem uma das maiores populações carcerárias do mundo e déficit de vagas. Construir mais presídios amplia a capacidade; críticos defendem penas alternativas para crimes sem violência.',
 1, 'published', 'equipe-editorial', now()),
('SEG-003', 1, 103,
 'As regras para o cidadão comum comprar e portar arma de fogo devem ser mais rígidas?',
 'As regras de posse e porte mudam por decreto e por lei. Mais rigor significa exigir mais requisitos; menos rigor amplia o acesso.',
 1, 'published', 'equipe-editorial', now()),

-- 02 SAÚDE -----------------------------------------------------------
('SAU-001', 2, 201,
 'O governo deve aumentar o valor destinado ao SUS?',
 'O SUS tem um piso constitucional de gastos. Aumentar acima do piso exige remanejar o orçamento ou ampliar a arrecadação.',
 1, 'published', 'equipe-editorial', now()),
('SAU-002', 2, 202,
 'O governo deve contratar serviços de hospitais privados para reduzir filas do SUS?',
 'É a chamada complementaridade: o poder público paga a rede privada para atender pacientes do SUS. Reduz fila no curto prazo e transfere recursos públicos ao setor privado.',
 1, 'published', 'equipe-editorial', now()),
('SAU-003', 2, 203,
 'Parte do orçamento da saúde deve ser deslocada do tratamento para a prevenção?',
 'Prevenção (vacinação, atenção básica, rastreamento) custa menos por pessoa e dá resultado no longo prazo. Tratamento atende quem já está doente hoje.',
 1, 'published', 'equipe-editorial', now()),

-- 03 EDUCAÇÃO --------------------------------------------------------
('EDU-001', 3, 301,
 'Todas as escolas públicas devem passar a funcionar em tempo integral?',
 'Ensino integral amplia a jornada do aluno. Exige mais professores, mais estrutura e mais alimentação — é uma das políticas educacionais mais caras.',
 1, 'published', 'equipe-editorial', now()),
('EDU-002', 3, 302,
 'As universidades públicas devem continuar gratuitas para todos os estudantes?',
 'Hoje a gratuidade é universal. Uma alternativa discutida é cobrar de quem tem renda alta e usar o valor em bolsas.',
 1, 'published', 'equipe-editorial', now()),
('EDU-003', 3, 303,
 'O ensino médio deve dar mais espaço à formação técnica e profissional?',
 'Formação técnica aproxima a escola do mercado de trabalho; críticos apontam risco de reduzir a formação geral de quem quer seguir para a universidade.',
 1, 'published', 'equipe-editorial', now()),

-- 04 ECONOMIA --------------------------------------------------------
('ECO-001', 4, 401,
 'O governo deve reduzir o total de gastos públicos?',
 'Gasto público inclui saúde, educação, previdência e funcionalismo. Reduzir o total tende a diminuir a dívida e também o alcance de serviços e benefícios.',
 1, 'published', 'equipe-editorial', now()),
('ECO-002', 4, 402,
 'O Estado deve ter participação direta em setores estratégicos da economia, como energia e petróleo?',
 'Participação direta significa empresas estatais atuando no setor. Aumenta o controle público sobre preços e investimentos e amplia a exposição do orçamento ao risco.',
 1, 'published', 'equipe-editorial', now()),
('ECO-003', 4, 403,
 'Controlar a inflação deve ser prioridade mesmo que isso segure o crescimento no curto prazo?',
 'Controlar a inflação costuma exigir juros mais altos, que encarecem o crédito e desaceleram a economia. Inflação alta corrói o poder de compra, especialmente de quem ganha menos.',
 1, 'published', 'equipe-editorial', now()),

-- 05 IMPOSTOS --------------------------------------------------------
('IMP-001', 5, 501,
 'A carga tributária total do país deve diminuir?',
 'A carga tributária é o quanto o governo arrecada em relação ao tamanho da economia. Reduzi-la exige cortar gastos na mesma proporção ou aceitar mais dívida.',
 1, 'published', 'equipe-editorial', now()),
('IMP-002', 5, 502,
 'Quem tem renda mais alta deve pagar uma proporção maior de imposto sobre a renda?',
 'É o princípio da progressividade. Aumenta a arrecadação sobre o topo da distribuição; críticos apontam risco de desestímulo e de saída de capital.',
 1, 'published', 'equipe-editorial', now()),
('IMP-003', 5, 503,
 'Vale a pena simplificar os impostos mesmo que alguns setores passem a pagar mais do que hoje?',
 'Simplificação unifica tributos e reduz custo de conformidade, mas redistribui a carga: setores hoje beneficiados por regimes especiais tendem a pagar mais.',
 1, 'published', 'equipe-editorial', now()),

-- 06 EMPREGO E RENDA -------------------------------------------------
('EMP-001', 6, 601,
 'As regras trabalhistas devem ser mais flexíveis para facilitar a contratação?',
 'Mais flexibilidade reduz o custo e o risco de contratar; reduz também garantias do trabalhador contratado.',
 1, 'published', 'equipe-editorial', now()),
('EMP-002', 6, 602,
 'Trabalhadores de aplicativos devem ter direitos trabalhistas garantidos por lei?',
 'Garantir direitos aumenta a proteção de milhões de trabalhadores e eleva o custo das plataformas, que pode ser repassado a preços ou ao número de vagas.',
 1, 'published', 'equipe-editorial', now()),
('EMP-003', 6, 603,
 'O governo deve financiar cursos de qualificação profissional para adultos desempregados?',
 'Qualificação melhora a chance de recolocação. É gasto público direto, com resultado que aparece no médio prazo.',
 1, 'published', 'equipe-editorial', now()),

-- 07 ASSISTÊNCIA SOCIAL ----------------------------------------------
('ASS-001', 7, 701,
 'Os programas de transferência de renda devem ser ampliados?',
 'Ampliar significa atender mais famílias ou pagar valores maiores. Reduz pobreza imediata e aumenta a despesa obrigatória do orçamento.',
 1, 'published', 'equipe-editorial', now()),
('ASS-002', 7, 702,
 'Receber benefício social deve depender de contrapartidas, como frequência escolar dos filhos?',
 'Contrapartidas condicionam o benefício a comportamentos. Aumentam o efeito em educação e saúde e podem excluir famílias que não conseguem cumpri-las.',
 1, 'published', 'equipe-editorial', now()),
('ASS-003', 7, 703,
 'É melhor concentrar os benefícios em quem tem menos renda do que distribuí-los de forma ampla?',
 'Focalizar aumenta o impacto por real gasto; políticas amplas custam mais e costumam ter menos resistência política e menos erro de exclusão.',
 1, 'published', 'equipe-editorial', now()),

-- 08 INFRAESTRUTURA --------------------------------------------------
('INF-001', 8, 801,
 'O governo deve priorizar investimento em ferrovias em vez de rodovias?',
 'Ferrovia tem custo inicial alto e frete mais barato por tonelada no longo prazo; rodovia é mais flexível e mais rápida de entregar.',
 1, 'published', 'equipe-editorial', now()),
('INF-002', 8, 802,
 'Universalizar o saneamento básico deve ser prioridade de investimento público?',
 'Saneamento tem um dos maiores retornos em saúde pública por real investido. Exige investimento sustentado por muitos anos.',
 1, 'published', 'equipe-editorial', now()),
('INF-003', 8, 803,
 'Obras de infraestrutura devem ser entregues à iniciativa privada por concessão?',
 'Concessão traz capital privado e transfere o risco da obra; a cobrança de tarifa ou pedágio passa a recair sobre o usuário.',
 1, 'published', 'equipe-editorial', now()),

-- 09 HABITAÇÃO -------------------------------------------------------
('HAB-001', 9, 901,
 'O governo deve financiar a construção de moradia popular com recursos públicos?',
 'Reduz o déficit habitacional diretamente. É despesa alta e concentrada, com resultado visível em poucos anos.',
 1, 'published', 'equipe-editorial', now()),
('HAB-002', 9, 902,
 'O crédito imobiliário para a primeira casa própria deve ter juros subsidiados pelo governo?',
 'Subsídio barateia a parcela para a família e é pago por todos os contribuintes.',
 1, 'published', 'equipe-editorial', now()),
('HAB-003', 9, 903,
 'O poder público deve urbanizar áreas ocupadas irregularmente em vez de removê-las?',
 'Urbanizar leva infraestrutura a quem já mora no local; remover libera a área e exige realocar as famílias.',
 1, 'published', 'equipe-editorial', now()),

-- 10 MEIO AMBIENTE ---------------------------------------------------
('AMB-001',10,1001,
 'A fiscalização contra o desmatamento deve ser reforçada mesmo que restrinja atividades econômicas na região?',
 'Mais fiscalização reduz desmatamento e limita atividades como extração de madeira, mineração e abertura de novas áreas.',
 1, 'published', 'equipe-editorial', now()),
('AMB-002',10,1002,
 'O licenciamento ambiental de obras deve ser mais rápido, mesmo que com menos etapas de análise?',
 'Acelerar destrava investimento e reduz o tempo de análise de impactos; o risco é aprovar projetos com avaliação incompleta.',
 1, 'published', 'equipe-editorial', now()),
('AMB-003',10,1003,
 'O país deve acelerar a substituição de combustíveis fósseis por fontes renováveis?',
 'Reduz emissões e a dependência de petróleo; afeta empregos, arrecadação e investimentos já feitos no setor fóssil.',
 1, 'published', 'equipe-editorial', now()),

-- 11 AGRICULTURA -----------------------------------------------------
('AGR-001',11,1101,
 'O governo deve manter crédito rural com juros abaixo do mercado?',
 'Crédito subsidiado reduz o custo de produção e é bancado pelo Tesouro ou por direcionamento obrigatório de depósitos bancários.',
 1, 'published', 'equipe-editorial', now()),
('AGR-002',11,1102,
 'A agricultura familiar deve receber apoio específico do governo, separado do apoio ao agronegócio?',
 'A agricultura familiar responde por boa parte dos alimentos consumidos internamente e opera em escala menor, com outra necessidade de crédito e assistência.',
 1, 'published', 'equipe-editorial', now()),
('AGR-003',11,1103,
 'Aumentar a exportação de produtos agrícolas deve ser prioridade do país?',
 'Exportação gera divisas e renda no campo; concentra a economia em commodities e pressiona o uso da terra.',
 1, 'published', 'equipe-editorial', now()),

-- 12 TECNOLOGIA ------------------------------------------------------
('TEC-001',12,1201,
 'As empresas devem ser obrigadas por lei a proteger os dados pessoais dos usuários com regras mais rígidas?',
 'Mais rigor aumenta a proteção do cidadão e o custo de conformidade das empresas, especialmente das menores.',
 1, 'published', 'equipe-editorial', now()),
('TEC-002',12,1202,
 'O uso de inteligência artificial deve ser regulado por lei específica?',
 'Regulação define limites e responsabilidades; o debate é sobre o ponto em que ela protege sem travar o desenvolvimento.',
 1, 'published', 'equipe-editorial', now()),
('TEC-003',12,1203,
 'O governo deve investir para levar internet de qualidade a áreas rurais e remotas?',
 'Conectividade viabiliza educação, saúde e serviços públicos digitais em regiões onde o investimento privado não se paga.',
 1, 'published', 'equipe-editorial', now()),

-- 13 JUSTIÇA E ESTADO ------------------------------------------------
('JUS-001',13,1301,
 'As penas para crimes de corrupção devem ser mais duras?',
 'Penas maiores buscam efeito dissuasório; o debate técnico aponta que a probabilidade de punição costuma pesar mais do que o tamanho da pena.',
 1, 'published', 'equipe-editorial', now()),
('JUS-002',13,1302,
 'Todos os gastos públicos devem ser publicados de forma aberta e detalhada na internet?',
 'Transparência total facilita o controle social e expõe dados que podem envolver segurança ou informação pessoal.',
 1, 'published', 'equipe-editorial', now()),
('JUS-003',13,1303,
 'O sistema eleitoral brasileiro precisa de mudanças significativas?',
 'Envolve regras de financiamento, tipo de voto, número de partidos e funcionamento das urnas.',
 1, 'published', 'equipe-editorial', now()),

-- 14 DIREITOS E LIBERDADES -------------------------------------------
('DIR-001',14,1401,
 'As redes sociais devem ser responsabilizadas pelo conteúdo publicado por seus usuários?',
 'Responsabilizar aumenta o incentivo a remover conteúdo ilegal e também o incentivo a remover conteúdo legítimo por precaução.',
 1, 'published', 'equipe-editorial', now()),
('DIR-002',14,1402,
 'O uso de reconhecimento facial pelo poder público em espaços abertos deve ser limitado por lei?',
 'A tecnologia auxilia investigações e cria vigilância permanente, com histórico documentado de erro maior sobre determinados grupos.',
 1, 'published', 'equipe-editorial', now()),
('DIR-003',14,1403,
 'O Estado deve adotar políticas específicas para reduzir desigualdades entre grupos sociais?',
 'Políticas específicas atuam sobre desigualdades históricas medidas em renda, educação e acesso; o debate é sobre eficácia e sobre critérios de aplicação.',
 1, 'published', 'equipe-editorial', now()),

-- 15 RELAÇÕES INTERNACIONAIS -----------------------------------------
('INT-001',15,1501,
 'O país deve reduzir tarifas de importação para aumentar a concorrência no mercado interno?',
 'Tarifas menores barateiam produtos importados e pressionam a indústria nacional a competir.',
 1, 'published', 'equipe-editorial', now()),
('INT-002',15,1502,
 'O Brasil deve buscar novos acordos comerciais com outros blocos econômicos?',
 'Acordos abrem mercados para exportação e expõem setores internos à concorrência externa.',
 1, 'published', 'equipe-editorial', now()),
('INT-003',15,1503,
 'O país deve aumentar o investimento em defesa nacional?',
 'Envolve equipamento, pessoal e indústria de defesa. É gasto que disputa espaço com áreas sociais no mesmo orçamento.',
 1, 'published', 'equipe-editorial', now())
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- APROFUNDAMENTOS (depth_level 2)
-- Aparecem só para quem respondeu a pergunta de entrada.
-- É aqui que o quiz descobre a CONDIÇÃO por trás da preferência.
-- ---------------------------------------------------------------------
insert into questions
  (code, theme_id, subtheme_id, statement, explanation, depth_level, status,
   neutrality_reviewed_by, neutrality_reviewed_at)
values
('SEG-101', 1, 101,
 'Você aceitaria pagar mais impostos para financiar o aumento do investimento em segurança?',
 'Toda ampliação de gasto vem de algum lugar: mais imposto, mais dívida ou corte em outra área.',
 2, 'published', 'equipe-editorial', now()),
('SAU-101', 2, 201,
 'Você aceitaria pagar mais impostos para financiar o aumento do orçamento da saúde?',
 'Mesma lógica: aumentar o gasto exige definir a fonte.',
 2, 'published', 'equipe-editorial', now()),
('EDU-101', 3, 301,
 'Você aceitaria que o ensino integral fosse implantado aos poucos, começando pelas escolas mais pobres?',
 'Implantação gradual custa menos por ano e demora mais para alcançar todos.',
 2, 'published', 'equipe-editorial', now()),
('ECO-101', 4, 401,
 'A redução de gastos públicos poderia atingir áreas como saúde e educação?',
 'Saúde, educação e previdência são a maior parte do orçamento. Cortes que as excluam têm alcance limitado.',
 2, 'published', 'equipe-editorial', now()),
('IMP-101', 5, 501,
 'A redução de impostos poderia vir acompanhada de corte em programas sociais?',
 'Reduzir arrecadação sem cortar despesa aumenta a dívida pública.',
 2, 'published', 'equipe-editorial', now())
on conflict (code) do nothing;

-- Encadeamento adaptativo: quem responde SIM na entrada vê o aprofundamento
insert into question_dependencies (parent_question_id, required_answer, child_question_id)
select p.id, 1, c.id
from questions p
join questions c
  on c.code = replace(p.code, '-00', '-10')
where p.code in ('SEG-001','SAU-001','EDU-001','ECO-001','IMP-001')
on conflict do nothing;
