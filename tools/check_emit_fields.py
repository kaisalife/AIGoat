"""反向字段契约：Rust 映射层**发出**的键，前端类型里认不认得。

`check_field_contract.py` 管「读」的方向（Rust `.get("x")` 的字段必须在前端
类型里出现过）；这里管**发**的方向（`map/*.rs` 造出来的 `json!` 对象键必须
前端认识）。两个方向各抓一类错：

- 读方向抓「协议字段没建模」；
- 发方向抓「发了前端没人接的字段」——历史上 `imageGeneration` 的 `failure`
  就是这么丢的：类型里声明了、reducer 也读，但映射层从来不发，失败的图片
  生成在实时流里显示成成功，而重连基线却带 failure，两边行为不一致。

判定同样用「出现过」的宽松口径（零误报优先），豁免需要附理由。

用法：
  python tools/check_emit_fields.py
退出码：0 = 全部认得（可能有已登记的豁免）；1 = 有前端不认识的键。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# CI runner 的控制台编码是 cp1252，print 中文会 UnicodeEncodeError；统一钉成 UTF-8。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
MAP_DIR = ROOT / "src-tauri" / "src" / "map"
# 语料：事件类型 + 契约（HistoryEntry 等也在 Rust 侧用 json! 造）。
TS_CORPUS = [
    ROOT / "web" / "src" / "bridge" / "types",
    ROOT / "web" / "src" / "bridge" / "contract.ts",
]

# json!({...}) 里的对象键；`["key"] = ...` 的下标赋值（历史 item 的 patch 写法）。
JSON_KEY = re.compile(r'"([A-Za-z_][A-Za-z0-9_]*)"\s*:')
INDEX_ASSIGN = re.compile(r'\[\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*\]')

# 不是事件字段，是信封 / JSON-RPC 结构本身。
IGNORE = {
    "type",
    "method",
    "event",
    "kind",
    # JSON-RPC 帧（framing 侧的应答壳，不是 AgentEvent 的字段）
    "id",
    "result",
    "error",
    "code",
    "message",
    "params",
}

# Rust 发了、前端**有意**不声明为具名字段的键。附理由；加之前先问一句：
# 是「信封/调试载荷，前端故意 unknown」，还是「前端漏声明了」？后者要补类型。
ALLOWED = {
    # debug 通道的原始载荷：前端 debugEvent.payload 声明为 unknown，整块
    # 故意不透明（原始响应用于排查，不进界面）。
    "payload",
    # guard 通道的沙箱审批载荷是自由形状，前端按 unknown 处理。
    "reason",
    "timeout",
    "timeoutSecs",
    "networkAccess",
    # 工具/协作调用的身份与原始响应字段：原样透传进 toolCallStart.input /
    # debugEvent.payload，前端声明为 unknown，消费方按需自取（与
    # check_field_contract.py 的 ALLOWED 同一组，同一批理由）。
    "server",
    "prompt",
    "receiverThreadIds",
    "response",
    "responseId",
    "item",
    "usage",
    "usageMetadata",
}


def rust_keys() -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    if not MAP_DIR.exists():
        return found
    for path in sorted(MAP_DIR.rglob("*.rs")):
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        for i, line in enumerate(lines, 1):
            stripped = line.split("//")[0]
            for name in JSON_KEY.findall(stripped) + INDEX_ASSIGN.findall(stripped):
                if name in IGNORE:
                    continue
                found.setdefault(name, []).append(f"{path.name}:{i}")
    return found


def ts_names() -> set[str]:
    names: set[str] = set()
    token = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
    for entry in TS_CORPUS:
        paths = entry.rglob("*.ts") if entry.is_dir() else ([entry] if entry.exists() else [])
        for path in sorted(paths):
            text = path.read_text(encoding="utf-8", errors="replace")
            text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
            text = re.sub(r"//[^\n]*", " ", text)
            names |= set(token.findall(text))
    return names


def main() -> int:
    rust = rust_keys()
    if not rust:
        print("✖ 没读到任何 Rust 发出的键——路径不对，拒绝给出结论。")
        return 2

    known = ts_names()
    excused = sorted(n for n in rust if n not in known and n in ALLOWED)
    unknown = sorted(n for n in rust if n not in known and n not in ALLOWED)

    for name in unknown:
        where = ", ".join(rust[name][:3])
        print(f"[前端不认] {name}  <- {where}")
    print(
        f"\nRust 映射层发出了 {len(rust)} 个键："
        f"前端类型不认识 {len(unknown)} 个，已登记豁免 {len(excused)} 个"
    )
    if unknown:
        print("  发出去没人接的字段等于白发：要么前端类型漏声明（该补），")
        print("  要么 Rust 发了个多余键（该删）。确认是刻意的写进 ALLOWED 并附理由。")
    return 1 if unknown else 0


if __name__ == "__main__":
    sys.exit(main())
