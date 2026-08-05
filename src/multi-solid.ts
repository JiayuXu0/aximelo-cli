import type { AnalysisResult } from "./types.js";

export const MULTI_SOLID_UNSUPPORTED = "MULTI_SOLID_UNSUPPORTED";

export function isMultiSolidAnalysis(item: AnalysisResult): boolean {
  if ((item.geometry?.solid_count ?? 0) > 1) return true;
  return [item.components.machining, item.components.dfm]
    .some((component) => component.error_code === MULTI_SOLID_UNSUPPORTED);
}
