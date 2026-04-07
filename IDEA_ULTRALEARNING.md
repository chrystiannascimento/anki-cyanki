# User Stories — App de Flashcards (Ultralearning)

> Documento de requisitos para implementação via Claude Code.
> Cada história segue o formato: contexto, critérios de aceite e regras técnicas.

---

## ÉPICO 1 — Renderização de Checklist (Sintaxe Obsidian)

### US-01 · Renderizar checklist não marcado

**Como** usuário que escreve cartões em Markdown,
**quero** que a sintaxe `- [ ] critério` seja renderizada como um checkbox visual desmarcado,
**para que** os critérios de acerto apareçam como itens interativos, não como texto bruto.

**Critérios de aceite:**
- `- [ ] texto` renderiza como checkbox desmarcado + texto ao lado
- O checkbox é clicável e alterna para marcado ao ser tocado
- O estado marcado/desmarcado persiste enquanto a sessão do cartão estiver ativa
- Não afeta outros elementos Markdown (listas normais com `-` sem `[ ]` continuam como bullets)

**Regras técnicas:**
- Regex de detecção: `/^- \[( |x)\] (.+)/gm`
- Capturar grupo 1 (`' '` ou `'x'`) para estado inicial e grupo 2 para o texto do critério
- Renderizar como `<label>` com `<input type="checkbox">` para acessibilidade
- Aplicar a regra **antes** do parser geral de listas para evitar conflito

---

### US-02 · Renderizar checklist marcado

**Como** usuário,
**quero** que a sintaxe `- [x] critério` seja renderizada como checkbox já marcado,
**para que** eu possa criar cartões com critérios pré-preenchidos quando necessário.

**Critérios de aceite:**
- `- [x] texto` (case-insensitive: `[X]` também funciona) renderiza como checkbox marcado
- O texto do item marcado recebe estilo visual diferenciado (tachado ou opacidade reduzida)
- O estado inicial `[x]` é respeitado ao abrir o cartão pela primeira vez

---

### US-03 · Contagem e avaliação automática de critérios

**Como** usuário revisando um cartão com critérios de acerto,
**quero** ver um indicador de progresso (ex: "2 de 3 critérios") que atualize em tempo real conforme marco os checkboxes,
**para que** eu saiba quanto falta para passar no cartão sem precisar contar manualmente.

**Critérios de aceite:**
- Contador exibe `N de Total` e atualiza a cada clique no checkbox
- Barra de progresso visual (0% → 100%) acompanha o contador
- Ao atingir 100%, um feedback visual diferenciado aparece (cor, ícone ou mensagem)
- O contador só aparece no verso do cartão (após revelação), nunca na frente

**Regras técnicas:**
- Detectar blocos de checklist pelo parser e contabilizar automaticamente
- Não exigir marcação especial do autor do cartão — a contagem é automática sempre que houver `- [ ]` no corpo do cartão

---

### US-04 · Avaliação por resultado do checklist

**Como** usuário que terminou de marcar os critérios,
**quero** receber um veredito automático (passou / parcial / não passou) baseado na proporção de critérios marcados,
**para que** o algoritmo de repetição espaçada receba a nota correta sem eu precisar escolher manualmente.

**Critérios de aceite:**
- **Passou:** 100% dos critérios marcados → agenda próxima revisão com intervalo longo
- **Parcial:** 50–99% marcados → agenda com intervalo curto
- **Não passou:** abaixo de 50% → agenda para o dia seguinte
- O veredito é exibido visualmente com cor semântica (verde / amarelo / vermelho)
- O usuário pode sobrescrever o veredito manualmente antes de confirmar

**Regras técnicas:**
- Lógica: `score = marcados / total`
- Mapear score para nota do algoritmo de repetição espaçada existente no app
- Se o cartão não tiver nenhum `- [ ]`, usar o fluxo de avaliação manual padrão (sem alteração)

---

## ÉPICO 2 — Integração com IA (Chave do Usuário)

### US-05 · Configurar chave de API

**Como** usuário,
**quero** inserir minha chave de API (OpenAI ou Anthropic) nas configurações do app,
**para que** as funcionalidades de IA fiquem disponíveis sem que o app armazene minha chave em servidores externos.

**Critérios de aceite:**
- Campo de texto tipo `password` para inserção da chave
- Seletor do provedor: OpenAI (GPT-4o) ou Anthropic (Claude Sonnet)
- A chave é armazenada apenas localmente (Keychain no iOS/macOS, EncryptedSharedPreferences no Android, localStorage criptografado na web)
- Botão "Testar conexão" que faz uma chamada mínima e confirma se a chave é válida
- Aviso claro: "Sua chave nunca é enviada para nossos servidores"
- A chave pode ser removida a qualquer momento

**Regras técnicas:**
- Nunca logar ou transmitir a chave para nenhum backend próprio do app
- Todas as chamadas de IA são feitas diretamente do cliente para a API do provedor
- Tratar erros de autenticação (401) com mensagem amigável: "Chave inválida ou expirada"

---

### US-06 · Converter caderno existente em flashcards via IA

**Como** usuário com cadernos (notebooks) já criados no app,
**quero** selecionar um caderno e pedir para a IA transformar seu conteúdo em flashcards classificados (conceito / fato / procedimento),
**para que** eu aproveite minhas anotações existentes sem precisar recriar tudo manualmente.

**Critérios de aceite:**
- Botão "Gerar flashcards com IA" disponível na tela de um caderno
- O usuário pode selecionar páginas/seções específicas ou o caderno inteiro
- Antes de gerar, exibe estimativa: "Isso vai gerar aproximadamente N cartões"
- Exibe progresso da geração (streaming ou barra de carregamento)
- Ao finalizar, mostra preview dos cartões gerados antes de salvar
- O usuário pode editar, excluir ou aprovar cada cartão individualmente no preview
- Após aprovação, os cartões são salvos no caderno de origem ou em um novo deck

**Regras técnicas:**
- Usar o Prompt Master (ver documento `prompt_master_flashcards.md`) como system prompt
- Enviar o conteúdo do caderno como mensagem do usuário
- Parsear a resposta da IA usando as marcações `Tipo:`, `Q:`, `A:`, `Critérios:`, `Tags:`
- Implementar retry automático com backoff exponencial em caso de timeout
- Limitar o conteúdo enviado por chamada a ~6.000 tokens; dividir cadernos grandes em chunks com overlap de contexto
- Preservar tags originais do caderno e mesclar com as tags geradas pela IA

---

### US-07 · Gerar flashcards a partir de prompt livre

**Como** usuário,
**quero** descrever um tema em linguagem natural (ex: "50 cartões sobre análise de ponto de função") e receber os flashcards gerados automaticamente,
**para que** eu crie decks sobre qualquer assunto sem precisar ter o conteúdo-base previamente escrito.

**Critérios de aceite:**
- Campo de texto livre na tela de criação: "Descreva o que quer aprender..."
- Parâmetros opcionais configuráveis antes de gerar:
  - Quantidade de cartões (padrão: 10, máximo: 50 por geração)
  - Tipo forçado (automático / só conceitos / só fatos / só procedimentos)
  - Nível do aprendiz (iniciante / intermediário / avançado)
  - Área/domínio (preenchimento livre, ajuda o modelo a calibrar a linguagem)
- Exibe preview com aprovação individual igual à US-06
- Permite "gerar mais" para adicionar cartões ao deck sem repetir os já criados

**Regras técnicas:**
- Injetar o Prompt Master como system prompt
- Incluir no prompt do usuário os parâmetros opcionais selecionados
- Para "gerar mais": incluir no contexto os títulos/perguntas dos cartões já gerados com instrução de não repetir
- Implementar deduplicação por similaridade da pergunta (comparação simples de string, sem embedding) antes de salvar

---

### US-08 · Revisar e editar cartões gerados por IA antes de salvar

**Como** usuário,
**quero** ver um preview editável de todos os cartões gerados pela IA antes de confirmá-los,
**para que** eu corrija erros, remova cartões inadequados e ajuste critérios sem precisar editar um por um depois de salvar.

**Critérios de aceite:**
- Tela de preview lista todos os cartões gerados em formato expandido (frente + verso + critérios visíveis)
- Cada cartão tem botões: Aprovar / Editar / Descartar
- O tipo (conceito/fato/procedimento) pode ser alterado no preview
- Edição inline: o usuário toca no campo e edita o texto diretamente
- Barra inferior mostra: "X de Y aprovados" e botão "Salvar aprovados"
- Cartões descartados não são salvos e não consomem cota

---

## ÉPICO 3 — Funcionalidades Complementares Sugeridas

### US-09 · Indicador visual de tipo no cartão

**Como** usuário,
**quero** identificar rapidamente se um cartão é de conceito, fato ou procedimento pelo visual,
**para que** eu prepare mentalmente a estratégia correta antes de virar o cartão.

**Critérios de aceite:**
- Badge colorido no canto do cartão: roxo = conceito, âmbar = fato, verde = procedimento
- O tipo é editável na tela de edição do cartão
- Na listagem do deck, o badge aparece em miniatura ao lado do título

---

### US-10 · Intervalo de revisão diferenciado por tipo

**Como** usuário,
**quero** que o algoritmo de repetição espaçada use intervalos diferentes para cada tipo de cartão quando o resultado for "passou",
**para que** o agendamento respeite a velocidade natural de esquecimento de cada tipo de conhecimento.

**Critérios de aceite:**
- Passou em **fato**: multiplicador de intervalo padrão × 1.5 (esquecimento mais lento)
- Passou em **conceito**: multiplicador padrão × 1.0 (padrão do algoritmo)
- Passou em **procedimento**: multiplicador padrão × 1.5 (memória procedimental é estável)
- Os multiplicadores são configuráveis nas preferências avançadas
- Não passou em qualquer tipo: intervalo fixo de 1 dia

---

### US-11 · Modo de estudo "só critérios"

**Como** usuário avançado,
**quero** um modo onde vejo a pergunta, respondo mentalmente e avalio apenas pelos critérios (sem ver o verso completo),
**para que** eu treine o auto-monitoramento sem depender da resposta como muleta.

**Critérios de aceite:**
- Opção "Modo criterioso" na sessão de estudo
- Neste modo, ao revelar o verso, os critérios aparecem primeiro em destaque
- O verso completo fica colapsado com opção "Ver referência completa" discreta
- O modo é configurável por deck (padrão: desativado)

---

### US-12 · Histórico de desempenho por tipo

**Como** usuário,
**quero** ver estatísticas separadas para conceito, fato e procedimento (taxa de acerto, cartões vencidos, tempo médio de resposta),
**para que** eu identifique qual tipo de conhecimento está mais fraco e priorize o estudo.

**Critérios de aceite:**
- Tela de estatísticas com abas: Geral / Conceito / Fato / Procedimento
- Cada aba mostra: taxa de acerto (%), cartões ativos, cartões vencidos, próxima revisão
- Gráfico de linha com evolução da taxa de acerto nos últimos 30 dias
- Destaque visual para o tipo com pior desempenho relativo

---

### US-13 · Exportar deck no formato Obsidian

**Como** usuário que usa o Obsidian como segundo cérebro,
**quero** exportar qualquer deck como arquivo `.md` no formato do Prompt Master,
**para que** eu mantenha os cartões sincronizados com meu vault sem reescrita manual.

**Critérios de aceite:**
- Botão "Exportar para Obsidian" na tela do deck
- Gera um arquivo `.md` com todos os cartões no formato `Q: / A: / Critérios: / Tags:`
- Checkboxes exportados como `- [ ]` (sempre desmarcados — estado de revisão não exporta)
- Cada cartão separado por linha em branco dupla
- Arquivo nomeado automaticamente como `deck-nome-AAAA-MM-DD.md`

---

### US-14 · Importar cartões do formato Obsidian / Prompt Master

**Como** usuário,
**quero** importar um arquivo `.md` no formato do Prompt Master para criar um deck,
**para que** eu aproveite cartões gerados fora do app (ex: pelo Claude diretamente) sem copiar um por um.

**Critérios de aceite:**
- Opção "Importar .md" na tela de criação de deck
- O parser detecta automaticamente os blocos `Tipo: / Q: / A: / Critérios: / Tags:`
- Cartões malformados (sem Q ou sem A) são sinalizados para revisão, não descartados silenciosamente
- Preview de importação igual ao de geração por IA (US-08) antes de confirmar
- Suporta arquivos gerados pelo Anki (formato básico `frente;verso`) como fallback

---

## Mapa de prioridade sugerido

| História | Impacto | Esforço | Prioridade |
|----------|---------|---------|------------|
| US-01 Renderizar checklist | Alto | Baixo | P0 — implementar primeiro |
| US-02 Checklist marcado | Alto | Baixo | P0 |
| US-03 Contador de progresso | Alto | Baixo | P0 |
| US-04 Avaliação automática | Alto | Médio | P0 |
| US-05 Configurar chave API | Alto | Médio | P1 |
| US-06 Converter caderno | Alto | Alto | P1 |
| US-07 Gerar por prompt livre | Alto | Médio | P1 |
| US-08 Preview e edição | Alto | Médio | P1 |
| US-09 Badge de tipo | Médio | Baixo | P2 |
| US-10 Intervalo por tipo | Médio | Médio | P2 |
| US-14 Importar .md | Médio | Médio | P2 |
| US-13 Exportar Obsidian | Médio | Baixo | P2 |
| US-11 Modo criterioso | Baixo | Médio | P3 |
| US-12 Histórico por tipo | Baixo | Alto | P3 |

---

## Notas para o Claude Code

- Implementar US-01 a US-04 primeiro — são pré-requisito para todas as outras histórias fazerem sentido visualmente.
- O Prompt Master está em `prompt_master_flashcards.md` — referenciar diretamente como constante no código, não hardcodar inline.
- O parser de `.md` (US-14) e o parser da resposta da IA (US-06/07) devem compartilhar a mesma função — o formato de saída é idêntico.
- Nunca salvar a chave da API em texto plano. Usar a API de armazenamento seguro da plataforma alvo.
- Toda chamada à API de IA deve ter timeout de 30s e no máximo 3 retries com backoff.