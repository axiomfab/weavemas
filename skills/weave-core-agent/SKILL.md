---
name: weave-core-agent
description: >-
  Standard WeaveMAS subagent execution protocol. Enforces CWD sandboxing,
  pre-flight verification, task lifecycle tracking, and deliverable verification via WeaveMAS MCP status tools.
---

# 🤖 WeaveMAS Subagent Execution Protocol

This protocol provides universal execution rules and deterministic status lifecycle management for all subagents in the WeaveMAS pipeline.

---

## 1. Directory Sandbox & Boundaries

Your current working directory (`.`) is your absolute execution boundary:
* **Strict CWD Writes**: All file outputs, scratch notes, and final deliverables must be created strictly within your working directory.
* **No Parent/Root Writes**: Never attempt to write to parent, sibling, or repository root directories.
* **Absolute Path for Status Tools**: When invoking Weave status tools (`status_verify`, `status_update`), `dir` must strictly be the absolute path to your assigned working directory.
* **Strict Ban on `view_file` for Status**: Never inspect `status.md`, `status_*.json`, or tool schema files via `view_file` or file-reading tools. Pre-flight verification and status lifecycle updates must strictly be performed by calling the WeaveMAS MCP status tools (`status_verify`, `status_update`) directly. Reading `status.md` manually wastes tokens and bypasses automated verification.

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

## 4. Task Lifecycle Tracking

As you proceed through each task outlined in your role instructions, update `status.md`:

* **Multi-Task Agents (`# Tasks`)**:
  Derive `<task_slug>` directly from your `## Task: [slug_name]` sections (e.g., `01_reading_personas`, `02_selecting_persona`, `03_factual_research`):
  * **Using Native MCP Tool (Standard)**:
    Call `call_mcp_tool`:
    * `ServerName`: `"weavemas_weave"`
    * `ToolName`: `"status_update"`
    * `Arguments`:
      ```json
      {
        "status": "in_progress/<task_slug>",
        "progress": "<Summary of current task progress>",
        "dir": "<absolute_working_directory>"
      }
      ```
  * **Using CLI Tool (Fallback)**:
    ```bash
    python .agent/skills/weave-core/scripts/weave_status.py update \
      --status "in_progress/<task_slug>" \
      --progress "<Summary of current task progress>"
    ```

* **Single-Purpose Agents**:
  If your role has a single unified purpose without a `# Tasks` section, simply use `status: "in_progress"` without a sub-slug:
  * **Using Native MCP Tool (Standard)**:
    Call `call_mcp_tool`:
    * `ServerName`: `"weavemas_weave"`
    * `ToolName`: `"status_update"`
    * `Arguments`:
      ```json
      {
        "status": "in_progress",
        "progress": "<Summary of current progress>",
        "dir": "<absolute_working_directory>"
      }
      ```
  * **Using CLI Tool (Fallback)**:
    ```bash
    python .agent/skills/weave-core/scripts/weave_status.py update \
      --status "in_progress" \
      --progress "<Summary of current progress>"
    ```

* Always include a meaningful `progress` message detailing what was discovered, decided, or produced.

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
