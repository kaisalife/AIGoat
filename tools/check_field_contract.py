"""核对桥接两侧的字段名：Rust 映射层读的，前端类型里认不认得。

背景：`turn/steer` 那一类缺陷（壳侧收 `text: String`，前端发 `input`）在编译期
完全看不出来——事件是跨桥过来的 JSON，类型系统抓不到字段对不上。而 `map/*.rs`
里全是手写的 `p.get("...")`，改协议字段时漏改前端类型不会有任何报错。

所以这里做一次静态交叉核对：把 `src-tauri/src/map/` 里所有 `.get("X")` 的
字段名收集起来，逐个确认它在 `web/src/bridge/types/` 里出现过。

判定用的是「出现过」而不是「精确声明在某个 interface 上」：后者要求把每个
字段映射到具体类型，映射层的字段大量来自协议透传（`p.get(...)` 直接塞进
json!），根本没有一一对应的前端类型。宽松判定换来的是零误报，代价是漏掉
「声明在了错误的地方」这种——那种由 TS 编译器负责。

用法：
  python tools/check_field_contract.py
退出码：0 = 全部认得（可能有已登记的豁免）；1 = 有前端不认识的字段。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAP_DIR = ROOT / "src-tauri" / "src" / "map"
TS_TYPES = ROOT / "web" / "src" / "bridge" / "types"

# Rust 侧读协议字段的写法：p.get("x") / item.get("x") / base["x"]
GET = re.compile(r'\.get\(\s*"([A-Za-z_][A-Za-z0-9_]*)"')
INDEX = re.compile(r'\[\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*\]')

# 这些不是协议字段，是本地 helper 自己的键或 serde 的结构性字段。
IGNORE = {
    # serde_json 自身的结构 / 本地 wrap 壳字段（由 map/mod.rs 的 wrap 统一造）
    "type",
    "kind",
    "method",
    "event",
}

# Rust 读了、但前端**有意不声明**的字段。附理由；往这里加之前先问一句：
# 是"映射层已归一化掉、前端不需要"，还是"前端漏声明了"？后者要补类型。
#
#   aggregatedOutput —— 协议只有这一个输出字段（没有 stdout/stderr 双流），
#       映射层直接落到 ToolEntry.output。双流分色是 05 号文件里唯一标 [~]
#       的未实现项，协议侧不具备条件，不是漏做。
#   move_path —— FileUpdateChange 的 `{"type":"update","move_path":…}` 变体，
#       已在映射层归一化进 FileChange.path（item_kinds 的 map_changes）。
#   summary —— reasoning item 的 summary 数组，在 reasoning_text() 里 join
#       成字符串后才发给前端。
#   items —— Thread.turns[].items，前端按 Turn.items 建模，但类型声明在
#       bridge/types 之外的模块（Thread 定义处），故本扫描看不到。
#   server / prompt / receiverThreadIds —— 工具与协作调用的身份字段，原样透传
#       进 toolCallStart.input / collab 事件；input 声明为 unknown，消费方
#       按需自取，不进类型。
ALLOWED = {
    "aggregatedOutput",
    "move_path",
    "summary",
    "items",
    "server",
    "prompt",
    "receiverThreadIds",
    # mcpToolCall 的错误详情：MCP 有这个字段，映射层读它、前端
    # ToolEntry.error 也声明了。
    "error",
    # 协议 TurnPlanUpdatedNotification 里字段就叫 `plan`（Array<TurnPlanStep>），
    # 映射层转发为前端的 `steps`（PlanStep[]）。协议侧命名，已归一化。
    "plan",
    # rawResponse/completed 的原文。debugEvent.payload 前端声明为 unknown，
    # 整块故意不透明（原始响应用于排查，不进界面）。
    "response",
    # dynamicToolCall 的 contentItems 数组，映射层直接落进 ToolEntry.output。
    # 该字段声明为 string，运行时可能是数组；渲染统一走 JsonBody 的
    # pretty(value: unknown)，所以不会崩。真相记录在 entries.ts 的注释里。
    "contentItems",
    # debug 通道的载荷字段。map/host.rs 的 debug() 把 rawResponse/completed、
    # rawResponseItem/completed、turn/moderationMetadata 三类原样塞进
    # debugEvent.payload，而该字段在前端**故意**声明为 unknown——原始响应
    # 只给账本/排查看，不进任何界面，声明它的字段只会是噪音。
    "responseId",
    "response",
    "item",
    "usage",
    "usageMetadata",
}


def rust_fields() -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    if not MAP_DIR.exists():
        return found
    for path in sorted(MAP_DIR.rglob("*.rs")):
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        for i, line in enumerate(lines, 1):
            for name in GET.findall(line) + INDEX.findall(line):
                if name in IGNORE:
                    continue
                found.setdefault(name, []).append(f"{path.name}:{i}")
    return found


def ts_names() -> set[str]:
    """前端类型目录里出现过的全部标识符字面量。"""
    names: set[str] = set()
    if not TS_TYPES.exists():
        return names
    token = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
    for path in sorted(TS_TYPES.rglob("*.ts")):
        text = path.read_text(encoding="utf-8", errors="replace")
        # 去掉注释，免得注释里提到的字段名把结果撑大
        text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
        text = re.sub(r"//[^\n]*", " ", text)
        names |= set(token.findall(text))
    return names


def main() -> int:
    rust = rust_fields()
    if not rust:
        print("✖ 没读到任何 Rust 字段引用——路径不对，拒绝给出结论。")
        return 2

    known = ts_names()
    excused = sorted(n for n in rust if n not in known and n in ALLOWED)
    unknown = sorted(n for n in rust if n not in known and n not in ALLOWED)

    for name in unknown:
        where = ", ".join(rust[name][:3])
        print(f"[前端不认] {name}  <- {where}")
    print(
        f"\nRust 映射层读了 {len(rust)} 个字段名："
        f"前端类型不认识 {len(unknown)} 个，已登记豁免 {len(excused)} 个"
    )
    if unknown:
        print("  字段跨桥是 JSON，类型系统抓不到对不上。出现「不认识」时：")
        print("  要么前端类型漏声明（该补），要么 Rust 读了个不存在的协议字段（该删）。")
        print("  确认是刻意归一化的话，写进脚本里的 ALLOWED 并附理由。")
    return 1 if unknown else 0


if __name__ == "__main__":
    sys.exit(main())