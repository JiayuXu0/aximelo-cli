---
name: yoxiang-part-quote
description: Quote one or more explicitly provided STEP/STP manufacturing parts with Yoxiang, or install, check, update, and repair the Yoxiang quote CLI and Skill. Use for price, lead time, machining time, DFM, geometry, 3D-view, CLI installation, or CLI/Skill update requests. Defaults to 6061 aluminum, CNC, quantity 1, standard finish, ISO 2768-m, and Ra 3.2.
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
- Quote at most five parts concurrently. Daily quote count is currently unlimited; for more than five explicit files, submit sequential groups of at most five and never fan out parallel CLI processes.
- Never call ERP/debug endpoints or expose costs, algorithms, traces, storage paths, or internal rules.
- Never calculate, reconstruct, or fall back to the retired legacy machining time or price. Any DFM warning/fail, unavailable AutoCam estimate, or untrusted AutoCam estimate means `no_auto_quote`.
- Treat results as test estimates, not orders or binding offers.

## Workflow

1. If up to five exact file paths are clear, run exactly once:

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

## Update and repair

- Do not check for or install updates before a normal quote.
- When the user explicitly asks to update the CLI or Skill, run once:

  ```bash
  yoxiang update --agent codex --json
  ```

- Use `--agent claude` or `--agent all` only when the user names that target.
- If an older CLI reports that `update` is unknown, run the fallback once:

  ```bash
  npm install -g @yoxiang/quote-cli@next && yoxiang install --agent codex
  ```

- If a quote fails specifically because the installed CLI is incompatible or too old, update once and retry the original quote once. Do not enter an update loop.
- `yoxiang update --check --json` only checks the configured release channel. Use it only when the user asks whether an update is available.

## Response

Present in this order:

1. Result link for the seven-day batch page and 3D viewer.
2. A table with each part's economy, standard, and expedited price and lead time.
3. AutoCam total and available stage machining times, setup count, and estimate grade.
4. Public DFM findings or failures.

For `no_auto_quote`, distinguish a DFM block from an unavailable/untrusted machining-time estimate when the response provides a reason code, and never invent a price. For partial batches, preserve each part's independent status. Do not claim that a part entered manual review unless the response explicitly says so.
