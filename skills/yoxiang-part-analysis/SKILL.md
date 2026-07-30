---
name: yoxiang-part-analysis
description: Analyze explicitly provided STEP/STP manufacturing parts with YoxiangAI H2 route projections and optionally calculate a local estimate only for an executable selected three-axis route using the user's saved cost profile. Use for part dimensions, minimum stock, raw toolpath time and stages, three/five-axis classification and route selection, three-axis setup count, DFM, 3D preview, local cost estimates, or Yoxiang CLI installation/update requests.
---

# YoxiangAI Part Analysis

Use the YoxiangAI public service for manufacturing analysis only. It never returns a price or lead time. When the user asks for a cost estimate, calculate it directly from the analysis result and the private cost profile stored on the user's machine; never upload those rates.

## Atomic capabilities

- Analyze one to five explicitly named STEP/STP files in one batch.
- Read part bounding-box dimensions, solid volume, surface area, and complexity.
- Read minimum stock shape, dimensions, volume, density, and mass.
- Submit a known block or cylindrical blank and read its declared dimensions, resolved orientation, containment proof, actual volume, and mass separately from minimum stock.
- Read H2 raw toolpath total/stage times, machining class, recommended route, selected route, time basis, three-axis setup count, and estimate grade.
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
- When the user, workbook, drawing, or another authoritative source gives the blank, pass it explicitly. Never omit a known blank and never replace a missing or invalid blank with minimum/derived stock when reproducing a labeled evaluation.
- Do not call ERP, debug, internal quote, or retired public quote endpoints. Do not expose internal algorithms, traces, storage paths, or rules.
- Present machining results to the user as YoxiangAI output. Never repeat an internal producer name from a raw `source` value or error code.
- Treat the output and any locally calculated cost as an estimate, not an order or binding offer.
- The public share link, including its 3D access, is valid for seven days. Do not describe this as the retention period for uploaded files or stored analysis results. Remind the user not to upload a model they are not authorized to share.

## Analysis workflow

For up to five exact paths, run the analysis exactly once:

```bash
yoxiang analyze "/exact/path/a.step" "/exact/path/b.stp" --wait --compact-json
```

For known block dimensions, their order is nominal and does not assert X/Y/Z. AutoCam resolves the enclosing axis permutation:

```bash
yoxiang analyze "/exact/path/a.step" --stock-box 20 868 175 --wait --compact-json
```

For known cylindrical stock:

```bash
yoxiang analyze "/exact/path/b.step" --stock-cylinder 60 25 --wait --compact-json
```

`--stock-box` and `--stock-cylinder` are mutually exclusive. One stock flag applies to every explicitly listed file in that CLI invocation, so split the batch when files have different blanks. If the explicit blank does not contain the part, report `AUTOCAM_INVALID_STOCK`; do not retry without the blank.

Always use `--compact-json` for normal analysis and status polling. It returns `agent-summary-v1`, keeps every batch item in input order, and limits only verbose DFM text, node IDs, and excess stage entries. Check every `*_omitted` field and state the omitted count when it is non-zero. Never use raw analysis `--json` by default: it can exhaust the Agent tool-output budget before later files appear. Use raw `--json` only when the user explicitly requests the complete machine payload for debugging; redirect it to a file instead of printing it into the conversation. Do not rerun an analysis merely to recover omitted detail; use the public result page.

Add `--material`, `--process`, `--tolerance`, or `--surface-roughness` only when the user explicitly overrides a default. Do not run `doctor` or `analyze options` first. Use `doctor` only after installation or connection failure; use `analyze options` only when an explicit non-default value cannot be mapped.

DFM warnings do not block machining-time analysis or a local cost estimate. Mark the risk prominently. Preserve `geometry`, `dfm`, `machining`, and `preview` component statuses independently when the batch is `completed_with_gaps`.

Keep the stock meanings separate:

- `geometry.minimum_stock` is the geometry-derived minimum envelope.
- `machining.stock` is the blank actually used by AutoCam. Show `source`, `input_size_mm`, `resolved_size_mm`, `axis`, and `envelope_contains_part`.
- For a provided block, preserve `input_size_mm` order and use `resolved_size_mm` to explain the selected X/Y/Z permutation. Do not reorder the user's declared value in the request.

Treat `machining.total_processing` and every `machining.stages[].hours` value as H2 raw toolpath time. Use `machining.route` as the route authority:

- Show `machining_class`, `recommended_route`, `selected_route`, and `time_basis` without rewriting the H2 recommendation.
- When H2 recommends five-axis but `selected_route.route_class` is `mill_3axis`, explain that the platform selected the executable three-axis alternative and keep the five-axis recommendation visible.
- Show `setup_count` only when the selected route is executable `mill_3axis`.
- When `manual_quote_required` is true, or no selected executable three-axis route exists, show the manual reason codes and never invent a setup count or price.
- Treat a legacy result without `machining.route` as analysis-only; do not calculate a local price from it.

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

Unless the user explicitly configures other values, use these defaults: `block_allowance_per_side_mm = 3`, `cylinder_radial_allowance_mm = 3`, `cylinder_end_allowance_mm = 3`, and `round_up_mm = 0`. Thus a block gains `6 mm` on every dimension; a cylinder gains `6 mm` on both diameter and length. Recompute adjusted stock volume and mass without early rounding.

When `machining.stock.source == provided`, it is already the actual blank: use its `mass_kg` for material cost and do not add the local minimum-stock adjustment again. Apply the adjustment rules below only when calculating from `geometry.minimum_stock` because no provided machining blank exists.

Apply the stored adjustments as follows:

- Block: add twice `block_allowance_per_side_mm` to each of length, width, and height.
- Cylinder: add twice `cylinder_radial_allowance_mm` to diameter and twice `cylinder_end_allowance_mm` to length.
- If `round_up_mm > 0`, round every adjusted dimension upward independently to the next multiple of that value.
- Block volume in mm³ is `length × width × height`.
- Cylinder volume in mm³ is `π × (diameter / 2)² × length`.
- Mass in kg is `volume_mm3 × material_density_kg_m3 / 1,000,000,000`.

Show both minimum and adjusted stock dimensions whenever an adjustment is applied.

## Cost formula

Before calculating, require all of the following: `machining.route.manual_quote_required == false`, `selected_route.route_class == mill_3axis`, `selected_route.toolpath_executable == true`, and a positive integer `setup_count`. If any check fails, stop the cost calculation and state that the route needs manual quotation or lacks executable three-axis proof.

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

1. Public share link validity (seven days) and preview availability.
2. Per-part dimensions, solid volume, surface area, complexity, geometry minimum stock, then actual machining stock with input/resolved direction.
3. H2 raw total/stage toolpath time, machining class, H2 recommendation, selected route, time basis, and three-axis setup count when applicable.
4. Prominent DFM findings and any component gaps.
5. When price was requested: per-design local cost inputs and breakdown, quantity, final two-decimal total, then batch total.

Never describe the locally calculated amount as a price returned or approved by Yoxiang's server.

## Install and update

Install or refresh the Skill only when requested:

```bash
npm install -g @yoxiang/cli@latest
yoxiang install --agent codex
```

Use `--agent claude` or `--agent all` only when named. For updates run `yoxiang update --agent codex --json`. Do not check for updates before a normal analysis. The retired `yoxiang quote` command is intentionally local-only and exits with code `4`.

After a successful install, respond in the user's current language and do not merely say that installation finished. Summarize these capabilities:

- Upload only explicitly named STEP/STP files without scanning directories or adjacent files.
- Return part dimensions and solid volume, plus geometry minimum-stock facts and the separate actual machining-stock source/input/resolved direction/volume/mass.
- Return H2 raw total machining time and the actual roughing, semi-finishing, finishing, holemaking, or other stage times present in the result; never promise or invent a missing stage.
- Return three/five-axis classification, H2 recommended route, selected route, time basis, three-axis setup count when applicable, estimate grade, structured DFM risks/suggestions, and 3D preview/thumbnail links.

Also state that the public service returns no price. If the cost profile is missing, offer to configure startup, programming, machine-hour, setup, and material rates only when the user wants a local estimate. Rates stay on the user's machine. Do not block the installation-complete response by asking for rates when no estimate was requested.
