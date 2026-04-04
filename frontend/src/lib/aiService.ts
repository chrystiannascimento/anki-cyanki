/**
 * AI Service — Ultralearning flashcard generation
 *
 * US-05: API key stored locally only (localStorage) — never sent to Cyanki servers.
 * US-06: Generate flashcards from notebook content.
 * US-07: Generate flashcards from a free-text prompt.
 *
 * All calls go directly from the browser to the AI provider's API.
 * Supports OpenAI (GPT-4o) and Anthropic (Claude Sonnet).
 */

import { parsePromptMasterCards, type ParsedPromptCard } from '$lib/notebookParser';

export type AIProvider = 'openai' | 'anthropic';

// ─── Key management ─────────────────────────────────────────────────────────

const KEY_PREFIX = 'cyanki_api_key_';

export function saveApiKey(provider: AIProvider, key: string) {
    localStorage.setItem(KEY_PREFIX + provider, key);
}

export function getApiKey(provider: AIProvider): string {
    return localStorage.getItem(KEY_PREFIX + provider) ?? '';
}

export function removeApiKey(provider: AIProvider) {
    localStorage.removeItem(KEY_PREFIX + provider);
}

export function hasApiKey(provider: AIProvider): boolean {
    return Boolean(getApiKey(provider));
}

/** Test that the stored key is valid with a minimal API call. */
export async function testApiKey(provider: AIProvider): Promise<{ ok: boolean; error?: string }> {
    const key = getApiKey(provider);
    if (!key) return { ok: false, error: 'Nenhuma chave configurada.' };

    try {
        if (provider === 'openai') {
            const res = await fetchWithTimeout(
                'https://api.openai.com/v1/chat/completions',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [{ role: 'user', content: 'ping' }],
                        max_tokens: 1
                    })
                }
            );
            if (res.status === 401) return { ok: false, error: 'Chave inválida ou expirada.' };
            return { ok: res.ok };
        }

        if (provider === 'anthropic') {
            const res = await fetchWithTimeout(
                'https://api.anthropic.com/v1/messages',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: JSON.stringify({
                        model: 'claude-sonnet-4-6',
                        max_tokens: 1,
                        messages: [{ role: 'user', content: 'ping' }]
                    })
                }
            );
            if (res.status === 401) return { ok: false, error: 'Chave inválida ou expirada.' };
            return { ok: res.ok };
        }

        return { ok: false, error: 'Provedor desconhecido.' };
    } catch (e: any) {
        return { ok: false, error: e.message ?? 'Erro de conexão.' };
    }
}

// ─── Generation ──────────────────────────────────────────────────────────────

export interface GenerationParams {
    provider: AIProvider;
    /** Free-text topic description (US-07) */
    topic?: string;
    /** Notebook content to convert (US-06) — overrides topic */
    notebookContent?: string;
    maxCards?: number;          // default 10
    cardType?: 'automático' | 'CONCEITO' | 'FATO' | 'PROCEDIMENTO';
    level?: 'iniciante' | 'intermediário' | 'avançado';
    domain?: string;
    /** IDs/questions of cards already generated (for "gerar mais", US-07) */
    existingQuestions?: string[];
}

/**
 * Generates flashcards and returns ParsedPromptCards ready for the preview UI.
 * Throws on network/auth errors.
 */
export async function generateFlashcards(params: GenerationParams): Promise<ParsedPromptCard[]> {
    const {
        provider,
        topic,
        notebookContent,
        maxCards = 10,
        cardType = 'automático',
        level = 'intermediário',
        domain = '',
        existingQuestions = []
    } = params;

    const key = getApiKey(provider);
    if (!key) throw new Error('Chave de API não configurada. Vá em Perfil > Configurações de IA.');

    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage({
        topic,
        notebookContent,
        maxCards,
        cardType,
        level,
        domain,
        existingQuestions
    });

    let rawText = '';

    if (provider === 'openai') {
        rawText = await callOpenAI(key, systemPrompt, userMessage);
    } else {
        rawText = await callAnthropic(key, systemPrompt, userMessage);
    }

    const cards = parsePromptMasterCards(rawText);
    if (cards.length === 0) throw new Error('A IA não retornou flashcards no formato esperado. Tente novamente.');

    return cards;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
    return `Você é um especialista em aprendizado acelerado baseado no método Ultralearning de Scott Young.
Sua tarefa é transformar o conteúdo fornecido em flashcards de alta qualidade, classificando cada um como CONCEITO, FATO ou PROCEDIMENTO, e gerando critérios de acerto adequados para cada tipo.

REGRAS DE CLASSIFICAÇÃO:
FATO — definição normativa, lista fechada, nome, dado. Critério: reprodução exata.
CONCEITO — exige compreensão do mecanismo, lógica e encadeamento. Critério: geração, não reconhecimento.
PROCEDIMENTO — sequência de passos que precisa ser executada. Critério: checklist de execução.

FORMATO DE SAÍDA (siga exatamente):
Tipo: [CONCEITO | FATO | PROCEDIMENTO]
Q: [pergunta clara que exige produção]
A: [resposta de referência completa]
Critérios:
- [ ] [critério 1]
- [ ] [critério n]
Tags: [tag1, tag2, tag3]


Separe cada flashcard por uma linha em branco dupla.
Não adicione numeração, títulos ou qualquer texto fora do formato acima.`;
}

function buildUserMessage(opts: {
    topic?: string;
    notebookContent?: string;
    maxCards: number;
    cardType: string;
    level: string;
    domain: string;
    existingQuestions: string[];
}): string {
    const { topic, notebookContent, maxCards, cardType, level, domain, existingQuestions } = opts;

    const params = [
        `Número máximo de flashcards: ${maxCards}`,
        `Nível do aprendiz: ${level}`,
        cardType !== 'automático' ? `Forçar tipo: ${cardType}` : '',
        domain ? `Área/domínio: ${domain}` : '',
        'Idioma: português'
    ].filter(Boolean).join('\n');

    let content = '';
    if (notebookContent) {
        content = `CONTEÚDO A TRANSFORMAR:\n${truncateToTokens(notebookContent, 6000)}`;
    } else if (topic) {
        content = `TEMA A APRENDER:\n${topic}`;
    }

    let dedup = '';
    if (existingQuestions.length > 0) {
        dedup = `\n\nPERGUNTAS JÁ GERADAS (não repita):\n${existingQuestions.map(q => `- ${q}`).join('\n')}`;
    }

    return `${params}\n\n${content}${dedup}`;
}

async function callOpenAI(key: string, system: string, user: string): Promise<string> {
    const res = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                ],
                temperature: 0.7
            })
        },
        30_000
    );

    if (res.status === 401) throw new Error('Chave OpenAI inválida ou expirada.');
    if (!res.ok) throw new Error(`Erro OpenAI: ${res.status} ${res.statusText}`);

    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(key: string, system: string, user: string): Promise<string> {
    const res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 4096,
                system,
                messages: [{ role: 'user', content: user }]
            })
        },
        30_000
    );

    if (res.status === 401) throw new Error('Chave Anthropic inválida ou expirada.');
    if (!res.ok) throw new Error(`Erro Anthropic: ${res.status} ${res.statusText}`);

    const json = await res.json();
    return json.content?.[0]?.text ?? '';
}

function fetchWithTimeout(url: string, init: RequestInit, ms = 30_000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

/** Rough character-based truncation (~4 chars per token). */
function truncateToTokens(text: string, tokens: number): string {
    const maxChars = tokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n[conteúdo truncado para caber no limite]';
}
