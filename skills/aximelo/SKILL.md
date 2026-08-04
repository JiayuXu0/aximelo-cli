---
name: aximelo
description: Analyze explicitly provided STEP/STP or supported native single-part CAD files with Aximelo and optionally calculate a local estimate only when the final recommendation is three-axis and a valid setup count is present, using the user's saved cost profile. Use for part dimensions, minimum stock, raw H2 toolpath time and stages, three-axis/mill-turn/five-axis recommendations, three-axis setup count, DFM, 3D preview, local cost estimates, or Aximelo CLI installation/update requests.
---

# Aximelo Part Analysis

Use the Aximelo public service for manufacturing analysis only. It never returns a price or lead time. When the user asks for a cost estimate, calculate it directly from the analysis result and the private cost profile stored on the user's machine; never upload those rates.

## Atomic capabilities

- Analyze one to five explicitly named supported single-part CAD files in one batch; the service handles any required native-CAD preprocessing only as an internal analysis step.
- Read part bounding-box dimensions, solid volume, surface area, and complexity.
- Read minimum stock shape, dimensions, volume, density, and mass.
- Submit a known block or cylindrical blank and read its declared dimensions, resolved orientation, containment proof, actual volume, and mass separately from minimum stock.
- Read H2 raw toolpath total/stage times and the four-category CNC breakdown (holemaking, roughing, finishing, deburring), plus one final three-axis/mill-turn/five-axis recommendation, applicable three-axis setup count, and estimate grade.
- Read structured DFM findings, suggestions, and associated 3D node IDs.
- Read 3D preview and thumbnail state and links.
- Configure/show local fixed fees, hourly/setup rates, material prices, and stock adjustments.
- Calculate a transparent local estimate with the fixed formula below.

## Safety and defaults

- Upload only exact paths explicitly provided or selected by the user. Never search, glob, recurse, list, or scan directories for models.
- Never add adjacent files, drawings, assemblies, or archives.
- Supported files are `.step`, `.stp`, `.x_t`, `.x_b`, `.sat`, `.sldprt`, `.prt`, `.ipt`, and `.catpart`, each no larger than 10 MiB (10,485,760 bytes).
- Reject assemblies and meshes, including `.sldasm`, `.asm`, `.iam`, `.catproduct`, `.3dxml`, `.stl`, and `.obj`. Never ask the service to flatten them.
- Use at most five files per batch. For more than five explicit files, submit sequential groups; never fan out parallel CLI processes.
- Defaults are material `6061`, process `cnc-machining`, tolerance `ISO2768-m`, and roughness `Ra3.2`. Do not ask about omitted manufacturing parameters.
- When the user, workbook, drawing, or another authoritative source gives the blank, pass it explicitly. Never omit a known blank and never replace a missing or invalid blank with minimum/derived stock when reproducing a labeled evaluation.
- Do not call ERP, debug, internal quote, or retired public quote endpoints. Do not expose internal algorithms, traces, storage paths, or rules.
- Do not call standalone CAD conversion endpoints, offer format conversion, or download derived CAD files. Native-CAD preprocessing exists only inside the manufacturing-analysis and formal quotation workflows.
- Present machining results to the user as Aximelo output. Never repeat an internal producer name from a raw `source` value or error code.
- Treat the output and any locally calculated cost as an estimate, not an order or binding offer.
- The public share link, including its 3D access, is valid for seven days. Do not describe this as the retention period for uploaded files or stored analysis results. Remind the user not to upload a model they are not authorized to share.

## Analysis workflow

For up to five exact paths, run the analysis exactly once:

```bash
aximelo analyze "/exact/path/a.step" "/exact/path/b.stp" --wait --compact-json
```

Native single-part CAD uses the same analysis command and may report `source_format`. If internal input processing fails, report `CAD_INPUT_PROCESSING_FAILED`; do not expose the converter, offer a derived STEP, retry by renaming the extension, or silently switch to another converter.

```bash
aximelo analyze "/exact/path/native.x_t" --wait --compact-json
```

For known block dimensions, their order is nominal and does not assert X/Y/Z. Aximelo resolves the enclosing axis permutation:

```bash
aximelo analyze "/exact/path/a.step" --stock-box 20 868 175 --wait --compact-json
```

For known cylindrical stock:

```bash
aximelo analyze "/exact/path/b.step" --stock-cylinder 60 25 --wait --compact-json
```

`--stock-box` and `--stock-cylinder` are mutually exclusive. One stock flag applies to every explicitly listed file in that CLI invocation, so split the batch when files have different blanks. If the explicit blank does not contain the part, report `AUTOCAM_INVALID_STOCK`; do not retry without the blank.

Always use `--compact-json` for normal analysis and status polling. It returns `agent-summary-v3`, keeps every batch item in input order, expresses machining time as `total_processing_minutes`, `stages[].minutes`, and `cnc_breakdown_minutes`, and limits only verbose DFM text, node IDs, and excess stage entries. Check every `*_omitted` field and state the omitted count when it is non-zero. Never use full analysis `--json` by default: `cli-json-v3` can exhaust the Agent tool-output budget before later files appear. Use `--json` only when the user explicitly requests the complete machine payload for debugging; redirect it to a file instead of printing it into the conversation. Do not rerun an analysis merely to recover omitted detail; use the public result page.

When the user asks for one category from an existing batch, query the batch without uploading again:

```bash
aximelo analyze status <batch-id> --extract dfm
aximelo analyze status <batch-id> --extract route
```

`--extract` is an independent bounded JSON output mode; never combine it with `--compact-json` or `--json`. It returns `agent-extract-v3`, accepts only `overview`, `geometry`, `stock`, `machining`, `route`, `dfm`, or `preview`, and returns that category for every part in input order. Route extraction returns the single recommendation string. Machining extraction uses minutes. Do not use extraction for a requested local cost estimate because the calculation requires geometry/stock and machining together.

Add `--material`, `--process`, `--tolerance`, or `--surface-roughness` only when the user explicitly overrides a default. Do not run `doctor` or `analyze options` first. Use `doctor` only after installation or connection failure; use `analyze options` only when an explicit non-default value or current service format support cannot be mapped.

DFM warnings do not block machining-time analysis or a local cost estimate. Mark the risk prominently. Preserve `geometry`, `dfm`, `machining`, and `preview` component statuses independently when the batch is `completed_with_gaps`.

Treat setup count only as a machining-route fact. `SETUP_COUNT_EXCESSIVE` is not a DFM risk; never report it under DFM if it appears in a legacy raw payload.

Keep the stock meanings separate:

- `geometry.minimum_stock` is the geometry-derived minimum envelope.
- `geometry.bounding_box_xyz_mm` is the part's global X/Y/Z bounding box. `shop_dimensions_mm` always means length/width/thickness and must be labelled separately.
- `machining.stock` is the blank actually used by machining analysis. Show `derivation_mode`, `input_size_mm`, `resolved_size_mm`, `frame`, `shop_dimensions_mm`, and `envelope_contains_part` when present.
- For a provided block, preserve `input_size_mm` order and use `resolved_size_mm` only as the blank's local X/Y/Z order when `frame` is present. Do not reorder the user's declared value in the request. For legacy results without `frame`, label the resolved values as dimensions with direction unavailable rather than global X/Y/Z.

Treat `machining.total_processing_minutes`, every `machining.stages[].minutes` value, and every `machining.cnc_breakdown_minutes` value as H2 raw toolpath time. `machining.cnc_breakdown_minutes` is an alternative classification of the same total: semi-finishing belongs to roughing, threading belongs to holemaking, and deburring includes only geometrically evidenced edge breaks and hole-mouth chamfers. Its four values sum to `total_processing_minutes`; never add them to `stages`. If the field is absent in a legacy result, say the detailed CNC breakdown is unavailable rather than inventing it.

- Treat `machining.route_recommendation` as the only public route advice. Its value is `three_axis`, `mill_turn`, or `five_axis`; do not reconstruct internal recommended, selected, or candidate routes.
- Show `machining.setup_count` only when present. It is the one machine-learning prediction for an internally selected executable three-axis route; show `setup_count_confidence` and `setup_model.validation_status`. Never describe `development_only_unvalidated` as certified and never substitute another setup count.
- For `mill_turn`, `five_axis`, a missing `route_recommendation`, or a missing positive integer `setup_count`, never invent a setup count or local price.

## Local cost profile

After the single analysis call, read the profile once:

```bash
aximelo cost-profile show --json
```

The file is `${XDG_CONFIG_HOME:-~/.config}/aximelo/cost-profile.json` on POSIX and `%APPDATA%\\aximelo\\cost-profile.json` on Windows. It is mode `0600` on POSIX.

If `cost_profile` is `missing` and a price is requested, stop and ask one blocking question for all five values:

1. Startup fixed fee, charged once per design.
2. Programming fee, charged once per design.
3. Machine-hour rate, allowed to be `0`.
4. Setup fee per setup, allowed to be `0`.
5. 6061 material price in CNY/kg.

After the user answers, save them with one non-interactive command:

```bash
aximelo cost-profile configure --startup-fee <n> --programming-fee <n> --machine-hour-rate <n> --setup-fee <n> --material 6061 --price-per-kg <n> --currency CNY --json
```

If the analyzed material is absent from `materials`, stop and ask its CNY/kg price, then append it:

```bash
aximelo cost-profile material set <material> --price-per-kg <n> --json
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

Before calculating, require `machining.route_recommendation == three_axis` and a positive integer `machining.setup_count`. The API returns `setup_count` only after internally selecting an executable three-axis route, so no duplicate public executability field is needed. If either check fails, stop the cost calculation and state that the result lacks an executable three-axis setup count.

For each design and requested quantity `q`, calculate:

```text
total = startup_fee_per_design
      + programming_fee_per_design
      + q × (
          total_processing_minutes / 60 × machine_hour_rate
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
3. H2 raw total/stage toolpath time, the four-category CNC breakdown including deburring when available, the single route recommendation, and three-axis setup count when applicable.
4. Prominent DFM findings and any component gaps.
5. When price was requested: per-design local cost inputs and breakdown, quantity, final two-decimal total, then batch total.

Never describe the locally calculated amount as a price returned or approved by Aximelo's server.

## Install and update

Install or refresh the Skill only when requested:

```bash
npm install -g @aximelo/cli@latest
aximelo install --agent codex
```

Use `--agent claude` or `--agent all` only when named. For updates run `aximelo update --agent codex --json`. The CLI performs a cached version check only after a successful public API request. If any human or structured result contains an update notice, tell the user which version is available and show its exact update command; do not install it unless the user requests the update. Do not run a separate version check before normal analysis. The retired `aximelo quote` command is intentionally local-only and exits with code `4`.

After a successful install, respond in the user's current language and do not merely say that installation finished. Summarize these capabilities:

- Upload only explicitly named supported single-part CAD files without scanning directories or adjacent files; reject assemblies and meshes.
- Explain that supported native single-part CAD can be used as analysis input, while internal preprocessing and derived CAD files are not exposed or downloadable through the public CLI/Skill.
- Return part dimensions and solid volume, plus geometry minimum-stock facts and the separate actual machining-stock source/input/resolved direction/volume/mass.
- Return H2 raw total machining time, the actual planner stage times, and the four-category CNC breakdown including deburring when present; never promise or invent a missing category.
- Return one three-axis/mill-turn/five-axis recommendation, one three-axis setup count when applicable, estimate grade, structured DFM risks/suggestions, and 3D preview/thumbnail links.

Also state that the public service returns no price. If the cost profile is missing, offer to configure startup, programming, machine-hour, setup, and material rates only when the user wants a local estimate. Rates stay on the user's machine. Do not block the installation-complete response by asking for rates when no estimate was requested.
