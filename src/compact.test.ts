import { describe, expect, it } from "vitest";
import { analysisResultInMinutes, compactAnalysisResult, extractCompactAnalysisResult, isSetupCountDfmText } from "./compact.js";
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
      format: "agent-summary-v2",
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
      finding_count: 19,
      findings_omitted: 13,
      warning_count: 9,
      warnings_omitted: 6,
      suggestion_count: 9,
      suggestions_omitted: 6,
    });
    expect(compact.batch.items[0]?.dfm?.findings[0]).toMatchObject({
      viewer_node_ids_omitted: 18,
    });
    expect(compact.batch.items[0]?.machining).toMatchObject({
      stages_omitted: 8,
      total_processing_minutes: 90,
      setup_count: 2,
      setup_count_confidence: 0.9,
      cnc_breakdown_minutes: { holemaking: 15, roughing: 45, finishing: 24, deburring: 6 },
    });
    expect(serialized).not.toContain("physical_setup_count");
    expect(serialized).not.toContain("setup_count_basis");
    expect(serialized).not.toContain("signed-preview-url");
    expect(serialized).not.toContain("signed-thumbnail-url");
    expect(serialized).not.toContain("SETUP_COUNT_EXCESSIVE");
    expect(serialized).not.toContain("装夹次数偏多");
    expect(serialized.length).toBeLessThan(30_000);
  });

  it("keeps setup count in machining but removes it from DFM", () => {
    const onlySetupRisk = part(1);
    onlySetupRisk.dfm = {
      risk_level: "medium",
      findings: [setupCountFinding()],
      warnings: ["装夹次数偏多"],
      suggestions: ["SETUP_COUNT_EXCESSIVE"],
    };
    const compact = compactAnalysisResult({
      batch_id: "batch-setup",
      status: "completed",
      result_path: "/tools/part-analysis/results/batch-setup",
      items: [onlySetupRisk],
      requested_at: "2026-07-30T00:00:00Z",
      expires_at: "2026-08-06T00:00:00Z",
    });

    expect(compact.batch.items[0]?.machining?.route?.setup_count).toBe(2);
    expect(compact.batch.items[0]?.dfm).toMatchObject({
      risk_level: "none",
      finding_count: 0,
      findings_omitted: 0,
      warning_count: 0,
      warnings_omitted: 0,
      suggestion_count: 0,
      suggestions_omitted: 0,
    });
  });

  it("extracts one bounded category for every part", () => {
    const result: AnalysisBatchResult = {
      batch_id: "batch-extract",
      status: "completed_with_gaps",
      result_path: "/tools/part-analysis/results/batch-extract",
      items: Array.from({ length: 5 }, (_, index) => part(index + 1)),
      requested_at: "2026-07-30T00:00:00Z",
      expires_at: "2026-08-06T00:00:00Z",
    };

    const extracted = extractCompactAnalysisResult(result, "route");

    expect(extracted).toMatchObject({
      ok: true,
      format: "agent-extract-v2",
      batch: { item_count: 5, extract: "route" },
    });
    expect(extracted.batch.items.map((item) => item.file_name)).toEqual([
      "part-1.step",
      "part-2.step",
      "part-3.step",
      "part-4.step",
      "part-5.step",
    ]);
    expect(extracted.batch.items[2]).toMatchObject({
      index: 3,
      file_name: "part-3.step",
      content: {
        machining_class: "mill_3axis",
        setup_count: 2,
        selected_route: { route_class: "mill_3axis" },
      },
    });
    expect(extracted.batch.items[0]?.content).not.toHaveProperty("geometry");
    expect(extracted.batch.items[0]?.content).not.toHaveProperty("dfm");
    expect(JSON.stringify(extracted).length).toBeLessThan(10_000);

    const machining = extractCompactAnalysisResult(result, "machining");
    expect(machining.batch.items[0]?.content).toMatchObject({
      total_processing_minutes: 90,
      cnc_breakdown_minutes: { deburring: 6 },
    });
    const machiningContent = machining.batch.items[0]?.content as { stages: Array<{ code: string; minutes: number }> };
    expect(machiningContent.stages[0]).toEqual({ code: "stage-0", minutes: 6 });
    expect(machining.batch.items[0]?.content).not.toHaveProperty("total_processing");
  });

  it("filters route/setup wording without hiding real fixture deformation risks", () => {
    expect(isSetupCountDfmText("需多次装夹转换（多工位）。特征散落在多个侧向几何面方向上，机床必须停机重新装夹。"))
      .toBe(true);
    expect(isSetupCountDfmText("薄壁件装夹变形风险较高，应增加支撑。"))
      .toBe(false);
  });

  it("converts full CLI JSON machining fields to minutes without retaining hour fields", () => {
    const converted = analysisResultInMinutes({
      batch_id: "batch-json",
      status: "completed",
      result_path: "/tools/part-analysis/results/batch-json",
      items: [part(1)],
      requested_at: "2026-07-30T00:00:00Z",
      expires_at: "2026-08-06T00:00:00Z",
    });

    expect(converted.items[0]?.machining).toMatchObject({
      total_processing_minutes: 90,
      cnc_breakdown_minutes: { deburring: 6 },
    });
    expect(converted.items[0]?.machining?.stages[0]).toEqual({ code: "stage-0", minutes: 6 });
    const serialized = JSON.stringify(converted.items[0]?.machining);
    expect(serialized).not.toContain("total_processing\"");
    expect(serialized).not.toContain("hours");
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
      setup_count: 2,
      setup_count_confidence: 0.9,
      setup_prediction: {
        status: "learned_prediction",
        predicted_count: 2,
        model_version: "as-setup-ordinal-hybrid-development-v1",
        model_sha256: "e".repeat(64),
        feature_schema_version: "autocam.setup-count-features.as-hybrid.v3",
        deployment_status: "authoritative_unverified",
        validation_status: "development_only_unvalidated",
      },
      cnc_breakdown_minutes: { holemaking: 15, roughing: 45, finishing: 24, deburring: 6 },
      stages: Array.from({ length: 20 }, (_, stage) => ({ code: `stage-${stage}`, hours: 0.1 })),
      route: {
        machining_class: "mill_3axis",
        time_basis: "toolpath",
        toolpath_executable: true,
        setup_count: 2,
        setup_count_confidence: 0.9,
        manual_quote_required: false,
        recommended_route: route(),
        selected_route: route(),
      },
    },
    dfm: {
      risk_level: "medium",
      findings: [
        setupCountFinding(),
        ...Array.from({ length: 19 }, (_, finding) => ({
          code: `RISK_${finding}`,
          level: "warning",
          status: "active",
          message_cn: longText,
          message_en: "",
          blocking: false,
          viewer_node_ids: Array.from({ length: 30 }, (_, node) => node + 1),
        })),
      ],
      warnings: ["装夹次数偏多", ...Array.from({ length: 9 }, () => longText)],
      suggestions: ["SETUP_COUNT_EXCESSIVE", ...Array.from({ length: 9 }, () => longText)],
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

function setupCountFinding() {
  return {
    code: "SETUP_COUNT_EXCESSIVE",
    level: "warning",
    status: "active",
    message_cn: "装夹次数偏多",
    message_en: "Too many setups",
    blocking: false,
    viewer_node_ids: [10, 12, 13],
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
