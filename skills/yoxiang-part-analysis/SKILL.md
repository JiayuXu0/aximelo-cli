---
name: yoxiang-part-analysis
description: Analyze explicitly provided STEP/STP manufacturing parts with Yoxiang and optionally calculate a local estimate from the user's saved cost profile. Use for part dimensions, minimum stock, machining time and stages, setup count, DFM, 3D preview, local cost estimates, or Yoxiang CLI installation/update requests.
---

# Yoxiang Part Analysis

Use the public service for manufacturing analysis only. It never returns a price or lead time. When the user asks for a cost estimate, calculate it directly from the analysis result and the private cost profile stored on the user's machine; never upload those rates.

## Atomic capabilities

- Analyze one to five explicitly named STEP/STP files in one batch.
- Read part bounding-box dimensions, solid volume, surface area, and complexity.
- Read minimum stock shape, dimensions, volume, density, and mass.
- Read total machining time, stage times, setup count, and estimate grade.
- Read structured DFM findings, suggestions, and associated 3D node IDs.
- Read 3D preview and thumbnail state and links.
- Configure/show local fixed fees, hourly/setup rates, material prices, and stock adjustments.
- Calculate a transparent local estimate with the fixed formula below.

## Safety and defaults

- Upload only exact paths explicitly provided or selected by the user. Never search, glob, recurse, list, or scan directories for models.
- Never add adjacent files, drawings, assemblies, or archives.
- Each file must be `.step` or `.stp` and no larger than 10 MiB (10,485,760 bytes).
- Use at most five files per batch. For more than five explicit files, submit sequential groups; never fan out parallel CLI processes.
- Defaults are material `6061`, process `cnc-machining`, tolerance `ISO2768-m`, and roughness `Ra3.2`. Do not ask about omitted manufacturing parameters.
- Do not call ERP, debug, internal quote, or retired public quote endpoints. Do not expose internal algorithms, traces, storage paths, or rules.
- Treat the output and any locally calculated cost as an estimate, not an order or binding offer.
- Analysis and 3D results are retained for seven days. Remind the user not to upload a model they are not authorized to share.

## Analysis workflow

For up to five exact paths, run the analysis exactly once:

```bash
yoxiang analyze "/exact/path/a.step" "/exact/path/b.stp" --wait --json
```

Add `--material`, `--process`, `--tolerance`, or `--surface-roughness` only when the user explicitly overrides a default. Do not run `doctor` or `analyze options` first. Use `doctor` only after installation or connection failure; use `analyze options` only when an explicit non-default value cannot be mapped.

DFM warnings do not block machining-time analysis or a local cost estimate. Mark the risk prominently. Preserve `geometry`, `dfm`, `machining`, and `preview` component statuses independently when the batch is `completed_with_gaps`.

## Local cost profile

After the single analysis call, read the profile once:

```bash
yoxiang cost-profile show --json
```

The file is `${XDG_CONFIG_HOME:-~/.config}/yoxiang/cost-profile.json` on POSIX and `%APPDATA%\\yoxiang\\cost-profile.json` on Windows. It is mode `0600` on POSIX.

If `cost_profile` is `missing` and a price is requested, stop and ask one blocking question for all five values:

1. Startup fixed fee, charged once per design.
2. Programming fee, charged once per design.
3. Machine-hour rate, allowed to be `0`.
4. Setup fee per setup, allowed to be `0`.
5. 6061 material price in CNY/kg.

After the user answers, save them with one non-interactive command:

```bash
yoxiang cost-profile configure --startup-fee <n> --programming-fee <n> --machine-hour-rate <n> --setup-fee <n> --material 6061 --price-per-kg <n> --currency CNY --json
```

If the analyzed material is absent from `materials`, stop and ask its CNY/kg price, then append it:

```bash
yoxiang cost-profile material set <material> --price-per-kg <n> --json
```

Never infer or invent a rate. Updating the CLI or Skill must not replace an existing profile.

## Stock adjustment

With all adjustments at their default `0`, use the service's minimum-stock mass unchanged.

When adjustments are configured, recompute without early rounding:

- Block: add twice `block_allowance_per_side_mm` to each of length, width, and height.
- Cylinder: add twice `cylinder_radial_allowance_mm` to diameter and twice `cylinder_end_allowance_mm` to length.
- If `round_up_mm > 0`, round every adjusted dimension upward independently to the next multiple of that value.
- Block volume in mm³ is `length × width × height`.
- Cylinder volume in mm³ is `π × (diameter / 2)² × length`.
- Mass in kg is `volume_mm3 × material_density_kg_m3 / 1,000,000,000`.

Show both minimum and adjusted stock dimensions whenever an adjustment is applied.

## Cost formula

For each design and requested quantity `q`, calculate:

```text
total = startup_fee_per_design
      + programming_fee_per_design
      + q × (
          total_processing_hours × machine_hour_rate
          + setup_count × setup_fee_per_setup
          + adjusted_stock_mass_kg × material_price_per_kg
        )
```

- Startup and programming fees are charged once per design, not per part.
- Machine time, setup count, and material mass all scale with quantity.
- Keep every intermediate value at full precision. Round only the final monetary amount to two decimal places for the configured currency.
- For multiple files, show the cost breakdown for each design, then sum their final unrounded totals and round the batch total once.
- A DFM warning does not prohibit the estimate, but must be visibly called out.
- If a non-zero hourly rate lacks machining time, a non-zero setup fee lacks setup count, or a non-zero material price lacks minimum-stock geometry/density, do not invent a total. State exactly which component is missing.

## Response order

1. Seven-day result link and preview availability.
2. Per-part dimensions, solid volume, surface area, complexity, and minimum stock.
3. Total/stage machining time, setup count, and estimate grade.
4. Prominent DFM findings and any component gaps.
5. When price was requested: per-design local cost inputs and breakdown, quantity, final two-decimal total, then batch total.

Never describe the locally calculated amount as a price returned or approved by Yoxiang's server.

## Install and update

Install or refresh the Skill only when requested:

```bash
npm install -g @yoxiang/cli@next
yoxiang install --agent codex
```

Use `--agent claude` or `--agent all` only when named. For updates run `yoxiang update --agent codex --json`. Do not check for updates before a normal analysis. The retired `yoxiang quote` command is intentionally local-only and exits with code `4`.
