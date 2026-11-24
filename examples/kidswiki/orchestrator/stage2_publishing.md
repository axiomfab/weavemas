# Stage 2: Illustration & Publishing

## Objective
Extract the approved alt-text visual prompt from `01_draft.md` and generate `02_illustration.png` to complete the illustrated article in place.

## Agents

### Illustrator Agent: `illustrator`
* **Instructions**: [stage2_illustrator.md](.agent/agents/stage2_illustrator.md)
* **Working Directory**: `${RUN_DIR}/stage02_publishing/agents/illustrator/`
* **Inputs**:
  - `draft.md: ${RUN_DIR}/01_draft.md`
* **Outputs**:
  - `illustration.png: ${RUN_DIR}/02_illustration.png`

## Execution
1. **`illustrator`**:
   - Parameters: `none`
   - Execution: Read `draft.md`, extract the visual prompt from `![<prompt>](./02_illustration.png)`, and generate `illustration.png` (promoted automatically to `${RUN_DIR}/02_illustration.png`).
