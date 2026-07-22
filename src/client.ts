import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { QuoteOptions, QuoteResult, UploadIntent } from "./types.js";

export const DEFAULT_API_BASE_URL = "https://quote-test-api.yoxiang.cn";

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CliError";
  }
}

interface SubmitInput {
  filePath: string;
  material: string;
  process: string;
  quantity: number;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
}

export class QuoteClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
  }

  async options(): Promise<QuoteOptions> {
    return this.request<QuoteOptions>("/v1/public/part-quote-options");
  }

  async submit(input: SubmitInput): Promise<QuoteResult> {
    const file = await inspectFile(input.filePath);
    const intent = await this.request<UploadIntent>("/v1/public/part-quotes", {
      method: "POST",
      body: JSON.stringify({
        file_name: file.name,
        file_size: file.size,
        checksum: `sha256:${file.sha256}`,
        content_type: "model/step",
        material: input.material,
        process: input.process,
        quantity: input.quantity,
      }),
      headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
    });

    await this.upload(input.filePath, intent);
    return this.request<QuoteResult>(
      `/v1/public/part-quotes/${encodeURIComponent(intent.quote_id)}/complete`,
      { method: "POST" },
    );
  }

  async status(quoteId: string): Promise<QuoteResult> {
    return this.request<QuoteResult>(`/v1/public/part-quotes/${encodeURIComponent(quoteId)}`);
  }

  async wait(quoteId: string, timeoutMs = 10 * 60_000): Promise<QuoteResult> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.status(quoteId);
      if (["succeeded", "no_auto_quote", "failed", "expired"].includes(result.status)) {
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    throw new CliError("等待报价超时，可稍后使用 quote status 继续查询。", 3);
  }

  private async upload(filePath: string, intent: UploadIntent): Promise<void> {
    const uploadRequest = {
      method: intent.upload_method,
      headers: intent.required_headers ?? {},
      body: createReadStream(filePath),
      duplex: "half",
    } as unknown as RequestInit;
    const response = await this.fetchImpl(intent.upload_url, uploadRequest);
    if (!response.ok) {
      throw new CliError(`文件上传失败（HTTP ${response.status}）。`, 5);
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (error) {
      throw new CliError("无法连接有象报价服务。", 5, error);
    }
    const raw = await response.text();
    const body = raw ? safeJson(raw) : undefined;
    if (!response.ok) {
      const message = extractErrorMessage(body) ?? `报价服务返回 HTTP ${response.status}。`;
      throw new CliError(message, response.status >= 500 ? 5 : 4, body);
    }
    return body as T;
  }
}

export async function inspectFile(filePath: string): Promise<{ name: string; size: number; sha256: string }> {
  const extension = extname(filePath).toLowerCase();
  if (extension !== ".step" && extension !== ".stp") {
    throw new CliError("仅支持单个 .step 或 .stp 文件。", 4);
  }
  let metadata;
  try {
    metadata = await stat(filePath);
  } catch (error) {
    throw new CliError(`无法读取文件：${filePath}`, 4, error);
  }
  if (!metadata.isFile()) {
    throw new CliError("指定路径不是文件。", 4);
  }

  const hash = createHash("sha256");
  const handle = await open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close().catch(() => undefined);
  }
  return { name: basename(filePath), size: metadata.size, sha256: hash.digest("hex") };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new CliError("报价服务返回了无法解析的数据。", 5);
  }
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (record.error && typeof record.error === "object") {
    const message = (record.error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}
