//! 子 Agent 注册表的**存储层**（AF 规范）。
//!
//! 规范要点（`AF规范/子Agent规范.md` + `主Agent接入指南.md`）：
//! - 子 agent 是无头一次性进程：`<exe> --agent <task.json> --out <report.json>`，
//!   退出码 0 成功 / 1 失败；报告回传 `data` 里的稳定 id 与产物路径
//! - 地址只登记在注册表数据库里（`~/.agent-registry/registry.json`），
//!   教学材料写占位符、由注入器替换——**任何宿主都不硬编码地址**
//! - 主 agent 侧只需三样：看得见（能力清单）、写得对（协议+参数）、跑得动（shell）
//!
//! 本模块是那个"注入器"的后半段：读注册表 → `rows.rs` 探测本机状态 →
//! `instructions.rs` 生成薄薄一节派单说明 → 随 `thread/start` 的
//! `developerInstructions` 注入会话。子 agent 本体原地不动。

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const DB_VERSION: u32 = 3;

/// `previous_paths` 最多留几条：只用于排查「昨天还能用」，无限追加只会让
/// 注册表文件随反复重登记一直变大。
const MAX_PREVIOUS_PATHS: usize = 8;

/// 成员接入方式。
///
/// - `External`：AF 规范的外部无头进程，任务单协议派活。
/// - `Codex`：codex **原生子代理**——由 codex 的多代理协作（`spawn_agent`）
///   在 codex 进程内拉起，与主 agent 共享运行时（沙箱/审批/MCP/技能）。
///   它没有 exe；能力面（model/skills/mcp_servers/prompt）经 `-c
///   agents.<name>.*` 启动覆盖写进 codex 配置（见 `launch_overrides`）。
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum AgentKind {
    #[serde(rename = "external")]
    #[default]
    External,
    #[serde(rename = "codex")]
    Codex,
}

impl AgentKind {
    pub fn parse(value: &str) -> Self {
        match value.trim() {
            "codex" => Self::Codex,
            _ => Self::External,
        }
    }
}

/// 登记/更新时提交的成员规格。校验在 `upsert`。
#[derive(Default, Clone)]
pub struct AgentSpec {
    pub path: String,
    pub desc: String,
    pub kind: AgentKind,
    pub team: Option<String>,
    pub model: Option<String>,
    pub skills: Vec<String>,
    pub mcp_servers: Vec<String>,
    pub prompt: Option<String>,
    /// 副本来源的原始成员名。只有 `team::materialize` 会写；普通登记传
    /// `None`（= 该条目就是原初成员，或用户手动接管了副本）。
    pub derived_from: Option<String>,
}

/// 团队级元数据。团队**不是成员**，而是成员之上的编组：成员用 `team` 字段
/// 归队，这里存团队自己的一段说明（工作流 / SOP）。
///
/// 参考 MetaGPT / GameGPT 的做法：把"团队怎么协作"写成 SOP 随会话注入，
/// 主 agent 才会按流水线调度，而不是拿到一张成员清单自己猜分工。
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct TeamMeta {
    /// 团队工作流 / SOP（自由文本，建议写成有序的阶段与交接物）。
    #[serde(default)]
    pub workflow: String,
    /// 团队规范：全体成员共同遵守的硬约束（命名、风格、交付口径）。
    ///
    /// 与 `workflow` 分开：流程讲"先做什么后做什么"，规范讲"所有人都必须
    /// 怎样"。特化副本会把这段并进角色提示词。
    #[serde(default)]
    pub spec: String,
    /// 团队花名册：从人才池里**挑选**的原初成员名。
    ///
    /// 挑人只生成副本（`团队/成员`），原初成员不受影响、可被多个团队同时
    /// 选中。花名册为空时退化为"已在该团队里的原初成员"（旧用法）。
    #[serde(default)]
    pub roster: Vec<String>,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Registry {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub agents: BTreeMap<String, AgentEntry>,
    /// team 名 → 团队元数据（与成员上的 `team` 字段对应）。
    #[serde(default)]
    pub teams: BTreeMap<String, TeamMeta>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AgentEntry {
    pub path: String,
    #[serde(default)]
    pub desc: String,
    #[serde(default)]
    pub registered_at: u64,
    #[serde(default)]
    pub previous_paths: Vec<String>,
    #[serde(default)]
    pub kind: AgentKind,
    /// 编队：同队成员在派单说明里编入同一组（跨协议混编）。
    #[serde(default)]
    pub team: Option<String>,
    /// Codex 专用：子代理模型；None = 跟随主会话。
    #[serde(default)]
    pub model: Option<String>,
    /// Codex 专用：启用的技能名单（skill 名，见 codex `skills/list`）。
    #[serde(default)]
    pub skills: Vec<String>,
    /// Codex 专用：启用的 MCP server id 名单（须已存在于 codex 配置）。
    #[serde(default)]
    pub mcp_servers: Vec<String>,
    /// Codex 专用：角色提示词。
    #[serde(default)]
    pub prompt: Option<String>,
    /// 副本来源的原始成员名；None = 原初成员。
    #[serde(default)]
    pub derived_from: Option<String>,
}

/// 界面上用的行数据：注册表条目 + 本机实际状态。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentRow {
    pub name: String,
    pub path: String,
    pub desc: String,
    pub registered_at: u64,
    pub kind: AgentKind,
    pub team: Option<String>,
    pub model: Option<String>,
    pub skills: Vec<String>,
    pub mcp_servers: Vec<String>,
    pub prompt: Option<String>,
    /// exe 是否真实存在——登记过但没构建是最常见的坑，界面上直接标出来。
    /// codex 原生成员没有 exe，恒为 true。
    pub exe_exists: bool,
    /// 推导出的工程根（src-tauri/target/release/x.exe → 工程根）。
    pub project_root: Option<String>,
    /// 能力清单（agent-card.json）是否存在。
    pub capability_manifest: Option<String>,
    /// 派单细则 SKILL.md 是否存在。
    pub skill_doc: Option<String>,
    /// 副本来源的原始成员名；None = 原初成员。
    pub derived_from: Option<String>,
    /// 原初成员在副本生成之后被改过——副本可能已过期，建议重跑特化。
    pub derived_stale: bool,
}

/// 界面 / 注入用的团队行：团队名 + 工作流 + 成员名清单。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeamRow {
    pub name: String,
    /// 团队工作流 / SOP。
    pub workflow: String,
    /// 团队规范：全体成员共同遵守的硬约束。
    pub spec: String,
    /// 团队花名册：挑选进来的原初成员名（副本随特化生成）。
    pub roster: Vec<String>,
    pub members: Vec<String>,
}

pub fn db_path() -> PathBuf {
    // 注册表归拢到安装目录 cache\agent-registry\（见 cache.rs）；
    // 旧 ~/.agent-registry/registry.json 由 cache::init() 一次性拷贝迁入。
    crate::cache::registry_path()
}

pub fn load() -> Registry {
    let default = Registry {
        version: DB_VERSION,
        agents: BTreeMap::new(),
        teams: BTreeMap::new(),
    };
    let path = db_path();
    match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<Registry>(&text) {
            Ok(registry) => registry,
            Err(err) => {
                // 解析失败先备份：否则下一次 register/remove 的 save 会把损坏
                // 但可能还有救的文件覆盖掉，已登记的子 agent 全部消失。
                let _ = std::fs::write(path.with_extension("json.bad"), &text);
                eprintln!("[registry] 注册表解析失败，已备份为 .json.bad：{err}");
                default
            }
        },
        Err(_) => default,
    }
}

pub fn save(registry: &Registry) -> Result<(), String> {
    // 原子写 + 自动建目录（与 settings/workspaces 共用）。
    crate::settings::config::write_json(&db_path(), registry)
        .map_err(|e| format!("无法写入注册表：{e}"))
}

/// 绝对路径，去掉 Windows 的 `\\?\` 前缀。
fn abs_path(p: &Path) -> Result<String, String> {
    let canonical = p.canonicalize().map_err(|e| format!("路径无效：{e}"))?;
    let text = canonical.to_string_lossy().to_string();
    Ok(text.strip_prefix(r"\\?\").unwrap_or(&text).to_string())
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 成员名校验。
///
/// 允许 `团队/成员` 形式（团队特化副本），因此放开了 `/` 与非 ASCII 字母。
/// 仍然拒绝：空白、Windows 文件名非法字符、`/` 在首尾、`//`、`..`——
/// 名字会落成 `<CODEX_HOME>/agents/<slug>.toml`，这些都会破坏路径。
pub fn check_name(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("子 agent 名称不能为空".into());
    }
    if name.starts_with('/') || name.ends_with('/') || name.contains("//") || name.contains("..") {
        return Err("名称不能以 / 开头或结尾，也不能含 // 或 ..".into());
    }
    if name
        .chars()
        .any(|c| c.is_whitespace() || r#"\:*?"<>|"#.contains(c))
    {
        return Err("名称不能含空白或 : * ? \" < > | \\".into());
    }
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '/')
    {
        return Err("名称只能包含字母、数字、-、_ 和 /（团队/成员）".into());
    }
    Ok(())
}

/// 落盘用的安全名。
///
/// 注册表主键允许 `团队/成员`，但 `/` 在 Windows 文件名里非法——codex 角色
/// 文件名与角色 TOML 的 `name` 字段一律把 `/` 换成 `__`。
pub fn slug(name: &str) -> String {
    name.replace('/', "__")
}

/// 登记或更新一个子 agent。external 成员 exe 必须真实存在（登记不存在的
/// 东西等于埋雷）；codex 原生成员没有 exe，跳过这项校验。
pub fn upsert(name: &str, spec: &AgentSpec) -> Result<Registry, String> {
    let name = name.trim();
    check_name(name)?;

    let kind = spec.kind;
    let path = if kind == AgentKind::External {
        let path = abs_path(Path::new(spec.path.trim()))?;
        if !Path::new(&path).is_file() {
            return Err(format!("找不到可执行文件：{path}"));
        }
        path
    } else {
        spec.path.trim().to_string()
    };

    let mut registry = load();
    if registry.version == 0 {
        registry.version = DB_VERSION;
    }
    let entry = AgentEntry {
        path,
        desc: spec.desc.trim().to_string(),
        registered_at: now_secs(),
        previous_paths: Vec::new(),
        kind,
        team: norm_optional(&spec.team),
        model: norm_optional(&spec.model),
        skills: norm_list(&spec.skills),
        mcp_servers: norm_list(&spec.mcp_servers),
        prompt: norm_optional(&spec.prompt),
        derived_from: norm_optional(&spec.derived_from),
    };
    // 重新登记时保留旧地址，方便排查"昨天还能用今天找不到 exe"。
    if let Some(old) = registry.agents.get(name) {
        let mut previous = old.previous_paths.clone();
        if old.path != entry.path && kind == AgentKind::External {
            previous.push(old.path.clone());
        }
        previous.truncate(MAX_PREVIOUS_PATHS);
        registry.agents.insert(
            name.to_string(),
            AgentEntry {
                previous_paths: previous,
                ..entry
            },
        );
    } else {
        registry.agents.insert(name.to_string(), entry);
    }
    save(&registry)?;
    // 成员从 codex 原生改成外部进程时，旧角色文件一并清掉。
    if kind != AgentKind::Codex {
        let role_path = codex_agents_dir()?.join(format!("{}.toml", slug(name)));
        if std::fs::read_to_string(&role_path)
            .map(|text| text.contains(GENERATED_MARKER))
            .unwrap_or(false)
        {
            let _ = std::fs::remove_file(&role_path);
        }
    }
    Ok(registry)
}

/// 更新已登记子 agent。name 是注册表主键，不可改。
pub fn update(name: &str, spec: &AgentSpec) -> Result<Registry, String> {
    let mut registry = load();
    if registry.agents.get_mut(name.trim()).is_none() {
        return Err(format!("未登记的子 agent：{}", name.trim()));
    }
    upsert(name, spec)
}

/// 清理可选字符串：trim 后空串归 None。
fn norm_optional(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// 清理名单：trim、去空、去重（保序）。
fn norm_list(values: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for value in values {
        let v = value.trim();
        if !v.is_empty() && !out.iter().any(|e| e == v) {
            out.push(v.to_string());
        }
    }
    out
}

pub fn remove(name: &str) -> Result<Registry, String> {
    let mut registry = load();
    if registry.agents.remove(name.trim()).is_none() {
        return Err(format!("未登记的子 agent：{}", name.trim()));
    }
    save(&registry)?;
    // codex 原生成员注销后，它生成的角色文件一并清掉（只认 AIGoat 标记，
    // 用户手写的角色文件不动）。
    let role_path = codex_agents_dir()?.join(format!("{}.toml", slug(name.trim())));
    if std::fs::read_to_string(&role_path)
        .map(|text| text.contains(GENERATED_MARKER))
        .unwrap_or(false)
    {
        let _ = std::fs::remove_file(&role_path);
    }
    Ok(registry)
}

/// 列出所有团队：团队集合 = 「有 workflow 的」∪「有成员的」。
///
/// 成员名从 `rows()` 归并（按 `team` 字段）；工作流从注册表的 `teams` 取。
/// 只登记了 workflow、还没成员的团队也列出来——用户常常先写流程再加人。
pub fn teams() -> Vec<TeamRow> {
    let registry = load();
    let mut members: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for row in rows() {
        if let Some(team) = row.team.as_deref().filter(|t| !t.trim().is_empty()) {
            members.entry(team.to_string()).or_default().push(row.name);
        }
    }
    let mut names: BTreeSet<String> = registry.teams.keys().cloned().collect();
    names.extend(members.keys().cloned());
    names
        .into_iter()
        .map(|name| TeamRow {
            workflow: registry
                .teams
                .get(&name)
                .map(|t| t.workflow.clone())
                .unwrap_or_default(),
            spec: registry
                .teams
                .get(&name)
                .map(|t| t.spec.clone())
                .unwrap_or_default(),
            roster: registry
                .teams
                .get(&name)
                .map(|t| t.roster.clone())
                .unwrap_or_default(),
            members: members.get(&name).cloned().unwrap_or_default(),
            name,
        })
        .collect()
}

/// 设置某团队的工作流 / SOP。空串 = 清除；三项（流程/规范/成员）全空时整条丢弃。
pub fn set_team_workflow(team: &str, workflow: &str) -> Result<Registry, String> {
    set_team_text(team, |meta| meta.workflow = workflow.trim().to_string())
}

/// 设置某团队的规范（全体成员共同遵守的硬约束）。空串 = 清除。
pub fn set_team_spec(team: &str, spec: &str) -> Result<Registry, String> {
    set_team_text(team, |meta| meta.spec = spec.trim().to_string())
}

/// 团队元数据的统一写入口。
fn set_team_text(team: &str, update: impl FnOnce(&mut TeamMeta)) -> Result<Registry, String> {
    let team = team.trim();
    if team.is_empty() {
        return Err("团队名不能为空".into());
    }
    let mut registry = load();
    if registry.version == 0 {
        registry.version = DB_VERSION;
    }
    let has_members = rows().iter().any(|r| r.team.as_deref() == Some(team));
    let mut meta = registry.teams.remove(team).unwrap_or_default();
    update(&mut meta);
    // 只写了规范、只写了流程、或只挑了人，团队都要留着——都是有效内容。
    if !(meta.workflow.is_empty() && meta.spec.is_empty() && meta.roster.is_empty() && !has_members)
    {
        registry.teams.insert(team.to_string(), meta);
    }
    save(&registry)?;
    Ok(registry)
}

/// codex 原生团队成员 → **角色文件**（`<CODEX_HOME>/agents/<名>.toml`）。
///
/// codex-rs 的原生子代理由多代理协作工具拉起，成员定义不走 `[agents]`
/// 内联配置：`AgentRoleToml` 只有 `description/config_file/nickname_candidates`，
/// 真正的能力面在**角色配置文件**里——它 flatten 了整份 ConfigToml，所以
/// `model`、`[skills]`、`developer_instructions`（必填）都可按角色覆写；
/// `agents/` 目录下的 `.toml` 会被 codex 启动时自动发现。
///
/// 返回需要追加的 `-c` 覆盖项：存在 codex 原生成员时打开
/// `features.multi_agent_v2`（该特性 Stable 但默认关，团队协作的
/// spawn/wait 工具在 v2 上）。
pub fn launch_overrides() -> Result<Vec<String>, String> {
    let has_native = rows().iter().any(|row| row.kind == AgentKind::Codex);
    sync_role_files()?;
    if !has_native {
        return Ok(Vec::new());
    }
    Ok(vec!["-c".into(), "features.multi_agent_v2=true".into()])
}

/// 把 codex 原生成员落成角色文件；非 codex 成员对应的旧角色文件删除。
fn sync_role_files() -> Result<(), String> {
    let dir = codex_agents_dir()?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("无法创建角色目录 {}：{e}", dir.display()))?;
    let generated: Vec<String> = rows()
        .iter()
        .filter(|row| row.kind == AgentKind::Codex)
        .map(|row| format!("{}.toml", slug(&row.name)))
        .collect();
    // 只清理带 AIGoat 标记的文件：目录里可能有用户手写的角色。
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| format!("无法读取角色目录：{e}"))?
        .flatten()
    {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.ends_with(".toml")
            && !generated.iter().any(|g| g == name)
            && std::fs::read_to_string(&path)
                .map(|text| text.contains(GENERATED_MARKER))
                .unwrap_or(false)
        {
            let _ = std::fs::remove_file(&path);
        }
    }
    for row in rows().iter().filter(|row| row.kind == AgentKind::Codex) {
        let path = dir.join(format!("{}.toml", slug(&row.name)));
        crate::settings::config::write_text(&path, &role_file_toml(&row.name, row))?;
    }
    Ok(())
}

/// 角色文件的 TOML 内容。顶层键必须全部在表头之前。
fn role_file_toml(name: &str, entry: &SubAgentRow) -> String {
    use crate::settings::launch::toml_str;
    // 角色名 = slug：codex 的 spawn_agent 按这个名字找人，`/` 在这里非法。
    let codex_name = slug(name);
    let mut out = String::new();
    out.push_str(&format!(
        "# {GENERATED_MARKER}\n# 由 AIGoat 管理：在设置 → 子 Agent 里编辑，手改会被下一次连接覆盖。\n"
    ));
    out.push_str(&format!("name = {}\n", toml_str(&codex_name)));
    let desc = if entry.desc.trim().is_empty() {
        format!("{name} 团队成员")
    } else {
        entry.desc.trim().to_string()
    };
    out.push_str(&format!("description = {}\n", toml_str(&desc)));

    // developer_instructions 在角色文件里是必填项：角色提示词 + 技能/MCP 说明。
    let mut instructions = String::new();
    if let Some(prompt) = entry
        .prompt
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
    {
        instructions.push_str(prompt);
        instructions.push('\n');
    }
    if !entry.skills.is_empty() {
        instructions.push_str(&format!(
            "优先使用以下技能完成任务：{}。\n",
            entry.skills.join("、")
        ));
    }
    if !entry.mcp_servers.is_empty() {
        // codex 配置层的 mcp_servers 只能「新增定义」，无法按名引用既有
        // server——所以这里以说明的形式交给子代理自查可用工具。
        instructions.push_str(&format!(
            "可用 MCP 服务器（按 id 自查工具）：{}。\n",
            entry.mcp_servers.join("、")
        ));
    }
    if instructions.is_empty() {
        instructions = format!("你是 {name} 团队成员，按主 agent 的派单完成任务。");
    }
    out.push_str(&format!(
        "developer_instructions = {}\n",
        toml_str(&instructions)
    ));
    if let Some(model) = entry
        .model
        .as_deref()
        .map(str::trim)
        .filter(|m| !m.is_empty())
    {
        out.push_str(&format!("model = {}\n", toml_str(model)));
    }
    if !entry.skills.is_empty() {
        out.push_str("\n[skills]\n");
        for skill in &entry.skills {
            out.push_str(&format!(
                "\n[[skills.config]]\nname = {}\nenabled = true\n",
                toml_str(skill)
            ));
        }
    }
    out
}

/// CODEX_HOME 下的角色目录（codex 启动时自动发现 `agents/*.toml`）。
fn codex_agents_dir() -> Result<std::path::PathBuf, String> {
    let home = match std::env::var("CODEX_HOME") {
        Ok(home) if !home.trim().is_empty() => std::path::PathBuf::from(home),
        _ => {
            let user_home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .map_err(|_| "无法定位用户目录".to_string())?;
            std::path::PathBuf::from(user_home).join(".codex")
        }
    };
    Ok(home.join("agents"))
}

/// AIGoat 生成的角色文件标记：注销成员时只删带这个标记的文件，
/// 用户手写的角色文件不动。
const GENERATED_MARKER: &str = "generated-by-aigoat";

/// `<root>/src-tauri/target/release/<exe>` → `<root>`；其它布局返回 None。
mod instructions;
mod rows;
pub mod watch;

pub use instructions::build_instructions;
pub use rows::rows;
