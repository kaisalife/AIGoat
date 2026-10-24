"""按已定取舍重算协议面分母，得出真实覆盖率目标。

取舍（用户 2026-10-01 拍板，14:32 追加「账号也不需要」）：
  1. ChatGPT 订阅体系不对接
  2. 账号体系整体不对接（含 account/read）
  3. 实时语音不需要
  4. 应用市场不需要
"""

import json
from pathlib import Path

# 以脚本所在目录为 repo 根目录，避免硬编码绝对路径。
REPO = Path(__file__).resolve().parent.parent
M = json.loads((REPO / "proto" / "manifest.json").read_text(encoding="utf-8"))

# ---- 排除规则（显式列举，便于 review；不靠模糊前缀猜测）------------------
DROP_CLIENT = {
    # 账号体系整体不对接（含 account/read —— 免登录自检也一并出范围）
    "account/read",
    "account/login/start", "account/login/cancel", "account/logout",
    "account/rateLimits/read", "account/rateLimitResetCredit/consume",
    "account/sendAddCreditsNudgeEmail", "account/usage/read",
    "account/workspaceMessages/read",
    # 实时语音
    # （client 侧本来就没有 realtime 方法）
    # 应用市场 / 插件生态
    "app/installed", "app/list", "app/read",
    "marketplace/add", "marketplace/remove", "marketplace/upgrade",
    "plugin/install", "plugin/installed", "plugin/list", "plugin/read",
    "plugin/reconcile", "plugin/uninstall",
    "plugin/share/checkout", "plugin/share/delete", "plugin/share/list",
    "plugin/share/save", "plugin/share/updateTargets",
    # 远程控制（连厂商云，非 agent 能力）—— 与实时语音/应用市场同类取舍
    "remoteControl/status/changed",
    # 外部 agent 配置迁移（把 Claude/Cursor 等的配置搬过来）—— 与本项目无关
    "externalAgentConfig/detect", "externalAgentConfig/import",
    "externalAgentConfig/import/readHistories", "externalAgentConfig/import/recordHistory",
    "externalAgentConfig/import/progress", "externalAgentConfig/import/completed",
    # 反馈上报：往厂商云上传数据，既非 agent 能力也不本地
    "feedback/upload",
}

DROP_SERVER_REQ = {
    # 账号体系
    "account/chatgptAuthTokens/refresh",
    # 实时语音无 server->client 请求
    # 应用市场无 server->client 请求
}

DROP_NOTIF = {
    # 账号体系
    "account/login/completed", "account/updated", "account/rateLimits/updated",
    # 远程控制（连厂商云）
    "remoteControl/status/changed",
    # 外部 agent 配置迁移
    "externalAgentConfig/import/progress", "externalAgentConfig/import/completed",    # 实时语音
    "thread/realtime/started", "thread/realtime/closed", "thread/realtime/error",
    "thread/realtime/sdp", "thread/realtime/itemAdded",
    "thread/realtime/item/started", "thread/realtime/item/completed",
    "thread/realtime/item/transcript/delta", "thread/realtime/transcript/delta",
    "thread/realtime/transcript/done", "thread/realtime/outputAudio/delta",
    # 应用市场
    "app/list/updated",
}

# ---- 桥接层当前已建模（沿用已核实的比对结果）----------------------------
# ---- 桥接层当前已建模（沿用已核实的比对结果）----------------------------
# 注意：account/read 虽在桥接层里存在，但已按取舍出范围，不计入覆盖。
MODELED_CLIENT = {
    "initialize", "thread/start", "thread/resume", "thread/fork",
    "thread/list", "thread/archive", "turn/start", "turn/interrupt", "turn/steer",
    # P1 已建模
    "thread/read", "thread/delete", "thread/unarchive", "thread/loaded/list",
    "thread/items/list", "thread/turns/list", "thread/unsubscribe",
    "thread/name/set", "thread/metadata/update", "thread/compact/start",
    "thread/revert", "thread/inject_items", "thread/shellCommand",
    "thread/attachment/add", "thread/attachment/list", "thread/attachment/remove",
    "thread/goal/get", "thread/goal/set", "thread/goal/clear",
    "thread/approveGuardianDeniedAction",
    "threadSection/create", "threadSection/delete", "threadSection/list",
    "threadSection/update", "thread/section/move",
    # P2 已建模
    "fs/readFile", "fs/writeFile", "fs/readDirectory", "fs/createDirectory",
    "fs/remove", "fs/copy", "fs/getMetadata", "fs/watch", "fs/unwatch",
    "command/exec", "command/exec/write", "command/exec/resize", "command/exec/terminate",
    "skills/list", "skills/config/write", "skills/extraRoots/set", "plugin/skill/read",
    # P3 已建模
    "review/start", "permissionProfile/list",
    "windowsSandbox/readiness", "windowsSandbox/setupStart",
    # P4 已建模
    "config/read", "config/value/write", "config/batchWrite", "configRequirements/read",
    "config/mcpServer/reload",
    "experimentalFeature/list", "experimentalFeature/enablement/set",
    "model/list", "modelProvider/capabilities/read",
    "mcpServerStatus/list", "mcpServer/tool/call", "mcpServer/resource/read",
    "mcpServer/oauth/login", "hooks/list",
}
MODELED_SERVER_REQ = {
    "item/commandExecution/requestApproval", "item/fileChange/requestApproval",
    "item/permissions/requestApproval", "item/tool/requestUserInput",
    "mcpServer/elicitation/request",
    # M1：已按语义分流（工具执行 / 宿主能力），不再误答为审批
    "item/tool/call", "attestation/generate",
}
MODELED_NOTIF = {
    "item/started", "item/completed", "item/agentMessage/delta",
    "item/reasoning/summaryTextDelta", "item/reasoning/textDelta",
    "item/commandExecution/outputDelta", "item/fileChange/patchUpdated",
    "turn/started", "turn/completed", "error", "warning",
    "thread/tokenUsage/updated",
    # P1 已建模
    "turn/plan/updated", "item/plan/delta", "turn/diff/updated",
    "serverRequest/resolved", "item/reasoning/summaryPartAdded",
    "thread/started", "thread/closed", "thread/deleted", "thread/archived",
    "thread/unarchived", "thread/reverted", "thread/name/updated",
    "thread/status/changed", "thread/queue/changed", "thread/settings/updated",
    "thread/compacted", "thread/project/updated", "thread/attachment/updated",
    "thread/environment/connected", "thread/environment/disconnected",
    "thread/goal/updated", "thread/goal/cleared",
    # P2 已建模
    "fs/changed", "project/changed", "skills/changed",
    "command/exec/outputDelta", "process/outputDelta", "process/exited",
    "item/commandExecution/terminalInteraction", "item/fileChange/outputDelta",
    "item/mcpToolCall/progress",
    # P3 已建模
    "autoApprovalReview/strictReviewRequired",
    "item/autoApprovalReview/started", "item/autoApprovalReview/completed",
    "windowsSandbox/setupCompleted", "windows/worldWritableWarning",
    "model/rerouted", "model/verification", "model/safetyBuffering/updated",
    "modelProvider/authRecoveryStarted", "modelProvider/authRecoveryCompleted",
    # P4 已建模
    "mcpServer/startupStatus/updated", "mcpServer/oauthLogin/completed",
    "mcpServer/event/stream/notification",
    "hook/started", "hook/completed",
    "rawResponse/completed", "rawResponseItem/completed",
    "turn/moderationMetadata",
    "fuzzyFileSearch/sessionUpdated", "fuzzyFileSearch/sessionCompleted",
}
MODELED_ITEMS = {
    "agentMessage", "reasoning", "commandExecution", "fileChange", "mcpToolCall",
    "webSearch", "userMessage", "dynamicToolCall", "collabAgentToolCall",
    # P1 已建模
    "plan", "contextCompaction", "enteredReviewMode", "exitedReviewMode",
    # P2 已建模
    "hookPrompt", "sleep", "functionCallOutput",
    # P3 已建模
    "subAgentActivity", "imageGeneration", "imageView",
}


def report(label, total_all, drop, modeled):
    total = sorted(set(total_all) - drop)
    done = sorted(set(total) & modeled)
    missing = sorted(set(total) - modeled)
    pct = 100 * len(done) // len(total) if total else 0
    print(f"\n### {label}")
    print(f"  权威总数      : {len(total_all)}")
    print(f"  按取舍排除    : {len(set(total_all) & drop)}")
    print(f"  纳入范围      : {len(total)}")
    print(f"  当前已建模    : {len(done)}  ({pct}%)")
    print(f"  仍缺          : {len(missing)}")
    return missing


mc = report("client → server 方法", M["clientRequests"], DROP_CLIENT, MODELED_CLIENT)
ms = report("server → client 请求", M["serverRequests"], DROP_SERVER_REQ, MODELED_SERVER_REQ)
mn = report("通知", M["notifications"], DROP_NOTIF, MODELED_NOTIF)
mi = report("ThreadItem 类型", M["threadItemTypes"], set(), MODELED_ITEMS)

print("\n" + "=" * 60)
print("纳入范围后的总计")
print(f"  client 方法   : {len(M['clientRequests']) - len(DROP_CLIENT & set(M['clientRequests']))}")
print(f"  server 请求   : {len(M['serverRequests']) - len(DROP_SERVER_REQ & set(M['serverRequests']))}")
print(f"  通知          : {len(M['notifications']) - len(DROP_NOTIF & set(M['notifications']))}")
print(f"  Item 类型     : {len(M['threadItemTypes'])}")
tot = (len(M["clientRequests"]) - len(DROP_CLIENT & set(M["clientRequests"]))) + \
      (len(M["serverRequests"]) - len(DROP_SERVER_REQ & set(M["serverRequests"]))) + \
      (len(M["notifications"]) - len(DROP_NOTIF & set(M["notifications"]))) + \
      len(M["threadItemTypes"])
done = len(set(M["clientRequests"]) & MODELED_CLIENT) + len(set(M["serverRequests"]) & MODELED_SERVER_REQ) + \
       len(set(M["notifications"]) & MODELED_NOTIF) + len(set(M["threadItemTypes"]) & MODELED_ITEMS)
print(f"  合计          : {tot}项，当前覆盖 {done} 项 ({100 * done // tot}%)")

out = REPO / "proto" / "scope.json"
out.write_text(json.dumps({
    "_comment": "按用户拍板的取舍（不对接 ChatGPT 订阅 / 不要实时语音 / 不要应用市场）"
                "重算后的纳入范围。由 tools/scope_report.py 生成，勿手改。",
    "excluded": {
        "clientRequests": sorted(DROP_CLIENT & set(M["clientRequests"])),
        "serverRequests": sorted(DROP_SERVER_REQ & set(M["serverRequests"])),
        "notifications": sorted(DROP_NOTIF & set(M["notifications"])),
    },
    "inScope": {
        "clientRequests": sorted(set(M["clientRequests"]) - DROP_CLIENT),
        "serverRequests": sorted(set(M["serverRequests"]) - DROP_SERVER_REQ),
        "notifications": sorted(set(M["notifications"]) - DROP_NOTIF),
        "threadItemTypes": sorted(M["threadItemTypes"]),
    },
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"\n纳入范围已写入 {out}")

print("\n### 纳入范围内仍缺 client 方法")
for x in mc:
    print(f"  {x}")
print("\n### 纳入范围内仍缺 通知")
for x in mn:
    print(f"  {x}")
print("\n### 纳入范围内仍缺 server→client 请求")
for x in ms:
    print(f"  {x}")
print("\n### 仍缺 Item 类型")
for x in mi:
    print(f"  {x}")