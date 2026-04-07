# Cyanki — Ideias para Próximas Evoluções

**Versão:** 1.0 · Abril de 2026  
**Contexto:** O app já tem núcleo completo (FSRS, offline-first, gamificação, comunidade, analytics, mini-games, privacidade). Estas ideias estendem o que existe sem duplicar funcionalidades já implementadas.

**Legenda de complexidade:** 🟢 Baixa · 🟡 Média · 🔴 Alta  
**Legenda de impacto:** ⭐ Médio · ⭐⭐ Alto · ⭐⭐⭐ Muito alto

---

## 1. Inteligência Artificial no Fluxo de Estudo

### IDEA-01 — Geração Automática de Flashcards com IA
**Complexidade:** 🔴 · **Impacto:** ⭐⭐⭐

O usuário cola um trecho de texto (parágrafo, artigo, anotação) e a IA gera pares Q:/A:/Tags: no formato Markdown já entendido pelo parser do Cyanki. O resultado é inserido diretamente no editor do caderno para revisão antes de salvar.

- Opções de estilo: factual, conceitual, definição, causa-efeito
- Preview antes de inserir — usuário edita antes de confirmar
- Integração: `POST /api/ai/generate-cards { text, style, maxCards }`
- Frontend: modal com textarea de input + lista editável de cards gerados

---

### IDEA-02 — Dica Inteligente Durante a Revisão
**Complexidade:** 🟡 · **Impacto:** ⭐⭐

Botão "💡 Dica" opcional na tela de estudo FSRS. Ao pressionar, exibe uma pista contextual sem revelar a resposta completa — ideal para cards marcados frequentemente como Again.

- Dica gerada pelo back-end com base no `front` do card
- Limite de dicas por sessão (ex: 3 por sessão, para não criar dependência)
- Histórico: cards com ≥2 dicas usadas marcados para revisão prioritária

---

### IDEA-03 — Auto-Sugestão de Tags ao Criar Card
**Complexidade:** 🟡 · **Impacto:** ⭐⭐

Ao salvar um card sem tags no editor, o sistema sugere tags baseadas no conteúdo do `front` + `back`, comparando com tags já existentes na coleção do usuário (local, sem IA externa).

- Algoritmo local: TF-IDF simplificado sobre corpus de tags existentes
- Exibido como pills "Adicionar #math?" abaixo do card no painel
- Zero custo de infra — funciona completamente offline

---

### IDEA-04 — Diagnóstico de Lacunas de Conhecimento
**Complexidade:** 🟡 · **Impacto:** ⭐⭐⭐

Painel em `/mastery` ou separado que analisa padrões de Again/Hard e aponta: "Você erra consistentemente cards sobre [tópico X] nas últimas 2 semanas. Recomendamos revisar estes 8 cards antes de continuar."

- Lógica local: agrupa logs de Again por tag + janela temporal
- Lista os cards "problemáticos" com link direto para estudo FSRS isolado
- Sem IA externa — pura análise dos `reviewLogs` já armazenados

---

## 2. Novos Modos de Estudo

### IDEA-05 — Modo Múltipla Escolha Automático
**Complexidade:** 🟡 · **Impacto:** ⭐⭐⭐

Transforma qualquer flashcard em questão de múltipla escolha com 4 opções — 1 correta + 3 distractors gerados automaticamente a partir de outros cards da mesma tag.

- Distractor selection: backs de cards da mesma tag, diferentes do correto
- Fallback: se < 3 cards na tag, usa backs de cards de outras tags
- Modo ativável em `/practice/solve` com toggle "Múltipla Escolha"
- XP diferente (ex: 5 XP em vez de 10 — mais fácil que FSRS)

---

### IDEA-06 — Modo Digitação de Resposta
**Complexidade:** 🟢 · **Impacto:** ⭐⭐

Ao invés de flip card, o usuário digita a resposta. O sistema compara com o `back` usando similaridade de texto (distância de Levenshtein normalizada) e aceita respostas "quase corretas" com aviso.

- Tolerância configurável: exata / 80% similar / qualquer tentativa
- Útil para vocabulário de idiomas e fórmulas curtas
- Toggle por sessão — não altera fluxo FSRS existente

---

### IDEA-07 — Modo Revisão Relâmpago (Blitz)
**Complexidade:** 🟢 · **Impacto:** ⭐⭐

Cards pendentes do dia exibidos em sequência rápida sem animações. Usuário marca Sei/Não Sei com teclado (`J`/`F`). Ao finalizar, sincroniza como `Good`/`Again` no FSRS.

- Ideal para revisões rápidas no celular durante transporte
- Interface minimalista: só o front + dois botões grandes
- Rota: `/study/blitz` acessível pelo Dashboard

---

### IDEA-08 — Estudo Colaborativo em Tempo Real
**Complexidade:** 🔴 · **Impacto:** ⭐⭐

Dois ou mais usuários estudam o mesmo desafio simultaneamente. Cada um responde independentemente; ao final compara-se o desempenho lado a lado.

- Baseado na infra de desafios (UC-12) já existente
- Canal WebSocket `/ws/challenge/{code}/session`
- Placar em tempo real durante a sessão
- Sem compartilhar respostas entre participantes durante o jogo

---

## 3. Importação e Exportação de Conteúdo

### IDEA-09 — Importar de CSV
**Complexidade:** 🟢 · **Impacto:** ⭐⭐⭐

Upload de `.csv` com colunas `front,back,tags` que converte automaticamente para o formato Markdown do Cyanki e cria um novo caderno.

- Parser front-end puro (FileReader API) — sem upload ao servidor
- Preview dos primeiros 10 cards antes de confirmar
- Compatível com exports do Anki (formato simples) e Quizlet
- Rota: modal em `/notebooks` com botão "Importar CSV"

---

### IDEA-10 — Importar de PDF / Texto
**Complexidade:** 🔴 · **Impacto:** ⭐⭐⭐

Upload de PDF ou texto longo. O back-end extrai o texto (PDF.js no frontend ou pdfminer no backend) e usa IA para gerar cards no formato Markdown.

- Pipeline: PDF → texto puro → chunking → geração de cards por chunk
- Progresso em tempo real via SSE (`/api/ai/import-pdf`)
- Resulta em rascunho de caderno para revisão antes de salvar
- Combina com IDEA-01 (geração via IA)

---

### IDEA-11 — Exportar para Anki (.apkg)
**Complexidade:** 🔴 · **Impacto:** ⭐⭐

Exporta um caderno como arquivo `.apkg` compatível com o Anki Desktop, permitindo migração de saída sem lock-in.

- Biblioteca: `genanki` (Python, backend) ou implementação JS custom
- Mapeia FSRS state → Anki scheduling aproximado
- Opção no painel de Storage e na página de cadernos

---

### IDEA-12 — Extensão de Navegador para Clipping
**Complexidade:** 🔴 · **Impacto:** ⭐⭐

Extensão Chrome/Firefox que permite selecionar texto em qualquer página web e criar um card diretamente no Cyanki, com a URL da fonte salva como metadado.

- Background script envia `POST /api/notebooks/{id}/quick-add`
- Popup com campo de seleção de caderno destino e tag
- Fonte/URL armazenada no campo `back` como referência

---

## 4. Analytics e Visualizações Avançadas

### IDEA-13 — Heatmap de Atividade (Estilo GitHub)
**Complexidade:** 🟢 · **Impacto:** ⭐⭐

Grid anual de quadradinhos coloridos por intensidade de estudo (quantidade de revisões por dia). Disponível em `/history` e no perfil público.

- Dados: agrega `reviewLogs` por `date(reviewed_at)` — já existentes
- Renderização: SVG ou CSS grid puro, sem libs externas
- Tooltip hover com data + quantidade de revisões
- Streak máximo histórico destacado

---

### IDEA-14 — Curva de Esquecimento por Card
**Complexidade:** 🟡 · **Impacto:** ⭐⭐

Para cada card, exibir um mini-gráfico da curva de retenção estimada ao longo do tempo, mostrando como o FSRS agenda a próxima revisão e o decaimento esperado.

- Dados: estado FSRS atual do card (`stability`, `difficulty`, `due`)
- Cálculo: `R(t) = e^(-t/S)` com `S` do ts-fsrs
- Exibido na tela de detalhes do card (hover/modal)
- Valor educativo: mostra ao usuário como o algoritmo funciona

---

### IDEA-15 — Relatório Semanal por Email / Notificação
**Complexidade:** 🟡 · **Impacto:** ⭐⭐⭐

Toda segunda-feira, o sistema envia (ou exibe como notificação push) um resumo da semana: cards revisados, taxa de acerto, tópico mais fraco, tópico mais forte, streak, XP ganho.

- Push: Service Worker + backend com Web Push API
- Email: `POST /api/notifications/weekly-digest` agendado via cron no backend
- Template HTML simples, sem dependências de email marketing
- Toggle nas preferências do perfil (opt-in)

---

### IDEA-16 — Previsão de Cards a Vencer
**Complexidade:** 🟢 · **Impacto:** ⭐⭐⭐

Dashboard no topo do `/study` ou `/dashboard` mostrando: "Você tem 12 cards vencendo hoje, 34 amanhã, 8 na quarta." Ajuda o usuário a planejar as sessões de estudo.

- Lógica: `getDueCards(date)` para +1, +2, +3, +7 dias
- Gráfico de barras CSS simples por dia da semana
- Já tem toda a infra necessária (FSRS states no Dexie)

---

## 5. Comunidade e Social

### IDEA-17 — Perfil Público do Usuário
**Complexidade:** 🟡 · **Impacto:** ⭐⭐

Página `/u/[username]` com: nome de exibição, avatar por iniciais, XP, nível, streak máximo, cadernos públicos, heatmap de atividade e conquistas desbloqueadas.

- `username` derivado do prefixo do email ou definido pelo usuário
- Dados de XP/streak já persistidos no backend via sync
- Privacidade: toggle "perfil público" nas configurações

---

### IDEA-18 — Conquistas (Achievements / Badges)
**Complexidade:** 🟡 · **Impacto:** ⭐⭐⭐

Sistema de conquistas desbloqueadas por marcos: primeiro caderno criado, 100 revisões, 7 dias de streak, primeiro desafio completado, Mestre em 3 tópicos, etc.

- ~20 conquistas iniciais armazenadas no `localStorage` + sincronizadas
- Animação de desbloqueio (similar ao confetti já existente)
- Exibidas no perfil público e no dashboard
- Extendem a economia de engajamento já existente (XP + coins + streak)

---

### IDEA-19 — Comentários em Cadernos Públicos
**Complexidade:** 🟡 · **Impacto:** ⭐

Usuários logados podem deixar comentários em cadernos públicos na comunidade. Formato simples (texto, sem threads).

- Endpoint: `GET/POST /api/notebooks/{id}/comments`
- Moderação básica: dono do caderno pode deletar comentários
- Paginação: 10 comentários por vez

---

### IDEA-20 — Seguir / Favoritar Cadernos da Comunidade
**Complexidade:** 🟢 · **Impacto:** ⭐⭐

Usuário pode favoritar cadernos públicos sem clonar. Feed personalizado em `/community` mostra atualizações dos cadernos favoritados.

- Tabela `favorites` no Dexie + sincronização
- Badge "X favoritos" no card do caderno na listagem pública
- Aba "Meus Favoritos" em `/community`

---

## 6. Acessibilidade e UX

### IDEA-21 — Guia de Atalhos de Teclado (Overlay)
**Complexidade:** 🟢 · **Impacto:** ⭐⭐

Pressionar `?` em qualquer tela abre um modal com todos os atalhos disponíveis naquele contexto. Atalhos já existem (Espaço, J, F, Ctrl+F) mas não há documentação in-app.

- Mapeamento estático por rota: cada página registra seus atalhos
- Modal com lista de `[atalho] → ação` formatada
- Fechável com Esc ou `?` novamente

---

### IDEA-22 — Ajuste de Fonte e Contraste
**Complexidade:** 🟢 · **Impacto:** ⭐

Nas preferências do perfil: slider de tamanho de fonte base (pequena/normal/grande/extra-grande) e modo alto contraste. Persistido no `localStorage` e aplicado via variáveis CSS.

- `document.documentElement.style.setProperty('--font-size-base', value)`
- 4 tamanhos: 14px / 16px / 18px / 20px
- Alto contraste: paleta alternativa via classe CSS `.high-contrast`

---

### IDEA-23 — Texto-para-Fala nos Cards (TTS)
**Complexidade:** 🟢 · **Impacto:** ⭐⭐

Botão 🔊 nos cards de estudo que usa `window.speechSynthesis` para ler o `front` ou `back` em voz alta. Útil para aprendizado de idiomas.

- API nativa do browser — zero dependências
- Seletor de idioma por caderno (ex: "en-US", "es-ES", "pt-BR")
- Toggle global nas preferências do perfil

---

### IDEA-24 — Modo de Leitura para Cadernos
**Complexidade:** 🟢 · **Impacto:** ⭐

Botão "Modo Leitura" no editor de caderno oculta o textarea e exibe apenas o preview Markdown em largura confortável (max-width: 680px), sem distrações.

- Atalho: `Ctrl+Shift+R`
- Ideal para revisar o conteúdo de um caderno antes de estudar
- Sai do modo com Esc ou clicando no botão novamente

---

## 7. PWA e Mobile

### IDEA-25 — Prompt de Instalação Inteligente (PWA)
**Complexidade:** 🟢 · **Impacto:** ⭐⭐⭐

Banner discreto no Dashboard que aparece após o 3º acesso ao app sugerindo instalar o Cyanki como PWA. Usa o evento `beforeinstallprompt` para acionar a instalação nativa.

- Banner dismissível com "Não mostrar novamente" (localStorage flag)
- Exibe benefícios: acesso offline, ícone na tela inicial, experiência nativa
- Já tem Service Worker registrado — instalação é trivial

---

### IDEA-26 — Gestos de Swipe nos Cards (Mobile)
**Complexidade:** 🟡 · **Impacto:** ⭐⭐⭐

Em telas touch, swipe left = Errei/Again, swipe right = Acertei/Good, swipe up = Easy, swipe down = Hard. Substitui os botões para estudo mais fluido no celular.

- Detecção: `touchstart` / `touchend` com delta X/Y
- Feedback visual: indicador colorido de direção durante o swipe
- Fallback: botões permanecem visíveis para quem não usar gestos

---

### IDEA-27 — Widget de Progresso Diário (PWA)
**Complexidade:** 🔴 · **Impacto:** ⭐

Widget na tela inicial do Android/iOS mostrando: cards pendentes hoje, streak atual, % da meta diária. Requer API de Widgets (Android 12+ / iOS 16+) ou Shortcuts.

- Android: `android.appwidget` via Trusted Web Activity
- iOS: App Clips / Shortcuts como alternativa
- Dados: Service Worker lê Dexie e retorna contagens ao widget

---

## 8. Gamificação Avançada

### IDEA-28 — Liga Semanal (Seasons)
**Complexidade:** 🟡 · **Impacto:** ⭐⭐⭐

Ranking semanal separado do ranking global. A cada domingo, os top 10 da liga sobem de divisão (Bronze → Prata → Ouro → Diamante). Reset semanal com prêmio de moedas para os vencedores.

- Divisões: Bronze / Prata / Ouro / Diamante / Mestre
- XP da semana (não acumulado) define posição na liga
- Grupos de ~20 pessoas por divisão (matchmaking por XP histórico)
- Prêmio: 50–200 moedas conforme posição final

---

### IDEA-29 — Missões Diárias / Semanais
**Complexidade:** 🟡 · **Impacto:** ⭐⭐⭐

3 missões diárias rotativas e 1 missão semanal. Exemplos: "Revise 10 cards de #math", "Complete uma sessão sem erros", "Estude por 20 minutos", "Crie 5 novos cards".

- Geradas algoritmicamente com base nas tags mais frequentes do usuário
- Recompensas: moedas + XP bônus
- Progresso rastreado localmente nos `reviewLogs` e `studyTimer`
- Exibidas no Dashboard como cards clicáveis

---

### IDEA-30 — Conquistas de Time (Clan / Grupo de Estudo)
**Complexidade:** 🔴 · **Impacto:** ⭐⭐

Grupos de até 5 pessoas com meta coletiva semanal (ex: "Revisar 500 cards no total"). Progresso agregado em tempo real com ranking interno do grupo.

- Backend: tabela `study_groups` com membros e metas
- Sincronização de contribuições individuais no push/pull
- Interface simples: nome do grupo, código de convite, placar coletivo

---

## 9. Editor de Cadernos

### IDEA-31 — Suporte a Cloze Deletion
**Complexidade:** 🟡 · **Impacto:** ⭐⭐⭐

Novo tipo de card: `Q: A capital do Brasil é {{Brasília}}.` onde o texto entre `{{}}` é ocultado. Parser detecta o padrão e gera um card de lacuna preenchida.

- Sintaxe: `{{resposta}}` no campo Q: (sem campo A: separado)
- Múltiplas lacunas no mesmo card = múltiplos cards gerados
- Renderização: texto com `[___]` no lugar da lacuna durante o estudo
- Compatível com o parser incremental/Worker existente (regex adicional)

---

### IDEA-32 — Templates de Cards Prontos
**Complexidade:** 🟢 · **Impacto:** ⭐⭐

Botão "Inserir template" no editor que insere snippets pré-formatados: Definição, Fórmula, Vocabulário (idiomas), Causa-Efeito, Data histórica, Código de programação.

- Templates como strings estáticas inseridas na posição do cursor
- 6–8 templates iniciais, expansível por configuração
- Atalho: `Ctrl+T` abre picker de templates

---

### IDEA-33 — Suporte a Fórmulas LaTeX / KaTeX
**Complexidade:** 🟡 · **Impacto:** ⭐⭐⭐

Renderizar expressões matemáticas em cards usando `$...$` (inline) e `$$...$$` (bloco). Essencial para física, química, matemática e engenharia.

- Biblioteca: KaTeX (< 300 KB gzipped, mais rápida que MathJax)
- Integração: pós-processamento do HTML gerado pelo Marked.js
- Auto-escape: KaTeX sanitiza por padrão — sem risco de XSS adicional

---

### IDEA-34 — Histórico de Versões do Caderno
**Complexidade:** 🟡 · **Impacto:** ⭐

A cada auto-save, armazena um snapshot comprimido do conteúdo no Dexie (tabela `notebookHistory`). Usuário pode visualizar versões anteriores e restaurar.

- Retenção: últimas 20 versões por caderno
- Diff visual: destaque do que mudou entre versões (adições/remoções)
- UI: modal "Histórico" no header do editor com timeline

---

## 10. Backend e Infraestrutura

### IDEA-35 — Webhooks de Eventos de Estudo
**Complexidade:** 🟡 · **Impacto:** ⭐

API para desenvolvedores: o usuário configura uma URL que recebe um POST quando eventos ocorrem (sessão concluída, meta atingida, streak quebrado). Permite integração com Zapier, Make, etc.

- Eventos: `session.completed`, `goal.achieved`, `streak.broken`, `card.mastered`
- Payload JSON com dados do evento e contexto
- Configurável em `/profile` (seção Developer / Integrações)

---

### IDEA-36 — Integração com Google Calendar
**Complexidade:** 🟡 · **Impacto:** ⭐⭐

Sincroniza metas de estudo e sessões do timer com Google Calendar. Cria eventos futuros de revisão com base nos cards vencendo nos próximos 7 dias.

- OAuth Google Calendar já viabilizado pelo ambiente
- Cria evento "Revisar X cards de #tag" com duração estimada (2 min/card)
- Toggle nas configurações do perfil: "Sincronizar com Google Calendar"

---

### IDEA-37 — API Pública (Read-Only)
**Complexidade:** 🟡 · **Impacto:** ⭐

Endpoints públicos autenticados por API key que permitem leitura de estatísticas pessoais: `GET /api/v1/stats`, `GET /api/v1/cards`, `GET /api/v1/streaks`. Útil para dashboards externos (Notion, Obsidian plugins, scripts pessoais).

- API key gerada em `/profile` (seção Developer)
- Rate limit: 100 req/dia no plano gratuito
- Documentação Swagger/OpenAPI gerada automaticamente pelo FastAPI

---

## Resumo por Prioridade Sugerida

### Impacto Alto + Baixa Complexidade (implementar primeiro)
| ID | Feature |
|---|---|
| IDEA-03 | Auto-sugestão de tags (local, offline) |
| IDEA-13 | Heatmap de atividade estilo GitHub |
| IDEA-16 | Previsão de cards a vencer (próximos 7 dias) |
| IDEA-21 | Overlay de atalhos de teclado |
| IDEA-23 | Texto-para-fala nos cards (TTS nativo) |
| IDEA-24 | Modo leitura no editor de cadernos |
| IDEA-25 | Prompt de instalação PWA inteligente |
| IDEA-32 | Templates de cards prontos |

### Impacto Alto + Complexidade Média (segunda rodada)
| ID | Feature |
|---|---|
| IDEA-04 | Diagnóstico de lacunas de conhecimento |
| IDEA-05 | Modo múltipla escolha automático |
| IDEA-09 | Importar de CSV |
| IDEA-18 | Sistema de conquistas (Achievements) |
| IDEA-26 | Gestos de swipe nos cards (mobile) |
| IDEA-28 | Liga semanal com divisões |
| IDEA-29 | Missões diárias / semanais |
| IDEA-31 | Suporte a Cloze Deletion |
| IDEA-33 | Fórmulas LaTeX / KaTeX |

### Impacto Alto + Alta Complexidade (médio/longo prazo)
| ID | Feature |
|---|---|
| IDEA-01 | Geração automática de cards com IA |
| IDEA-08 | Estudo colaborativo em tempo real |
| IDEA-10 | Importar de PDF com IA |
| IDEA-11 | Exportar para Anki (.apkg) |
| IDEA-12 | Extensão de navegador para clipping |
| IDEA-30 | Grupos de estudo com meta coletiva |
