export type AnalysisStatus =
  | "processing"
  | "completed"
  | "completed_with_gaps"
  | "failed"
  | "expired";

export interface AnalysisOptions {
  materials: Array<{ value: string; label: string }>;
  processes: Array<{ value: string; label: string }>;
  surface_roughness?: Array<{ value: string; label: string }>;
  tolerances?: Array<{ value: string; label: string }>;
  max_file_bytes: number;
  supported_extensions: string[];
  passthrough_extensions?: string[];
  conversion_extensions?: string[];
  supported_stock_shapes?: Array<"block" | "cylinder">;
  defaults?: {
    material: string;
    process: string;
    tolerance: string;
    surface_roughness: string;
  };
  capabilities?: Record<string, boolean | number | null>;
}

export interface CadConversionUploadIntent {
  item_id: string;
  file_name: string;
  status: "awaiting_upload";
  upload_method: "PUT";
  upload_url: string;
  required_headers?: Record<string, string>;
}

export interface CadConversionBatchIntent {
  batch_id: string;
  status: "awaiting_upload";
  download_token: string;
  items: CadConversionUploadIntent[];
  expires_at: string;
}

export interface CadConversionItem {
  item_id: string;
  file_name: string;
  status: "awaiting_upload" | "converting" | "succeeded" | "failed";
  source_format: string;
  error_code?: string;
}

export interface CadConversionBatch {
  batch_id: string;
  status: "awaiting_upload" | "processing" | "completed" | "completed_with_errors" | "failed" | "expired";
  items: CadConversionItem[];
  expires_at: string;
}

export interface CliConvertItem {
  source_file: string;
  output_file: string;
  source_format: string;
  conversion: "passthrough" | "hoops";
  status: "succeeded";
}

export interface CliConvertResult {
  ok: boolean;
  format: "cli-convert-json-v1";
  status: "completed";
  items: CliConvertItem[];
}

export type StockInput =
  | { shape: "block"; size_mm: [number, number, number] }
  | { shape: "cylinder"; diameter_mm: number; length_mm: number };

export interface MachiningStock {
  shape: "block" | "cylinder" | "profile";
  source: "provided" | "derived";
  input_size_mm: [number, number, number];
  resolved_size_mm: [number, number, number];
  axis: [number, number, number];
  diameter_mm?: number;
  length_mm?: number;
  envelope_contains_part: boolean;
  volume_cm3: number;
  mass_kg: number;
}

export interface AnalysisUploadIntent {
  analysis_id: string;
  status: "awaiting_upload";
  upload_method: "PUT";
  upload_url: string;
  required_headers?: Record<string, string>;
  upload_expires_at: string;
  expires_at: string;
}

export interface AnalysisBatchUploadIntent {
  batch_id: string;
  status: "awaiting_upload";
  result_path: string;
  items: AnalysisUploadIntent[];
  expires_at: string;
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

export interface AnalysisDfm {
  risk_level: string;
  warnings: string[];
  suggestions: string[];
  findings: DfmFinding[];
}

export interface AutoCamRoute {
  process_family: "milling" | "turning" | "mill_turn";
  kinematics: string;
  route_class: "mill_3axis" | "mill_5axis" | "mill_turn";
  time_basis: string;
  toolpath_executable: boolean;
  estimated_seconds: number;
  required_region_coverage: number;
  reason_codes: string[];
  setup_count?: number;
  reclamp_count?: number;
}

export interface AutoCamRouteProjection {
  machining_class: "mill_3axis" | "mill_5axis_required";
  recommended_route?: AutoCamRoute;
  selected_route?: AutoCamRoute;
  route_options?: AutoCamRoute[];
  time_basis: string;
  toolpath_executable: boolean;
  setup_count?: number;
  setup_count_confidence?: number;
  setup_prediction?: SetupPrediction;
  manual_quote_required: boolean;
  manual_quote_reason_codes?: string[];
}

export interface SetupPrediction {
  status: "learned_prediction";
  predicted_count: number;
  model_version: string;
  model_sha256: string;
  feature_schema_version: string;
  deployment_status: "authoritative" | "authoritative_unverified";
  validation_status: "development_only_unvalidated" | "validation_certified";
}

export interface MachiningTime {
  source?: "autocam";
  setup_count?: number;
  setup_count_confidence?: number;
  setup_prediction?: SetupPrediction;
  estimate_grade?: string;
  stages?: Array<{ code: string; hours: number }>;
  /** Alternative minute classification of the same raw total; do not add to stages. */
  cnc_breakdown_minutes?: {
    holemaking: number;
    roughing: number;
    finishing: number;
    deburring: number;
  };
  total_processing: number;
  route?: AutoCamRouteProjection;
  stock?: MachiningStock;
}

export interface MinimumStock {
  shape: "block" | "cylinder";
  dimensions_mm: Record<string, number>;
  volume_cm3: number;
  material_density_kg_m3: number;
  mass_kg: number;
}

export interface AnalysisGeometry {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  volume_cm3: number;
  surface_area_cm2: number;
  complexity_score: number;
  complexity_level: "low" | "medium" | "high";
  minimum_stock?: MinimumStock;
}

export interface AnalysisPreview {
  status: "pending" | "running" | "succeeded" | "failed";
  image_status?: "pending" | "running" | "succeeded" | "failed";
  scs_url?: string;
  thumbnail_url?: string;
  error_message?: string;
}

export interface AnalysisComponent {
  status: "pending" | "succeeded" | "unavailable" | "failed";
  error_code?: string;
}

export interface AnalysisResult {
  analysis_id: string;
  status: AnalysisStatus;
  file_name: string;
  material: string;
  process: string;
  tolerance?: string;
  surface_roughness?: string;
  components: {
    geometry: AnalysisComponent;
    dfm: AnalysisComponent;
    machining: AnalysisComponent;
    preview: AnalysisComponent;
  };
  source_format?: string;
  conversion?: {
    status: "not_required" | "pending" | "running" | "succeeded" | "failed";
    error_code?: string;
  };
  machining?: MachiningTime;
  geometry?: AnalysisGeometry;
  dfm?: AnalysisDfm;
  preview?: AnalysisPreview;
  requested_at: string;
  completed_at?: string;
  expires_at: string;
}

export interface AnalysisBatchResult {
  batch_id: string;
  status: AnalysisStatus;
  result_path: string;
  result_url?: string;
  items: AnalysisResult[];
  requested_at: string;
  expires_at: string;
}
