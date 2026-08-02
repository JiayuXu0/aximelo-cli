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
const NON_DFM_SETUP_CODE = "SETUP_COUNT_EXCESSIVE";

export const COMPACT_SECTIONS = ["overview", "geometry", "stock", "machining", "route", "dfm", "preview"] as const;
export type CompactSection = (typeof COMPACT_SECTIONS)[number];

export function analysisResultInMinutes(result: AnalysisBatchResult) {
  return {
    ...result,
    items: result.items.map((item) => {
      if (!item.machining) return item;
      const { total_processing, stages, ...machining } = item.machining;
      return {
        ...item,
        machining: {
          ...machining,
          total_processing_minutes: hoursToMinutes(total_processing),
          stages: (stages ?? []).map((stage) => ({
            code: stage.code,
            minutes: hoursToMinutes(stage.hours),
          })),
        },
      };
    }),
  };
}

export function compactAnalysisResult(result: AnalysisBatchResult) {
  return {
    ok: result.status === "completed" || result.status === "completed_with_gaps",
    format: "agent-summary-v2",
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

export function extractCompactAnalysisResult(result: AnalysisBatchResult, section: CompactSection) {
  const compact = compactAnalysisResult(result);
  return {
    ok: compact.ok,
    format: "agent-extract-v2",
    limited: true,
    limits: compact.limits,
    batch: {
      batch_id: compact.batch.batch_id,
      status: compact.batch.status,
      result_url: compact.batch.result_url,
      expires_at: compact.batch.expires_at,
      item_count: compact.batch.item_count,
      extract: section,
      items: compact.batch.items.map((item) => ({
        index: item.index,
        analysis_id: item.analysis_id,
        file_name: item.file_name,
        status: item.status,
        material: item.material,
        process: item.process,
        components: item.components,
        content: selectContent(item, section),
      })),
    },
  };
}

export function isCompactSection(value: string): value is CompactSection {
  return (COMPACT_SECTIONS as readonly string[]).includes(value);
}

function compactPart(item: AnalysisResult, index: number) {
  const stages = (item.machining?.stages ?? []).map((stage) => ({
    code: stage.code,
    minutes: hoursToMinutes(stage.hours),
  }));
  return {
    index: index + 1,
    analysis_id: item.analysis_id,
    file_name: item.file_name,
    status: item.status,
    source_format: item.source_format,
    conversion: item.conversion,
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
          total_processing_minutes: hoursToMinutes(item.machining.total_processing),
          estimate_grade: item.machining.estimate_grade,
          setup_count: item.machining.setup_count,
          setup_count_confidence: item.machining.setup_count_confidence,
          setup_prediction: item.machining.setup_prediction,
          stock: item.machining.stock,
          stages: stages.slice(0, MAX_STAGES),
          stages_omitted: Math.max(0, stages.length - MAX_STAGES),
          cnc_breakdown_minutes: item.machining.cnc_breakdown_minutes
            ? {
                holemaking: item.machining.cnc_breakdown_minutes.holemaking,
                roughing: item.machining.cnc_breakdown_minutes.roughing,
                finishing: item.machining.cnc_breakdown_minutes.finishing,
                deburring: item.machining.cnc_breakdown_minutes.deburring,
              }
            : undefined,
          route: item.machining.route
            ? {
                machining_class: item.machining.route.machining_class,
                time_basis: item.machining.route.time_basis,
                toolpath_executable: item.machining.route.toolpath_executable,
                setup_count: item.machining.route.setup_count,
                setup_count_confidence: item.machining.route.setup_count_confidence,
                setup_prediction: item.machining.route.setup_prediction,
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

function selectContent(item: ReturnType<typeof compactPart>, section: CompactSection): unknown {
  if (section === "overview") return { tolerance: item.tolerance, surface_roughness: item.surface_roughness };
  if (section === "geometry") return item.geometry ?? null;
  if (section === "stock") {
    return {
      minimum_stock: item.geometry?.minimum_stock ?? null,
      machining_stock: item.machining?.stock ?? null,
    };
  }
  if (section === "machining") return item.machining ?? null;
  if (section === "route") return item.machining?.route ?? null;
  if (section === "dfm") return item.dfm ?? null;
  return item.preview ?? null;
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
  const findings = (item.dfm.findings ?? []).filter((finding) => !isSetupCountDfmCode(finding.code));
  const warnings = (item.dfm.warnings ?? []).filter((warning) => !isSetupCountDfmText(warning));
  const suggestions = (item.dfm.suggestions ?? []).filter((suggestion) => !isSetupCountDfmText(suggestion));
  return {
    risk_level: findings.length > 0 || warnings.length > 0 ? item.dfm.risk_level : "none",
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

export function isSetupCountDfmCode(value: string): boolean {
  return value.trim().toUpperCase() === NON_DFM_SETUP_CODE;
}

export function isSetupCountDfmText(value: string): boolean {
  const normalized = value.trim();
  return normalized.toUpperCase().includes(NON_DFM_SETUP_CODE)
    || ["装夹次数", "多次装夹", "重新装夹", "多工位"].some((phrase) => normalized.includes(phrase));
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

function hoursToMinutes(value: number): number {
  return Number((value * 60).toFixed(6));
}
