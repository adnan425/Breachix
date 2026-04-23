import OpenAI from "openai";
import {
  getDefaultChatModel,
  getRuntimeAIConfig,
  normalizeOpenAIBaseURL,
} from "./runtime-ai";

// One client, one model, everything from env
// Agent code never mentions models, tiers, or providers

let _client: OpenAI | null = null;

export function getClient(): OpenAI {
  if (!_client) {
    const runtime = getRuntimeAIConfig();
    _client = new OpenAI({
      baseURL: runtime.baseUrl,
      apiKey: runtime.apiKey,
    });
  }
  return _client;
}

export function createRuntimeClient(baseURL: string, apiKey?: string): OpenAI {
  return new OpenAI({
    baseURL: normalizeOpenAIBaseURL(baseURL),
    apiKey: apiKey ?? getRuntimeAIConfig().apiKey,
  });
}

export type ChatParams = {
  system:        string;
  user:          string;
  maxUserChars?: number;
  temperature?:  number;
  maxTokens?:    number;
};

/** Single completion */
export async function chat(params: ChatParams): Promise<string>;
export async function chat(client: OpenAI, model: string, params: ChatParams): Promise<string>;
export async function chat(
  clientOrParams: OpenAI | ChatParams,
  maybeModel?: string,
  maybeParams?: ChatParams,
): Promise<string> {
  const client = clientOrParams instanceof OpenAI ? clientOrParams : getClient();
  const model = clientOrParams instanceof OpenAI
    ? (maybeModel ?? getDefaultChatModel())
    : getDefaultChatModel();
  const params = clientOrParams instanceof OpenAI ? maybeParams : clientOrParams;
  if (!params) throw new Error("chat params are required");

  const res = await client.chat.completions.create({
    model,
    temperature: params.temperature ?? 0.1,
    max_tokens:  params.maxTokens  ?? 8192,
    messages: [
      { role: "system", content: params.system },
      { role: "user",   content: params.user.slice(0, params.maxUserChars ?? 120_000) },
    ],
  });
  return res.choices[0]?.message?.content ?? "(no response)";
}

/** Parallel completions — for Shannon's multi-agent phases */
export async function chatAll(requests: ChatParams[]): Promise<string[]> {
  return Promise.all(requests.map(chat));
}

/** Backward-compatible alias expected by existing agents. */
export async function completeChat(
  client: OpenAI,
  model: string,
  params: ChatParams,
): Promise<string> {
  return chat(client, model, params);
}

/** Streaming — for live dashboard logs */
export async function chatStream(
  params: ChatParams,
  onChunk: (text: string) => void,
): Promise<string> {
  const stream = await getClient().chat.completions.create({
    model:       getDefaultChatModel(),
    temperature: params.temperature ?? 0.1,
    max_tokens:  params.maxTokens  ?? 8192,
    stream:      true,
    messages: [
      { role: "system", content: params.system },
      { role: "user",   content: params.user.slice(0, params.maxUserChars ?? 120_000) },
    ],
  });

  let full = "";
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) { full += text; onChunk(text); }
  }
  return full;
}