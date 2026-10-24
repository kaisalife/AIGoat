//! 生成 spawn codex 时的 `-c` 覆盖项与环境变量。
//!
//! 覆盖项逐条钉死：model_provider / model 指向用户配置，provider 定义强制
//! `requires_openai_auth=false` + `wire_api="responses"`，不存在任何回落路径。

use super::{ProviderSpec, Settings};

/// 空配置时的占位提供商。
///
/// 没有任何自定义提供商/模型时，也必须把 codex 钉死在一个 provider 上——
/// 否则它会悄悄回落到内置默认端点（docs/14 铁律「无回落内置端点路径」），
/// 而且旧会话挂起的 provider 会被直接拒绝。占位端点必然连不上，它只负责
/// 让「先空启动、再配提供商」成立；用户保存真实配置后自动被替换。
const BOOTSTRAP_PROVIDER_ID: &str = "aigoat-bootstrap";
const BOOTSTRAP_BASE_URL: &str = "http://127.0.0.1:9/v1";

/// 空配置时的回退模型（provider id 与 model id 相同）。
/// 供 resume 等需要「当前生效模型」的地方用：历史回放本身与模型无关，
/// codex 只是加载线程时需要给一个有效的模型覆盖项。
pub(crate) fn fallback_model() -> (&'static str, &'static str) {
    (BOOTSTRAP_PROVIDER_ID, BOOTSTRAP_PROVIDER_ID)
}

pub fn launch_overrides(settings: &Settings) -> (Vec<String>, Vec<(String, String)>) {
    let mut args = Vec::new();
    let mut envs = Vec::new();

    for p in &settings.providers {
        push_provider_args(&mut args, p);
        push_env_key(&mut args, &mut envs, p);
    }
    if let Some(model) = settings.active_model() {
        args.push("-c".into());
        args.push(format!("model_provider={}", toml_str(&model.provider_id)));
        args.push("-c".into());
        args.push(format!("model={}", toml_str(&model.id)));
    } else {
        let bootstrap = ProviderSpec {
            id: BOOTSTRAP_PROVIDER_ID.into(),
            name: "AIGoat 占位提供商".into(),
            base_url: BOOTSTRAP_BASE_URL.into(),
            env_key: None,
            api_key: None,
            responses_path: None,
        };
        push_provider_args(&mut args, &bootstrap);
        args.push("-c".into());
        args.push(format!(
            "model_provider={}",
            toml_str(BOOTSTRAP_PROVIDER_ID)
        ));
        args.push("-c".into());
        args.push(format!("model={}", toml_str(BOOTSTRAP_PROVIDER_ID)));
    }
    push_tool_args(&mut args, settings);
    (args, envs)
}

/// 工具开关（codex 上游的默认值偏保守）：
/// - **update_plan**：`tools.update_plan.enabled` 缺省为 false——不开的话
///   模型没有计划工具，AIGoat 的计划面板（turn/plan/updated）永远空着。
/// - **web_search**：用户在模型设置里显式打开才注入；注意 hosted web_search
///   由 provider 端实现，第三方 Responses 中转不一定支持。
fn push_tool_args(args: &mut Vec<String>, settings: &Settings) {
    args.push("-c".into());
    args.push("tools.update_plan.enabled=true".into());
    if settings.web_search {
        args.push("-c".into());
        args.push("tools.web_search=true".into());
    }
}

fn push_provider_args(args: &mut Vec<String>, p: &ProviderSpec) {
    let prefix = format!("model_providers.{}", p.id);
    args.push("-c".into());
    args.push(format!("{prefix}.name={}", toml_str(&p.name)));
    args.push("-c".into());
    args.push(format!("{prefix}.base_url={}", toml_str(p.base_url.trim())));
    args.push("-c".into());
    args.push(format!("{prefix}.wire_api={}", toml_str("responses")));
    args.push("-c".into());
    args.push(format!("{prefix}.requires_openai_auth=false"));
    // Responses 请求路径覆盖：Some 才写（None 保持 codex 默认 /responses）。
    // 空串 = 直接 POST base_url（火山 Agent Plan 这类端点）。
    if let Some(responses_path) = &p.responses_path {
        args.push("-c".into());
        args.push(format!(
            "{prefix}.responses_path={}",
            toml_str(responses_path)
        ));
    }
}

/// Key 的注入顺序：直接填写的 Key 只进子进程环境（不写任何 toml/磁盘）；
/// 否则引用用户指定的环境变量名。
fn push_env_key(args: &mut Vec<String>, envs: &mut Vec<(String, String)>, p: &ProviderSpec) {
    let api_key = p.api_key.as_deref().unwrap_or("").trim();
    if !api_key.is_empty() {
        let env_name = p
            .env_key
            .clone()
            .unwrap_or_else(|| format!("AIGOAT_KEY_{}", p.id.to_uppercase().replace('-', "_")));
        push_env_key_arg(args, p, &env_name);
        envs.push((env_name, api_key.to_string()));
    } else if let Some(env_key) = &p.env_key {
        push_env_key_arg(args, p, env_key);
    }
}

fn push_env_key_arg(args: &mut Vec<String>, p: &ProviderSpec, env_name: &str) {
    args.push("-c".into());
    args.push(format!(
        "model_providers.{}.env_key={}",
        p.id,
        toml_str(env_name)
    ));
}

/// 值按 TOML 字符串传给 -c（codex 解析失败才当字面量，显式加引号最稳）。
///
/// 必须转义全部控制字符：角色提示词来自多行文本框，裸换行写进基本字符串
/// 就是非法 TOML（TOML 1.0 只允许 `\b \t \n \f \r \" \\` 八种转义）。
pub(crate) fn toml_str(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len() + 8);
    for ch in value.chars() {
        match ch {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            '\u{08}' => escaped.push_str("\\b"),
            '\u{0C}' => escaped.push_str("\\f"),
            c => escaped.push(c),
        }
    }
    format!("\"{escaped}\"")
}
