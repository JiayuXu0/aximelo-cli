import { describe, expect, it } from "vitest";
import { compactAnalysisResult } from "./compact.js";
import type { AnalysisBatchResult, AnalysisResult } from "./types.js";

describe("compact agent analysis output", () => {
  it("preserves all five items while bounding verbose DFM details", () => {
    const items = Array.from({ length: 5 }, (_, index) => part(index + 1));
    const result: AnalysisBatchResult = {
      batch_id: "batch-1",
      status: "completed_with_gaps",
      result_path: "/tools/part-analysis/results/batch-1",
      result_url: "https://test.yoxiang.cn/zh/tools/part-analysis/results/batch-1",
      items,
      requested_at: "2026-07-30T00:00:00Z",
      expires_at: "2026-08-06T00:00:00Z",
    };

    const compact = compactAnalysisResult(result);
    const serialized = JSON.stringify(compact);

    expect(compact).toMatchObject({
      ok: true,
      format: "agent-summary-v1",
      batch: { item_count: 5 },
    });
    expect(compact.batch.items.map((item) => item.file_name)).toEqual([
      "part-1.step",
      "part-2.step",
      "part-3.step",
      "part-4.step",
      "part-5.step",
    ]);
    expect(compact.batch.items[2]).toMatchObject({ index: 3, file_name: "part-3.step" });
    expect(compact.batch.items[0]?.dfm).toMatchObject({
      finding_count: 20,
      findings_omitted: 14,
      warning_count: 10,
      warnings_omitted: 7,
      suggestion_count: 10,
      suggestions_omitted: 7,
    });
    expect(compact.batch.items[0]?.dfm?.findings[0]).toMatchObject({
      viewer_node_ids_omitted: 18,
    });
    expect(compact.batch.items[0]?.machining).toMatchObject({ stages_omitted: 8 });
    expect(serialized).not.toContain("signed-preview-url");
    expect(serialized).not.toContain("signed-thumbnail-url");
    expect(serialized.length).toBeLessThan(30_000);
  });
});

function part(index: number): AnalysisResult {
  const longText = `风险-${index}-` + "很长的说明".repeat(100);
  return {
    analysis_id: `analysis-${index}`,
    status: index === 4 ? "completed_with_gaps" : "completed",
    file_name: `part-${index}.step`,
    material: "6061",
    process: "cnc-machining",
    tolerance: "ISO2768-m",
    surface_roughness: "Ra3.2",
    components: {
      geometry: { status: "succeeded" },
      dfm: { status: "succeeded" },
      machining: index === 4 ? { status: "failed", error_code: "AUTOCAM_FAILED" } : { status: "succeeded" },
      preview: { status: "succeeded" },
    },
    geometry: {
      length_mm: 100,
      width_mm: 80,
      height_mm: 20,
      volume_cm3: 120,
      surface_area_cm2: 400,
      complexity_score: 0.5,
      complexity_level: "medium",
      minimum_stock: {
        shape: "block",
        dimensions_mm: { length: 106, width: 86, height: 26 },
        volume_cm3: 237,
        material_density_kg_m3: 2700,
        mass_kg: 0.64,
      },
    },
    machining: {
      total_processing: 1.5,
      estimate_grade: "trusted",
      stages: Array.from({ length: 20 }, (_, stage) => ({ code: `stage-${stage}`, hours: 0.1 })),
      route: {
        machining_class: "mill_3axis",
        time_basis: "toolpath",
        toolpath_executable: true,
        setup_count: 2,
        manual_quote_required: false,
        recommended_route: route(),
        selected_route: route(),
      },
    },
    dfm: {
      risk_level: "medium",
      findings: Array.from({ length: 20 }, (_, finding) => ({
        code: `RISK_${finding}`,
        level: "warning",
        status: "active",
        message_cn: longText,
        message_en: "",
        blocking: false,
        viewer_node_ids: Array.from({ length: 30 }, (_, node) => node + 1),
      })),
      warnings: Array.from({ length: 10 }, () => longText),
      suggestions: Array.from({ length: 10 }, () => longText),
    },
    preview: {
      status: "succeeded",
      image_status: "succeeded",
      scs_url: "https://example.test/signed-preview-url",
      thumbnail_url: "https://example.test/signed-thumbnail-url",
    },
    requested_at: "2026-07-30T00:00:00Z",
    completed_at: "2026-07-30T00:01:00Z",
    expires_at: "2026-08-06T00:00:00Z",
  };
}

function route() {
  return {
    process_family: "milling" as const,
    kinematics: "3axis",
    route_class: "mill_3axis" as const,
    time_basis: "toolpath",
    toolpath_executable: true,
    estimated_seconds: 5400,
    required_region_coverage: 1,
    reason_codes: [],
    setup_count: 2,
    reclamp_count: 1,
  };
}
