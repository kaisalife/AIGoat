"""校验 Rust 结构体的线格式字段与 codex 生成的 TS 声明是否一致。

背景：`codex app-server generate-ts` 是协议的唯一权威。任何手抄的类型声明
都可能抄错——本项目已经栽过一次（`ReasoningEffortOption` 被抄成
`{effort, description}`，实际是 `{reasoningEffort, description}`），
编译无法发现，只有运行时解码才炸。

本脚本做两件事：
  1. 从 generate-ts 产物里抽出每个 `export type X = { ... }` 的字段名集合
  2. 从 Rust 源码里抽出每个 `#[derive(Deserialize)] pub struct X { ... }` 的
     serde 字段名（snake_case -> camelCase）
  3. 双向 diff，报出「Rust 多出的字段」与「Rust 缺失的字段」

只读，不改任何文件。退出码 1 表示有差异。

用法：
  python tools/check_wire_parity.py --proto <generate-ts 产物目录>
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# CI runner 的控制台编码是 cp1252，print 中文会 UnicodeEncodeError；统一钉成 UTF-8。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# `export type Name = { ... }` 里的字段：`name: Type,` 或 `name?: Type,`
# 需要跳过交叉类型（`... & { ... }`）里的重复字段，故这里只取首个花括号块。
TS_TYPE = re.compile(
    r"export\s+type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?://[^\n]*\n\s*)*\{",
)
# 字段分隔符可能是 `,`（单行声明）或换行 / `;`（多行声明）。
# 键可能带引号（联合判别标签如 "handlerType": "command"）。
# 用 finditer 而不是 search，否则一行里只会匹配到第一个字段。
TS_FIELD = re.compile(
    r'(?:^|[;,{\n(])\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\??\s*:'
)

RUST_STRUCT = re.compile(r"pub\s+struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{")
RUST_FIELD = re.compile(r"^\s*pub(?:\([^)]*\))?\s+([a-z_][a-z0-9_]*)\s*:")
RUST_RENAME_ALL = re.compile(r'#\[serde\(\s*rename_all\s*=\s*"([^"]+)"')
RUST_FIELD_RENAME = re.compile(r'#\[serde\(\s*rename\s*=\s*"([^"]+)"')
RUST_FLATTEN = re.compile(r"#\[serde\(\s*flatten")
SKIP = {"meta"}
# 含 `#[serde(flatten)]` 兜底容器的类型：它们的「未建模字段」是假阳性。
FLATTEN_TYPES: set[str] = set()

# AIGoat 自有的持久化结构体，**不上线**（只写 settings.json / workspaces.json）。
# 它们和协议类型撞名，而本脚本只按名字匹配，所以必须显式排除——
# 否则会拿 `Settings.activeModelId` 去比协议的 `Settings.model`，
# 报出一堆并不存在的漂移。
# （Rust 侧真正镜像协议的结构体在 `map.rs` 之外没有：JSON-RPC 的应答
#  一律进 serde_json::Value，由 map.rs 按事件语义取值。所以这个脚本在
#  当前布局下主要起"别误报"的哨兵作用，真正的协议漂移由第 4 关兜。）
LOCAL_TYPES: set[str] = {
    "Settings",
    "ProviderSpec",
    "ModelSpec",
    "UiSettings",
    "Workspaces",
    "WorkspaceEntry",
    "WorkspaceSummary",
    "Registry",
}


def snake_to_camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.capitalize() for part in rest if part)


def extract_ts(proto: Path) -> dict[str, set[str]]:
    """抽取每个协议类型的字段名集合。

    注意联合类型：`export type X = { a } | { b }` 与 `X = { a } & { b }` 都可能。
    只取第一个花括号块会漏掉后半个变体（`ResourceContent` 就是这种：
    一个变体带 `text`，另一个带 `blob`），因此这里收集声明语句里
    **所有顶层**花括号块。
    """
    out: dict[str, set[str]] = {}
    for path in proto.rglob("*.ts"):
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in TS_TYPE.finditer(text):
            type_name = match.group(1)
            fields = set()
            depth = 0
            block_start = None
            for i in range(match.end() - 1, len(text)):
                ch = text[i]
                if ch == "{":
                    if depth == 0:
                        block_start = i + 1
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0 and block_start is not None:
                        fields |= fields_of(text[block_start:i])
                        block_start = None
                    if depth < 0:
                        break
                elif ch == ";" and depth == 0:
                    break
            if fields:
                out.setdefault(type_name, set()).update(fields)
    return out


def fields_of(body: str) -> set[str]:
    """从一个花括号块里抽字段名。"""
    fields: set[str] = set()
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith("//") or line.startswith("/*"):
            continue
        line = line.split("//")[0].strip()
        for fm in TS_FIELD.finditer(line):
            # 局部变量不要叫 name：它会遮蔽外层的类型名，
            # 导致类型被登记在字段名下。
            field = fm.group(1)
            if field not in {"type", "get", "set"}:
                fields.add(field)
    return fields


def extract_rust(src: Path) -> dict[str, set[str]]:
    """抽取 Rust 结构体的线上字段名。

    要点：
    - `#[serde(rename_all = "camelCase")]` 决定 snake_case 的转换方式
    - `#[serde(rename = "x")]` 逐字段覆盖（例如线上叫 `_meta`）
    - `#[serde(flatten)]` 字段是兜底容器，**不是**线上的具名字段，跳过
    """
    out: dict[str, set[str]] = {}
    for path in src.rglob("*.rs"):
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        rename_all = "camelCase"
        for idx, line in enumerate(lines):
            rm = RUST_RENAME_ALL.search(line)
            if rm:
                rename_all = rm.group(1)
                continue
            sm = RUST_STRUCT.search(line)
            if not sm:
                continue
            name = sm.group(1)
            fields: set[str] = set()
            has_flatten = False
            # 字段上的 serde 属性可能写在字段上一行。
            pending_rename: str | None = None
            pending_flatten = False
            for body in lines[idx + 1 :]:
                if body.strip().startswith("}"):
                    break
                if body.strip().startswith("#[serde"):
                    fr = RUST_FIELD_RENAME.search(body)
                    pending_rename = fr.group(1) if fr else pending_rename
                    if RUST_FLATTEN.search(body):
                        pending_flatten = True
                    continue
                fm = RUST_FIELD.match(body)
                if not fm:
                    continue
                if pending_flatten:
                    # 兜底容器：线上未知字段都会落进来，因此「未建模」对它没有意义。
                    has_flatten = True
                    pending_flatten, pending_rename = False, None
                    continue
                raw = fm.group(1)
                wire = (
                    pending_rename
                    if pending_rename
                    else (snake_to_camel(raw) if rename_all == "camelCase" else raw)
                )
                fields.add(wire)
                pending_rename = None
            if fields or has_flatten:
                entry = out.setdefault(name, set())
                entry.update(fields)
                if has_flatten:
                    FLATTEN_TYPES.add(name)
    return out


def self_check(proto: Path) -> list[str]:
    """抽取器自检。

    检查器自己出错的话，结论全不可信——所以先拿几个已知形状的类型断言
    抽取结果，任何一条不符就拒绝继续。
    """
    ts = extract_ts(proto)
    problems = []
    # (类型名, 必须抽到的字段, 必须抽不到的字段)
    # 只选对象类型的联合/交叉成员；纯字符串联合（如 WriteStatus）
    # 在 Rust 侧是 `pub type X = String`，不是 struct，不会参与比对。
    expectations = [
        ("ReasoningEffortOption", {"reasoningEffort", "description"}, {"effort"}),
        ("ResourceContent", {"uri", "text", "blob"}, set()),
        ("FuzzyFileSearchResult", {"match_type", "file_name", "score"}, set()),
        ("McpServerToolCallResponse", {"content", "structuredContent", "isError"}, set()),
        ("ConfigLayerMetadata", {"name", "version"}, set()),
    ]
    for name, required, forbidden in expectations:
        if name not in ts:
            problems.append(f"{name}: 未抽取到该类型")
            continue
        missing = required - ts[name]
        if missing:
            problems.append(f"{name}: 缺字段 {sorted(missing)}（实际 {sorted(ts[name])}）")
        extra = forbidden & ts[name]
        if extra:
            problems.append(f"{name}: 多出字段 {sorted(extra)}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--proto", required=True, help="generate-ts 产物目录")
    ap.add_argument("--src", required=True, help="Rust 源码目录")
    ap.add_argument("--strict", action="store_true", help="缺失字段也视为失败")
    args = ap.parse_args()

    proto = Path(args.proto)
    broken = self_check(proto)
    if broken:
        print("✖ 抽取器自检未通过，拒绝给出结论：")
        for p in broken:
            print(f"    {p}")
        return 2

    ts = extract_ts(proto)
    rust = extract_rust(Path(args.src))

    extra_total = missing_total = 0
    checked = 0

    for name in sorted(rust):
        if name not in ts:
            continue  # 桥接层自定义类型，不来自协议
        if name in LOCAL_TYPES:
            continue  # AIGoat 自有的落盘结构体，只是撞名
        checked += 1
        ts_fields = {f for f in ts[name] if f not in SKIP}
        rust_fields = rust[name]

        extra = sorted(rust_fields - ts_fields)
        missing = sorted(ts_fields - rust_fields)
        if name in FLATTEN_TYPES:
            missing = []  # 兜底容器已覆盖

        if extra or missing:
            rel = f"{name}"
            if extra:
                extra_total += len(extra)
                print(f"[多余] {rel}: {', '.join(extra)}")
            if missing:
                missing_total += len(missing)
                marker = "缺失" if args.strict else "未建模"
                print(f"[{marker}] {rel}: {', '.join(missing)}")

    if checked == 0:
        # 关键：不能把「一个都没核对」印成和真核对过一样的形状。
        # 之前这里无条件输出「核对 0 个协议结构体：多余 0，未建模 0」，
        # verify.ps1 照样打 ✔ —— 读的人只会得出「线格式已核对通过」，
        # 而实际上 Rust 侧应答一律走 serde_json::Value，本关无从核对。
        # 它的职责是**哨兵**（保证下面 4 类本地结构体不误报），覆盖靠第 4 关。
        print(
            "\n⚠ 本关未核对任何结构体：Rust 侧应答走 serde_json::Value 透传，"
            "没有镜像协议的结构体可比。\n"
            "  职责：哨兵——保证 AIGoat 本地同名结构体不误报。\n"
            "  协议漂移的实际覆盖：上一关「协议漂移」（对照 generate-ts 基线清单）。"
        )
        # 3 = 「哨兵无事可做」，与 0（真的核对过且一致）区分开。
        return 3 if not extra_total else 1

    print(
        f"\n核对 {checked} 个协议结构体："
        f"多余字段 {extra_total} 处，未建模字段 {missing_total} 处"
    )
    return 1 if extra_total else 0


if __name__ == "__main__":
    sys.exit(main())