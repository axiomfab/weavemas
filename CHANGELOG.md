# Changelog

All notable changes to WeaveMAS are documented in this file.

## [1.2.0](https://github.com/axiomfab/weavemx/compare/v1.1.0...v1.2.0) (2026-11-26)


### Features

* add canonical harness adapter generator for multi-platform portability ([#24](https://github.com/axiomfab/weavemx/issues/24)) ([ecc4bdc](https://github.com/axiomfab/weavemx/commit/ecc4bdcdf72db248119bf44291392fa9c1a4872a))
* align MCP tool, skill names, and KidsWiki example with paper ([#22](https://github.com/axiomfab/weavemx/issues/22)) ([0feca33](https://github.com/axiomfab/weavemx/commit/0feca33af8590726db9e9946d4c397505f97d5ad))
* **cursor:** add Cursor adapter authoring rule, installer script, and KidsWiki smoke test ([#25](https://github.com/axiomfab/weavemx/issues/25)) ([b504180](https://github.com/axiomfab/weavemx/commit/b5041805195840e3457c08d97d6dcb5d0efe24e8))
* **ui:** align sidecar panel with native Antigravity host theme (Option A, [#27](https://github.com/axiomfab/weavemx/issues/27)) ([992d3a4](https://github.com/axiomfab/weavemx/commit/992d3a49a27cfab3b37494eb2d762d65d8a64019))
* **ui:** polish dark palette, muted stepper rail, neutral file chips, and SVG icons ([#20](https://github.com/axiomfab/weavemx/issues/20)) ([1d4273b](https://github.com/axiomfab/weavemx/commit/1d4273b397a8fda140e0a8488b5d55f9e867251c))
* **viewer:** build VS Code Custom Editor extension for weave.md ([#23](https://github.com/axiomfab/weavemx/issues/23)) ([db7f95e](https://github.com/axiomfab/weavemx/commit/db7f95efcf51764e042b9901bc29b8fdc18f905f))
* wrap up Rename WeaveMAS to WeaveMX (Multi-agent eXecution) across plugin, skills,… ([8137403](https://github.com/axiomfab/weavemx/commit/81374033670313321426f40c8aedd0b9877bde66))

## [1.1.0](https://github.com/axiomfab/weavemas-agy/compare/v1.0.0...v1.1.0) (2026-11-23)


### Features

* add inputs frontmatter contract and streamline weave skills ([b8144e2](https://github.com/axiomfab/weavemas-agy/commit/b8144e2850cca4e5ce59140e5fef0b53ed59f357))
* add runtime tracking, enforce minimal frontmatter contract, and update authoring guidelines ([31872ac](https://github.com/axiomfab/weavemas-agy/commit/31872acfcbe1ce1e6847bd3d0afa206228249a43))
* add WeaveMAS real-time observer UI sidecar, branding logo, and test suites ([6eedfc6](https://github.com/axiomfab/weavemas-agy/commit/6eedfc63b36d9c186eeaf63107cb7850ab5728e5))
* **agent:** centralize ZUE, batching, direct shell execution, and fail-fast in weave-core-agent ([c1d9106](https://github.com/axiomfab/weavemas-agy/commit/c1d910639f8537bd2a19385f866bfa11895865ff))
* **authoring,sidecar:** add stageless pipeline panel support and outcome revision guide ([8670563](https://github.com/axiomfab/weavemas-agy/commit/86705633b0dda2cb474aee3edc3bf52b0f31819d))
* **mcp,orchestrator:** add batch status_init support and update execution guidelines ([5de1217](https://github.com/axiomfab/weavemas-agy/commit/5de1217cce4e762493d3dba62be90e020f9d0191))
* **mcp:** add status_read tool and update orchestrator skills ([656110a](https://github.com/axiomfab/weavemas-agy/commit/656110adbbbc4c58168de719e95f545bfcc3d9fa))
* **panel:** bold timestamps and color-coded status badges in updates tab ([109f04a](https://github.com/axiomfab/weavemas-agy/commit/109f04a80c031666ff769c698993ab075600726b))
* **panel:** frontmatter-only status view, human-readable log timestamps, and stage timers ([2b1ed1f](https://github.com/axiomfab/weavemas-agy/commit/2b1ed1fcc36dde764a766448b977074cb66ad122))
* **panel:** input file verification badges and duration formatting for in_progress states ([d4ae1e5](https://github.com/axiomfab/weavemas-agy/commit/d4ae1e576bf33c21a8912e3bd008876355a888fd))
* **panel:** yellow text color for in_progress states and borderless status text in updates tab ([fe6608b](https://github.com/axiomfab/weavemas-agy/commit/fe6608be3f32b301d749a6eb5f077c56af3f8a97))
* **paths:** add explicit path variables and standardize orchestrator operations ([fdb3f8f](https://github.com/axiomfab/weavemas-agy/commit/fdb3f8f072b2a750ecfe4b79351ff2ab27ad4b0a))
* **r5:** add lean stage_orchestrator and per-stage sub-orchestration ([#11](https://github.com/axiomfab/weavemas-agy/issues/11)) ([1a1f703](https://github.com/axiomfab/weavemas-agy/commit/1a1f703ceb86e3825a13ede74d7d8d9cc3439300))
* **r6:** enforce zero-copy review gates and add MCP mirror_to ([#12](https://github.com/axiomfab/weavemas-agy/issues/12)) ([7d65e5f](https://github.com/axiomfab/weavemas-agy/commit/7d65e5f7c6fd228cd881dcbbb0925e08ec58b9e6))
* **r7:** inline weavemas_weave MCP tool schemas and trim startup skill reads ([#13](https://github.com/axiomfab/weavemas-agy/issues/13)) ([be443a2](https://github.com/axiomfab/weavemas-agy/commit/be443a22cc0a3cff71239e208e61cb716f999c3f))
* **r8:** enforce concise 1-line subagent acks and batch weave_read ([#14](https://github.com/axiomfab/weavemas-agy/issues/14)) ([629d3a1](https://github.com/axiomfab/weavemas-agy/commit/629d3a1e02231520fe0e16613be4f68c9b9defae))
* refactor orchestrator into microskills + MCP discovery and remove 'role' frontmatter key ([#5](https://github.com/axiomfab/weavemas-agy/issues/5)) ([f6109a0](https://github.com/axiomfab/weavemas-agy/commit/f6109a0906e1c053efc515b44710edb048f88a9d))
* standardize pipeline execution directory to runs/&lt;slug&gt;/ ([a97588d](https://github.com/axiomfab/weavemas-agy/commit/a97588d281f74cb6b821529be8fac23999132a5a))
* **status:** add awaiting_review orchestrator state and yellow-green UI stage indicator ([#7](https://github.com/axiomfab/weavemas-agy/issues/7)) ([f920c50](https://github.com/axiomfab/weavemas-agy/commit/f920c5062a852cf5f73ac7c0e8ab403f241a0c17))
* **status:** stage-first [&lt;stage&gt;/]&lt;state&gt;[/&lt;detail&gt;] grammar, guard orchestrator weave.md, fix UI stage stepper ([#8](https://github.com/axiomfab/weavemas-agy/issues/8)) ([5e7ff9d](https://github.com/axiomfab/weavemas-agy/commit/5e7ff9df0ab133f94e54c18e86415b4e4ea4eb45))
* support output port bindings in ## Agents with automatic MCP promotion ([acc782b](https://github.com/axiomfab/weavemas-agy/commit/acc782b30dba40e63da526b4288749940e6a751c))
* **ui:** add collapsible stage panels and enhance input verification ([14e07cd](https://github.com/axiomfab/weavemas-agy/commit/14e07cddfd307328c7aa4a38e155cdc2ed59824d))
* **ui:** add git worktree detection and optgroup badge to runs selector ([6759d63](https://github.com/axiomfab/weavemas-agy/commit/6759d638aebcb3ae7b6024dbdc22442abb7a07b7))
* **ui:** add light/dark layout toggle with persisted preference (R4) ([6543c19](https://github.com/axiomfab/weavemas-agy/commit/6543c1964aeee94668bd6d92129baf6adb49a39e))
* **ui:** add status.md viewer tab to agent panel cards ([84d5bd5](https://github.com/axiomfab/weavemas-agy/commit/84d5bd593cb1b9b6c9cb413f1f10282c68bc96a7))
* **ui:** enable output copy/paste and embedded image/audio/video previews ([1cd17ab](https://github.com/axiomfab/weavemas-agy/commit/1cd17ab282d05da0cbacd4aef7c6a78d6c0646da))
* **ui:** extract HeaderBar component and streamline panel containers ([a14dbf0](https://github.com/axiomfab/weavemas-agy/commit/a14dbf0537d6ac8a4a10a3a18aa168be64f79ff9))
* **ui:** simplify header into flat native agy section ([#6](https://github.com/axiomfab/weavemas-agy/issues/6)) ([e075616](https://github.com/axiomfab/weavemas-agy/commit/e075616da9999f8d9e9ed61cff54a15bd1fce1dd))
* **ui:** support Solony worktree discovery and directory symlinks in sidecar panel ([bc87ee7](https://github.com/axiomfab/weavemas-agy/commit/bc87ee7bae18d403dab8fb2cf7d9ea655b29e41b))
* **verification:** add bilateral parameter verification and named alias contract matching ([97012b1](https://github.com/axiomfab/weavemas-agy/commit/97012b17a6e49d1d9b55014577e9ca5c5b48e800))
* **verify:** add 3-tier path resolution, pending inputs, wildcards, and static verification protocol ([59788f4](https://github.com/axiomfab/weavemas-agy/commit/59788f40b25228ad8b276233f5141e8326f46e5c))
* **weave:** persist worker conversation_id in weave.md (R9, [#15](https://github.com/axiomfab/weavemas-agy/issues/15)) ([75f1953](https://github.com/axiomfab/weavemas-agy/commit/75f1953f8d7576701dc613212397a433eeacbcd1))


### Bug Fixes

* **mcp:** align status_read with status.md schema and support expected deliverable matching ([cb8fb18](https://github.com/axiomfab/weavemas-agy/commit/cb8fb1879883b3e25b3c23eabfca73da0cbe4f29))
* **provisioner:** grant explicit view_file and write_to_file tool permissions ([95c54d3](https://github.com/axiomfab/weavemas-agy/commit/95c54d37197e3978f6420fb0c524834d1eb4a716))
* **runtime:** exclude user input and review waiting time from stage duration ([e4637d6](https://github.com/axiomfab/weavemas-agy/commit/e4637d627fa910b67f7e19143a264b1e187ec420))
* **status:** enforce strict absolute path validation on status MCP tooling ([2caecae](https://github.com/axiomfab/weavemas-agy/commit/2caecae2a01f312070906d548a212741c5cfe740))
* **status:** simplify statusRead to return exact frontmatter fields (status, role, deliverable, type, updated_at) ([a952164](https://github.com/axiomfab/weavemas-agy/commit/a95216469ef0cca84199d211702d17d05cd80ce4))
* **ui:** eliminate timer drift and second skipping with continuous millisecond tracking ([f77c358](https://github.com/axiomfab/weavemas-agy/commit/f77c358e6180912dfcaf00954c84038537840d3a))
* **ui:** enforce light/dark theme surfaces over runtime Tailwind and update roadmap ([4abae6a](https://github.com/axiomfab/weavemas-agy/commit/4abae6a3c2a50846d0d6d6d0b4b73d32a7ce1972))
* **ui:** remove elapsed time labels from pipeline stepper view ([c43ae26](https://github.com/axiomfab/weavemas-agy/commit/c43ae265412d458af384aa50bf63ad6a3f8175a2))
* **verification:** make - Parameters: none optional when agent requires no parameters ([f6c0c11](https://github.com/axiomfab/weavemas-agy/commit/f6c0c11371dcbfe1e3bf3f7dd0e61f372246f4f5))
* **weave-authoring:** enforce explicit runtime parameter declarations and strict contract match validation ([857db82](https://github.com/axiomfab/weavemas-agy/commit/857db82499050b3b38bff48bd320fb4a6b5543ee))

## [1.0.0] - 2026-11-23

- Initial public release of WeaveMAS (`weavemas_weave` MCP server, `weave-authoring` / `weave-core-orchestrator` / `weave-core-agent` skills, `provisioner` & `stage_orchestrator` agents, and the `WeaveMAS UI` sidecar).
