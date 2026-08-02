import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { CliError } from "./client.js";

export interface CostProfile {
  version: 1;
  currency: string;
  startup_fee_per_design: number;
  programming_fee_per_design: number;
  machine_hour_rate: number;
  setup_fee_per_setup: number;
  materials: Record<string, { price_per_kg: number }>;
  stock_adjustment: {
    block_allowance_per_side_mm: number;
    cylinder_radial_allowance_mm: number;
    cylinder_end_allowance_mm: number;
    round_up_mm: number;
  };
}

export interface ConfigureCostProfileInput {
  currency?: string;
  startupFee: number;
  programmingFee: number;
  machineHourRate: number;
  setupFee: number;
  material: string;
  materialPricePerKg: number;
}

export function costProfilePath(env: NodeJS.ProcessEnv = process.env): string {
  if (platform() === "win32") {
    return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "aximelo", "cost-profile.json");
  }
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "aximelo", "cost-profile.json");
}

export async function loadCostProfile(): Promise<CostProfile | undefined> {
  try {
    const raw = await readFile(costProfilePath(), "utf8");
    return validateProfile(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    if (error instanceof CliError) throw error;
    throw new CliError("无法读取本地成本配置。", 4, error);
  }
}

export async function configureCostProfile(input: ConfigureCostProfileInput): Promise<CostProfile> {
  const profile: CostProfile = {
    version: 1,
    currency: normalizeCurrency(input.currency ?? "CNY"),
    startup_fee_per_design: nonNegative(input.startupFee, "--startup-fee"),
    programming_fee_per_design: nonNegative(input.programmingFee, "--programming-fee"),
    machine_hour_rate: nonNegative(input.machineHourRate, "--machine-hour-rate"),
    setup_fee_per_setup: nonNegative(input.setupFee, "--setup-fee"),
    materials: {
      [normalizeMaterial(input.material)]: {
        price_per_kg: nonNegative(input.materialPricePerKg, "--price-per-kg"),
      },
    },
    stock_adjustment: {
      block_allowance_per_side_mm: 3,
      cylinder_radial_allowance_mm: 3,
      cylinder_end_allowance_mm: 3,
      round_up_mm: 0,
    },
  };
  await saveCostProfile(profile);
  return profile;
}

export async function setMaterialPrice(material: string, pricePerKg: number): Promise<CostProfile> {
  const profile = await requireCostProfile();
  profile.materials[normalizeMaterial(material)] = {
    price_per_kg: nonNegative(pricePerKg, "--price-per-kg"),
  };
  await saveCostProfile(profile);
  return profile;
}

export async function setStockAdjustment(input: Partial<CostProfile["stock_adjustment"]>): Promise<CostProfile> {
  const profile = await requireCostProfile();
  profile.stock_adjustment = {
    ...profile.stock_adjustment,
    ...Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, nonNegative(value, key)]),
    ),
  };
  await saveCostProfile(profile);
  return profile;
}

async function requireCostProfile(): Promise<CostProfile> {
  const profile = await loadCostProfile();
  if (!profile) {
    throw new CliError("本地成本配置尚未完成，请先运行 aximelo cost-profile configure。", 4);
  }
  return profile;
}

async function saveCostProfile(profile: CostProfile): Promise<void> {
  const path = costProfilePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (platform() !== "win32") await chmod(path, 0o600);
}

function validateProfile(value: unknown): CostProfile {
  if (!value || typeof value !== "object") throw new CliError("本地成本配置格式无效。", 4);
  const profile = value as CostProfile;
  if (profile.version !== 1 || !profile.materials || !profile.stock_adjustment) {
    throw new CliError("本地成本配置版本不受支持。", 4);
  }
  return profile;
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new CliError("--currency 必须是三位币种代码。", 4);
  return currency;
}

function normalizeMaterial(value: string): string {
  const material = value.trim().toUpperCase();
  if (!material) throw new CliError("材料代码不能为空。", 4);
  return material;
}

function nonNegative(value: number | undefined, name: string): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    throw new CliError(`${name} 必须是大于或等于 0 的数字。`, 4);
  }
  return value;
}
