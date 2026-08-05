import { describe, expect, it } from "vitest";
import { compactAnalysisResult, extractCompactAnalysisResult, isSetupCountDfmText, normalizeAnalysisResult } from "./compact.js";
import type { AnalysisBatchResult, AnalysisResult } from "./types.js";

describe("compact agent analysis output", () => {
  it("preserves all five items while bounding verbose DFM details", () => {
    const items = Array.from({ length: 5 }, (_, index) => part(index + 1));
    const result: AnalysisBatchResult = {
      batch_id: "batch-1",
      status: "completed_with_gaps",
      result_path: "/tools/part-analysis/results/batch-1",
      result_url: "https://app.aximelo.ai/zh/tools/part-analysis/results/batch-1",
      items,
      requested_at: "2026-07-30T00:00:00Z",
      expires_at: "2026-08-06T00:00:00Z",
    };

    const compact = compactAnalysisResult(result);
    const serialized = JSON.stringify(compact);

    expect(compact).toMatchObject({
      ok: true,
      format: "agent-summary-v3",
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
    expect(compact.batch.items[0]?.geometry).toMatchObject({
      bounding_box_xyz_mm: [100, 80, 20],
      shop_dimensions_mm: { length: 100, width: 80, thickness: 20 },
      minimum_stock: {
        shop_dimensions_mm: { length: 106, width: 86, thickness: 26 },
      },
    });
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

    expect(compact.batch.items[0]?.machining).toMatchObject({
      setup_count: 2,
      route_recommendation: "three_axis",
    });
    const serialized = JSON.stringify(compact.batch.items[0]?.machining);
    expect(serialized.match(/"setup_count"/g)).toHaveLength(1);
    expect(serialized).not.toContain("predicted_count");
    expect(serialized).not.toContain("recommended_route");
    expect(serialized).not.toContain("selected_route");
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
      format: "agent-extract-v3",
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
      content: "three_axis",
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

    const geometry = extractCompactAnalysisResult(result, "geometry");
    expect(geometry.batch.items[0]?.content).toMatchObject({
      bounding_box_xyz_mm: [100, 80, 20],
      shop_dimensions_mm: { length: 100, width: 80, thickness: 20 },
    });
  });

  it("filters route/setup wording without hiding real fixture deformation risks", () => {
    expect(isSetupCountDfmText("需多次装夹转换（多工位）。特征散落在多个侧向几何面方向上，机床必须停机重新装夹。"))
      .toBe(true);
    expect(isSetupCountDfmText("薄壁件装夹变形风险较高，应增加支撑。"))
      .toBe(false);
  });

  it("keeps the API minute contract and removes the duplicate result path", () => {
    const converted = normalizeAnalysisResult({
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
      stock: {
        derivation_mode: "generic_allowance",
        shop_dimensions_mm: { length: 110, width: 90, thickness: 20 },
      },
    });
    expect(converted.items[0]?.machining?.stages[0]).toEqual({ code: "stage-0", minutes: 6 });
    expect(converted.result_url).toBe("/tools/part-analysis/results/batch-json");
    expect(converted).not.toHaveProperty("result_path");
    const serialized = JSON.stringify(converted.items[0]?.machining);
    expect(serialized).not.toContain("total_processing\"");
    expect(serialized).not.toContain("hours");
  });

  it("returns aggregate dimensions, total volume, and the reason for multi-solid files", () => {
    const multiSolid = part(1);
    multiSolid.status = "completed_with_gaps";
    multiSolid.geometry = {
      ...multiSolid.geometry!,
      solid_count: 2,
      length_mm: 90,
      width_mm: 20,
      height_mm: 8,
      bounding_box_xyz_mm: [90, 20, 8],
      shop_dimensions_mm: { length: 90, width: 20, thickness: 8 },
      volume_cm3: 11.041,
    };
    const compact = compactAnalysisResult({
      batch_id: "batch-multi-solid",
      status: "completed_with_gaps",
      result_path: "/tools/part-analysis/results/batch-multi-solid",
      items: [multiSolid],
      requested_at: "2026-08-05T00:00:00Z",
      expires_at: "2026-08-12T00:00:00Z",
    });
    const item = compact.batch.items[0]!;

    expect(item.geometry).toEqual({
      length_mm: 90,
      width_mm: 20,
      height_mm: 8,
      solid_count: 2,
      bounding_box_xyz_mm: [90, 20, 8],
      shop_dimensions_mm: { length: 90, width: 20, thickness: 8 },
      volume_cm3: 11.041,
      surface_area_cm2: undefined,
      complexity_score: undefined,
      complexity_level: undefined,
      minimum_stock: undefined,
    });
    expect(item.components).toMatchObject({
      geometry: { status: "succeeded" },
      machining: { status: "unavailable", error_code: "MULTI_SOLID_UNSUPPORTED" },
      dfm: { status: "unavailable", error_code: "MULTI_SOLID_UNSUPPORTED" },
    });
    expect(item.machining).toBeUndefined();
    expect(item.dfm).toBeUndefined();

    const normalized = normalizeAnalysisResult({
      batch_id: "batch-multi-solid",
      status: "completed_with_gaps",
      result_path: "/tools/part-analysis/results/batch-multi-solid",
      items: [multiSolid],
      requested_at: "2026-08-05T00:00:00Z",
      expires_at: "2026-08-12T00:00:00Z",
    });
    expect(normalized.items[0]).toMatchObject({
      geometry: {
        solid_count: 2,
        bounding_box_xyz_mm: [90, 20, 8],
        shop_dimensions_mm: { length: 90, width: 20, thickness: 8 },
        volume_cm3: 11.041,
      },
      components: {
        machining: { status: "unavailable", error_code: "MULTI_SOLID_UNSUPPORTED" },
        dfm: { status: "unavailable", error_code: "MULTI_SOLID_UNSUPPORTED" },
      },
    });
    expect(normalized.items[0]?.geometry?.volume_cm3).toBe(11.041);
    expect(normalized.items[0]?.geometry).not.toHaveProperty("minimum_stock");
    expect(normalized.items[0]?.machining).toBeUndefined();
    expect(normalized.items[0]?.dfm).toBeUndefined();

    const extracted = extractCompactAnalysisResult({
      batch_id: "batch-multi-solid",
      status: "completed_with_gaps",
      result_path: "/tools/part-analysis/results/batch-multi-solid",
      items: [multiSolid],
      requested_at: "2026-08-05T00:00:00Z",
      expires_at: "2026-08-12T00:00:00Z",
    }, "stock");
    expect(extracted.batch.items[0]?.content).toEqual({
      minimum_stock: null,
      machining_stock: null,
    });
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
      bounding_box_xyz_mm: [100, 80, 20],
      shop_dimensions_mm: { length: 100, width: 80, thickness: 20 },
      volume_cm3: 120,
      surface_area_cm2: 400,
      complexity_score: 0.5,
      complexity_level: "medium",
      minimum_stock: {
        shape: "block",
        dimensions_mm: { length: 106, width: 86, height: 26 },
        shop_dimensions_mm: { length: 106, width: 86, thickness: 26 },
        volume_cm3: 237,
        material_density_kg_m3: 2700,
        mass_kg: 0.64,
      },
    },
    machining: {
      total_processing_minutes: 90,
      estimate_grade: "trusted",
      setup_count: 2,
      setup_count_confidence: 0.9,
      setup_model: {
        version: "as-setup-ordinal-hybrid-ml-only-development-v3",
        sha256: "e".repeat(64),
        feature_schema_version: "autocam.setup-count-features.as-hybrid.v7",
        deployment_status: "authoritative_unverified",
        validation_status: "development_only_unvalidated",
      },
      cnc_breakdown_minutes: { holemaking: 15, roughing: 45, finishing: 24, deburring: 6 },
      stages: Array.from({ length: 20 }, (_, stage) => ({ code: `stage-${stage}`, minutes: 6 })),
      route_recommendation: "three_axis",
      ...(index === 1 ? {
        stock: {
          shape: "block" as const,
          source: "derived" as const,
          derivation_mode: "generic_allowance" as const,
          input_size_mm: [20, 110, 90] as [number, number, number],
          resolved_size_mm: [20, 110, 90] as [number, number, number],
          frame: {
            oriented: true,
            origin_mm: [0, 0, 0] as [number, number, number],
            x_axis: [1, 0, 0] as [number, number, number],
            y_axis: [0, 1, 0] as [number, number, number],
            z_axis: [0, 0, 1] as [number, number, number],
          },
          shop_dimensions_mm: { length: 110, width: 90, thickness: 20 },
          axis: [1, 0, 0] as [number, number, number],
          envelope_contains_part: true,
          volume_cm3: 198,
          mass_kg: 0.5346,
        },
      } : {}),
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
