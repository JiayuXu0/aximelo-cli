---
name: yoxiang-part-quote
description: Use the Yoxiang public quote CLI to quote one STEP or STP manufacturing part. Trigger when a user asks for a part price, manufacturing quote, or DFM review and explicitly provides a STEP/STP file. Always collect material, process, and quantity before submission.
---

# Yoxiang Part Quote

Use the `yoxiang` CLI to submit exactly one user-selected STEP/STP file to the public Yoxiang test quote service. Return the public economy, standard, and expedited prices plus public DFM guidance.

## Required inputs

Before uploading anything, confirm all four inputs:

1. The exact STEP/STP file selected by the user.
2. Material code.
3. Manufacturing process code.
4. Positive integer quantity.

If material, process, or quantity is missing or ambiguous, ask the user. Never infer or guess these values.

## Safety boundary

- Upload only the exact file path explicitly provided or selected by the user.
- Never search, glob, recurse through, or scan a directory for models.
- Never upload adjacent files, assemblies, drawings, or archives without a new explicit request.
- Never call ERP pricing debug endpoints or try to obtain internal cost, algorithm, fee, trace, or rule data.
- The public test result is an estimate. Do not represent it as a confirmed order or binding commercial offer.

## Workflow

1. Verify the CLI and public service:

   ```bash
   yoxiang doctor
   ```

2. If a material or process code needs confirmation, inspect current choices:

   ```bash
   yoxiang quote options --json
   ```

3. Submit the exact user-selected file and wait:

   ```bash
   yoxiang quote submit "/exact/path/part.step" \
     --material "<material-code>" \
     --process "<process-code>" \
     --quantity <quantity> \
     --wait \
     --json
   ```

4. If the command returns a pending task or times out, continue with:

   ```bash
   yoxiang quote status "<quote-id>" --wait --json
   ```

5. Summarize all returned price tiers, currency, lead time, and DFM findings. Preserve the quote ID and expiry time.

## Result handling

- `succeeded`: show economy, standard, and expedited choices and the public DFM findings.
- `no_auto_quote`: explain that the file was accepted but cannot currently be priced automatically; do not invent a price.
- `failed`: report the public failure message and offer a retry only when appropriate.
- `expired`: explain that the seven-day result window ended and ask before resubmitting the same file.

Do not expose or speculate about algorithms, cost breakdowns, internal pricing rules, hidden identifiers, storage locations, or worker traces.
