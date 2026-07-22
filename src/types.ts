export type QuoteStatus =
  | "awaiting_upload"
  | "queued"
  | "analyzing"
  | "succeeded"
  | "no_auto_quote"
  | "failed"
  | "expired";

export type BatchStatus =
  | "awaiting_upload"
  | "processing"
  | "succeeded"
  | "completed_with_errors";

export interface QuoteOptions {
  materials: Array<{ value: string; label: string }>;
  processes: Array<{ value: string; label: string }>;
  surface_finishes?: Array<{ value: string; label: string }>;
  surface_roughness?: Array<{ value: string; label: string }>;
  tolerances?: Array<{ value: string; label: string }>;
  max_file_bytes: number;
  supported_extensions: string[];
  defaults?: QuoteDefaults;
  capabilities?: Record<string, boolean>;
}

export interface QuoteDefaults {
  material: string;
  process: string;
  quantity: number;
  surface_finish: string;
  tolerance: string;
  surface_roughness: string;
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

export interface BatchUploadIntent {
  batch_id: string;
  status: "awaiting_upload";
  result_path: string;
  items: UploadIntent[];
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

export interface DfmFinding {
  code: string;
  level: string;
  status: string;
  message_cn: string;
  message_en: string;
  blocking: boolean;
  viewer_node_ids: number[];
}

export interface DfmResult {
  auto_quote_available: boolean;
  risk_level: string;
  warnings: string[];
  suggestions: string[];
  required_manual_review: boolean;
  findings?: DfmFinding[];
}

export interface MachiningTimeHours {
  first_rough: number;
  second_rough: number;
  hole_rough: number;
  semi_finishing: number;
  finishing: number;
  hole_finishing: number;
  sharp_edge_deburring: number;
  tool_change: number;
  total_processing: number;
}

export interface GeometrySummary {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  volume_cm3: number;
  surface_area_cm2: number;
  complexity_score: number;
  complexity_level: "low" | "medium" | "high";
}

export interface QuotePreview {
  status: "pending" | "running" | "succeeded" | "failed";
  image_status?: "pending" | "running" | "succeeded" | "failed";
  scs_url?: string;
  thumbnail_url?: string;
  error_message?: string;
}

export interface QuoteResult {
  quote_id: string;
  status: QuoteStatus;
  file_name: string;
  quantity: number;
  material: string;
  process: string;
  surface_finish?: string;
  tolerance?: string;
  surface_roughness?: string;
  price_options: PriceOption[];
  machining_time_hours?: MachiningTimeHours;
  geometry?: GeometrySummary;
  dfm?: DfmResult;
  preview?: QuotePreview;
  error_code?: "automatic_quote_unavailable" | "analysis_failed";
  requested_at: string;
  completed_at?: string;
  expires_at: string;
}

export interface BatchQuoteResult {
  batch_id: string;
  status: BatchStatus;
  result_path: string;
  result_url?: string;
  items: QuoteResult[];
  requested_at: string;
  expires_at: string;
}
