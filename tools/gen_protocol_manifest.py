"""从 codex app-server generate-ts 产物生成协议清单，并做漂移检测。

用法：
  - 生成 / 更新基线：  python tools/gen_protocol_manifest.py --write
  - 只检测漂移：        python tools/gen_protocol_manifest.py --check

`--check` 需要能执行 codex（通过 --codex 或 PATH）。退出码 1 表示协议已漂移，
调用方（CI / tools/check-protocol.ps1）据此失败。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MANIFEST = REPO / "proto" / "manifest.json"


def extract(proto_dir: Path) -> dict:
    def methods(rel: str) -> list[str]:
        path = proto_dir / rel
        if not path.exists():
            return []
        text = path.read_text(encoding="utf-8", errors="replace")
        found = re.findall(
            r'"method":\s*"([A-Za-z][A-Za-z0-9_]*(?:/[A-Za-z0-9_]+)+)"', text
        )
        return sorted(set(found))

    def item_types(rel: str) -> list[str]:
        path = proto_dir / rel
        if not path.exists():
            return []
        text = path.read_text(encoding="utf-8", errors="replace")
        return sorted(set(re.findall(r'"type":\s*"([A-Za-z][A-Za-z0-9_]*)"', text)))

    return {
        "clientRequests": methods("ClientRequest.ts"),
        "serverRequests": methods("ServerRequest.ts"),
        "notifications": methods("ServerNotification.ts"),
        "threadItemTypes": item_types("v2/ThreadItem.ts"),
    }


def generate_ts(codex: str, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [codex, "app-server", "generate-ts", "--out", str(out)],
        check=True,
        capture_output=True,
    )


def find_codex(explicit: str | None) -> str | None:
    if explicit:
        return explicit
    return shutil.which("codex")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--codex", help="codex 可执行文件路径")
    ap.add_argument("--write", action="store_true", help="更新基线")
    ap.add_argument("--check", action="store_true", help="检测漂移")
    args = ap.parse_args()

    codex = find_codex(args.codex)
    if not codex:
        print("找不到 codex 可执行文件；用 --codex 指定，或先把它放进 PATH", file=sys.stderr)
        return 2

    tmp = Path(tempfile.mkdtemp(prefix="codex-proto-"))
    try:
        generate_ts(codex, tmp)
        current = extract(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if args.write:
        payload = {
            "_comment": "由 tools/gen_protocol_manifest.py 生成，勿手改。"
            "重新生成：python tools/gen_protocol_manifest.py --write",
            "source": "codex app-server generate-ts",
            **current,
        }
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"已写入 {MANIFEST}")
        for key, value in current.items():
            print(f"  {key}: {len(value)}")
        return 0

    if args.check:
        if not MANIFEST.exists():
            print(f"基线不存在：{MANIFEST}；先跑一次 --write", file=sys.stderr)
            return 1
        baseline = json.loads(MANIFEST.read_text(encoding="utf-8"))
        drift = False
        for key, values in current.items():
            old = set(baseline.get(key, []))
            new = set(values)
            added = sorted(new - old)
            removed = sorted(old - new)
            if added or removed:
                drift = True
                print(f"[漂移] {key}")
                for m in added:
                    print(f"  + {m}")
                for m in removed:
                    print(f"  - {m}")
            else:
                print(f"[一致] {key}: {len(values)} 项")
        if drift:
            print(
                "\n协议已漂移。请同步桥接层后运行："
                "\n  python tools/gen_protocol_manifest.py --write"
            )
            return 1
        print("\n协议与基线一致。")
        return 0

    ap.error("必须指定 --write 或 --check")
    return 2


if __name__ == "__main__":
    sys.exit(main())