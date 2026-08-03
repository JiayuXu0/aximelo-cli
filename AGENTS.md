# Aximelo CLI and Skill

This repository is the public Aximelo manufacturing-analysis client. The canonical package is `@aximelo/cli`, the executable is `aximelo`, the installed Skill is `aximelo`, and the source repository is `JiayuXu0/aximelo-cli`.

## Public endpoints

- Analysis API: `https://api.aximelo.ai`
- Result application: `https://app.aximelo.ai`
- Product and installation pages: `https://www.aximelo.ai`

Do not add legacy product names, legacy commands, legacy environment variables, or fallback domains. Public commands and docs must use Aximelo names only.

## Contract rules

- Upload only explicitly named supported single-part CAD files. Never scan directories or adjacent files.
- Keep the 10 MiB per-file and five-files-per-batch limits.
- Keep `--json`, `--compact-json`, and `--extract` mutually exclusive. Extraction sections remain `overview|geometry|stock|machining|route|dfm|preview`.
- Preserve per-component states when a batch is `completed_with_gaps`.
- H2 total/stage time and the four CNC categories are two views of the same machining time. Never add one view to the other.
- The public service returns no price or lead time. A local estimate is allowed only for a selected executable three-axis route and uses rates stored on the user's machine.

## Change and release gates

Run `npm run verify`, validate `skills/aximelo/SKILL.md` with the Codex skill validator, and inspect `npm pack --dry-run` before publishing. Keep `README.md` and `README.zh-CN.md` structurally aligned. Update both READMEs, `docs/installation.md`, exported static docs, tests, and the Skill together whenever public behavior changes.
