"""核查 bridge 接口的方法是否真有调用点。

背景：这个项目栽过两次同一形状的坑——`turn/steer` 和 `thread/unarchive`
都是「接口声明了、Tauri 命令实现了、store 动作也在，却从没被调用过」。
两次都是界面/行为与真实能力不一致：steer 在界面上是个装饰按钮，
取消归档只改本地列表、下次刷新就弹回去。

编译抓不到这种缺陷（方法存在且类型正确），运行时也只有用户点得到那条
路径才会暴露。所以这里做静态交叉核对：接口里的每个方法，在
`web/src` 里必须能找到至少一个**调用点**。

「调用点」的判定：形如 `.name(` 或 `>name(` 的使用，且所在行不是
接口声明本身、也不是实现体的方法签名。这样实现和声明都不会被误当成
调用点——否则这个检查永远是绿的。

用法：
  python tools/check_bridge_wiring.py
退出码：0 = 全部有调用点（可能有已登记的豁免）；1 = 有未接线的方法。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_SRC = ROOT / "web" / "src"
BRIDGE = WEB_SRC / "bridge"

# 接口/类型声明所在文件：这些文件里的方法名不算调用点。
DECL_FILES = {"client.ts", "api.ts", "contract.ts", "types.ts"}

# 方法声明：`^  name(` 或 `^  async name(`，位于接口或 class 体内。
METHOD = re.compile(r"^\s{2}(?:async\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*\(", re.M)

# 实现体的方法签名（适配器里挂在对象字面量上，缩进不固定）。
IMPL = re.compile(r"^\s*(?:async\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*\(", re.M)

# 调用点：`.name(`、`>name(`（含可选空白），行内不是方法定义本身。
CALL = re.compile(r"(?:\.|>)\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\(")

# 这些方法**没有**调用点，但原因不同，分两类登记。往任何一类里加条目之前
# 先问一句：是不需要，还是忘了接线？后者应该修代码。
#
# 【设计不需要】—— 功能本身不存在，留着是扩展点/遗留
NOT_NEEDED = {
    "attachmentAdd": "附件走 fsRead 直接内联 base64（drafts.ts addPaths）："
                      "截图只有几百 KB，省掉一次上传往返和附件落盘生命周期。"
                      "上传式接口是早期设计的遗留。",
    "attachmentRemove": "同上。",
    "config": "右栏资源面板只有 MCP / 技能 / 钩子三块——resources.ts 的状态"
              "字段与 REFRESH_PLAN 里都没有 config，所以这是扩展点，不是断链。",
    "review": "复核不是用户发起的：codex 侧 strictReviewRequired 映射成 "
              "guardEvent，应用只提交判定（reviewApprove / reviewDeny，都有"
              "调用点）。主动发起复核的入口产品上没做。",
}

# 【已知缺口】—— 功能本该有，只是没接完。列在这里是为了让它每次跑都可见，
# 而不是烂在代码里等人发现。接完一条就从这里删掉。
KNOWN_GAP = {
    "threadTurns": "回合块目前从 ledger 的 LedgerRow 分组得出（"
                   "TrajectoryTimeline 的 groupByTurn）。ledger 是 ring buffer，"
                   "旧的回合被挤掉后回合块就跟着消失；threadItems 有服务端回补"
                   "路径，threadTurns 没有。06 号板块的回合块回补未做。",
}


def declared_methods() -> dict[str, int]:
    """接口里的方法名 -> 形参个数。"""
    out: dict[str, int] = {}
    for name in ("client.ts", "api.ts"):
        path = BRIDGE / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in METHOD.finditer(text):
            out.setdefault(m.group(1), count_params(text, m.end() - 1))
    return out


def count_params(text: str, open_paren: int) -> int:
    """数顶层形参个数。

    注意尾逗号：多行签名习惯写成
        foo(
          a: string,
          b?: Opt,
        ): void
    最后一个逗号后面什么都没有，**不算**一个形参。第一版没处理这个，于是
    attachmentList / hooks / threadItems 这些多行签名全被误报成"实现丢了形参"
    ——门禁自己出了假警报，那比没有门禁更糟。
    """
    depth = 0
    count = 0
    pending = False  # 上一个顶层逗号之后是否还有实际内容
    for ch in text[open_paren:]:
        if ch in "([{<":
            depth += 1
        elif ch in ")]}>":
            depth -= 1
            if depth == 0:
                if pending:
                    count += 1
                return count
        elif ch == "," and depth == 1:
            if pending:
                count += 1
            pending = False
        elif not ch.isspace():
            pending = True
    return count


def impl_param_counts() -> dict[str, int]:
    """各适配器里方法实现 -> 形参个数。"""
    out: dict[str, int] = {}
    for path in sorted(BRIDGE.glob("tauri*.ts")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in IMPL.finditer(text):
            out.setdefault(m.group(1), count_params(text, m.end() - 1))
    return out


def called_methods() -> set[str]:
    """扫出所有「真的被调用」的方法名。

    只认 `CALL` 就够了，不需要再按行排除方法定义：接口声明
    (`name(x): T`) 和实现签名 (`async name(x) {`) 前面都**没有点号**，
    `CALL` 天然不匹配。而 `getClient().foo(...)` 有点号，是货真价实的调用。

    （曾经在这里加过「行首像方法定义就跳过」的排除规则，结果
    `getClient().listThreads(filter)` 因为行首是 `getClient(` 而被整行
    跳过，把在用的方法误报成未接线。教训：少写规则，别写需要额外排除的规则。）
    """
    out: set[str] = set()
    for path in WEB_SRC.rglob("*"):
        if path.suffix not in (".ts", ".tsx") or path.name in DECL_FILES:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        out |= set(CALL.findall(text))
    return out


def main() -> int:
    declared = declared_methods()
    if not declared:
        print("✖ 没读到任何接口方法——路径不对或接口已重构，拒绝给出结论。")
        return 2

    called = called_methods()
    dead = sorted(set(declared) - called)
    unknown = [m for m in dead if m not in NOT_NEEDED and m not in KNOWN_GAP]

    for m in unknown:
        print(f"[未接线] {m}: 接口声明了、Tauri 也实现了，但 web/src 里没有调用点")
        print(f"          → 功能其实不存在。像 steer 和 thread/unarchive 那样，")
        print(f"            编译期完全看不出来，只有用户点到那条路才会发现。")
    for m, why in KNOWN_GAP.items():
        if m in dead:
            print(f"[已知缺口] {m}: {why}")
    for m, why in NOT_NEEDED.items():
        if m in dead:
            print(f"[设计不需要] {m}: {why}")

    gaps = [m for m in dead if m in KNOWN_GAP]
    print(
        f"\n接口方法 {len(declared)} 个：未接线 {len(unknown)} 个，"
        f"已知缺口 {len(gaps)} 个，设计不需要 {len(dead) - len(unknown) - len(gaps)} 个"
    )

    # 第二类检查：实现比接口少的形参。
    #
    # TypeScript **允许**实现方法比接口少形参，所以这一类漏检不会报任何错。
    # 而少掉的形参不是"可有可无"——那正是接口声明它需要的东西：曾经
    # `interrupt(threadId, turnId)` 被实现成 `async interrupt()`，两个参数被
    # 静默丢弃，壳侧只好去打断"当前那个"回合；子代理在跑的时候，用户在主会话
    # 上点停止会打断子代理。编译期完全看不出来。
    impls = impl_param_counts()
    dropped = [
        (name, n, impls[name])
        for name, n in sorted(declared.items())
        if name in impls and impls[name] < n
    ]
    for name, want, got in dropped:
        print(
            f"[丢了形参] {name}: 接口声明 {want} 个，实现只接 {got} 个 —— "
            f"调用方传的东西被静默丢弃"
        )
    if dropped:
        print("  实现必须接住接口声明的全部形参；不用就写出来并标 `_`，别省略。")
    return 1 if (unknown or dropped) else 0


if __name__ == "__main__":
    sys.exit(main())