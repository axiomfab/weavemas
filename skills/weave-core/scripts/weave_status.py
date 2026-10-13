from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Optional
import argparse
import re
import sys

FRONTMATTER_PATTERN = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)$", re.DOTALL)


@dataclass
class StatusData:
    type: str
    role: str
    status: str
    deliverable: Optional[str]
    updated_at: str
    body: str


def parse_status_file(file_path: Path) -> StatusData:
    if not file_path.exists():
        raise FileNotFoundError(f"CRITICAL: status file does not exist at {file_path}")
    raw_content = file_path.read_text(encoding="utf-8").strip()
    match = FRONTMATTER_PATTERN.match(raw_content)
    if not match:
        raise ValueError(f"CRITICAL: Malformed frontmatter in {file_path}")

    frontmatter_text = match.group(1)
    body = match.group(2).strip()
    fields: dict[str, Optional[str]] = {}

    for line in frontmatter_text.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        colon_idx = trimmed.find(":")
        if colon_idx == -1:
            continue
        key = trimmed[:colon_idx].strip()
        val = trimmed[colon_idx + 1 :].strip()
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        elif val in ("null", "~"):
            val = None
        fields[key] = val

    node_type = fields.get("type")
    if not node_type:
        raise ValueError("CRITICAL: Missing 'type' in status frontmatter")
    role = fields.get("role")
    if not role:
        if node_type == "orchestrator":
            role = "orchestrator"
        else:
            raise ValueError("CRITICAL: Missing 'role' in status frontmatter")
    status = fields.get("status")
    if not status:
        raise ValueError("CRITICAL: Missing 'status' in status frontmatter")

    deliverable = fields.get("deliverable")
    updated_at = fields.get("updated_at") or datetime.now(timezone.utc).isoformat()

    return StatusData(
        type=node_type,
        role=role,
        status=status,
        deliverable=deliverable,
        updated_at=updated_at,
        body=body,
    )


def serialize_status_file(data: StatusData) -> str:
    deliv_str = f'"{data.deliverable}"' if data.deliverable is not None else "null"
    lines: list[str] = [
        "---",
        f"type: {data.type}",
        f"role: {data.role}",
        f"status: {data.status}",
        f"deliverable: {deliv_str}",
        f'updated_at: "{data.updated_at}"',
        "---",
    ]
    if data.body:
        return "\n".join(lines) + f"\n\n{data.body.strip()}\n"
    return "\n".join(lines) + "\n"


def init_status(
    target_dir: Path,
    role: Optional[str] = None,
    node_type: str = "agent",
    initial_status: str = "not_started",
) -> Path:
    if node_type == "orchestrator" and (not role or not role.strip()):
        role = "orchestrator"
    elif not role or not role.strip():
        raise ValueError("CRITICAL: role parameter is required and cannot be empty for agent")
    target_dir.mkdir(parents=True, exist_ok=True)
    status_file = target_dir / "status.md"

    now_iso = datetime.now(timezone.utc).isoformat()
    init_body = (
        "Pipeline execution initialized."
        if node_type == "orchestrator"
        else f"Working directory initialized for {role.strip()}."
    )
    data = StatusData(
        type=node_type,
        role=role.strip(),
        status=initial_status.strip(),
        deliverable=None,
        updated_at=now_iso,
        body=init_body,
    )
    status_file.write_text(serialize_status_file(data), encoding="utf-8")
    return status_file


def verify_status(target_dir: Path, expected_role: str) -> bool:
    if not expected_role or not expected_role.strip():
        raise ValueError("CRITICAL: expected_role parameter is required")
    status_file = target_dir / "status.md"
    data = parse_status_file(status_file)

    if data.role != expected_role:
        raise ValueError(
            f"CRITICAL: Role mismatch. Expected '{expected_role}', found '{data.role}' in {status_file}"
        )
    if data.status != "not_started":
        raise ValueError(
            f"CRITICAL: Initial status must be 'not_started', found '{data.status}' in {status_file}"
        )
    return True


def update_status(
    target_dir: Path,
    status: str,
    deliverable: Optional[str] = None,
    progress: Optional[str] = None,
) -> Path:
    if not status or not status.strip():
        raise ValueError("CRITICAL: status parameter is required and cannot be empty")

    status_file = target_dir / "status.md"
    current = parse_status_file(status_file)

    if deliverable is not None:
        deliverable_clean = deliverable.strip()
        if status.startswith("completed"):
            target_path = target_dir / deliverable_clean
            if not target_path.exists():
                raise FileNotFoundError(
                    f"CRITICAL: Deliverable file '{deliverable_clean}' does not exist on disk in {target_dir}"
                )
        current.deliverable = deliverable_clean
    elif status.startswith("completed") and current.deliverable:
        target_path = target_dir / current.deliverable
        if not target_path.exists():
            raise FileNotFoundError(
                f"CRITICAL: Deliverable file '{current.deliverable}' does not exist on disk in {target_dir}"
            )

    current.status = status.strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    current.updated_at = now_iso

    if progress and progress.strip():
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        update_entry = f"### ⏱️ Update — {timestamp}\n\n{progress.strip()}"
        current.body = f"{current.body}\n\n{update_entry}" if current.body else update_entry

    status_file.write_text(serialize_status_file(current), encoding="utf-8")
    return status_file


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="WeaveMAS status.md manager")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_p = subparsers.add_parser("init", help="Initialize status.md")
    init_p.add_argument("--role", default=None, help="Agent role slug (required for agent, defaults to 'orchestrator' for orchestrator)")
    init_p.add_argument("--dir", default=".", help="Directory to create status.md in (defaults to CWD)")
    init_p.add_argument("--type", default="agent", choices=["agent", "orchestrator"], help="Node type")
    init_p.add_argument("--status", default="not_started", help="Initial status")

    verify_p = subparsers.add_parser("verify", help="Verify preflight status.md state")
    verify_p.add_argument("--expected-role", required=True, help="Expected agent role slug")
    verify_p.add_argument("--dir", default=".", help="Directory containing status.md")

    update_p = subparsers.add_parser("update", help="Update status.md state")
    update_p.add_argument("--status", required=True, help="New status (e.g. in_progress/drafting, completed/ready)")
    update_p.add_argument("--deliverable", default=None, help="Relative deliverable path")
    update_p.add_argument("--progress", default=None, help="Summary progress message")
    update_p.add_argument("--dir", default=".", help="Directory containing status.md")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    target_dir = Path(os.path.abspath(args.dir))

    if args.command == "init":
        init_status(
            target_dir=target_dir,
            role=args.role,
            node_type=args.type,
            initial_status=args.status,
        )
        print(f"STATUS_INIT_OK: Initialized status.md in {target_dir}")
    elif args.command == "verify":
        verify_status(target_dir=target_dir, expected_role=args.expected_role)
        print(f"STATUS_VERIFY_OK: status.md matches expected role '{args.expected_role}'")
    elif args.command == "update":
        update_status(
            target_dir=target_dir,
            status=args.status,
            deliverable=args.deliverable,
            progress=args.progress,
        )
        print(f"STATUS_UPDATE_OK: Updated status to '{args.status}'")


if __name__ == "__main__":
    main()
