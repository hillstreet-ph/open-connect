#!/usr/bin/env python3
"""Package the existing private App plugin with the canonical Auto skill."""

import argparse
import json
from pathlib import Path
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    source = root / "plugins/chatgpt-open-connect"
    manifest = json.loads((source / "plugin.json").read_text())
    legacy = json.loads((source / ".codex-plugin/plugin.json").read_text())
    extension = manifest["extensions"]["com.openai"]
    if any(manifest[key] != legacy[key] for key in ("name", "version", "description", "author")):
        raise ValueError("Portable and compatibility metadata differ")
    if extension["interface"] != legacy["interface"] or extension["apps"] != legacy["apps"]:
        raise ValueError("App binding or presentation differs")
    files = {
        name: source / name
        for name in ("plugin.json", ".codex-plugin/plugin.json", ".app.json")
    }
    files["skills/auto/SKILL.md"] = root / "skills/auto/SKILL.md"
    if any(path.is_symlink() or not path.is_file() for path in files.values()):
        raise ValueError("All package sources must be regular files")
    output = args.output.resolve()
    if output in [path.resolve() for path in files.values()]:
        raise ValueError("Output must not replace a source file")
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, path in files.items():
            archive.write(path, name)
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != set(files):
            raise ValueError("Archive integrity check failed")
    print(f"Packaged {manifest['name']} {manifest['version']}: {output}")


if __name__ == "__main__":
    main()
