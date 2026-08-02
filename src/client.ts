import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type {
  AnalysisBatchResult,
  AnalysisBatchUploadIntent,
  AnalysisOptions,
  AnalysisResult,
  StockInput,
} from "./types.js";

export const DEFAULT_API_BASE_URL = "https://api.aximelo.ai";
export const DEFAULT_RESULT_BASE_URL = "https://app.aximelo.ai";
export const MAX_FILE_BYTES = 10_485_760;
export const MAX_CONCURRENT_PARTS = 5;
const STEP_ANALYSIS_EXTENSIONS = [".step", ".stp"] as const;
const NATIVE_ANALYSIS_EXTENSIONS = [".x_t", ".x_b", ".sat", ".sldprt", ".prt", ".ipt", ".catpart"] as const;
const REJECTED_ANALYSIS_EXTENSIONS = [".sldasm", ".asm", ".iam", ".catproduct", ".3dxml", ".stl", ".obj"] as const;
const SUPPORTED_ANALYSIS_EXTENSIONS = [...STEP_ANALYSIS_EXTENSIONS, ...NATIVE_ANALYSIS_EXTENSIONS] as const;

export const DEFAULT_ANALYSIS_INPUT = {
  material: "6061",
  process: "cnc-machining",
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

export interface SubmitAnalysisInput {
  filePaths: string[];
  material?: string;
  process?: string;
  tolerance?: string;
  surfaceRoughness?: string;
  stock?: StockInput;
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

interface InternalAnalysisResult extends AnalysisResult {
  conversion?: {
    status: "not_required" | "pending" | "running" | "succeeded" | "failed";
    error_code?: string;
  };
}

interface InternalAnalysisBatchResult extends Omit<AnalysisBatchResult, "items"> {
  items: InternalAnalysisResult[];
}

export class AnalysisClient {
  private readonly baseUrl: string;
  private readonly resultBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
    this.resultBaseUrl = (options.resultBaseUrl ?? DEFAULT_RESULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    // Interactive analysis should surface a completed worker result promptly.
    // This only affects status refresh; Redis workers still execute asynchronously.
    this.pollIntervalMs = options.pollIntervalMs ?? 750;
  }

  async options(): Promise<AnalysisOptions> {
    const options = await this.request<AnalysisOptions & {
      passthrough_extensions?: string[];
      conversion_extensions?: string[];
    }>("/v1/public/part-analysis-options");
    const {
      passthrough_extensions: _passthroughExtensions,
      conversion_extensions: _conversionExtensions,
      ...publicOptions
    } = options;
    return publicOptions;
  }

  async submitBatch(input: SubmitAnalysisInput): Promise<AnalysisBatchResult> {
    const files = await inspectFiles(input.filePaths);
    const normalized = normalizeInput(input);
    const intent = await this.request<AnalysisBatchUploadIntent>("/v1/public/part-analysis-batches", {
      method: "POST",
      body: JSON.stringify({
        files: files.map((file) => ({
          file_name: file.name,
          file_size: file.size,
          checksum: `sha256:${file.sha256}`,
          content_type: isStepExtension(extname(file.name)) ? "model/step" : "application/octet-stream",
          ...(normalized.stock ? { stock: normalized.stock } : {}),
        })),
        material: normalized.material,
        process: normalized.process,
        tolerance: normalized.tolerance,
        surface_roughness: normalized.surfaceRoughness,
      }),
      headers: jsonHeaders(),
    });
    if (intent.items.length !== files.length) {
      throw new CliError("分析服务返回的上传地址数量与文件数量不一致。", 5);
    }
    await mapWithConcurrency(files, MAX_CONCURRENT_PARTS, async (file, index) => {
      const item = intent.items[index]!;
      await this.upload(file.path, item.upload_url, item.upload_method, item.required_headers);
    });
    const result = await this.request<InternalAnalysisBatchResult>(
      `/v1/public/part-analysis-batches/${encodeURIComponent(intent.batch_id)}/complete`,
      { method: "POST" },
    );
    return this.decorateBatch(result);
  }

  async batchStatus(batchId: string): Promise<AnalysisBatchResult> {
    const result = await this.request<InternalAnalysisBatchResult>(
      `/v1/public/part-analysis-batches/${encodeURIComponent(batchId)}`,
    );
    return this.decorateBatch(result);
  }

  async waitBatch(
    batchId: string,
    timeoutMs = 10 * 60_000,
    onPoll?: (result: AnalysisBatchResult) => void,
  ): Promise<AnalysisBatchResult> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.batchStatus(batchId);
      onPoll?.(result);
      if (isBatchTerminal(result.status)) return result;
      await delay(this.pollIntervalMs);
    }
    throw new CliError("等待分析超时，可稍后使用 analyze status <batch-id> --wait 继续查询。", 3);
  }

  private decorateBatch(result: InternalAnalysisBatchResult): AnalysisBatchResult {
    return {
      ...result,
      result_url: `${this.resultBaseUrl}/zh${result.result_path}`,
      items: result.items.map(publicAnalysisResult),
    };
  }

  private async upload(
    filePath: string,
    uploadUrl: string,
    method: string,
    headers: Record<string, string> = {},
  ): Promise<void> {
    const response = await this.fetchImpl(uploadUrl, {
      method,
      headers,
      body: createReadStream(filePath),
      duplex: "half",
    } as unknown as RequestInit);
    if (!response.ok) throw new CliError(`文件上传失败（HTTP ${response.status}）。`, 5);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (error) {
      throw new CliError("无法连接Aximelo 零件分析服务。", 5, error);
    }
    const raw = await response.text();
    const body = raw ? safeJson(raw) : undefined;
    if (!response.ok) {
      const message = extractErrorMessage(body) ?? `分析服务返回 HTTP ${response.status}。`;
      const exitCode = response.status === 429 || response.status >= 500 ? 5 : 4;
      throw new CliError(message, exitCode, body);
    }
    return body as T;
  }
}

export async function inspectFile(filePath: string): Promise<InspectedFile> {
  const extension = extname(filePath).toLowerCase();
  if ((REJECTED_ANALYSIS_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new CliError(`不支持装配体或网格文件：${filePath}`, 4);
  }
  if (!(SUPPORTED_ANALYSIS_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new CliError(`不支持的零件格式：${filePath}`, 4);
  }
  let metadata;
  let resolvedPath;
  try {
    [metadata, resolvedPath] = await Promise.all([stat(filePath), realpath(filePath)]);
  } catch (error) {
    throw new CliError(`无法读取文件：${filePath}`, 4, error);
  }
  if (!metadata.isFile()) throw new CliError(`指定路径不是普通文件：${filePath}`, 4);
  if (metadata.size <= 0) throw new CliError(`零件文件不能为空：${filePath}`, 4);
  if (metadata.size > MAX_FILE_BYTES) {
    throw new CliError(`零件文件超过 10 MiB（10,485,760 bytes）：${filePath}`, 4);
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
  if (filePaths.length === 0) throw new CliError("请至少明确指定一个零件文件。", 4);
  if (filePaths.length > MAX_CONCURRENT_PARTS) {
    throw new CliError(`一个批次最多同时分析 ${MAX_CONCURRENT_PARTS} 个零件，请分批顺序提交。`, 4);
  }
  const files = await Promise.all(filePaths.map(inspectFile));
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.realPath)) throw new CliError(`同一个文件不能重复分析：${file.path}`, 4);
    seen.add(file.realPath);
  }
  return files;
}

function isStepExtension(extension: string): boolean {
  return (STEP_ANALYSIS_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

function publicAnalysisResult(item: InternalAnalysisResult): AnalysisResult {
  const { conversion: _internalConversion, ...publicItem } = item;
  const components = Object.fromEntries(
    Object.entries(publicItem.components).map(([name, component]) => [
      name,
      { ...component, error_code: publicErrorCode(component.error_code) },
    ]),
  ) as AnalysisResult["components"];
  return { ...publicItem, components };
}

function publicErrorCode(value: string | undefined): string | undefined {
  if (!value) return value;
  return /HOOPS|CONVERSION/i.test(value) ? "CAD_INPUT_PROCESSING_FAILED" : value;
}

export function isBatchTerminal(status: AnalysisBatchResult["status"]): boolean {
  return ["completed", "completed_with_gaps", "failed", "expired"].includes(status);
}

function normalizeInput(input: SubmitAnalysisInput): {
  material: string;
  process: string;
  tolerance: string;
  surfaceRoughness: string;
  stock?: StockInput;
} {
  const process = normalizeProcess(input.process ?? DEFAULT_ANALYSIS_INPUT.process);
  return {
    material: input.material?.trim() || DEFAULT_ANALYSIS_INPUT.material,
    process,
    tolerance: input.tolerance?.trim() || DEFAULT_ANALYSIS_INPUT.tolerance,
    surfaceRoughness: input.surfaceRoughness?.trim() || DEFAULT_ANALYSIS_INPUT.surfaceRoughness,
    stock: normalizeStock(input.stock),
  };
}

function normalizeStock(stock: StockInput | undefined): StockInput | undefined {
  if (!stock) return undefined;
  const positive = (value: number): boolean => Number.isFinite(value) && value > 0;
  if (stock.shape === "block") {
    if (stock.size_mm.length !== 3 || !stock.size_mm.every(positive)) {
      throw new CliError("--stock-box 的三个尺寸必须是大于 0 的有限数字。", 4);
    }
    return { shape: "block", size_mm: [...stock.size_mm] as [number, number, number] };
  }
  if (!positive(stock.diameter_mm) || !positive(stock.length_mm)) {
    throw new CliError("--stock-cylinder 的直径和长度必须是大于 0 的有限数字。", 4);
  }
  return { ...stock };
}

function normalizeProcess(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === "cnc" ? "cnc-machining" : normalized;
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
    throw new CliError("分析服务返回了无法解析的数据。", 5);
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
