"""Validate the repository's supported AI adapter subset without network access."""

import re
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def claude_frontmatter(path):
    text = path.read_text(encoding="utf-8")
    parts = text.split("---", 2)
    require(len(parts) == 3 and not parts[0].strip(), f"{path}: missing frontmatter")
    fields = {}
    for line in parts[1].strip().splitlines():
        match = re.fullmatch(r"([a-z_]+): ([^\r\n]+)", line)
        require(match is not None, f"{path}: unsupported frontmatter syntax")
        key, value = match.groups()
        require(key not in fields, f"{path}: duplicate {key}")
        require(not any(char in value for char in "{}[]&*!|>\"'"),
                f"{path}: use plain scalar frontmatter")
        fields[key] = value
    require(set(fields) == {"name", "description", "tools", "model", "effort"},
            f"{path}: unexpected or missing fields")
    require(fields["name"] == path.stem, f"{path}: role name mismatch")
    expected_model = "haiku" if path.stem == "repository-explorer" else "sonnet"
    require(fields["model"] == expected_model, f"{path}: review model policy before changing")
    require(fields["effort"] in {"medium", "high"}, f"{path}: unsupported effort")
    return fields


def main():
    config = tomllib.loads((ROOT / ".codex/config.toml").read_text(encoding="utf-8"))
    require(set(config) == {"model", "model_reasoning_effort", "agents"},
            "Codex project config changed: review supported keys and permission inheritance")
    require(config["model"] == "gpt-6.1-sol" and config["model_reasoning_effort"] == "medium",
            "Codex orchestrator policy mismatch")
    require(config["agents"] == {
        "enabled": True, "max_concurrent_threads_per_session": 2,
        "default_subagent_model": "gpt-6.1-sol",
        "default_subagent_reasoning_effort": "medium",
    }, "Codex agent defaults mismatch")
    codex_roles = sorted((ROOT / ".codex/agents").glob("*.toml"))
    claude_roles = sorted((ROOT / ".claude/agents").glob("*.md"))
    require(bool(codex_roles) and bool(claude_roles), "Missing role definitions")
    claude = {path.stem: claude_frontmatter(path) for path in claude_roles}
    high = {"solution-architect", "security-engineer", "critical-specialist"}
    for path in codex_roles:
        role = tomllib.loads(path.read_text(encoding="utf-8"))
        require(set(role) == {"name", "description", "model", "model_reasoning_effort",
                              "developer_instructions"}, f"{path}: unexpected keys")
        require(role["name"] == path.stem, f"{path}: role name mismatch")
        require(role["model"] == "gpt-6.1-sol", f"{path}: unreviewed model")
        effort = "low" if path.stem == "repository-explorer" else (
            "high" if path.stem in high else "medium")
        require(role["model_reasoning_effort"] == effort, f"{path}: routing mismatch")
        require("CLAUDE.md" in role["developer_instructions"], f"{path}: missing rules")
        require(path.stem in claude or path.stem == "critical-specialist",
                f"{path}: missing shared responsibility definition")
    require(set(claude) == {path.stem for path in codex_roles} - {"critical-specialist"},
            "Claude / Codex role coverage mismatch")
    for path in ["AGENTS.md", "CLAUDE.md", "docs/ai-harness.md", "docs/CLAUDE_HANDOFF.md"]:
        require((ROOT / path).is_file(), f"Missing {path}")
    print(f"PASS: Codex TOML ({len(codex_roles)} roles), Claude plain-scalar frontmatter "
          f"({len(claude)} roles), routing and inherited permissions. No live model call.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
