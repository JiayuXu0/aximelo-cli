import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureCostProfile, costProfilePath, loadCostProfile, setMaterialPrice, setStockAdjustment } from "./cost-profile.js";

describe("local cost profile", () => {
  let previous: string | undefined;
  beforeEach(async () => {
    previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), "aximelo-cost-"));
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previous;
  });

  it("reports missing and saves the five initial rates with 3 mm stock allowances", async () => {
    await expect(loadCostProfile()).resolves.toBeUndefined();
    const profile = await configureCostProfile({ startupFee: 100, programmingFee: 200, machineHourRate: 0, setupFee: 0, material: "6061", materialPricePerKg: 30 });
    expect(profile).toMatchObject({ currency: "CNY", startup_fee_per_design: 100, programming_fee_per_design: 200, machine_hour_rate: 0, setup_fee_per_setup: 0, materials: { "6061": { price_per_kg: 30 } }, stock_adjustment: { block_allowance_per_side_mm: 3, cylinder_radial_allowance_mm: 3, cylinder_end_allowance_mm: 3, round_up_mm: 0 } });
    if (process.platform !== "win32") expect((await stat(costProfilePath())).mode & 0o777).toBe(0o600);
  });

  it("appends new materials and independently updates stock adjustments", async () => {
    await configureCostProfile({ startupFee: 1, programmingFee: 2, machineHourRate: 3, setupFee: 4, material: "6061", materialPricePerKg: 5 });
    await setMaterialPrice("7075", 36);
    const profile = await setStockAdjustment({ cylinder_radial_allowance_mm: 2, round_up_mm: 5 });
    expect(profile.materials).toEqual({ "6061": { price_per_kg: 5 }, "7075": { price_per_kg: 36 } });
    expect(profile.stock_adjustment).toMatchObject({ block_allowance_per_side_mm: 3, cylinder_radial_allowance_mm: 2, cylinder_end_allowance_mm: 3, round_up_mm: 5 });
  });

  it("rejects negative rates", async () => {
    await expect(configureCostProfile({ startupFee: -1, programmingFee: 0, machineHourRate: 0, setupFee: 0, material: "6061", materialPricePerKg: 0 })).rejects.toMatchObject({ exitCode: 4 });
  });
});
