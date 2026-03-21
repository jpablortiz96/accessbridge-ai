// Azure OpenAI client — uses fetch directly (no SDK dependency)
// Server-side only: never import this in client components.

const ENDPOINT   = process.env.AZURE_OPENAI_ENDPOINT   ?? '';
const API_KEY    = process.env.AZURE_OPENAI_API_KEY     ?? '';
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT  ?? '';
const API_VER    = process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompletionOptions {
  maxTokens?:  number;
  temperature?: number;
}

interface AzureChoice {
  message: { role: string; content: string | null };
  finish_reason: string;
}

interface AzureResponse {
  choices: AzureChoice[];
  error?:  { message: string; code?: string };
}

type MessageContent =
  | string
  | Array<
      | { type: 'text';      text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

interface ChatMessage {
  role:    'system' | 'user' | 'assistant';
  content: MessageContent;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildUrl(): string {
  if (!ENDPOINT || !DEPLOYMENT) {
    throw new Error(
      'Azure OpenAI is not configured. ' +
      'Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT in .env.local'
    );
  }
  return `${ENDPOINT.replace(/\/$/, '')}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VER}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callAzure(
  messages: ChatMessage[],
  options:  CompletionOptions = {},
  label:    string,
): Promise<string> {
  const url = buildUrl();

  if (!API_KEY) {
    throw new Error('AZURE_OPENAI_API_KEY is not set in .env.local');
  }

  const body = JSON.stringify({
    messages,
    max_tokens:  options.maxTokens  ?? 1000,
    temperature: options.temperature ?? 0.3,
  });


  const RETRIES    = 3;
  const BASE_DELAY = 1000; // ms

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key':       API_KEY,
        },
        body,
      });

      const data: AzureResponse = await res.json();

      // Azure surfaces errors inside the JSON body even on non-200 responses
      if (data.error) {
        throw new Error(`Azure API error: ${data.error.message} (code: ${data.error.code ?? 'unknown'})`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (content == null) {
        throw new Error('Azure returned an empty response (null content)');
      }

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.warn(
          `[azure-client] ${label} attempt ${attempt}/${RETRIES} failed — ` +
          `retrying in ${delay}ms. Reason: ${lastError.message}`
        );
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `[azure-client] ${label} failed after ${RETRIES} attempts. ` +
    `Last error: ${lastError.message}`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Standard text completion via Azure OpenAI.
 * Use for Scanner, Simplifier, Navigator agents.
 */
export async function getAzureCompletion(
  systemPrompt: string,
  userPrompt:   string,
  options?:     CompletionOptions,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt   },
  ];
  return callAzure(messages, options, 'text-completion');
}

/**
 * Vision completion via Azure OpenAI (GPT-4o).
 * Use for Vision Agent — analyzes a screenshot URL + text context.
 */
export async function getAzureVisionCompletion(
  systemPrompt: string,
  imageUrl:     string,
  textContext:  string,
  options?:     CompletionOptions,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role:    'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text',      text: textContext              },
      ],
    },
  ];
  return callAzure(messages, options, 'vision-completion');
}
