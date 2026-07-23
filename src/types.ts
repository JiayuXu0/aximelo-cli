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
  defaults?: {
    material: string;
    process: string;
    tolerance: string;
    surface_roughness: string;
  };
  capabilities?: Record<string, boolean | number | null>;
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

export interface MachiningTime {
  source?: "autocam";
  setup_count: number;
  estimate_grade?: string;
  stages?: Array<{ code: string; hours: number }>;
  total_processing: number;
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
