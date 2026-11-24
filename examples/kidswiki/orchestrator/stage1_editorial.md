# Stage 1: Editorial & Verification

## Objective
Draft an age-calibrated KidsWiki article with an embedded illustration placeholder, then verify scientific accuracy and readability in parallel before human approval.

## Agents

### Writer Agent: `writer`
* **Instructions**: [stage1_writer.md](.agent/agents/stage1_writer.md)
* **Working Directory**: `${RUN_DIR}/stage01_editorial/agents/writer/`
* **Outputs**:
  - `draft.md: ${RUN_DIR}/01_draft.md`

### Fact Checker Agent: `fact_checker`
* **Instructions**: [stage1_fact_checker.md](.agent/agents/stage1_fact_checker.md)
* **Working Directory**: `${RUN_DIR}/stage01_editorial/agents/fact_checker/`
* **Inputs**:
  - `../writer/draft.md`
* **Outputs**:
  - `fact_audit.md`

### Age Checker Agent: `age_checker`
* **Instructions**: [stage1_age_checker.md](.agent/agents/stage1_age_checker.md)
* **Working Directory**: `${RUN_DIR}/stage01_editorial/agents/age_checker/`
* **Inputs**:
  - `../writer/draft.md`
* **Outputs**:
  - `age_audit.md`

## Execution
1. **`writer`**:
   - Parameters: `topic`, `target_age`
   - Execution: Draft the article and in-place `![<illustration prompt>](./02_illustration.png)` placeholder to `draft.md` (promoted automatically to `${RUN_DIR}/01_draft.md`).
2. **`fact_checker` & `age_checker` (execute in parallel)**:
   - `fact_checker` Parameters: `topic`
   - `age_checker` Parameters: `target_age`
   - Execution: Audit `../writer/draft.md` concurrently for factual accuracy (`fact_audit.md`) and age readability (`age_audit.md`). If either audit returns `verdict: FAIL` (max 2 revision cycles), route combined critique feedback to `writer` via `send_message` and re-run the failed checker(s).
3. **User Review Gate**:
   - Present `01_draft.md` for approval via WeaveMAS UI and a direct `${RUN_DIR}/01_draft.md` link (zero-copy); route any revision feedback to `writer` via `send_message`.
