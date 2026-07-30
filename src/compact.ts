import type {
  AnalysisBatchResult,
  AnalysisComponent,
  AnalysisResult,
  AutoCamRoute,
  DfmFinding,
} from "./types.js";

const MAX_FINDINGS = 6;
const MAX_WARNINGS = 3;
const MAX_SUGGESTIONS = 3;
const MAX_NODE_IDS = 12;
const MAX_STAGES = 12;
const MAX_REASON_CODES = 12;
const MAX_TEXT_CHARS = 180;

export function compactAnalysisResult(result: AnalysisBatchResult) {
  return {
    ok: result.status === "completed" || result.status === "completed_with_gaps",
    format: "agent-summary-v1",
    limited: true,
    limits: {
      findings_per_item: MAX_FINDINGS,
      warnings_per_item: MAX_WARNINGS,
      suggestions_per_item: MAX_SUGGESTIONS,
      node_ids_per_finding: MAX_NODE_IDS,
      text_chars: MAX_TEXT_CHARS,
    },
    batch: {
      batch_id: result.batch_id,
      status: result.status,
      result_url: result.result_url ?? result.result_path,
      expires_at: result.expires_at,
      item_count: result.items.length,
      items: result.items.map((item, index) => compactPart(item, index)),
    },
  };
}

function compactPart(item: AnalysisResult, index: number) {
  const stages = item.machining?.stages ?? [];
  return {
    index: index + 1,
    analysis_id: item.analysis_id,
    file_name: item.file_name,
    status: item.status,
    material: item.material,
    process: item.process,
    tolerance: item.tolerance,
    surface_roughness: item.surface_roughness,
    components: Object.fromEntries(
      Object.entries(item.components).map(([name, component]) => [name, compactComponent(component)]),
    ),
    geometry: item.geometry
      ? {
          length_mm: item.geometry.length_mm,
          width_mm: item.geometry.width_mm,
          height_mm: item.geometry.height_mm,
          volume_cm3: item.geometry.volume_cm3,
          surface_area_cm2: item.geometry.surface_area_cm2,
          complexity_score: item.geometry.complexity_score,
          complexity_level: item.geometry.complexity_level,
          minimum_stock: item.geometry.minimum_stock,
        }
      : undefined,
    machining: item.machining
      ? {
          total_processing: item.machining.total_processing,
          estimate_grade: item.machining.estimate_grade,
          setup_count: item.machining.setup_count,
          stock: item.machining.stock,
          stages: stages.slice(0, MAX_STAGES),
          stages_omitted: Math.max(0, stages.length - MAX_STAGES),
          route: item.machining.route
            ? {
                machining_class: item.machining.route.machining_class,
                time_basis: item.machining.route.time_basis,
                toolpath_executable: item.machining.route.toolpath_executable,
                setup_count: item.machining.route.setup_count,
                manual_quote_required: item.machining.route.manual_quote_required,
                manual_quote_reason_codes: limitedStrings(item.machining.route.manual_quote_reason_codes ?? [], MAX_REASON_CODES),
                recommended_route: compactRoute(item.machining.route.recommended_route),
                selected_route: compactRoute(item.machining.route.selected_route),
              }
            : undefined,
        }
      : undefined,
    dfm: compactDfm(item),
    preview: item.preview
      ? {
          status: item.preview.status,
          image_status: item.preview.image_status,
          preview_available: Boolean(item.preview.scs_url),
          thumbnail_available: Boolean(item.preview.thumbnail_url),
          error_message: compactText(item.preview.error_message),
        }
      : undefined,
  };
}

function compactComponent(component: AnalysisComponent) {
  return {
    status: component.status,
    error_code: compactText(component.error_code),
  };
}

function compactRoute(route: AutoCamRoute | undefined) {
  if (!route) return undefined;
  return {
    process_family: route.process_family,
    kinematics: route.kinematics,
    route_class: route.route_class,
    time_basis: route.time_basis,
    toolpath_executable: route.toolpath_executable,
    estimated_seconds: route.estimated_seconds,
    required_region_coverage: route.required_region_coverage,
    setup_count: route.setup_count,
    reclamp_count: route.reclamp_count,
    reason_codes: limitedStrings(route.reason_codes, MAX_REASON_CODES),
  };
}

function compactDfm(item: AnalysisResult) {
  if (!item.dfm) return undefined;
  const findings = item.dfm.findings ?? [];
  const warnings = item.dfm.warnings ?? [];
  const suggestions = item.dfm.suggestions ?? [];
  return {
    risk_level: item.dfm.risk_level,
    finding_count: findings.length,
    findings: findings.slice(0, MAX_FINDINGS).map(compactFinding),
    findings_omitted: Math.max(0, findings.length - MAX_FINDINGS),
    warning_count: warnings.length,
    warnings: limitedStrings(warnings, MAX_WARNINGS),
    warnings_omitted: Math.max(0, warnings.length - MAX_WARNINGS),
    suggestion_count: suggestions.length,
    suggestions: limitedStrings(suggestions, MAX_SUGGESTIONS),
    suggestions_omitted: Math.max(0, suggestions.length - MAX_SUGGESTIONS),
  };
}

function compactFinding(finding: DfmFinding) {
  const nodeIds = finding.viewer_node_ids ?? [];
  return {
    code: compactText(finding.code),
    level: compactText(finding.level),
    status: compactText(finding.status),
    blocking: finding.blocking,
    message: compactText(finding.message_cn || finding.message_en || finding.code),
    viewer_node_ids: nodeIds.slice(0, MAX_NODE_IDS),
    viewer_node_ids_omitted: Math.max(0, nodeIds.length - MAX_NODE_IDS),
  };
}

function limitedStrings(values: string[], limit: number): string[] {
  return values.slice(0, limit).map((value) => compactText(value) ?? "");
}

function compactText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return Array.from(normalized).slice(0, MAX_TEXT_CHARS).join("");
}
