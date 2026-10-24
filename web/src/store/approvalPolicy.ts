/**
 * 权限档位 → `turn/start.approvalPolicy` 的映射（17 号文件 §5.5）。
 *
 * # 为什么需要这张表
 *
 * 协议里这两套词汇**不是一回事**：
 *
 * | 来源 | 词汇 |
 * |---|---|
 * | `permissionProfile/list`（我们查得到的） | `read-only` / `workspace-write` / `danger-full-access` … |
 * | `turn/start.approvalPolicy`（要发给它的） | `untrusted` / `on-request` / `never` / granular 对象 |
 *
 * 直接把 id 塞进 `approvalPolicy` 的表现是"设了但没用"——比不设更难
 * 排查。所以必须有一张显式的表。
 *
 * # 表从哪来
 *
 * 按**语义**对齐，不按名字对齐：档位回答"这个档位允许什么操作"，
 * policy 回答"什么时候要问人"。所以映射依据是「这个档位下，未知命令要不要
 * 问」，而不是「名字像不像」。
 *
 * - 未知命令一律要问 → `untrusted`
 * - 沙箱内的命令不问，越权的才问 → `on-request`（默认，最常用）
 * - 什么都不问 → `never`（等价于全部批准，**危险**）
 *
 * 落在表外的档位**不发** `approvalPolicy`：宁可让协议用它自己的默认
 * （`on-request`），也不要猜错成 `never`。
 */

/** 协议侧的 `AskForApproval`。 */
export type AskForApproval = 'untrusted' | 'on-request' | 'never' | { granular: unknown }

/**
 * 协议侧的 `SandboxPolicy`（app-server v2 的形状）。
 *
 * **注意变体名是 camelCase**（`dangerFullAccess` / `readOnly` / `workspaceWrite`）：
 * app-server 自己的 `SandboxPolicy`（`protocol/v2/permissions.rs`）用
 * `rename_all = "camelCase"`，而 codex **核心**同名的枚举是 kebab-case——
 * 发错命名会把整个 `turn/start` 拒掉（表现为"发送后没反应"）。
 *
 * **档位必须同时决定这两样**：`approvalPolicy` 只回答"什么时候问人"，
 * `sandboxPolicy` 才回答"命令在什么约束下跑"。只发前者、不发后者时，
 * 沙箱落在 codex 的配置默认上（通常是 read-only）——于是「沙箱内自动跑」
 * 的档位实际上每条命令都要审批。
 */
export type SandboxPolicyValue =
  | { type: 'dangerFullAccess' }
  | { type: 'readOnly'; networkAccess?: boolean }
  | { type: 'workspaceWrite'; writableRoots?: string[]; networkAccess?: boolean }

/**
 * 档位 id → 沙箱策略。key 与 {@link PROFILE_TO_POLICY} 一一对应，
 * 两张表必须同进同出（档位决定了审批与沙箱的配对语义）。
 */
const PROFILE_TO_SANDBOX: Record<string, SandboxPolicyValue> = {
  'read-only': { type: 'readOnly' },
  'read-only-with-network': { type: 'readOnly', networkAccess: true },
  'workspace-write': { type: 'workspaceWrite' },
  'danger-full-access': { type: 'dangerFullAccess' },
}

/**
 * 档位 id → 沙箱策略。表外返回 null（调用方**不要**填这个字段，
 * 让协议用自己的默认）。
 */
export function sandboxPolicyFor(profileId: string | null | undefined): SandboxPolicyValue | null {
  if (!profileId) return null
  if (profileId.startsWith('granular')) return null
  return PROFILE_TO_SANDBOX[profileId] ?? null
}

/**
 * 档位 id → AskForApproval。
 *
 * key 用协议的真实档位 id（`permissionProfile/list` 的返回），值是语义判定。
 */
const PROFILE_TO_POLICY: Record<string, AskForApproval> = {
  // 只读档位：几乎不会改文件，未知命令直接问是最稳的
  'read-only': 'on-request',
  // 沙箱内可写：沙箱里的不问，越界的才问 —— 这是绝大多数工作区该用的
  'workspace-write': 'on-request',
  // 完全访问（用户显式选的）：不再逐个问
  'danger-full-access': 'never',
  // 只读 + 允许网络：问的门槛没变
  'read-only-with-network': 'untrusted',
}

/**
 * 档位 id → policy。表外返回 null（调用方**不要**填这个字段）。
 *
 * `granular` 那档要特别注意：它带细分规则，不能压成一个字符串——
 * 压了等于把用户配的粒度丢掉，那比不配更危险。
 */
export function approvalPolicyFor(profileId: string | null | undefined): AskForApproval | null {
  if (!profileId) return null
  if (profileId.startsWith('granular')) {
    // granular 档位：原样透传由调用方给的对象，这里只声明"别压成字符串"
    return null
  }
  return PROFILE_TO_POLICY[profileId] ?? null
}

/** 已知档位 id 列表（设置中心的参考表与文档核对用）。 */
export function knownProfileIds(): string[] {
  return Object.keys(PROFILE_TO_POLICY)
}

/**
 * 档位的一句话说明，设置中心与档位选择器共用。
 *
 * 尤其要写明 `danger-full-access` 等价于 `never`（不再逐个审批）——
 * 用户选它的时候必须知道自己在关掉什么。
 */
export function profileHint(profileId: string): string {
  switch (profileId) {
    case 'never':
    case 'danger-full-access':
      return '不逐个审批：命令直接执行'
    case 'untrusted':
    case 'read-only-with-network':
      return '每个未知命令都先问你'
    case 'on-request':
      return '沙箱内不问，越权的才问'
    default:
      return `granular：按细分规则决定（协议侧传对象，不压成字符串）`
  }
}