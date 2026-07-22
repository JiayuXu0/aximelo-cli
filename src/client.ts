import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type {
  BatchQuoteResult,
  BatchUploadIntent,
  QuoteOptions,
  QuoteResult,
  UploadIntent,
} from "./types.js";

export const DEFAULT_API_BASE_URL = "https://quote-test-api.yoxiang.cn";
export const DEFAULT_RESULT_BASE_URL = "https://test.yoxiang.cn";
export const MAX_FILE_BYTES = 10_485_760;
export const MAX_CONCURRENT_PARTS = 5;

export const DEFAULT_QUOTE_INPUT = {
  material: "6061",
  process: "cnc-machining",
  quantity: 1,
  surfaceFinish: "standard",
  tolerance: "ISO2768-m",
  surfaceRoughness: "Ra3.2",
} as const;

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

export interface SubmitInput {
  filePath: string;
  material?: string;
  process?: string;
  quantity?: number;
  surfaceFinish?: string;
  tolerance?: string;
  surfaceRoughness?: string;
}

export interface SubmitBatchInput extends Omit<SubmitInput, "filePath"> {
  filePaths: string[];
}

interface ClientOptions {
  baseUrl?: string;
  resultBaseUrl?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
}

interface InspectedFile {
  path: string;
  realPath: string;
  name: string;
  size: number;
  sha256: string;
}

export class QuoteClient {
  private readonly baseUrl: string;
  private readonly resultBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
    this.resultBaseUrl = (options.resultBaseUrl ?? DEFAULT_RESULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
  }

  async options(): Promise<QuoteOptions> {
    return this.request<QuoteOptions>("/v1/public/part-quote-options");
  }

  async submit(input: SubmitInput): Promise<QuoteResult> {
    const file = await inspectFile(input.filePath);
    const normalized = normalizeInput(input);
    const intent = await this.request<UploadIntent>("/v1/public/part-quotes", {
      method: "POST",
      body: JSON.stringify({
        file_name: file.name,
        file_size: file.size,
        checksum: `sha256:${file.sha256}`,
        content_type: "model/step",
        ...requestSpecification(normalized),
      }),
      headers: jsonHeaders(),
    });
    await this.upload(file.path, intent);
    return this.request<QuoteResult>(
      `/v1/public/part-quotes/${encodeURIComponent(intent.quote_id)}/complete`,
      { method: "POST" },
    );
  }

  async submitBatch(input: SubmitBatchInput): Promise<BatchQuoteResult> {
    const files = await inspectFiles(input.filePaths);
    const normalized = normalizeInput(input);
    const intent = await this.request<BatchUploadIntent>("/v1/public/part-quote-batches", {
      method: "POST",
      body: JSON.stringify({
        files: files.map((file) => ({
          file_name: file.name,
          file_size: file.size,
          checksum: `sha256:${file.sha256}`,
          content_type: "model/step",
        })),
        ...requestSpecification(normalized),
      }),
      headers: jsonHeaders(),
    });
    if (intent.items.length !== files.length) {
      throw new CliError("报价服务返回的上传地址数量与文件数量不一致。", 5);
    }
    await mapWithConcurrency(files, MAX_CONCURRENT_PARTS, async (file, index) => {
      await this.upload(file.path, intent.items[index]!);
    });
    const result = await this.request<BatchQuoteResult>(
      `/v1/public/part-quote-batches/${encodeURIComponent(intent.batch_id)}/complete`,
      { method: "POST" },
    );
    return this.decorateBatch(result);
  }

  async status(quoteId: string): Promise<QuoteResult> {
    return this.request<QuoteResult>(`/v1/public/part-quotes/${encodeURIComponent(quoteId)}`);
  }

  async batchStatus(batchId: string): Promise<BatchQuoteResult> {
    const result = await this.request<BatchQuoteResult>(
      `/v1/public/part-quote-batches/${encodeURIComponent(batchId)}`,
    );
    return this.decorateBatch(result);
  }

  async wait(quoteId: string, timeoutMs = 10 * 60_000): Promise<QuoteResult> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.status(quoteId);
      if (isQuoteTerminal(result.status)) return result;
      await delay(this.pollIntervalMs);
    }
    throw new CliError("等待报价超时，可稍后使用 quote status 继续查询。", 3);
  }

  async waitBatch(
    batchId: string,
    timeoutMs = 10 * 60_000,
    onPoll?: (result: BatchQuoteResult) => void,
  ): Promise<BatchQuoteResult> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.batchStatus(batchId);
      onPoll?.(result);
      if (isBatchTerminal(result.status)) return result;
      await delay(this.pollIntervalMs);
    }
    throw new CliError("等待批次报价超时，可稍后使用 quote status <batch-id> --wait 继续查询。", 3);
  }

  private decorateBatch(result: BatchQuoteResult): BatchQuoteResult {
    return {
      ...result,
      result_url: `${this.resultBaseUrl}/zh${result.result_path}`,
    };
  }

  private async upload(filePath: string, intent: UploadIntent): Promise<void> {
    const uploadRequest = {
      method: intent.upload_method,
      headers: intent.required_headers ?? {},
      body: createReadStream(filePath),
      duplex: "half",
    } as unknown as RequestInit;
    const response = await this.fetchImpl(intent.upload_url, uploadRequest);
    if (!response.ok) throw new CliError(`文件上传失败（HTTP ${response.status}）。`, 5);
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
      const exitCode = response.status === 429 || response.status >= 500 ? 5 : 4;
      throw new CliError(message, exitCode, body);
    }
    return body as T;
  }
}

export async function inspectFile(filePath: string): Promise<InspectedFile> {
  const extension = extname(filePath).toLowerCase();
  if (extension !== ".step" && extension !== ".stp") {
    throw new CliError("仅支持明确指定的 .step 或 .stp 文件路径。", 4);
  }
  let metadata;
  let resolvedPath;
  try {
    [metadata, resolvedPath] = await Promise.all([stat(filePath), realpath(filePath)]);
  } catch (error) {
    throw new CliError(`无法读取文件：${filePath}`, 4, error);
  }
  if (!metadata.isFile()) throw new CliError(`指定路径不是普通文件：${filePath}`, 4);
  if (metadata.size <= 0) throw new CliError(`STEP 文件不能为空：${filePath}`, 4);
  if (metadata.size > MAX_FILE_BYTES) {
    throw new CliError(`STEP 文件超过 10 MiB（10,485,760 bytes）：${filePath}`, 4);
  }

  const hash = createHash("sha256");
  const handle = await open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close().catch(() => undefined);
  }
  return {
    path: filePath,
    realPath: resolvedPath,
    name: basename(filePath),
    size: metadata.size,
    sha256: hash.digest("hex"),
  };
}

export async function inspectFiles(filePaths: string[]): Promise<InspectedFile[]> {
  if (filePaths.length === 0) throw new CliError("请至少明确指定一个 STEP/STP 文件。", 4);
  if (filePaths.length > MAX_CONCURRENT_PARTS) {
    throw new CliError(`一个批次最多同时报价 ${MAX_CONCURRENT_PARTS} 个零件，请分批顺序提交。`, 4);
  }
  const files = await Promise.all(filePaths.map(inspectFile));
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.realPath)) throw new CliError(`同一个文件不能重复报价：${file.path}`, 4);
    seen.add(file.realPath);
  }
  return files;
}

export function isQuoteTerminal(status: QuoteResult["status"]): boolean {
  return ["succeeded", "no_auto_quote", "failed", "expired"].includes(status);
}

export function isBatchTerminal(status: BatchQuoteResult["status"]): boolean {
  return status === "succeeded" || status === "completed_with_errors";
}

function normalizeInput(input: Omit<SubmitInput, "filePath">): Required<Omit<SubmitInput, "filePath">> {
  const quantity = input.quantity ?? DEFAULT_QUOTE_INPUT.quantity;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new CliError("--quantity 必须是正整数。", 4);
  const process = normalizeProcess(input.process ?? DEFAULT_QUOTE_INPUT.process);
  return {
    material: input.material?.trim() || DEFAULT_QUOTE_INPUT.material,
    process,
    quantity,
    surfaceFinish: input.surfaceFinish?.trim() || DEFAULT_QUOTE_INPUT.surfaceFinish,
    tolerance: input.tolerance?.trim() || DEFAULT_QUOTE_INPUT.tolerance,
    surfaceRoughness: input.surfaceRoughness?.trim() || DEFAULT_QUOTE_INPUT.surfaceRoughness,
  };
}

function normalizeProcess(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "cnc" || normalized === "cnc-machining") return "cnc-machining";
  return normalized;
}

function requestSpecification(input: Required<Omit<SubmitInput, "filePath">>): Record<string, unknown> {
  return {
    material: input.material,
    process: input.process,
    quantity: input.quantity,
    surface_finish: input.surfaceFinish,
    tolerance: input.tolerance,
    surface_roughness: input.surfaceRoughness,
  };
}

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json", "idempotency-key": randomUUID() };
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      await operation(values[index]!, index);
    }
  });
  await Promise.all(workers);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
