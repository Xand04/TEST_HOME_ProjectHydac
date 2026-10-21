"""Start Kundenmarkt-Scout directly from the PyCharm Run button."""
from pathlib import Path
import shutil
import subprocess


def main() -> int:
    project = Path(__file__).resolve().parent / "kundenmarkt-scout"
    node = shutil.which("node")
    if not node:
        print("Bitte Node.js ab Version 22.13 installieren.")
        return 1
    if not (project / "node_modules").is_dir():
        print(f"Bitte zuerst im Ordner {project} den Befehl npm install ausführen.")
        return 1
    print("Kundenmarkt-Scout startet: http://127.0.0.1:5173", flush=True)
    try:
        return subprocess.call([node, "scripts/run-framework.mjs", "dev"], cwd=project)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
