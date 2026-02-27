## Overview

The project is an adaptive, resilient, and continuous learning ecosystem. The requirement for robust "offline-first" operation combined with the instant interactivity necessary for problem-solving and simulations dictates the choice of a client-centric architecture.

In this model, the user's device (whether an entry-level Android smartphone or a high-performance desktop) acts as the primary source of truth during the study session. The server assumes a secondary role of synchronization, backup, and integrity arbitration, but never of blocking interaction. This approach eliminates network latency, allowing the study flow—the cognitive "flow"—to remain uninterrupted, a critical characteristic for knowledge retention and long-term user engagement.

## Deployment

I will install this as a docker container in my home server, and I will expose it through cloudflare tunnel and zero trust, it will have a proper frankmega.example.com domain with TLS. so I need a lean production ready docker configuration.

## Tech Stack

- Svelte for frontend.
- Dexie.js for clientside storage for offline purpose
- backend in pytho(fastapi)
- UI should be Tailwind CSS, as clean as possible
- Every important feature must have a unit test associated, I need good coverage;
- make this work properly in development mode, and only consider the real domain in production mode.
- ci script before every git commit
- security locks must be less restrict in development so I can test (make that configurable and document in readme)
- it would be good to add security focused tests such as if rate limits in important endpoints, band, ttls are correctly working (could be integration tests)
- always update readme with important configuration aspects
- always check proper http headers such as csp, etc.

## Use Cases

**Catálogo de Use Cases**

Plataforma de Estudos — Especificação Funcional

_Versão 2.0 · fevereiro de 2026_

**Categorias Cobertas**

*   **Offline & Sincronização** — 3 use cases
*   **Filtragem & Busca** — 3 use cases
*   **Estudo & Aprendizado** — 4 use cases
*   **Gamificação & Engajamento** — 2 use cases
*   **Metas & Notificações** — 1 use case
*   **Desempenho & Análise** — 1 use case
*   **Gerenciamento de Conteúdo** — 1 use case
*   **Cadernos & Flashcards** — 6 use cases
*   **Usuário** — 5 use cases

**01\. Offline & Sincronização**

**UC-01 UI Otimista com Fila de Sincronização**

**Ator:** Estudante

**Descrição:** Ao responder uma questão ou completar uma lição, a interface e o banco de dados local são atualizados instantaneamente para garantir feedback imediato. A ação é enfileirada e sincronizada silenciosamente com o servidor em segundo plano (via Service Worker) assim que a conexão com a internet for restabelecida.

**Pré-condições:** Usuário autenticado. Pode estar offline.

**Fluxo Principal:** Usuário interage com a questão → Interface atualiza localmente de forma imediata → Ação é gravada na fila local → Service Worker detecta conexão disponível → Sincronização ocorre silenciosamente com o servidor.

**Exceções / Fluxos Alternativos:** Conflito de sincronização: servidor resolve pelo registro mais recente. Falha persistente: notificação discreta ao usuário.

**Pós-condições:** Dados locais e remotos consistentes. Histórico de progresso preservado.

**UC-02 Armazenamento Separado para Conteúdo Offline**

**Ator:** Sistema

**Descrição:** Para garantir alto desempenho no acesso ao conteúdo offline (lições e cadernos), o sistema separa inteligentemente o armazenamento no dispositivo: assets estáticos de interface vão para o API Cache, enquanto mídias dinâmicas (imagens e vídeos de questões) são salvas nativamente como Blobs no banco de dados local (IndexedDB). Isso evita lentidão do formato Base64 e permite controle refinado de espaço.

**Pré-condições:** Aplicativo instalado como PWA.

**Fluxo Principal:** Download de conteúdo iniciado → Assets estáticos armazenados no Cache API → Mídias dinâmicas convertidas para Blob e salvas no IndexedDB → Sistema registra metadados de controle de espaço.

**Exceções / Fluxos Alternativos:** Armazenamento insuficiente: exibe alerta e solicita limpeza de pacotes antigos.

**Pós-condições:** Conteúdo disponível offline com performance otimizada.

**UC-03 Ranking Sincronizado e Projeção Offline**

**Ator:** Estudante

**Descrição:** Para estimular a competição saudável, o sistema exibe um ranking global de estudantes calculado no servidor e atualizado periodicamente no banco de dados local. Se o usuário estiver offline, a gamificação não é interrompida: o app calcula instantaneamente um 'Ranking Projetado', somando a pontuação de questões resolvidas offline ao último ranking conhecido.

**Pré-condições:** Ranking previamente carregado no banco local.

**Fluxo Principal:** Usuário acessa ranking → Sistema verifica conexão → Se offline: calcula projeção com pontos pendentes → Exibe ranking projetado com indicação visual → Ao reconectar: sincroniza e exibe ranking real.

**Exceções / Fluxos Alternativos:** Divergência > 20% entre projeção e ranking real: exibe aviso de atualização.

**Pós-condições:** Usuário visualiza posição estimada ou real de forma contínua.

**02\. Filtragem & Busca**

**UC-04 Indexação Otimizada para Filtros Avançados Offline**

**Ator:** Sistema

**Descrição:** Para habilitar buscas complexas e instantâneas no dispositivo do usuário (como cruzamento de disciplinas, bancas, nível de dificuldade e histórico de erros), o banco de dados local (IndexedDB via Dexie) emprega um modelo de índices estruturados, superando as limitações de consultas do browser sem SQL nativo.

**Pré-condições:** Banco local populado com questões e índices criados.

**Fluxo Principal:** Usuário define critérios de filtro → Sistema identifica índice mais restritivo → Primeira busca no volume de dados pelo índice → Refinamento em memória com critérios adicionais → Resultado paginado exibido.

**Exceções / Fluxos Alternativos:** Volume excessivo em memória: aplica streaming por lotes de 100 itens.

**Pós-condições:** Resultados precisos exibidos em menos de 300ms.

**UC-05 Filtragem Multidimensional Avançada Offline**

**Ator:** Estudante

**Descrição:** Para suportar buscas por múltiplos critérios (disciplinas, tópicos, dificuldade) sem travar a interface, o sistema adota estratégia de duas etapas de alta performance: primeiro busca o volume de dados usando o índice mais restritivo, depois refina os detalhes finais diretamente na memória do dispositivo, garantindo resultados precisos e paginação fluida.

**Pré-condições:** Usuário com banco de questões local carregado.

**Fluxo Principal:** Usuário seleciona múltiplos filtros → Sistema aplica busca pelo índice mais seletivo → Refina resultado em memória → Pagina e renderiza os primeiros 20 resultados → Carrega mais ao rolar.

**Exceções / Fluxos Alternativos:** Combinação sem resultados: sugere relaxar filtros automaticamente.

**Pós-condições:** Lista de questões filtradas exibida de forma fluida e paginada.

**UC-06 Análise de Desempenho por Filtros Salvos**

**Ator:** Estudante

**Descrição:** Para permitir acompanhamento focado e altamente personalizado, o sistema cria 'visualizações virtuais' sempre que o usuário salva uma combinação de filtros. Ao acessar o painel de desempenho, o app executa dinamicamente esses critérios no banco local, isolando e exibindo instantaneamente as estatísticas únicas daquela área específica (ex: desempenho apenas em Direito Civil).

**Pré-condições:** Usuário possui ao menos um filtro salvo.

**Fluxo Principal:** Usuário acessa painel de desempenho → Seleciona filtro salvo → Sistema executa query no banco local → Calcula taxa de acerto, volume e evolução → Exibe gráfico isolado para aquele contexto.

**Exceções / Fluxos Alternativos:** Filtro salvo sem questões respondidas: exibe estado vazio com orientação.

**Pós-condições:** Dashboard exibe métricas específicas para a área de estudo selecionada.

**03\. Estudo & Aprendizado**

**UC-07 Resolução de Questões com Feedback em Tempo Real**

**Ator:** Estudante

**Descrição:** Ao escolher uma resposta, o usuário vê instantaneamente o resultado (correto ou incorreto) junto com a explicação da questão. Essa interação registra a resposta no banco local e usa a reatividade do sistema (Svelte e liveQuery) para atualizar imediatamente os indicadores de desempenho do estudante na barra superior da interface, garantindo experiência fluida sem delays.

**Pré-condições:** Sessão de questões iniciada.

**Fluxo Principal:** Usuário seleciona alternativa → Sistema registra resposta localmente → Interface exibe resultado e explicação → Indicadores da barra superior atualizam via liveQuery → Algoritmo SRS recalcula próxima revisão.

**Exceções / Fluxos Alternativos:** Toque acidental: opção de desfazer disponível por 3 segundos.

**Pós-condições:** Resposta registrada, feedback exibido, indicadores atualizados.

**UC-08 Estudo Contínuo com Repetição Espaçada (FSRS)**

**Ator:** Estudante

**Descrição:** Para maximizar a retenção de memória a longo prazo, a funcionalidade de Estudo Contínuo incorpora o algoritmo FSRS (Free Spaced Repetition Scheduler). O FSRS usa modelagem preditiva para calibrar dinamicamente a curva de esquecimento de cada estudante, permitindo definir taxa de retenção desejada (ex: 90%) e priorizando questões cujo prazo de revisão já passou.

**Pré-condições:** Histórico de respostas disponível para calibração.

**Fluxo Principal:** Usuário inicia sessão de estudo → Sistema calcula questões com revisão pendente via FSRS → Ordena por urgência de revisão → Após cada resposta, recalcula dificuldade e data da próxima revisão → Atualiza banco local.

**Exceções / Fluxos Alternativos:** Primeira sessão sem histórico: inicia com parâmetros padrão do FSRS.

**Pós-condições:** Cronograma de revisões otimizado e atualizado no banco local.

**UC-09 Mestria e Níveis de Proficiência**

**Ator:** Estudante

**Descrição:** Para medir o real domínio do estudante sobre os tópicos, o sistema adota um mecanismo de Mastery (Iniciante, Familiarizado, Proficiente e Mestre) que vai além de acertos e erros. O cálculo dinâmico considera desempenho recente, peso da dificuldade das questões e o decaimento natural gerado pelo tempo sem prática. Anéis de progresso na interface regridem visualmente se o estudante ficar muito tempo sem revisar.

**Pré-condições:** Usuário com histórico de respostas em determinado tópico.

**Fluxo Principal:** Sistema calcula nível de mastery por tópico → Considera acertos recentes, dificuldade e última revisão → Atualiza anéis de progresso na interface → Se inatividade > limiar: decai nível e notifica usuário.

**Exceções / Fluxos Alternativos:** Tópico sem questões suficientes: exibe nível 'Indefinido' com orientação.

**Pós-condições:** Nível de proficiência atual exibido e histórico de evolução registrado.

**UC-10 Mini-Games Educativos e Economia de Pontos**

**Ator:** Estudante

**Descrição:** Para quebrar a monotonia do estudo tradicional e aumentar o engajamento diário, o sistema oferece mini-games educativos dinâmicos (como desafios cronometrados e jogos de memória). O acesso às atividades lúdicas funciona como recompensa, desbloqueado exclusivamente por pontos ganhos em sessões de repetição espaçada, criando uma economia circular que incentiva a disciplina.

**Pré-condições:** Usuário possui pontos suficientes para desbloquear o mini-game.

**Fluxo Principal:** Usuário completa sessão de repetição espaçada → Recebe pontos → Acessa seção de mini-games → Sistema verifica saldo → Mini-game desbloqueado é iniciado → Resultado reforça conteúdo estudado.

**Exceções / Fluxos Alternativos:** Pontos insuficientes: exibe quantos pontos faltam e sugere sessão de estudo.

**Pós-condições:** Mini-game concluído, conteúdo reforçado, histórico de pontos atualizado.

**04\. Gamificação & Engajamento**

**UC-11 Estudo Contínuo e Gamificação (Streak)**

**Ator:** Estudante

**Descrição:** Para estimular o engajamento diário e facilitar o retorno rápido aos estudos, um widget na tela inicial permite ao usuário 'continuar de onde parou'. O sistema recupera automaticamente a última atividade do estudante e restaura o progresso exato na interface — seja a posição em uma videoaula ou os filtros e índice de um banco de questões. Além disso, rastreia e exibe o Streak (dias consecutivos de estudo).

**Pré-condições:** Usuário com atividade prévia registrada.

**Fluxo Principal:** Usuário abre o app → Widget exibe última atividade e streak atual → Usuário clica em 'continuar' → Sistema restaura exatamente o estado anterior (posição em vídeo, filtros, índice de questão).

**Exceções / Fluxos Alternativos:** Dados de progresso corrompidos: retoma do início do tópico com aviso.

**Pós-condições:** Streak atualizado, sessão retomada do ponto exato anterior.

**UC-12 Criação de Desafios Comunitários**

**Ator:** Estudante

**Descrição:** Usuários podem criar desafios personalizados (públicos ou privados) definindo regras e filtros específicos, que o sistema usa para selecionar aleatoriamente um conjunto imutável de questões. A funcionalidade opera perfeitamente offline: o desafio criado é armazenado em fila local e, ao restaurar a internet, é publicado automaticamente na lista da comunidade ou tem seu código único de compartilhamento gerado.

**Pré-condições:** Usuário autenticado com banco de questões local carregado.

**Fluxo Principal:** Usuário define regras do desafio → Sistema seleciona questões aleatórias baseado nos filtros → Salva desafio na fila offline → Ao reconectar: publica desafio e gera código de compartilhamento → Notifica criador.

**Exceções / Fluxos Alternativos:** Filtros muito restritivos resultam em menos de 5 questões: alerta e sugere ampliar critérios.

**Pós-condições:** Desafio publicado e disponível para a comunidade ou compartilhado via código.

**05\. Metas & Notificações**

**UC-13 Criação de Metas de Estudo e Lembretes Inteligentes**

**Ator:** Estudante

**Descrição:** Usuários podem definir metas precisas de estudo baseadas em horas líquidas (com pausas automáticas por inatividade para evitar trapaças), volume de questões respondidas, ou taxa de desempenho, podendo vincular essas metas a disciplinas específicas. O app usa Service Worker para agendar e exibir notificações nativas no dispositivo nos horários configurados, funcionando mesmo com o navegador fechado.

**Pré-condições:** PWA instalado com permissão de notificações concedida.

**Fluxo Principal:** Usuário cria meta com critérios e horário → Service Worker agenda notificações → Timer de estudo inicia automaticamente nas sessões → Inatividade > 2min pausa o timer → Sistema acompanha progresso em relação à meta → Notificação enviada no horário configurado.

**Exceções / Fluxos Alternativos:** Permissão de notificação negada: orienta usuário a conceder nas configurações do dispositivo.

**Pós-condições:** Meta registrada, timer configurado, notificações agendadas.

**06\. Desempenho & Análise**

**UC-14 Dashboard de Desempenho e Gráficos de Performance**

**Ator:** Estudante

**Descrição:** Para permitir acompanhamento detalhado do progresso em diferentes períodos (Hoje, 7 dias, 30 dias ou Sempre), o sistema calcula e exibe a taxa de acerto do usuário. O app realiza queries otimizadas no banco local baseadas na data e resultado das questões, processando as informações no próprio dispositivo para renderizar gráficos interativos e rápidos sem depender de processamento no servidor.

**Pré-condições:** Histórico de respostas disponível no banco local.

**Fluxo Principal:** Usuário acessa dashboard → Seleciona período de análise → Sistema executa query otimizada no banco local → Calcula taxa de acerto, volume e evolução → Renderiza gráficos interativos → Usuário pode filtrar por disciplina.

**Exceções / Fluxos Alternativos:** Período sem dados: exibe estado vazio com encorajamento para iniciar estudos.

**Pós-condições:** Métricas de desempenho exibidas de forma visual e interativa.

**07\. Gerenciamento de Conteúdo**

**UC-15 Gerenciamento de Download Paginado e Controle de Armazenamento**

**Ator:** Estudante

**Descrição:** Para evitar travamentos do browser e esgotamento do armazenamento do dispositivo, o sistema limita o download de grandes volumes de questões em pacotes gerenciáveis (ex: blocos de 500). Um painel dedicado permite ao estudante visualizar os pacotes baixados e excluí-los facilmente para liberar espaço.

**Pré-condições:** Usuário autenticado e com espaço disponível no dispositivo.

**Fluxo Principal:** Usuário solicita conteúdo extenso → Sistema calcula tamanho e divide em pacotes → Exibe confirmação de download fracionado → Processa textos em lotes no banco local → Salva imagens otimizadas como Blobs → Exibe progresso ao usuário.

**Exceções / Fluxos Alternativos:** Armazenamento insuficiente durante download: pausa processo e exibe painel de gerenciamento.

**Pós-condições:** Conteúdo disponível offline em pacotes gerenciáveis com controle de espaço.

**08\. Cadernos & Flashcards**

**UC-16 Edição de Alto Desempenho com Parsing Incremental em Background**

**Ator:** Estudante

**Descrição:** Para garantir que a digitação em documentos extensos (com mais de 500 flashcards) não trave a interface, o editor usa formato de separação por blocos e atualiza inteligentemente apenas a seção onde o cursor está posicionado. O processamento de conversão de texto (parsing) é delegado a uma thread secundária (Web Worker), mantendo experiência contínua sem gargalos de CPU.

**Pré-condições:** Caderno aberto com mais de 100 blocos de conteúdo.

**Fluxo Principal:** Usuário digita em bloco específico → Sistema identifica apenas o bloco afetado → Delega parsing ao Web Worker → Main thread permanece responsiva → Web Worker retorna resultado → Interface atualiza apenas o bloco modificado.

**Exceções / Fluxos Alternativos:** Web Worker indisponível: fallback para parsing síncrono em lotes pequenos.

**Pós-condições:** Edição fluida mesmo em documentos com centenas de flashcards.

**UC-17 Preview em Tempo Real com Renderização Virtualizada**

**Ator:** Estudante

**Descrição:** Para manter a fluidez do preview de formatação Markdown, o sistema aguarda uma fração de segundo após o fim da digitação (debounce) antes de atualizar a interface. Para evitar travamentos do browser ao lidar com centenas de elementos visuais, a tela usa scroll virtual, renderizando estritamente os 10 a 15 cards visíveis ao usuário no momento.

**Pré-condições:** Editor de caderno aberto com preview ativado.

**Fluxo Principal:** Usuário digita → Debounce de 300ms aguarda pausa na digitação → Preview atualizado via Web Worker → Scroll virtual calcula itens visíveis → Renderiza apenas 10-15 cards visíveis na viewport.

**Exceções / Fluxos Alternativos:** Dispositivo com pouca RAM: reduz janela de virtualização para 5 cards.

**Pós-condições:** Preview atualizado e fluido independente do tamanho do documento.

**UC-18 Salvamento Automático e Persistência Offline Escalável**

**Ator:** Sistema

**Descrição:** Para evitar perda de dados durante a edição sem exceder os limites de memória do browser (como a restrição de 5MB do localStorage), o sistema salva automaticamente o conteúdo no banco de dados local do dispositivo (IndexedDB). O texto do deck é dividido em chunks menores durante o salvamento, garantindo escalabilidade para volumes massivos de texto e imagens.

**Pré-condições:** Editor de caderno aberto com conteúdo sendo editado.

**Fluxo Principal:** Usuário edita conteúdo → Auto-save disparado após 2s de inatividade → Texto dividido em chunks → Chunks salvos no IndexedDB → Metadados de versão atualizados → Indicador visual de 'salvo' exibido.

**Exceções / Fluxos Alternativos:** Falha no IndexedDB: tenta fallback no sessionStorage temporário com aviso ao usuário.

**Pós-condições:** Conteúdo salvo localmente sem risco de perda de dados.

**UC-19 Busca Instantânea com Indexação Local**

**Ator:** Estudante

**Descrição:** Para permitir que estudantes encontrem flashcards instantaneamente dentro de um deck gigante, o editor processa e mantém um 'índice invertido' em memória. Essa estrutura mapeia tags (ex: #js, #performance) diretamente para as posições dos cards, habilitando buscas e filtragens ultra-rápidas sem precisar varrer todo o texto a cada nova pesquisa.

**Pré-condições:** Caderno aberto com índice invertido construído na memória.

**Fluxo Principal:** Usuário digita tag ou termo na busca → Sistema consulta índice invertido em memória → Retorna posições dos cards correspondentes → Interface rola e destaca os cards encontrados.

**Exceções / Fluxos Alternativos:** Índice desatualizado: reconstrói automaticamente em background sem bloquear interface.

**Pós-condições:** Cards encontrados e destacados em menos de 50ms.

**UC-20 Identidade Única e Rastreabilidade de Questões**

**Ator:** Sistema

**Descrição:** Para garantir controle absoluto sobre o histórico e progresso do estudante, o sistema gera um identificador único e imutável (UUID/NanoID) para cada flashcard no momento da sua criação. Essa identidade única garante que edições no texto do card não quebrem o histórico de revisões, permite rastreamento preciso no algoritmo SRS e evita duplicações na sincronização offline.

**Pré-condições:** Editor de caderno com criação de novo flashcard.

**Fluxo Principal:** Usuário cria novo flashcard → Sistema verifica ausência de ID → Gera UUID/NanoID único → Injeta ID imutável no bloco Markdown → Card passa a ser rastreado pelo SRS → Sincronização offline usa ID como chave.

**Exceções / Fluxos Alternativos:** Colisão de ID (extremamente rara): regenera automaticamente.

**Pós-condições:** Flashcard com identidade permanente e rastreável pelo sistema.

**UC-21 Ingestão de Flashcards via Cadernos Markdown**

**Ator:** Estudante

**Descrição:** O sistema usa 'Cadernos' (páginas em Markdown estruturado) como interface central para criação e gestão em lote de flashcards. O editor escaneia o documento: se o usuário inserir um novo flashcard sem identificador prévio, o sistema gera e injeta automaticamente um ID único naquele bloco, garantindo rastreamento permanente pelo algoritmo SRS mesmo com futuras edições.

**Pré-condições:** Editor de caderno aberto.

**Fluxo Principal:** Usuário escreve flashcard no padrão Q:/A: → Sistema detecta bloco sem ID durante parsing → Gera NanoID e injeta no Markdown → Card sincronizado com o SRS → Edições futuras no texto preservam o ID original.

**Exceções / Fluxos Alternativos:** Formato inválido (sem Q: ou A:): card ignorado com destaque visual de erro no editor.

**Pós-condições:** Flashcard identificado, rastreável e integrado ao sistema de repetição espaçada.

**09\. Usuário**

**UC-22 Onboarding e Configuração Inicial do Perfil**

**Ator:** Novo Usuário

**Descrição:** Para garantir uma experiência personalizada desde o primeiro acesso, o sistema conduz o novo estudante por um fluxo de onboarding guiado. O usuário define seu objetivo principal (aprovação em concurso, vestibular, certificação), seleciona as disciplinas de interesse, configura a meta de retenção desejada no FSRS e autoriza notificações. O sistema usa essas preferências para personalizar o conteúdo e o algoritmo de estudo.

**Pré-condições:** Primeiro acesso após cadastro.

**Fluxo Principal:** Usuário cria conta → Onboarding guiado iniciado → Define objetivo de estudo → Seleciona disciplinas → Configura meta de retenção FSRS (padrão 90%) → Autoriza notificações → Perfil criado → Conteúdo inicial recomendado exibido.

**Exceções / Fluxos Alternativos:** Usuário pula onboarding: perfil criado com configurações padrão e onboarding disponível nas configurações.

**Pós-condições:** Perfil configurado com preferências personalizadas e conteúdo recomendado.

**UC-23 Gerenciamento de Perfil e Preferências**

**Ator:** Estudante

**Descrição:** O usuário pode visualizar e editar suas informações de perfil (nome, avatar, email), atualizar preferências de notificação, alterar a meta de retenção do FSRS, gerenciar disciplinas ativas e ajustar o tema da interface (claro/escuro). Mudanças sensíveis (como email) exigem confirmação por senha.

**Pré-condições:** Usuário autenticado.

**Fluxo Principal:** Usuário acessa configurações de perfil → Edita informações desejadas → Sistema valida dados → Alterações salvas localmente e sincronizadas com servidor → Confirmação exibida.

**Exceções / Fluxos Alternativos:** Email já em uso: exibe mensagem de erro específica. Sem conexão: salva localmente e sincroniza depois.

**Pós-condições:** Perfil atualizado com as novas preferências.

**UC-24 Autenticação e Recuperação de Acesso**

**Ator:** Usuário

**Descrição:** O sistema oferece autenticação por email/senha e login social (Google, Apple). Em caso de esquecimento de senha, o fluxo de recuperação é iniciado via email com link temporário. Para usuários com sessão expirada offline, o sistema permite acesso ao conteúdo já baixado sem reconexão imediata, sincronizando o estado de autenticação quando a internet for restabelecida.

**Pré-condições:** Conta previamente cadastrada.

**Fluxo Principal:** Usuário acessa tela de login → Autentica via email/senha ou OAuth → Token armazenado localmente de forma segura → Sessão iniciada → Se offline com sessão válida: acesso ao conteúdo local liberado.

**Exceções / Fluxos Alternativos:** Credenciais inválidas: exibe mensagem genérica (não revela se email existe). Token expirado offline: modo somente leitura até reconexão.

**Pós-condições:** Usuário autenticado com acesso ao conteúdo conforme contexto de conexão.

**UC-25 Histórico de Estudo e Exportação de Dados**

**Ator:** Estudante

**Descrição:** O estudante pode visualizar todo o histórico de atividades de estudo (questões respondidas, sessões, evolução de mastery por tópico) e exportar seus dados em formato CSV ou PDF para portabilidade. Isso garante transparência sobre o algoritmo e permite que o usuário tenha controle total sobre suas informações de aprendizado.

**Pré-condições:** Usuário autenticado com histórico de uso.

**Fluxo Principal:** Usuário acessa 'Histórico' → Visualiza linha do tempo de atividades → Filtra por período ou disciplina → Solicita exportação → Sistema gera arquivo CSV/PDF com dados do período → Download iniciado.

**Exceções / Fluxos Alternativos:** Volume muito grande: exportação processada em background com notificação ao concluir.

**Pós-condições:** Dados históricos exportados e disponíveis para download.

**UC-26 Controle de Privacidade e Exclusão de Conta**

**Ator:** Estudante

**Descrição:** Em conformidade com a LGPD, o usuário pode controlar quais dados são coletados, visualizar o que foi armazenado, solicitar exclusão parcial (apenas histórico) ou total da conta. A exclusão total remove todos os dados do servidor em até 30 dias e limpa o banco de dados local imediatamente.

**Pré-condições:** Usuário autenticado.

**Fluxo Principal:** Usuário acessa 'Privacidade' → Visualiza dados coletados → Escolhe ação: ajustar preferências, excluir histórico ou excluir conta → Confirmação dupla para ações irreversíveis → Sistema processa solicitação e confirma.

**Exceções / Fluxos Alternativos:** Usuário com assinatura ativa: orientado a cancelar antes de excluir conta.

**Pós-condições:** Preferências de privacidade respeitadas e dados gerenciados conforme solicitação.

## Design

- Again, Tailwind, with light and dark themes, user can change through a top menu of sorts. Try to make it using proper HSL color science to choose the pallete.
- Simplicity, Visual Hierarchy, and Progressive Dissemination

## Novas Ideias Adicionadas ao Plano

1. **Importação Direta de Markdown/PKM (ex: Obsidian)**
   - Funcionalidade para injetar facilmente notas do Logseq/Obsidian e converter em flashcards (inserção na estrutura FSRS).

2. **Geração de Áudio Offline (TTS) para Flashcards**
   - Flashcards que convertem texto para áudio utilizando Text-to-Speech nativo, permitindo revisão "hands-free" offline.

3. **Gamificação com Efeitos Visuais (Juice)**
   - Micro-animações polidas (confetes, sombreados, etc.) ao completar streaks e metas, para maior engajamento.

4. **Automação de Criação por IA**
   - Integração (opcional/online) que lê cadernos extensos e usa uma LLM (local ou API) para gerar flashcards massivamente usando o padrão NanoID do sistema.

5. **CRDTs (Conflict-free Replicated Data Types)**
   - Uso de estruturas como Yjs no módulo de cadernos para prevenir colisão de dados durante acessos simultâneos (ex: celular e desktop) e sincronização offline.
