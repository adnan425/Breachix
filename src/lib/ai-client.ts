import OpenAI from "openai";

/** OpenAI SDK client for any server that exposes `<base>/v1` (OpenAI-compatible chat). */
export function createOllamaClient(ollamaBaseUrl: string): OpenAI {
  const baseURL = `${ollamaBaseUrl.replace(/\/$/, "")}/v1`;
  return new OpenAI({
    baseURL,
    apiKey: "not-used",
  });
}

export type ChatCompletionParams = {
  system: string;
  user: string;
  /** Truncate user message to this many characters (default 120_000). */
  maxUserChars?: number;
  temperature?: number;
};

/** Chat completions (OpenAI SDK). Used for all agent phases. */
export async function completeChat(
  client: OpenAI,
  model: string,
  params: ChatCompletionParams,
): Promise<string> {
  const maxUser = params.maxUserChars ?? 120_000;
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user.slice(0, maxUser) },
    ],
    temperature: params.temperature ?? 0.1,
  });
  return response.choices[0]?.message?.content ?? "(no response)";
}
