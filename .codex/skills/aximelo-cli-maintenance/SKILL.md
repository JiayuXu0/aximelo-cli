---
name: aximelo-cli-maintenance
description: Maintain the public aximelo-cli repository, @aximelo/cli compatibility, tests, packaging, npm trusted publishing workflow, version readback, installation manifest, and release handoff. Use for CLI code or release preparation; use manufacturing-ops for dispatch and website synchronization.
---

# Aximelo CLI Maintenance

Keep public package `@aximelo/cli`, command `aximelo`, Skill `aximelo`, and public production domains stable. This repository owns tests, packaging, GitHub release, npm Trusted Publishing, and version readback; it must not store a cross-repository token.

Generate `release/handoff.json` with commit, package version, tests, tarball checksum, and workflow name. Website synchronization and remote dispatch belong to `JiayuXu0/manufacturing-ops`.
