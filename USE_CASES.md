# Especificação de Casos de Uso — Cyanki

**Versão:** 1.0 · Abril de 2026  
**Status:** Documento vivo — serve como backlog para próximas implementações

---

## 1. Escopo e Atores

### 1.1 Escopo do Sistema

O **Cyanki** é uma plataforma de estudos adaptativa, offline-first, baseada em repetição espaçada (FSRS). O sistema opera com o dispositivo do usuário como fonte primária de verdade durante sessões de estudo, sincronizando dados com o servidor em segundo plano. O escopo abrange:

- Criação e gestão de cadernos e flashcards em formato Markdown
- Estudo via algoritmo FSRS com agendamento inteligente de revisões
- Prática com filtragem multidimensional avançada
- Gamificação com XP, streak e ranking
- Sincronização offline-first com resolução de conflitos por timestamp
- Comunidade para compartilhamento de cadernos públicos
- Analytics de desempenho e histórico de estudo

**Fora do escopo atual:**
- Vídeo-aulas e conteúdo multimídia pesado
- Pagamentos e assinaturas
- Moderação de conteúdo comunitário
- Integração com plataformas externas (ex: Anki, Quizlet)

---

### 1.2 Atores

| Ator | Descrição | Tipo |
|---|---|---|
| **Estudante** | Usuário autenticado que cria, estuda e gerencia flashcards/cadernos | Primário |
| **Novo Usuário** | Pessoa no primeiro acesso ao sistema | Primário |
| **Visitante** | Usuário não autenticado, acesso restrito | Primário |
| **Sistema** | Processos automáticos (sync, FSRS, auto-save, notificações) | Secundário |
| **Service Worker** | Gerencia cache, sincronização em background e notificações push | Secundário |
| **Servidor Backend** | FastAPI — arbitragem de conflitos, persistência remota e API | Secundário |

---

## 2. Casos de Uso

### Legenda de Status
- ✅ **Implementado** — Funcionalidade completa e disponível
- ⚠️ **Parcialmente Implementado** — Funcionalidade existe mas incompleta ou simplificada
- ❌ **Não Implementado** — Funcionalidade prevista no backlog, não existe no código

---

### 2.1 Offline & Sincronização

---

#### UC-01 — UI Otimista com Fila de Sincronização
**Status:** ✅ Implementado

**Ator:** Estudante / Sistema  
**Rota Frontend:** Todas as rotas de estudo  
**Endpoint Backend:** `POST /api/sync/push`, `GET /api/sync/pull`

**Descrição:** Interações do usuário (responder questões, salvar flashcards, editar cadernos) atualizam o banco local imediatamente. As operações são enfileiradas na `syncQueue` (IndexedDB) e enviadas ao servidor quando a conexão estiver disponível.

**Fluxo Principal:**
1. Usuário interage (cria card, responde questão, edita caderno)
2. Operação gravada na `syncQueue` local (Dexie)
3. Interface atualiza imediatamente (UI otimista)
4. `syncEngine` detecta conexão disponível
5. POST `/api/sync/push` com operações pendentes
6. Servidor processa com conflito por timestamp (mais recente vence)
7. GET `/api/sync/pull` baixa estado remoto atual
8. Operações processadas removidas da `syncQueue`

**Exceções:**
- Conflito de sincronização: servidor resolve pelo `updated_at` mais recente
- Falha persistente: operações permanecem na fila para próxima tentativa

---

#### UC-02 — Armazenamento Separado para Conteúdo Offline
**Status:** ✅ Implementado

**Ator:** Sistema  
**Módulos:** `frontend/src/lib/mediaCache.ts`, `frontend/src/lib/db.ts` (tabela `mediaCache`), `frontend/vite.config.ts` (Workbox runtime caching)

**Descrição:** O sistema separa o armazenamento offline em duas camadas: (1) assets estáticos de interface (JS, CSS, ícones, fontes) armazenados no Cache API pelo Service Worker via Workbox; (2) mídias dinâmicas (imagens referenciadas em flashcards e cadernos) armazenadas nativamente como Blobs no IndexedDB via tabela `mediaCache`, evitando o overhead de 33 % do Base64 e permitindo controle refinado de espaço.

**Fluxo Principal:**
1. Assets estáticos (UI) → Cache API via Workbox `generateSW` (precache + runtime CacheFirst) — *implementado*
2. Dados estruturados → IndexedDB via Dexie — *implementado*
3. Mídias dinâmicas (imagens em Markdown) → `cacheMediaFromMarkdown()` → Blob no IndexedDB (`mediaCache`) — *implementado*
4. Controle de espaço → `getStorageInfo()` retorna usage/quota/percent/mediaCacheSize; `pruneOldMedia()` remove entradas antigas — *implementado*

**API pública (`mediaCache.ts`):**
- `cacheMedia(url, flashcardId?)` — baixa e persiste um URL como Blob
- `cacheMediaFromMarkdown(content, flashcardId?)` — extrai URLs de Markdown/HTML e cacheia em lote
- `resolveMediaUrl(url)` — retorna Object URL do Blob local ou URL original como fallback
- `getStorageInfo()` — retorna `{ usage, quota, percent, mediaCacheSize, mediaCacheCount }`
- `pruneOldMedia(maxAgeMs?)` — remove entradas com mais de 30 dias (configurável)
- `pruneMediaForCard(flashcardId)` — remove mídias órfãs ao deletar um card
- `clearMediaCache()` — limpa toda a tabela

**Workbox (Cache API):**
- Precache: `**/*.{js,css,html,ico,png,svg,webp,woff2}`
- Runtime `NetworkFirst` para `/api/` com timeout 10s e cache de 5 min
- Runtime `CacheFirst` para imagens externas (30 dias, 150 entradas max)
- Runtime `CacheFirst` para Google Fonts (1 ano)

---

#### UC-03 — Ranking Sincronizado e Projeção Offline
**Status:** ✅ Implementado

**Ator:** Estudante / Sistema  
**Rota Frontend:** `/ranking`

**Descrição:** Ranking global exibido com posições e XP. Quando offline, o sistema projeta a posição estimada somando XP pendente de revisões não sincronizadas ao último ranking conhecido.

**Fluxo Principal:**
1. Usuário acessa `/ranking`
2. Sistema verifica conexão
3. Se offline: calcula projeção (XP local + XP pendente na fila)
4. Exibe ranking projetado com indicação visual
5. Ao reconectar: sincroniza e exibe ranking real

---

### 2.2 Filtragem & Busca

---

#### UC-04 — Indexação Otimizada para Filtros Avançados Offline
**Status:** ✅ Implementado

**Ator:** Sistema  
**Implementação:** Dexie.js com índices em `tags[]`, `createdAt`, `flashcardId`, `reviewedAt`, `synced`

**Descrição:** O banco local usa índices estruturados no IndexedDB para buscas rápidas sem SQL nativo. Tags são indexadas como array, permitindo filtragem direta.

---

#### UC-05 — Filtragem Multidimensional Avançada Offline
**Status:** ✅ Implementado

**Ator:** Estudante  
**Rota Frontend:** `/practice/questions`

**Descrição:** Filtros por tags (disciplina, assunto, modalidade, área), busca por palavra-chave no front/back, dificuldade, ordenação e paginação. Resultados paginados com 20 itens por página com lazy load.

**Filtros Disponíveis:**
- Tags multi-nível (disciplinas, tópicos, modalidade, área)
- Busca por palavra-chave (front e back do card)
- Dificuldade (mapeada para tags)
- Ordenação: mais recente, mais antigo
- Filtros salvos para reutilização

---

#### UC-06 — Análise de Desempenho por Filtros Salvos
**Status:** ✅ Implementado

**Ator:** Estudante  
**Rota Frontend:** `/practice/filter-stats/[filterId]`  
**Acesso:** Botão "Ver Desempenho" em cada card de filtro salvo na aba "Filtros Salvos" de `/practice/questions`

**Descrição:** Para cada filtro salvo, o sistema executa dinamicamente os critérios de filtro no banco local e calcula métricas isoladas para aquele contexto específico. O dashboard exibe taxa de acerto, volume de revisões, cobertura do caderno e distribuição de avaliações FSRS, tudo com seletor de período.

**Funcionalidades:**
- **Seletor de período:** 7 dias / 30 dias / 90 dias / Sempre — reativa sem recarregar a página
- **KPIs:** Taxa de acerto (%) com barra de progresso colorida, total de revisões, cards revistos, cards nunca revistos
- **Gráfico de atividade diária:** barras CSS com tooltip hover mostrando contagem do dia
- **Distribuição de avaliações:** barras de progresso para Again / Hard / Good / Easy com percentuais
- **Cobertura do caderno:** barra de progresso indicando % de cards do filtro que foram revisados no período, com alerta para cards não cobertos
- **CTAs:** links diretos para Praticar (simples) e Estudar com FSRS a partir do dashboard

---

### 2.3 Estudo & Aprendizado

---

#### UC-07 — Resolução de Questões com Feedback em Tempo Real
**Status:** ✅ Implementado

**Ator:** Estudante  
**Rotas Frontend:** `/practice/solve/[id]`, `/notebooks/solve/[id]`

**Descrição:** Usuário seleciona resposta e recebe feedback imediato. Para o modo FSRS, o algoritmo recalcula o próximo agendamento. Para o modo prática simples, registra correto/errado e mostra resumo ao final.

**Modos:**
- **Prática Simples** (`solve`): flip de cards, correto/errado sem FSRS, sem XP
- **Estudo FSRS** (`study`): rating 0-3 (Again/Hard/Good/Easy), XP concedido, confetti animado

---

#### UC-08 — Estudo Contínuo com Repetição Espaçada (FSRS)
**Status:** ✅ Implementado

**Ator:** Estudante  
**Rotas Frontend:** `/study`, `/practice/study/[id]`, `/notebooks/study/[id]`  
**Biblioteca:** `ts-fsrs` v5.2.3

**Descrição:** O FSRS V4 calcula cards com revisão pendente, ordena por urgência e recalcula agendamento após cada resposta. Taxa de retenção configurável (70-99%, padrão 90%).

**Fluxo:**
1. `getAllCardStates()` calcula estado FSRS de todos os cards do filtro
2. `getDueCards()` seleciona apenas os com revisão pendente
3. Card exibido; usuário avalia: Again / Hard / Good / Easy
4. `processReview()` grava ReviewLog localmente e enfileira sync
5. XP concedido (10 XP/revisão); streak atualizado; confetti exibido

---

#### UC-09 — Mestria e Níveis de Proficiência
**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Previsto:** Níveis Iniciante → Familiarizado → Proficiente → Mestre por tópico. Cálculo dinâmico considerando acertos recentes, peso de dificuldade e decaimento por tempo sem prática. Anéis de progresso visuais na interface que regridem com inatividade.

---

#### UC-10 — Mini-Games Educativos e Economia de Pontos
**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Previsto:** Mini-games educativos (desafios cronometrados, jogo da memória) desbloqueados via XP ganho em sessões FSRS. Economia circular que incentiva disciplina de revisão.

---

### 2.4 Gamificação & Engajamento

---

#### UC-11 — Estudo Contínuo e Gamificação (Streak)
**Status:** ⚠️ Parcialmente Implementado

**Ator:** Estudante  
**Implementado:** Streak diário rastreado (`lastStudyDate`, persistido no localStorage); XP por revisão (10 XP/card); nível baseado em XP acumulado (100 XP/nível); confetti ao completar cards  
**Não Implementado:** Widget de "continuar de onde parou" na tela inicial; restauração automática de contexto (posição em sessão, filtros ativos, índice de card)

---

#### UC-12 — Criação de Desafios Comunitários
**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Previsto:** Criar desafios com filtros personalizados (público/privado). Sistema seleciona questões aleatórias imutáveis. Desafio armazenado offline e publicado ao reconectar, com código único de compartilhamento.

---

### 2.5 Metas & Notificações

---

#### UC-13 — Criação de Metas de Estudo e Lembretes Inteligentes
**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Previsto:** Metas por horas líquidas (com pausas automáticas por inatividade), volume de questões ou taxa de desempenho. Timer automático com pausa após 2 min de inatividade. Service Worker para notificações push agendadas (funciona com browser fechado).

---

### 2.6 Desempenho & Análise

---

#### UC-14 — Dashboard de Desempenho e Gráficos de Performance
**Status:** ⚠️ Parcialmente Implementado

**Ator:** Estudante  
**Rota Frontend:** `/history`  
**Implementado:** Contadores de total de revisões, cards únicos estudados, revisões hoje; tabela detalhada de review log com timestamps, grades e estados; exportação CSV  
**Não Implementado:** Gráficos interativos de evolução temporal; filtro por período (Hoje/7 dias/30 dias/Sempre) com query otimizada; filtro por disciplina no dashboard; visualização de evolução de desempenho

---

### 2.7 Gerenciamento de Conteúdo

---

#### UC-15 — Gerenciamento de Download Paginado e Controle de Armazenamento
**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Previsto:** Download de conteúdo extenso em pacotes gerenciáveis (blocos de 500 questões). Painel dedicado para visualizar pacotes baixados, uso de espaço e exclusão individual para liberar storage.

---

### 2.8 Cadernos & Flashcards

---

#### UC-16 — Edição de Alto Desempenho com Parsing Incremental em Background
**Status:** ⚠️ Parcialmente Implementado

**Ator:** Estudante  
**Rota Frontend:** `/notebooks/[id]`  
**Implementado:** Editor de caderno com auto-save (debounce 1s); parser de Markdown para Q:/A: com injeção de NanoID; atualização reativa dos flashcards no Dexie  
**Não Implementado:** Web Worker para offloading do parsing; parsing incremental por bloco (somente o bloco afetado); fallback para parsing síncrono em lotes pequenos quando Web Worker indisponível

---

#### UC-17 — Preview em Tempo Real com Renderização Virtualizada
**Status:** ⚠️ Parcialmente Implementado

**Ator:** Estudante  
**Rota Frontend:** `/notebooks/[id]`  
**Implementado:** Preview de Markdown com debounce; renderização dos cards parseados; sanitização com DOMPurify  
**Não Implementado:** Virtual scroll (renderização apenas dos 10-15 cards visíveis na viewport); adaptação dinâmica para dispositivos com pouca RAM

---

#### UC-18 — Salvamento Automático e Persistência Offline Escalável
**Status:** ✅ Implementado

**Ator:** Sistema  
**Rota Frontend:** `/notebooks/[id]`

**Descrição:** Auto-save disparado após 1s de inatividade na digitação. Conteúdo salvo no IndexedDB via Dexie. Flashcards parseados persistidos no banco local com deduplicação por normalização do texto front.

---

#### UC-19 — Busca Instantânea com Indexação Local
**Status:** ⚠️ Parcialmente Implementado

**Ator:** Estudante  
**Implementado:** Filtragem por tags usando índice Dexie; busca por palavra-chave no front/back dos cards  
**Não Implementado:** Índice invertido em memória mapeando tags para posições de cards dentro do editor; busca dentro do editor de caderno (por tag, termo, posição de card); destaque visual de cards encontrados

---

#### UC-20 — Identidade Única e Rastreabilidade de Questões
**Status:** ✅ Implementado

**Ator:** Sistema  
**Biblioteca:** `nanoid` v5.x

**Descrição:** NanoID gerado automaticamente para cada flashcard criado. ID injetado como comentário HTML no Markdown (`<!-- id: xxx -->`). ID preservado em edições futuras, garantindo rastreamento FSRS contínuo. Deduplicação via normalização do texto `front`.

---

#### UC-21 — Ingestão de Flashcards via Cadernos Markdown
**Status:** ✅ Implementado

**Ator:** Estudante  
**Rota Frontend:** `/notebooks/[id]`  
**Módulo:** `frontend/src/lib/notebookParser.ts`

**Descrição:** Editor escaneia documento Markdown; detecta padrão `Q: ... A: ... Tags: ... <!-- id: xxx -->`; gera e injeta NanoID em cards sem ID; persiste cards parseados no Dexie; edições no texto preservam o ID original.

---

### 2.9 Usuário

---

#### UC-22 — Onboarding e Configuração Inicial do Perfil
**Status:** ⚠️ Parcialmente Implementado

**Ator:** Novo Usuário  
**Rota Frontend:** `/onboarding` (rota existe)  
**Implementado:** Rota de onboarding declarada na estrutura do projeto  
**Não Implementado:** Fluxo guiado completo (definição de objetivo, seleção de disciplinas, configuração de retenção FSRS, autorização de notificações); persistência das preferências do onboarding; recomendação de conteúdo inicial

---

#### UC-23 — Gerenciamento de Perfil e Preferências
**Status:** ⚠️ Parcialmente Implementado

**Ator:** Estudante  
**Rota Frontend:** `/profile`  
**Implementado:** Configuração de objetivo de estudo; configuração de taxa de retenção FSRS (70-99%); toggle de tema claro/escuro  
**Não Implementado:** Edição de nome/avatar/email; alteração de senha (com confirmação); gerenciamento de disciplinas ativas; mudanças sensíveis com validação de senha atual

---

#### UC-24 — Autenticação e Recuperação de Acesso
**Status:** ⚠️ Parcialmente Implementado

**Ator:** Usuário  
**Rotas Frontend:** `/login`, `/register`  
**Endpoints:** `POST /auth/register`, `POST /auth/login`  
**Implementado:** Autenticação email/senha com JWT (15 min de expiração); bcrypt com limite 72 bytes; acesso a conteúdo local com sessão em cache  
**Não Implementado:** Login social (Google, Apple); recuperação de senha via email (link temporário); modo somente leitura offline para sessão expirada; refresh token (token JWT sem renovação automática)

---

#### UC-25 — Histórico de Estudo e Exportação de Dados
**Status:** ⚠️ Parcialmente Implementado

**Ator:** Estudante  
**Rota Frontend:** `/history`  
**Implementado:** Visualização de histórico completo de revisões; contadores agregados (total, únicos, hoje); tabela detalhada com timestamp, grade, estado; exportação CSV  
**Não Implementado:** Exportação PDF; filtro por período (Hoje/7 dias/30 dias/Sempre); filtro por disciplina; linha do tempo visual de atividades; processamento em background para volumes grandes

---

#### UC-26 — Controle de Privacidade e Exclusão de Conta
**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Previsto:** Painel de privacidade (LGPD); visualização de dados coletados; exclusão parcial (apenas histórico) ou total da conta; exclusão total remove dados do servidor em 30 dias e limpa IndexedDB imediatamente; confirmação dupla para ações irreversíveis.

---

## 3. Regras de Negócio

| ID | Regra | Contexto |
|---|---|---|
| **RN-01** | O device do usuário é a fonte primária de verdade durante sessões de estudo. O servidor é fonte de verdade para arbitragem de conflitos na sincronização. | Sincronização |
| **RN-02** | Conflitos de sincronização são resolvidos pelo campo `updated_at` — o registro mais recente vence. | Sincronização |
| **RN-03** | Operações locais são sempre executadas primeiro (UI otimista); sincronização ocorre de forma assíncrona. | Sincronização |
| **RN-04** | Cada flashcard recebe um NanoID imutável no momento da criação. O ID não muda mesmo com edições no texto. | Flashcards |
| **RN-05** | Flashcards são identificados por seu ID no sistema FSRS. Edições no front/back não quebram o histórico de revisões. | FSRS / Flashcards |
| **RN-06** | A taxa de retenção FSRS é configurável por usuário (70-99%, padrão 90%). | FSRS |
| **RN-07** | Deleção de flashcards e cadernos é sempre soft delete (`is_deleted = true`). Dados nunca são removidos imediatamente do servidor. | Dados |
| **RN-08** | Review logs são deduplicados por chave composta `(flashcard_id, reviewed_at)` durante o pull de sincronização. | Sincronização |
| **RN-09** | Cadernos podem ser marcados como públicos (`is_public = true`). Cadernos públicos são visíveis na comunidade sem autenticação do visitante. | Comunidade |
| **RN-10** | Clonar um caderno comunitário cria uma cópia independente com título "(Clone) — título original". | Comunidade |
| **RN-11** | XP é concedido apenas em sessões FSRS (10 XP por revisão). Modo prática simples (`solve`) não concede XP. | Gamificação |
| **RN-12** | Streak é incrementado uma vez por dia. A data da última revisão é comparada com a data atual (sem hora). | Gamificação |
| **RN-13** | Senhas são armazenadas com bcrypt (limite de 72 bytes). O sistema não armazena senhas em texto plano. | Segurança |
| **RN-14** | Tokens JWT expiram em 15 minutos. Ausência de refresh token implica re-autenticação após expiração. | Segurança |
| **RN-15** | Conteúdo Markdown renderizado é sanitizado com DOMPurify antes da exibição (prevenção de XSS). | Segurança |
| **RN-16** | Usuário só acessa dados próprios. O `user_id` do token JWT é obrigatório em todas as queries protegidas. | Segurança |
| **RN-17** | Auto-save do editor de caderno é disparado após 1 segundo de inatividade na digitação. | Cadernos |
| **RN-18** | Flashcards gerados pelo parser de caderno são deduplicados pela normalização do texto `front` (sem espaços extras, lowercase). | Cadernos |
| **RN-19** | Paginação padrão em listagens de flashcards: 20 itens por página. | Performance |
| **RN-20** | O sistema deve funcionar completamente offline após o primeiro login e sync inicial. | Offline |

---

## 4. Requisitos Funcionais

### 4.1 Autenticação e Controle de Acesso

| ID | Requisito | Status |
|---|---|---|
| **RF-01** | O sistema deve permitir registro de usuário com email e senha. | ✅ |
| **RF-02** | O sistema deve autenticar usuários via JWT com expiração configurável. | ✅ |
| **RF-03** | O sistema deve proteger rotas da aplicação exigindo token válido. | ✅ |
| **RF-04** | O sistema deve oferecer login social (Google, Apple). | ❌ |
| **RF-05** | O sistema deve oferecer recuperação de senha via email com link temporário. | ❌ |
| **RF-06** | O sistema deve implementar refresh token para sessões de longa duração. | ❌ |

### 4.2 Flashcards e Cadernos

| ID | Requisito | Status |
|---|---|---|
| **RF-07** | O sistema deve permitir criação, edição e deleção de cadernos em formato Markdown. | ✅ |
| **RF-08** | O sistema deve fazer auto-save do caderno com debounce de 1 segundo. | ✅ |
| **RF-09** | O sistema deve parsear padrão `Q:/A:/Tags:` e gerar flashcards automaticamente. | ✅ |
| **RF-10** | O sistema deve gerar e injetar NanoID em flashcards criados via caderno sem ID. | ✅ |
| **RF-11** | O sistema deve deduplical flashcards por normalização do texto `front`. | ✅ |
| **RF-12** | O sistema deve suportar deleção soft de flashcards e cadernos. | ✅ |
| **RF-13** | O sistema deve oferecer preview em tempo real do Markdown com debounce. | ⚠️ |
| **RF-14** | O sistema deve usar Web Worker para parsing de cadernos com 100+ blocos. | ❌ |
| **RF-15** | O sistema deve usar virtual scroll para renderização de cadernos grandes. | ❌ |
| **RF-16** | O sistema deve suportar busca por tag/termo dentro do editor de caderno com destaque. | ❌ |

### 4.3 Estudo com FSRS

| ID | Requisito | Status |
|---|---|---|
| **RF-17** | O sistema deve calcular cards com revisão pendente usando o algoritmo FSRS V4. | ✅ |
| **RF-18** | O sistema deve permitir avaliação de revisão com 4 níveis (Again/Hard/Good/Easy). | ✅ |
| **RF-19** | O sistema deve recalcular o agendamento FSRS após cada revisão. | ✅ |
| **RF-20** | O sistema deve permitir configurar a taxa de retenção FSRS por usuário. | ✅ |
| **RF-21** | O sistema deve oferecer modo de prática simples (flip card) sem FSRS. | ✅ |
| **RF-22** | O sistema deve calcular e exibir níveis de proficiência (Mastery) por tópico. | ❌ |
| **RF-23** | O sistema deve oferecer mini-games educativos desbloqueados por XP. | ❌ |

### 4.4 Filtragem e Busca

| ID | Requisito | Status |
|---|---|---|
| **RF-24** | O sistema deve filtrar flashcards por tags multi-nível (disciplina, assunto, modalidade, área). | ✅ |
| **RF-25** | O sistema deve buscar flashcards por palavra-chave no front e back. | ✅ |
| **RF-26** | O sistema deve ordenar resultados por data (mais recente / mais antigo). | ✅ |
| **RF-27** | O sistema deve paginar resultados com 20 itens por página. | ✅ |
| **RF-28** | O sistema deve permitir salvar combinações de filtros para reutilização. | ✅ |
| **RF-29** | O sistema deve exibir analytics de desempenho isolados para cada filtro salvo. | ❌ |

### 4.5 Sincronização Offline-First

| ID | Requisito | Status |
|---|---|---|
| **RF-30** | O sistema deve enfileirar operações locais na `syncQueue` quando offline. | ✅ |
| **RF-31** | O sistema deve sincronizar automaticamente ao detectar conexão disponível. | ✅ |
| **RF-32** | O sistema deve resolver conflitos de sincronização por timestamp. | ✅ |
| **RF-33** | O sistema deve suportar operações CRUD de flashcards, cadernos e review logs no push. | ✅ |
| **RF-34** | O sistema deve armazenar assets estáticos no Cache API via Service Worker. | ❌ |
| **RF-35** | O sistema deve armazenar mídias dinâmicas como Blobs no IndexedDB. | ❌ |
| **RF-36** | O sistema deve oferecer painel de controle de armazenamento offline. | ❌ |

### 4.6 Gamificação e Engajamento

| ID | Requisito | Status |
|---|---|---|
| **RF-37** | O sistema deve conceder XP por revisões FSRS (10 XP/card). | ✅ |
| **RF-38** | O sistema deve rastrear e exibir streak de dias consecutivos de estudo. | ✅ |
| **RF-39** | O sistema deve exibir ranking global de usuários por XP. | ✅ |
| **RF-40** | O sistema deve calcular e exibir ranking projetado quando offline. | ✅ |
| **RF-41** | O sistema deve exibir feedback visual (confetti) ao completar revisões. | ✅ |
| **RF-42** | O sistema deve oferecer widget de "continuar de onde parou" na tela inicial. | ❌ |
| **RF-43** | O sistema deve permitir criação de desafios comunitários com código de compartilhamento. | ❌ |
| **RF-44** | O sistema deve permitir criação de metas de estudo com notificações agendadas. | ❌ |

### 4.7 Analytics e Histórico

| ID | Requisito | Status |
|---|---|---|
| **RF-45** | O sistema deve exibir histórico detalhado de revisões com timestamps e grades. | ✅ |
| **RF-46** | O sistema deve exibir contadores de total, cards únicos e revisões do dia. | ✅ |
| **RF-47** | O sistema deve exportar histórico em CSV. | ✅ |
| **RF-48** | O sistema deve exibir gráficos interativos de evolução de desempenho temporal. | ❌ |
| **RF-49** | O sistema deve filtrar o dashboard por período (Hoje/7d/30d/Sempre). | ❌ |
| **RF-50** | O sistema deve exportar histórico em PDF. | ❌ |

### 4.8 Comunidade

| ID | Requisito | Status |
|---|---|---|
| **RF-51** | O sistema deve permitir marcar cadernos como públicos. | ✅ |
| **RF-52** | O sistema deve listar cadernos públicos da comunidade. | ✅ |
| **RF-53** | O sistema deve permitir clonar cadernos públicos para coleção pessoal. | ✅ |

### 4.9 Perfil e Privacidade

| ID | Requisito | Status |
|---|---|---|
| **RF-54** | O sistema deve oferecer fluxo de onboarding guiado no primeiro acesso. | ⚠️ |
| **RF-55** | O sistema deve permitir configuração de preferências de perfil (retenção FSRS, tema). | ✅ |
| **RF-56** | O sistema deve permitir edição de nome, avatar e email com validação de senha. | ❌ |
| **RF-57** | O sistema deve oferecer painel de privacidade (LGPD) com exclusão de dados. | ❌ |
| **RF-58** | O sistema deve suportar exclusão total de conta com remoção de dados em 30 dias. | ❌ |

---

## 5. Campos de Tela

### 5.1 `/login` — Tela de Login

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Email | Input text | Sim | Formato email válido | ✅ |
| Senha | Input password | Sim | Mínimo 8 caracteres | ✅ |
| Botão "Entrar" | Button | — | Submete formulário | ✅ |
| Link "Criar conta" | Link | — | Navega para `/register` | ✅ |
| Link "Esqueci a senha" | Link | — | Inicia recuperação por email | ❌ |
| Botão "Entrar com Google" | Button OAuth | — | OAuth2 Google | ❌ |
| Botão "Entrar com Apple" | Button OAuth | — | OAuth2 Apple | ❌ |
| Mensagem de erro | Alert | — | Exibida em credenciais inválidas (mensagem genérica) | ✅ |

---

### 5.2 `/register` — Cadastro de Usuário

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Email | Input text | Sim | Formato email válido, único no sistema | ✅ |
| Senha | Input password | Sim | Mínimo 8 caracteres | ✅ |
| Confirmar Senha | Input password | Sim | Deve coincidir com Senha | ⚠️ |
| Botão "Criar conta" | Button | — | Submete formulário | ✅ |
| Link "Já tenho conta" | Link | — | Navega para `/login` | ✅ |
| Mensagem de erro | Alert | — | Email já cadastrado, validação falhou | ✅ |

---

### 5.3 `/onboarding` — Configuração Inicial

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Objetivo de estudo | Select/Radio | Sim | Concurso / Vestibular / Certificação / Outro | ❌ |
| Disciplinas de interesse | Multi-select | Não | — | ❌ |
| Meta de retenção FSRS | Slider | Não | 70-99% (padrão 90%) | ❌ |
| Autorizar notificações | Toggle | Não | — | ❌ |
| Botão "Começar" | Button | — | Conclui onboarding | ❌ |
| Link "Pular" | Link | — | Ignora onboarding (configurações padrão) | ❌ |

---

### 5.4 `/notebooks` — Lista de Cadernos

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Lista de cadernos | List/Grid | — | Exibe título, data de atualização, status público | ✅ |
| Botão "Novo Caderno" | Button | — | Abre modal/navega para criação | ✅ |
| Input nome do caderno | Input text | Sim | Mínimo 1 caractere | ✅ |
| Toggle "Público" | Checkbox | Não | — | ✅ |
| Botão "Deletar" por item | Button | — | Confirmação antes de deletar | ✅ |
| Botão "Abrir" por item | Button | — | Navega para `/notebooks/[id]` | ✅ |
| Botão "Estudar (FSRS)" | Button | — | Navega para `/notebooks/study/[id]` | ✅ |
| Botão "Praticar" | Button | — | Navega para `/notebooks/solve/[id]` | ✅ |

---

### 5.5 `/notebooks/[id]` — Editor de Caderno

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Título do caderno | Input text | Sim | Mínimo 1 caractere | ✅ |
| Área de texto Markdown | Textarea | Não | Padrão Q:/A:/Tags: para gerar cards | ✅ |
| Painel de preview | Div renderizado | — | Markdown sanitizado com DOMPurify | ✅ |
| Indicador "Salvo" / "Salvando..." | Label status | — | Atualiza conforme auto-save | ✅ |
| Contador de flashcards parseados | Badge | — | Número de cards detectados no documento | ✅ |
| Botão "Voltar" | Button | — | Retorna para `/notebooks` | ✅ |
| Campo de busca no caderno | Input search | Não | Busca por tag/termo dentro do editor | ❌ |

---

### 5.6 `/practice/questions` — Filtragem de Questões

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Filtro: Disciplinas | Multi-select tags | Não | — | ✅ |
| Filtro: Assuntos | Multi-select tags | Não | — | ✅ |
| Filtro: Modalidade | Select | Não | — | ✅ |
| Filtro: Área | Select | Não | — | ✅ |
| Busca por palavra-chave | Input text | Não | — | ✅ |
| Filtro: Dificuldade | Select | Não | Fácil / Médio / Difícil | ✅ |
| Ordenação | Select | Não | Mais recente / Mais antigo | ✅ |
| Botão "Filtrar" | Button | — | Aplica filtros e pagina resultados | ✅ |
| Botão "Salvar Filtro" | Button | — | Abre input para nomear e salvar | ✅ |
| Nome do filtro salvo | Input text | Sim (ao salvar) | Mínimo 1 caractere | ✅ |
| Lista de filtros salvos | List | — | Exibe filtros salvos com opção de aplicar/deletar | ✅ |
| Lista paginada de flashcards | List | — | 20 itens/página, exibe front, tags, data | ✅ |
| Botão "Carregar mais" | Button | — | Incrementa página | ✅ |
| Botão "Estudar (FSRS)" | Button | — | Inicia `/practice/study/[filterId]` | ✅ |
| Botão "Praticar" | Button | — | Inicia `/practice/solve/[filterId]` | ✅ |

---

### 5.7 `/practice/study/[id]` e `/study` — Sessão de Estudo FSRS

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Card front | Div texto | — | Markdown renderizado | ✅ |
| Botão "Mostrar Resposta" | Button | — | Revela o back do card | ✅ |
| Card back | Div texto | — | Markdown renderizado (oculto até revelar) | ✅ |
| Botão "Again" (0) | Button | — | Avalia revisão como Again | ✅ |
| Botão "Hard" (1) | Button | — | Avalia revisão como Hard | ✅ |
| Botão "Good" (2) | Button | — | Avalia revisão como Good | ✅ |
| Botão "Easy" (3) | Button | — | Avalia revisão como Easy | ✅ |
| Progresso da sessão | Progress bar | — | Cards revisados / total de cards pendentes | ✅ |
| XP ganho na sessão | Badge | — | Exibido ao final da sessão | ✅ |
| Efeito confetti | Animação | — | Disparado ao completar cada card | ✅ |
| Streak atual | Badge | — | Dias consecutivos de estudo | ✅ |
| Tela de conclusão | Modal/Page | — | Resumo da sessão (total, XP, streak) | ✅ |

---

### 5.8 `/practice/solve/[id]` e `/notebooks/solve/[id]` — Prática Simples

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Card front | Div texto | — | Markdown renderizado | ✅ |
| Botão "Virar Card" | Button | — | Revela o back do card | ✅ |
| Card back | Div texto | — | Markdown renderizado (oculto até virar) | ✅ |
| Botão "Errei" | Button | — | Marca como incorreto | ✅ |
| Botão "Acertei" | Button | — | Marca como correto | ✅ |
| Progresso da sessão | Progress bar | — | Cards respondidos / total | ✅ |
| Tela de resumo | Page | — | Total correto / incorreto / percentual | ✅ |

---

### 5.9 `/ranking` — Leaderboard

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Tabela de ranking | Table | — | Posição, nome (email prefix), XP, streak | ✅ |
| Indicador "Você" | Badge | — | Destaca a posição do usuário logado | ✅ |
| XP projetado | Badge | — | XP atual + revisões pendentes de sync | ✅ |
| Indicador online/offline | Badge | — | Status de conexão | ✅ |
| Posição projetada | Text | — | Posição estimada com XP projetado | ✅ |

---

### 5.10 `/history` — Histórico de Estudo

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Total de revisões | Card/Counter | — | Soma de todos review logs | ✅ |
| Cards únicos estudados | Card/Counter | — | Distinct flashcard_id | ✅ |
| Revisões hoje | Card/Counter | — | Revisões com `reviewed_at` hoje | ✅ |
| Tabela de revisões | Table | — | flashcard front, grade, estado, timestamp | ✅ |
| Botão "Exportar CSV" | Button | — | Download do histórico em CSV | ✅ |
| Filtro por período | Tabs/Select | Não | Hoje / 7 dias / 30 dias / Sempre | ❌ |
| Filtro por disciplina | Select | Não | — | ❌ |
| Gráfico de evolução | Chart | — | Taxa de acerto por período | ❌ |
| Botão "Exportar PDF" | Button | — | Download do histórico em PDF | ❌ |

---

### 5.11 `/profile` — Perfil e Preferências

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Nome de usuário | Input text | Não | — | ❌ |
| Avatar | Upload image | Não | — | ❌ |
| Email | Input text | Sim | Formato email válido, único | ❌ |
| Senha atual (para mudanças sensíveis) | Input password | Condicional | — | ❌ |
| Objetivo de estudo | Select | Não | — | ✅ |
| Taxa de retenção FSRS | Slider | Não | 70-99% | ✅ |
| Tema da interface | Toggle | Não | Claro / Escuro | ✅ |
| Preferências de notificação | Toggle | Não | — | ❌ |
| Botão "Salvar" | Button | — | Persiste alterações | ✅ |

---

### 5.12 `/community` — Cadernos da Comunidade

| Campo | Tipo | Obrigatório | Validação | Status |
|---|---|---|---|---|
| Lista de cadernos públicos | List/Grid | — | Título, autor, data de criação | ✅ |
| Botão "Clonar" por item | Button | — | Cria cópia pessoal com "(Clone)" no título | ✅ |
| Preview do conteúdo | Expandable | — | Primeiros caracteres do Markdown | ✅ |
| Busca/filtro de cadernos | Input search | Não | — | ❌ |

---

## Apêndice — Backlog Priorizado

### Alta Prioridade (impacto direto na experiência de estudo)

| ID | Feature | Tipo |
|---|---|---|
| UC-14 | Gráficos interativos de desempenho no `/history` com filtro por período | Melhoria |
| UC-06 | Analytics de desempenho isolados por filtro salvo | Novo |
| UC-22 | Fluxo de onboarding guiado completo | Novo |
| UC-24 | Recuperação de senha via email; refresh token | Melhoria |
| UC-23 | Edição completa de perfil (nome, avatar, email, senha) | Melhoria |

### Média Prioridade (experiência e engajamento)

| ID | Feature | Tipo |
|---|---|---|
| UC-09 | Levels de proficiência (Mastery) por tópico com anéis de progresso | Novo |
| UC-11 | Widget "continuar de onde parou" com restauração de contexto | Melhoria |
| UC-13 | Metas de estudo com timer e notificações via Service Worker | Novo |
| UC-16 | Web Worker para parsing incremental em cadernos grandes | Melhoria |
| UC-17 | Virtual scroll no editor de cadernos | Melhoria |
| UC-19 | Índice invertido e busca no editor de cadernos | Melhoria |
| UC-25 | Exportação PDF do histórico; filtro por disciplina | Melhoria |

### Baixa Prioridade (features avançadas)

| ID | Feature | Tipo |
|---|---|---|
| UC-02 | Cache API para assets estáticos; Blobs para mídias dinâmicas | Melhoria |
| UC-10 | Mini-games educativos com economia de pontos | Novo |
| UC-12 | Desafios comunitários com código de compartilhamento | Novo |
| UC-15 | Painel de gerenciamento de armazenamento offline | Novo |
| UC-26 | Painel de privacidade LGPD com exclusão de conta | Novo |
| RF-04 | Login social (Google, Apple) | Novo |
