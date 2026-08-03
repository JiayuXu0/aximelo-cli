<p align="center">
  <a href="https://www.aximelo.ai/en/">
    <img src="https://raw.githubusercontent.com/JiayuXu0/aximelo-cli/main/docs/assets/aximelo-wordmark.png" alt="Aximelo" width="360">
  </a>
</p>

<h1 align="center">Aximelo CLI &amp; Agent Skill</h1>

<p align="center">
  Manufacturing analysis for AI agents.<br>
  Give your Agent a selected CAD part and ask about geometry, stock, machining routes, setups, H2 toolpath time, DFM, and 3D results in natural language.
</p>

<p align="center">
  <a href="https://github.com/JiayuXu0/aximelo-cli/blob/main/README.md">English</a> ·
  <a href="https://github.com/JiayuXu0/aximelo-cli/blob/main/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@aximelo/cli"><img src="https://img.shields.io/npm/v/%40aximelo%2Fcli?color=ff3800" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@aximelo/cli"><img src="https://img.shields.io/node/v/%40aximelo%2Fcli" alt="Node.js version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/%40aximelo%2Fcli" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://www.aximelo.ai/en/">Website</a> ·
  <a href="https://www.aximelo.ai/en/agent-install/">Install guide</a> ·
  <a href="https://www.aximelo.ai/open/aximelo-cli/installation.md">Agent-readable setup</a> ·
  <a href="https://www.npmjs.com/package/@aximelo/cli">npm</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/JiayuXu0/aximelo-cli/main/docs/assets/aximelo-hero.webp" alt="A machined CAD part with toolpath, setup direction, and manufacturing-analysis overlays" width="100%">
</p>

## Ask your Agent, not a command manual

Aximelo is distributed as a public CLI, but the normal interface is your Agent. Install the Skill once in Codex or Claude Code, select a supported single-part CAD file, and ask a manufacturing question in your own words.

```text
Analyze /absolute/path/bracket.step. Can it be machined? Should it use
three-axis or five-axis machining? How many setups are needed, what is the
H2 machining time, and which DFM risks need attention?
```

The Skill gives the Agent a strict workflow: it reads only the files you explicitly name, invokes Aximelo once, preserves partial component states, and explains the structured result without turning it into a wall of CLI flags or JSON.

## Install in one minute

Requires Node.js 20 or later.

### Give this sentence to your Agent

```text
Install Aximelo by following https://www.aximelo.ai/open/aximelo-cli/installation.md
```

The installation contract tells the Agent to install, verify connectivity, and explain how to start—without asking you to type the commands manually.

### Or install manually

For Codex:

```bash
npm install -g @aximelo/cli@latest
aximelo install --agent codex --json
aximelo doctor --json
```

For Claude Code, replace `codex` with `claude`. Use `--agent all` only when you intentionally want both. `doctor` checks service connectivity and capabilities; it does not read or upload a part.

## What Aximelo can tell you

| Manufacturing question | Returned evidence | Learn more |
| --- | --- | --- |
| What is this part? | Explicit global X/Y/Z bounding-box dimensions, shop length/width/thickness, solid volume, surface area, complexity, and source format | [Dimensions and related information](https://www.aximelo.ai/en/drawing-dimensions/) |
| What stock is needed? | Geometry-derived minimum stock and the separate actual machining blank, including its source, local frame, shop length/width/thickness, volume, mass, and containment | [Quote pre-check](https://www.aximelo.ai/en/quote-precheck/) |
| Three-axis or five-axis? | Machining class, recommended route, selected route, time basis, executability, and manual-review reasons | [Route and tool access](https://www.aximelo.ai/en/toolpath-generation/) |
| How many setups? | Setup count, confidence, and validation status when the selected route is an executable three-axis route | [Setup-count analysis](https://www.aximelo.ai/en/setup-count/) |
| How long will machining take? | H2 raw toolpath total, returned planner stages, and holemaking/roughing/finishing/deburring views | [Machining time](https://www.aximelo.ai/en/machining-time/) |
| What is difficult to manufacture? | Structured DFM severity, location, explanation, suggestion, and related 3D nodes | [DFM checks](https://www.aximelo.ai/en/dfm/) |
| Can the result be reviewed visually? | 3D preview and thumbnail status, plus a public result link when available | [Share analysis results](https://www.aximelo.ai/en/drawing-sharing/) |
| Can I estimate local cost? | A transparent local estimate only for a selected executable three-axis route, using rates stored on your machine | [Cost pre-check](https://www.aximelo.ai/en/quote-precheck/) |

The H2 total, planner stages, and four CNC categories are different views of the same machining time. They must not be added together.

## A representative Agent answer

> The values below are illustrative demo data. A real answer is generated from the selected model and preserves any missing or incomplete component status.

**Part:** `bracket.step`

- **Geometry:** 120 × 80 × 36 mm bounding box; 184.2 cm³ solid volume; medium complexity.
- **Machining route:** executable three-axis milling selected; two-setup prediction with confidence shown alongside its validation status.
- **H2 time:** 42.6 minutes of raw toolpath time. Roughing, finishing, holemaking, and deburring are category views of this total—not extra time.
- **DFM:** deep-cavity access and a small deep hole need review before production; each finding includes its location and a practical follow-up.
- **Result:** completed geometry and machining facts remain visible even if DFM or preview finishes with a gap.

This is the kind of answer the Agent should give you: a manufacturing explanation with evidence, limitations, and the next decision—not an unfiltered machine payload.

## Direct CLI use

Agents should use bounded output for normal analysis:

```bash
aximelo analyze "/absolute/path/part.step" --wait --compact-json
```

Analyze up to five explicitly named files in one batch:

```bash
aximelo analyze "/absolute/path/a.step" "/absolute/path/b.x_t" --wait --compact-json
```

Pass a known blank instead of silently replacing it with a derived minimum stock:

```bash
aximelo analyze "/absolute/path/block.step" --stock-box 20 868 175 --wait --compact-json
aximelo analyze "/absolute/path/round.step" --stock-cylinder 60 25 --wait --compact-json
```

Read one section from an existing batch without uploading again:

```bash
aximelo analyze status <batch-id> --extract route
aximelo analyze status <batch-id> --extract dfm
```

Output modes are mutually exclusive:

- `--compact-json`: bounded Agent summary; recommended for normal work.
- `--extract overview|geometry|stock|machining|route|dfm|preview`: one category for every batch item.
- `--json`: complete CLI payload for explicit debugging or integration needs.

## Supported inputs and safety boundaries

Supported single-part CAD extensions:

```text
.step  .stp  .x_t  .x_b  .sat  .sldprt  .prt  .ipt  .catpart
```

- Maximum 10 MiB per file and five files per batch.
- Exact file paths only. Aximelo never scans directories, globs, or neighboring files.
- Assemblies and meshes such as `.sldasm`, `.asm`, `.iam`, `.catproduct`, `.3dxml`, `.stl`, and `.obj` are rejected.
- Native-CAD preprocessing is internal to manufacturing analysis. The public CLI does not expose standalone format conversion or derived CAD downloads.
- A public result link, including 3D access, is valid for seven days. Do not upload a model you are not authorized to share.

## Local cost profile

The public service returns no platform price or lead time. When a user explicitly requests a local estimate, Aximelo may calculate one only when the selected route is executable three-axis machining and all required evidence is present.

```bash
aximelo cost-profile configure
aximelo cost-profile show --json
```

Startup, programming, machine-hour, setup, and material rates stay in `aximelo/cost-profile.json` on the user's machine and are never uploaded. A five-axis or manual-quote route does not receive an invented local price.

## Update and troubleshoot

```bash
aximelo update --agent codex --json
aximelo doctor --json
aximelo --help
```

Aximelo checks npm at most once every 24 hours after a successful analysis request. It reports an available update but never installs one without the user's request.

## Documentation

- [Aximelo website](https://www.aximelo.ai/en/)
- [Human installation guide](https://www.aximelo.ai/en/agent-install/)
- [Canonical Agent-readable installation contract](https://www.aximelo.ai/open/aximelo-cli/installation.md)
- [npm package](https://www.npmjs.com/package/@aximelo/cli)
- [Public result application](https://app.aximelo.ai)

## Development

```bash
npm install
npm run verify
npm pack --dry-run
```

To export the canonical installation guide, Skill, and manifest to the website repository:

```bash
npm run export:site-docs -- ../AximeloSkillWeb
```

## License

[MIT](./LICENSE)
