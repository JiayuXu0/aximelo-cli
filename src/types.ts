export type QuoteStatus =
  | "awaiting_upload"
  | "queued"
  | "analyzing"
  | "succeeded"
  | "no_auto_quote"
  | "failed"
  | "expired";

export interface QuoteOptions {
  materials: Array<{ value: string; label: string }>;
  processes: Array<{ value: string; label: string }>;
  max_file_bytes: number;
  supported_extensions: string[];
}

export interface UploadIntent {
  quote_id: string;
  status: QuoteStatus;
  upload_method: "PUT";
  upload_url: string;
  required_headers?: Record<string, string>;
  upload_expires_at: string;
  expires_at: string;
}

export interface PriceOption {
  option_type: "economy" | "standard" | "express";
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  currency: string;
  lead_time_days: number;
}

export interface DfmResult {
  auto_quote_available: boolean;
  risk_level: string;
  warnings: string[];
  suggestions: string[];
  required_manual_review: boolean;
}

export interface QuoteResult {
  quote_id: string;
  status: QuoteStatus;
  file_name: string;
  quantity: number;
  material: string;
  process: string;
  price_options: PriceOption[];
  dfm?: DfmResult;
  error_code?: "automatic_quote_unavailable" | "analysis_failed";
  requested_at: string;
  completed_at?: string;
  expires_at: string;
}
