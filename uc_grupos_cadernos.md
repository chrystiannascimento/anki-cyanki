# Especificação de Casos de Uso — Subgrupos de Caderno

**Versão:** 1.0 · Junho de 2026  
**Status:** Documento vivo — backlog para implementação

---

## 1. Escopo

Esta especificação descreve a feature de **Subgrupos de Caderno**, uma camada de estudo progressivo e independente do FSRS. O usuário divide um caderno em fatias menores de cards, estuda cada subgrupo isoladamente em modo prática simples e acompanha o desempenho por nota e histórico de sessões.

**Fora do escopo desta feature:**
- Integração com FSRS (subgrupos não atualizam agendamento)
- Concessão de XP, moedas ou streak
- Subgrupos em filtros salvos (apenas em cadernos)
- Sugestão automática de próximo subgrupo a estudar
- Progressão linear obrigatória entre subgrupos

---

## 2. Casos de Uso

### Legenda de Status
- ✅ **Implementado** — Funcionalidade completa e disponível
- ⚠️ **Parcialmente Implementado** — Funcionalidade existe mas incompleta ou simplificada
- ❌ **Não Implementado** — Funcionalidade prevista no backlog, não existe no código

---

### UC-38 — Geração de Subgrupos de Caderno

**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Rota Frontend:** `/notebooks/[id]` (aba ou seção "Subgrupos")  
**Módulos:** `frontend/src/lib/db.ts` (tabelas `notebookGroups`, `groupSessions`), `frontend/src/lib/notebookGroups.ts` (novo)

**Descrição:** O usuário configura e gera subgrupos para um caderno. Os cards são divididos sequencialmente pela ordem do caderno em grupos de tamanho configurável. Os subgrupos são persistidos no IndexedDB com composição fixa (snapshot de `cardIds`), garantindo que o histórico de sessões seja rastreável ao longo do tempo.

**Fluxo Principal:**
1. Usuário acessa `/notebooks/[id]` e navega para a aba/seção "Subgrupos"
2. Sistema verifica se o caderno já possui subgrupos gerados (consulta `notebookGroups` por `notebookId`)
3. Se não existem subgrupos: exibe painel de configuração inicial
4. Usuário define o tamanho dos grupos (input numérico, mínimo 5, padrão 20)
5. Sistema calcula a divisão: `Math.ceil(totalCards / tamanho)` grupos
6. Preview exibe os grupos que serão criados: "6 grupos de até 20 cards"
7. Usuário confirma clicando em "Gerar Subgrupos"
8. Sistema cria registros em `notebookGroups` para cada grupo com `cardIds[]` fixado no momento da criação, nomeados automaticamente ("Grupo 1", "Grupo 2", etc.)
9. Interface transita para a visão de grid de subgrupos

**Fluxo Alternativo — Caderno sem cards:**
- Se `totalCards === 0`, botão "Gerar Subgrupos" fica desabilitado com tooltip "Adicione cards ao caderno antes de gerar subgrupos"

**Exceções:**
- Se o caderno for atualizado (cards adicionados ou removidos) após a geração, exibe banner: "O caderno foi atualizado desde a última geração. Deseja reorganizar os subgrupos?" — reorganização é opcional e requer confirmação (reseta histórico)

**Regras de Negócio:**
- Divisão é **sequencial** pela ordem dos cards no caderno (índice de criação)
- O último grupo pode ter menos cards que o tamanho configurado (ex: 117 cards ÷ 20 = 5 grupos de 20 + 1 grupo de 17)
- `cardIds[]` é um snapshot imutável — cards deletados do caderno permanecem no array mas são ignorados na sessão
- Geração é uma operação única por configuração; alterar o tamanho do grupo exige reorganização completa

---

### UC-39 — Visualização do Painel de Subgrupos

**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Rota Frontend:** `/notebooks/[id]` (aba/seção "Subgrupos")

**Descrição:** Após a geração, o usuário visualiza todos os subgrupos do caderno em um grid de cards. Cada card exibe o estado atual do subgrupo: quantidade de cards, última nota obtida, data da última sessão e mini histórico de sessões recentes.

**Informações exibidas por card de subgrupo:**
- Nome do grupo ("Grupo 1", "Grupo 2"...)
- Quantidade de cards válidos (exclui cards deletados do caderno)
- Última nota obtida: badge colorido com letra (E/D/C/B/A/S) — cinza se nunca estudado
- Data da última sessão em formato relativo ("há 2 dias") — "Nunca estudado" se sem histórico
- Mini histórico: últimas 5 notas em sequência (ex: `E → C → B → B → A`) — vazio se sem histórico
- Botão primário "Estudar"
- Botão secundário "Shuffle" (ícone de embaralhar)

**Indicador de progresso geral (topo do painel):**
- "X de Y grupos masterizados" — considera masterizado quando a última nota é ≥ B
- Barra de progresso proporcional

**Ações globais disponíveis:**
- Botão "Reorganizar grupos" — abre modal de confirmação antes de recriar (ver UC-41)
- Input de configuração de tamanho de grupo (editável; aplicado apenas ao reorganizar)

---

### UC-40 — Sessão de Estudo de Subgrupo

**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Rota Frontend:** `/notebooks/[id]/groups/[groupId]` (rota nova) ou modal fullscreen  
**Módulos:** `frontend/src/lib/notebookGroups.ts`, `frontend/src/lib/db.ts`

**Descrição:** O usuário estuda os cards de um subgrupo em modo prática simples (flip card → Acertei / Errei). Ao finalizar todos os cards, o sistema calcula a nota da sessão e persiste o resultado. O FSRS **não é atualizado**.

**Fluxo Principal:**
1. Usuário clica em "Estudar" no card do subgrupo
2. Sistema carrega os `cardIds[]` do grupo, resolve os cards válidos no Dexie (ignora deletados), aplica a ordem atual (sequencial ou embaralhada se shuffle ativo)
3. Tela de estudo exibe o `front` do card
4. Usuário clica "Mostrar Resposta" (ou pressiona `Espaço`)
5. Card revela o `back` com renderização Markdown
6. Usuário avalia: "Errei" (`←` / `F`) ou "Acertei" (`→` / `J`)
7. Sistema registra resultado em memória (não persiste card a card)
8. Próximo card é exibido; barra de progresso atualiza
9. Ao finalizar todos os cards: tela de resultado (ver UC-40a)
10. Sistema cria registro em `groupSessions` com nota calculada e timestamp

**UC-40a — Tela de Resultado da Sessão:**
- Anel SVG com percentual de acerto (mesmo padrão visual do app)
- Nota da sessão em destaque (letra E a S com cor correspondente)
- Contagem: X acertos de Y cards
- Histórico atualizado: últimas 5 notas do grupo com a nova incluída
- Botão "Estudar novamente" — reinicia a sessão (respeita shuffle atual)
- Botão "Voltar para subgrupos" — retorna ao painel UC-39

**Cálculo da Nota:**

| Nota | Acerto na sessão | Cor do badge |
|------|-----------------|--------------|
| E    | < 40%           | Vermelho     |
| D    | 40–54%          | Laranja      |
| C    | 55–69%          | Âmbar        |
| B    | 70–84%          | Azul         |
| A    | 85–94%          | Índigo       |
| S    | ≥ 95%           | Verde        |

**Regras de Negócio:**
- Sessão não atualiza `CardState` FSRS, não concede XP, não incrementa streak, não adiciona moedas
- Cards deletados do caderno são silenciosamente ignorados na montagem da fila (sem erro para o usuário)
- Se todos os cards do grupo foram deletados, botão "Estudar" exibe tooltip "Todos os cards deste grupo foram removidos do caderno"
- A nota é calculada sobre os cards efetivamente apresentados (excluindo deletados)
- Sessão interrompida (usuário sai antes de finalizar) não gera registro em `groupSessions`

---

### UC-41 — Shuffle e Reorganização de Subgrupos

**Status:** ❌ Não Implementado

**Ator:** Estudante  
**Rota Frontend:** `/notebooks/[id]` (aba/seção "Subgrupos")  
**Módulos:** `frontend/src/lib/notebookGroups.ts`

**Descrição:** O usuário pode embaralhar a ordem de apresentação dos cards dentro de um grupo (shuffle) sem alterar sua composição, ou reorganizar completamente todos os subgrupos do caderno (recriação com reset de histórico).

**Shuffle de grupo:**
1. Usuário clica no botão "Shuffle" (ícone de embaralhar) no card do subgrupo
2. Sistema persiste flag `shuffled: true` e seed de embaralhamento no registro `notebookGroups` do grupo
3. Badge visual "🔀 Embaralhado" aparece no card do grupo
4. Na próxima sessão, cards são apresentados em ordem aleatória derivada do seed
5. Clicar novamente em "Shuffle" gera novo seed (novo embaralhamento)
6. Botão "Ordem original" restaura a ordem sequencial e remove o badge

**Reorganizar todos os grupos:**
1. Usuário clica em "Reorganizar grupos"
2. Modal de confirmação exibe aviso: "Isso irá recriar todos os subgrupos com o novo tamanho configurado. O histórico de sessões de todos os grupos será perdido permanentemente."
3. Usuário confirma
4. Sistema deleta todos os registros de `notebookGroups` e `groupSessions` do caderno
5. Executa nova geração conforme UC-38 com o tamanho atualmente configurado
6. Interface retorna ao estado de grid com grupos sem histórico

**Regras de Negócio:**
- Shuffle é por grupo — cada grupo tem seu próprio estado de embaralhamento
- Reorganização é irreversível; histórico de `groupSessions` é deletado permanentemente
- Tamanho de grupo editado sem clicar em "Reorganizar" não tem efeito — sistema mantém a divisão atual

---

## 3. Regras de Negócio

| ID    | Regra | Contexto |
|-------|-------|----------|
| **RN-SG-01** | Subgrupos são gerados sequencialmente pela ordem dos cards no caderno no momento da geração. | Geração |
| **RN-SG-02** | A composição de cada subgrupo (`cardIds[]`) é imutável após a geração. Cards adicionados ao caderno não entram em subgrupos existentes automaticamente. | Geração |
| **RN-SG-03** | Cards deletados do caderno são ignorados na montagem da sessão, mas permanecem no snapshot `cardIds[]` sem causar erros. | Sessão |
| **RN-SG-04** | A nota é calculada sobre os cards efetivamente apresentados na sessão, excluindo deletados. | Sessão |
| **RN-SG-05** | Sessões de subgrupo não interagem com o algoritmo FSRS — nenhum `CardState` é atualizado. | Sessão |
| **RN-SG-06** | Sessões de subgrupo não concedem XP, moedas nem incrementam streak. | Gamificação |
| **RN-SG-07** | Sessão interrompida (usuário sai antes de finalizar) não gera registro em `groupSessions`. | Sessão |
| **RN-SG-08** | O histórico de sessões mantém os últimos 5 registros por grupo para exibição no painel; registros anteriores são preservados no banco mas não exibidos. | Histórico |
| **RN-SG-09** | Um grupo é considerado "masterizado" para fins do indicador de progresso quando sua **última nota** é ≥ B (≥ 70% de acerto). | Progresso |
| **RN-SG-10** | Reorganização de grupos deleta permanentemente todos os registros de `notebookGroups` e `groupSessions` do caderno. | Reorganização |
| **RN-SG-11** | Shuffle altera apenas a ordem de apresentação dentro da sessão; a composição (`cardIds[]`) do grupo não é alterada. | Shuffle |

---

## 4. Requisitos Funcionais

| ID      | Requisito | Status |
|---------|-----------|--------|
| **RF-SG-01** | O sistema deve permitir configurar o tamanho dos subgrupos (mínimo 5 cards). | ❌ |
| **RF-SG-02** | O sistema deve gerar subgrupos sequencialmente e persistir a composição no IndexedDB. | ❌ |
| **RF-SG-03** | O sistema deve exibir grid de subgrupos com última nota, data da última sessão e mini histórico. | ❌ |
| **RF-SG-04** | O sistema deve executar sessão de prática simples (flip card, Acertei/Errei) por subgrupo. | ❌ |
| **RF-SG-05** | O sistema deve calcular e persistir a nota da sessão (E/D/C/B/A/S) ao finalizar. | ❌ |
| **RF-SG-06** | O sistema deve exibir tela de resultado com anel SVG, nota, acertos e histórico atualizado. | ❌ |
| **RF-SG-07** | O sistema deve suportar shuffle de ordem de apresentação por grupo, com persistência de seed. | ❌ |
| **RF-SG-08** | O sistema deve suportar reorganização completa de subgrupos com confirmação e reset de histórico. | ❌ |
| **RF-SG-09** | O sistema deve exibir indicador de progresso geral ("X de Y grupos masterizados"). | ❌ |
| **RF-SG-10** | O sistema deve ignorar silenciosamente cards deletados do caderno durante a sessão. | ❌ |
| **RF-SG-11** | O sistema deve exibir banner de aviso quando o caderno for atualizado após a geração dos subgrupos. | ❌ |

---

## 5. Schema — IndexedDB / Dexie

### Tabela `notebookGroups`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string (NanoID) | Identificador único do subgrupo |
| `notebookId` | string | FK para o caderno pai |
| `groupIndex` | number | Número sequencial do grupo (1, 2, 3...) |
| `cardIds` | string[] | Snapshot imutável dos IDs dos cards no momento da geração |
| `cardCount` | number | Quantidade de cards no snapshot |
| `groupSize` | number | Tamanho configurado na geração (para referência) |
| `shuffled` | boolean | Indica se shuffle está ativo para este grupo |
| `shuffleSeed` | number \| null | Seed para embaralhamento determinístico |
| `createdAt` | number | Timestamp de criação |
| `synced` | boolean | Controle de sincronização |

**Índices Dexie:** `notebookId`, `[notebookId+groupIndex]`

### Tabela `groupSessions`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string (NanoID) | Identificador único da sessão |
| `groupId` | string | FK para `notebookGroups` |
| `notebookId` | string | FK para o caderno (para queries diretas) |
| `score` | string | Nota da sessão: `'E' \| 'D' \| 'C' \| 'B' \| 'A' \| 'S'` |
| `accuracy` | number | Percentual de acerto (0.0–1.0) |
| `totalCards` | number | Cards apresentados na sessão (excluindo deletados) |
| `correctCards` | number | Cards marcados como acerto |
| `studiedAt` | number | Timestamp de conclusão da sessão |
| `synced` | boolean | Controle de sincronização |

**Índices Dexie:** `groupId`, `notebookId`, `studiedAt`

---

## 6. Campos de Tela

### 6.1 `/notebooks/[id]` — Aba/Seção "Subgrupos"

#### Estado inicial (sem subgrupos gerados)

| Campo | Tipo | Obrigatório | Validação | Status |
|-------|------|-------------|-----------|--------|
| Input "Cards por grupo" | Input number | Não | Mínimo 5, padrão 20 | ❌ |
| Preview "X grupos de até N cards" | Text | — | Calculado dinamicamente | ❌ |
| Botão "Gerar Subgrupos" | Button | — | Desabilitado se caderno sem cards | ❌ |

#### Estado com subgrupos gerados

| Campo | Tipo | Obrigatório | Validação | Status |
|-------|------|-------------|-----------|--------|
| Indicador "X de Y grupos masterizados" | Progress + Text | — | Masterizado = última nota ≥ B | ❌ |
| Barra de progresso geral | Progress bar | — | Proporcional ao indicador | ❌ |
| Grid de cards de subgrupo | Cards | — | Um card por grupo | ❌ |
| — Nome do grupo | Text | — | "Grupo N" | ❌ |
| — Quantidade de cards válidos | Badge | — | Exclui cards deletados | ❌ |
| — Badge de última nota (E–S) | Badge colorido | — | Cinza se nunca estudado | ❌ |
| — Data da última sessão | Text relativo | — | "Nunca estudado" se sem histórico | ❌ |
| — Mini histórico (últimas 5 notas) | Pills sequenciais | — | Vazio se sem histórico | ❌ |
| — Botão "Estudar" | Button primário | — | — | ❌ |
| — Botão "Shuffle" / "Ordem original" | Button ícone | — | Toggle conforme estado atual | ❌ |
| — Badge "🔀 Embaralhado" | Badge | — | Visível quando shuffle ativo | ❌ |
| Input "Cards por grupo" (reconfiguração) | Input number | Não | Mínimo 5 | ❌ |
| Botão "Reorganizar grupos" | Button | — | Abre modal de confirmação | ❌ |

### 6.2 `/notebooks/[id]/groups/[groupId]` — Sessão de Estudo de Subgrupo

| Campo | Tipo | Obrigatório | Validação | Status |
|-------|------|-------------|-----------|--------|
| Label "Grupo N — Caderno X" | Header | — | — | ❌ |
| Card front | Div texto | — | Markdown renderizado | ❌ |
| Botão "Mostrar Resposta" (Espaço) | Button | — | Revela back do card | ❌ |
| Card back | Div texto | — | Markdown renderizado, oculto até revelar | ❌ |
| Botão "Errei" (← / F) | Button | — | Registra erro em memória | ❌ |
| Botão "Acertei" (→ / J) | Button | — | Registra acerto em memória | ❌ |
| Barra de progresso da sessão | Progress bar | — | Cards respondidos / total válidos | ❌ |
| Counter "X de Y" | Text | — | Atualiza a cada card | ❌ |

### 6.3 Tela de Resultado da Sessão

| Campo | Tipo | Obrigatório | Validação | Status |
|-------|------|-------------|-----------|--------|
| Anel SVG com percentual de acerto | Gauge animado | — | Mesmo padrão visual do app | ❌ |
| Nota da sessão em destaque (E–S) | Badge grande colorido | — | Cor conforme tabela de notas | ❌ |
| Contagem "X acertos de Y cards" | Text | — | — | ❌ |
| Mini histórico atualizado (últimas 5) | Pills sequenciais | — | Nova nota incluída | ❌ |
| Botão "Estudar novamente" | Button primário | — | Reinicia sessão com estado de shuffle atual | ❌ |
| Botão "Voltar para subgrupos" | Button secundário | — | Retorna ao painel UC-39 | ❌ |

### 6.4 Modal de Confirmação — Reorganizar Grupos

| Campo | Tipo | Obrigatório | Validação | Status |
|-------|------|-------------|-----------|--------|
| Texto de aviso sobre perda de histórico | Alert vermelho | — | — | ❌ |
| Botão "Cancelar" | Button secundário | — | Fecha modal sem ação | ❌ |
| Botão "Reorganizar e perder histórico" | Button vermelho | — | Executa deleção e recriação | ❌ |