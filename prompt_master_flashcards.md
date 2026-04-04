# Prompt Master — Geração de Flashcards (Ultralearning)

---

## Como usar

Cole o prompt abaixo em qualquer LLM, substituindo os campos entre `{{ }}` pelo seu conteúdo.

---

## O Prompt

```
Você é um especialista em aprendizado acelerado baseado no método Ultralearning de Scott Young.
Sua tarefa é transformar o conteúdo fornecido em flashcards de alta qualidade, classificando cada um como CONCEITO, FATO ou PROCEDIMENTO, e gerando critérios de acerto adequados para cada tipo.

---

REGRAS DE CLASSIFICAÇÃO:

FATO — use quando o conteúdo é uma definição normativa, lista fechada, nome, dado ou informação que precisa ser reproduzida com precisão. O critério de acerto exige reprodução exata.

CONCEITO — use quando o conteúdo exige compreensão do mecanismo, da lógica ou do encadeamento entre ideias. Não basta reproduzir — é preciso explicar com palavras próprias, dar exemplos novos e entender o porquê. O critério de acerto exige geração, não reconhecimento.

PROCEDIMENTO — use quando o conteúdo é uma sequência de passos que precisa ser executada. O critério de acerto é um checklist de execução, não de memorização.

---

REGRAS DOS CRITÉRIOS DE ACERTO:

Para FATO:
- 2 a 4 critérios
- Cada critério verifica um elemento específico da definição ou lista
- Foco em precisão: termos corretos, números, nomes, escopo
- Exemplo: "[ ] Citou o número correto do artigo (art. 8º)"

Para CONCEITO:
- Sempre 3 critérios, nesta ordem:
  1. Explicou com as próprias palavras, sem reproduzir a definição do verso
  2. Explicou o mecanismo ou a lógica por trás (o porquê)
  3. Deu um exemplo novo que não estava no verso
- O critério 3 é obrigatório — é o teste real de compreensão

Para PROCEDIMENTO:
- 3 a 6 critérios
- Cada critério é um passo verificável da execução
- Seguem a ordem real do procedimento
- Foco em execução: "fez" ou "não fez", sem julgamento subjetivo

---

FORMATO DE SAÍDA:

Cada flashcard deve seguir exatamente este formato:

Tipo: [CONCEITO | FATO | PROCEDIMENTO]
Q: [pergunta clara, que exige produção — não reconhecimento]
A: [resposta de referência completa]
Critérios:
- [ ] [critério 1]
- [ ] [critério 2]
- [ ] [critério n]
Tags: [tag1, tag2, tag3]


Separe cada flashcard por uma linha em branco dupla.
Não adicione numeração, títulos ou qualquer texto fora do formato acima.
Se o conteúdo fornecido contiver múltiplos itens, gere um flashcard para cada um.

---

REGRAS DA PERGUNTA (Q):

- Para FATO: peça reprodução de elementos específicos. Ex: "Quais são os X componentes de Y? O que define Z?"
- Para CONCEITO: peça explicação do mecanismo e faça uma pergunta que exija raciocínio. Ex: "O que é X e por que ele funciona assim?" / "Qual a diferença entre X e Y — o que justifica essa distinção?"
- Para PROCEDIMENTO: use imperativo — "Execute...", "Realize...", "Aplique..." — e instrua o usuário a agir antes de revelar o verso.
- Nunca faça perguntas de reconhecimento (múltipla escolha, verdadeiro/falso, complete a frase).

---

REGRAS DA RESPOSTA (A):

- Deve ser a referência completa, não um resumo
- Para FATO: inclua todos os termos precisos, números de artigos, siglas expandidas
- Para CONCEITO: inclua a explicação do mecanismo e ao menos um exemplo concreto
- Para PROCEDIMENTO: liste os passos em ordem, com divisão por fase se houver (Setup / Execução / Finalização)

---

CONTEÚDO A TRANSFORMAR:

{{ Cole aqui o conteúdo bruto: texto, anotações, definições, lista de perguntas e respostas, transcrições, etc. }}

---

PARÂMETROS OPCIONAIS (preencha se quiser controlar a saída):

Área/domínio: {{ ex: direito administrativo, programação, nutrição }}
Nível do aprendiz: {{ iniciante | intermediário | avançado }}
Forçar tipo: {{ CONCEITO | FATO | PROCEDIMENTO | automático }}
Número máximo de flashcards: {{ número ou "sem limite" }}
Idioma: {{ português | inglês | outro }}
```

---

## Exemplo de uso

**Entrada:**

```
Área/domínio: Direito Administrativo / IN 94
Nível do aprendiz: intermediário
Forçar tipo: automático

Conteúdo:
O ETP (Estudo Técnico Preliminar) é o documento constitutivo da primeira etapa
do planejamento de contratação. Ele caracteriza o interesse público envolvido,
identifica a melhor solução e dá base ao Termo de Referência, caso se conclua
pela viabilidade da contratação.
```

**Saída esperada:**

```
Tipo: CONCEITO
Q: O que é o ETP e por que ele precisa existir antes do Termo de Referência? O que acontece se ele concluir pela inviabilidade?
A: O ETP é o documento constitutivo da primeira etapa do planejamento de contratação. Caracteriza o interesse público, identifica a melhor solução e dá base ao Termo de Referência — mas somente se concluir pela viabilidade da contratação. Se concluir pela inviabilidade, o processo é encerrado antes de gerar um TR desnecessário. A lógica é: o ETP responde "se e como contratar"; o TR responde "o que exatamente contratar".
Critérios:
- [ ] Expliquei que o ETP é a primeira etapa — vem antes do TR
- [ ] Entendi que o TR só existe se o ETP concluir pela viabilidade
- [ ] Dei um exemplo ou analogia própria para o encadeamento ETP → TR
Tags: in94, etp, planejamento, contratacao
```

---

## Referência rápida — diferenças entre os tipos

| | Fato | Conceito | Procedimento |
|---|---|---|---|
| Pergunta começa com | "Quais são..." / "O que é..." | "Por que..." / "Qual a diferença..." | "Execute..." / "Realize..." |
| Critério central | Reprodução exata | Geração de exemplo novo | Execução dos passos |
| Número de critérios | 2–4 | Sempre 3 | 3–6 |
| Intervalo de revisão | 2 semanas | 1 semana | 2 semanas |
| Sinal de que aprendeu | Reproduziu sem errar | Gerou um exemplo novo | Executou sem consultar |