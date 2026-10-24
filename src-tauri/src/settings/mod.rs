//! 自定义模型配置 + 通用 UI 偏好。
//!
//! 设计原则（承自方案的安全姿态）：
//! - codex 内置模型目录一概不用：启动时用 `-c` 覆盖项注入自定义 provider，
//!   `model_provider` / `model` 钉死为用户配置，绝不回落到内置端点
//! - `requires_openai_auth` 显式写 false（不依赖默认值），不读 auth.json
//! - `wire_api` 固定 "responses"：Codex 已删除 chat 变体，写 chat 是硬错误
//! - base_url 必须显式提供，否则会静默回落到 chatgpt/openai 端点
//! - provider id 不得使用保留字
//! - API Key 两可：引用环境变量（不落盘，推荐）或直接保存在本应用配置目录
//!
//! 落盘策略（00 铁律「配置落盘」）：三个 json 统一写在安装目录的
//! `cache\shell\`；cache 根定位、AppData 回落与旧布局迁移在 `crate::cache`。
//!
//! 模块分工（≤200 行约束）：
//! - `mod.rs`        数据结构与默认值
//! - `validation.rs` 启动前校验
//! - `launch.rs`     spawn codex 的 `-c` 覆盖项与环境变量
//! - `config.rs`     目录回落与 settings.json 读写
//! - `ui_state.rs`   ui-state.json 读写（布局/dock，前端 UI 状态专用）

use serde::{Deserialize, Serialize};

pub mod config;
pub mod launch;
pub mod ui_state;
pub mod validation;

pub use config::{app_dir, config_path, load, reveal_in_explorer, save};
pub use launch::launch_overrides;
pub use validation::validate;

/// 这些 id 被 codex 保留，用作自定义 provider id 会被拒绝。
pub const RESERVED_PROVIDER_IDS: &[&str] = &[
    "openai",
    "amazon-bedrock",
    "amazon-bedrock-runtime",
    "ollama",
    "lmstudio",
];

pub const SETTINGS_FILE: &str = "settings.json";
pub const UI_STATE_FILE: &str = "ui-state.json";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub providers: Vec<ProviderSpec>,
    pub models: Vec<ModelSpec>,
    pub active_model_id: Option<String>,
    /// 通用偏好（主题/字号/密度/发送行为/默认权限档位）。
    /// 旧文件没有该段也能读——`default` 保证向后兼容。
    pub ui: UiSettings,
    /// 会话列表的**置顶**与**手工顺序**（03 号文件）。
    ///
    /// 存 threadId 列表而不是索引：会话会被删，索引一删就全错位，而按 id
    /// 存的话删掉的那几条直接被忽略即可。旧文件没有这两段也能读。
    #[serde(default)]
    pub pinned_threads: Vec<String>,
    #[serde(default)]
    pub thread_order: Vec<String>,
    /// 网页搜索工具开关（`tools.web_search`）。hosted web_search 由 provider
    /// 端实现，第三方 Responses 中转不一定支持——所以默认关、显式开。
    #[serde(default)]
    pub web_search: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ProviderSpec {
    /// 发给 codex 的 provider id（非保留字）。
    pub id: String,
    /// 显示名称。
    pub name: String,
    /// 必须 http(s)，留空会静默回落到 chatgpt 端点——这里强制必填。
    pub base_url: String,
    /// 存放 API Key 的环境变量名。
    pub env_key: Option<String>,
    /// 直接填写的 Key：保存在本应用配置目录（区别于 codex 目录），仅本机使用。
    pub api_key: Option<String>,
    /// Responses API 请求路径（追加在 base_url 后）。None = codex 默认
    /// `/responses`；Some(空串) = 直接 POST base_url（火山 Agent Plan 这类
    /// 「路径即端点」的网关）。需要 codex-rs ≥ 本仓库 patched 版本
    /// （支持 `responses_path` 配置键），旧版 codex 会忽略该键。
    #[serde(default)]
    pub responses_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ModelSpec {
    /// 发给 API 的模型 id。
    pub id: String,
    /// 选择器里显示的名字。
    pub display_name: String,
    pub provider_id: String,
    /// 推理档位：协议是自由字符串（low/medium/high…），留空用服务端默认。
    pub reasoning_effort: Option<String>,
    /// 上下文窗口（token 数），用于界面上的余量条；可留空。
    pub context_window: Option<u64>,
    /// 默认选中的模型（至多一个生效）。
    pub is_default: bool,
}

/// 通用 UI 偏好（settings.json 的 `ui` 段）。
///
/// 只放「跟着账号走但与连接无关」的偏好。布局、右栏 dock 这些高频变动的
/// 状态不进这里——它们在 `ui-state.json`（见 `ui_state.rs`），落盘更频繁、
/// 体积也更大，混在一个文件里会让 settings.json 频繁改写。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct UiSettings {
    /// `light` / `dark` / `system`。system 由前端在首屏前解析成具体值再上屏。
    pub theme: String,
    /// 内容字号档，10–22（只影响正文，不动 UI 控件字号）。
    pub content_size: u32,
    /// `comfortable` / `compact`。
    pub density: String,
    /// true = Enter 发送、Shift+Enter 换行；false 反之。
    pub enter_sends: bool,
    /// 新会话的默认权限档位 id（`permissionProfile/list` 的 id）。
    pub default_permission_profile: Option<String>,
}

impl Default for UiSettings {
    fn default() -> Self {
        // 亮色为默认（产品设定）。
        Self {
            theme: "light".into(),
            content_size: 14,
            density: "comfortable".into(),
            enter_sends: true,
            default_permission_profile: None,
        }
    }
}

impl Settings {
    pub fn active_model(&self) -> Option<&ModelSpec> {
        let by_id = |id: &str| self.models.iter().find(|m| m.id == id);
        self.active_model_id
            .as_deref()
            .and_then(by_id)
            .or_else(|| self.models.iter().find(|m| m.is_default))
            .or_else(|| self.models.first())
    }

    pub fn provider(&self, provider_id: &str) -> Option<&ProviderSpec> {
        self.providers.iter().find(|p| p.id == provider_id)
    }
}

/// 内容字号档钳制到 10–22：写坏的文件也不该把界面撑到不可用。
pub fn clamp_content_size(value: u32) -> u32 {
    value.clamp(10, 22)
}
