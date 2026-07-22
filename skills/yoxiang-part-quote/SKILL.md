---
name: yoxiang-part-quote
description: Quote one or more explicitly provided STEP/STP manufacturing parts with Yoxiang. Use for price, lead time, machining time, DFM, geometry, or 3D-view requests. Defaults to 6061 aluminum, CNC, quantity 1, standard finish, ISO 2768-m, and Ra 3.2.
---

# Yoxiang Part Quote

Submit the exact STEP/STP paths named by the user and return the public batch result. Normal quoting is one CLI call.

## Defaults

Do not ask for manufacturing parameters when the user omits them. Use:

- Material: 6061 aluminum
- Process: CNC
- Quantity: 1
- Surface finish: standard
- Tolerance: ISO 2768-m
- Surface roughness: Ra 3.2

## Safety

- Upload only file paths the user explicitly provided or selected.
- Never search, glob, recurse, list, or scan directories for models.
- Never add adjacent files, drawings, assemblies, or archives.
- Each file must be `.step` or `.stp` and no larger than 10 MiB (10,485,760 bytes).
- Never call ERP/debug endpoints or expose costs, algorithms, traces, storage paths, or internal rules.
- Treat results as test estimates, not orders or binding offers.

## Workflow

1. If all exact file paths are clear, run exactly once:

   ```bash
   yoxiang quote "/exact/path/a.step" "/exact/path/b.step" --wait --json
   ```

2. Add flags only when the user explicitly overrides defaults, for example:

   ```bash
   yoxiang quote "/exact/path/a.step" --material 7075 --quantity 5 --wait --json
   ```

3. Do not run `doctor` first. Run `yoxiang doctor --json` only after installation or connection failure.
4. Do not run `quote options` for defaults. Run it only when an explicit non-default value cannot be mapped to a supported code.
5. Ask one combined question only when paths are missing/ambiguous, a file is unsupported/oversized, or different parts require different parameters.

## Response

Present in this order:

1. Result link for the seven-day batch page and 3D viewer.
2. A table with each part's economy, standard, and expedited price and lead time.
3. Total and available stage machining times.
4. Public DFM findings or failures.

For `no_auto_quote`, say automatic pricing is unavailable and never invent a price. For partial batches, preserve each part's independent status. Do not claim that a part entered manual review unless the response explicitly says so.
