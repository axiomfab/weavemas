---
name: weave-core-agent
description: >-
  Standard WeaveMAS subagent execution protocol. Enforces CWD sandboxing,
  pre-flight verification, step-by-step lifecycle tracking, and deliverable verification via WeaveMAS MCP status tools.
---

# 🤖 WeaveMAS Subagent Execution Protocol

This protocol provides universal execution rules and deterministic status lifecycle management for all subagents in the WeaveMAS pipeline.

---

## 1. Directory Sandbox & Boundaries

Your current working directory (`.`) is your absolute execution boundary:
* **Strict CWD Writes**: All file outputs, scratch notes, and final deliverables must be created strictly within your working directory.
* **No Parent/Root Writes**: Never attempt to write to parent, sibling, or repository root directories.
* **Absolute Path for Status Tools**: When invoking Weave status tools (`status_verify`, `status_update`), `dir` must strictly be the absolute path to your assigned working directory.

---

## 2. Zero Unnecessary Exploration (ZUE)

* **No Directory Scans**: Do **NOT** run directory discovery commands (`dir`, `ls`, `Get-ChildItem`), repository-wide file searches, or inspect parent directories.
* **No Docs Browsing**: Do **NOT** search for or read root project documentation, orchestration guides, or unassigned scripts.
* **Explicit Inputs Only**: Read only the external files explicitly specified and authorized in your prompt (such as static persona files or input clips).

---

## 3. Step 0: Pre-flight Verification

Before starting any task work, verify that your assigned working directory and pre-initialized `status.md` are valid:

* **Using Native MCP Tool (Standard)**:
  Call `call_mcp_tool`:
  * `ServerName`: `"weavemas_weave"`
  * `ToolName`: `"status_verify"`
  * `Arguments`:
    ```json
    {
      "expected_role": "<role_slug>",
      "dir": "<absolute_working_directory>"
    }
    ```
* **Using CLI Tool (Fallback)**:
  ```bash
  python .agent/skills/weave-core/scripts/weave_status.py verify --expected-role <role_slug>
  ```

If verification fails, fail fast and report the error immediately.

---

## 4. Multi-Step Lifecycle Tracking

As you proceed through each step outlined in your role instructions, update `status.md` with the step slug:

* **Using Native MCP Tool (Standard)**:
  Call `call_mcp_tool`:
  * `ServerName`: `"weavemas_weave"`
  * `ToolName`: `"status_update"`
  * `Arguments`:
    ```json
    {
      "status": "in_progress/<step_slug>",
      "progress": "<Summary of current step progress>",
      "dir": "<absolute_working_directory>"
    }
    ```
* **Using CLI Tool (Fallback)**:
  ```bash
  python .agent/skills/weave-core/scripts/weave_status.py update \
    --status "in_progress/<step_slug>" \
    --progress "<Summary of current step progress>"
  ```

* Derive `<step_slug>` directly from your role's step titles (e.g., `reading_personas`, `selecting_persona`, `factual_research`).
* Always include a meaningful `progress` message detailing what was discovered or decided.

---

## 5. Completion & Deliverable Verification

When your required deliverable (e.g., `setup.md`) has been fully written to disk in your working directory, transition your status to `completed`:

* **Using Native MCP Tool (Standard)**:
  Call `call_mcp_tool`:
  * `ServerName`: `"weavemas_weave"`
  * `ToolName`: `"status_update"`
  * `Arguments`:
    ```json
    {
      "status": "completed",
      "deliverable": "<deliverable_filename>",
      "progress": "<Final executive summary of output>",
      "dir": "<absolute_working_directory>"
    }
    ```
* **Using CLI Tool (Fallback)**:
  ```bash
  python .agent/skills/weave-core/scripts/weave_status.py update \
    --status "completed" \
    --deliverable "<deliverable_filename>" \
    --progress "<Final executive summary of output>"
  ```

* `<deliverable_filename>` must be a relative filename inside your working directory (e.g. `setup.md`).
* The status tool automatically verifies that the deliverable file exists on disk and will reject completion if it does not.
