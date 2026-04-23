const DEFAULT_BASE_URL = process.env.AI_BASE_URL ?? "http://localhost:11434";
const DEFAULT_MODEL =
  process.env.AI_MODEL ??
  process.env.MODEL ??
  "qwen2.5:7b";
const DEFAULT_API_KEY =
  process.env.AI_API_KEY ??
  "no-key";

function stripSingleTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export function normalizeOpenAIBaseURL(url: string): string {
  return stripSingleTrailingSlash(url.trim());
}

export function getRuntimeBaseUrl(): string {
  return normalizeOpenAIBaseURL(DEFAULT_BASE_URL);
}

export function getRuntimeModel(): string {
  return DEFAULT_MODEL.trim();
}

export function getRuntimeApiKey(): string {
  return DEFAULT_API_KEY;
}

export function getRuntimeAIConfig(): { baseUrl: string; model: string; apiKey: string } {
  return {
    baseUrl: getRuntimeBaseUrl(),
    model: getRuntimeModel(),
    apiKey: getRuntimeApiKey(),
  };
}

export function getDefaultChatModel(): string {
  return getRuntimeModel();
}
