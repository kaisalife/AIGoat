//! 启动 codex 前的配置校验。错误逐条返回，直接喂给配置界面。

use super::{Settings, RESERVED_PROVIDER_IDS};
use std::collections::HashSet;

pub fn validate(settings: &Settings) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    let mut provider_ids = HashSet::new();

    validate_providers(settings, &mut errors, &mut provider_ids);
    validate_models(settings, &mut errors, &provider_ids);

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn validate_providers(
    settings: &Settings,
    errors: &mut Vec<String>,
    provider_ids: &mut HashSet<String>,
) {
    if settings.providers.is_empty() {
        errors.push("至少需要配置一个模型提供商。".into());
    }
    for p in &settings.providers {
        validate_provider_id(p, errors, provider_ids);
        if p.name.trim().is_empty() {
            errors.push(format!("提供商「{}」缺少显示名称。", p.id));
        }
        validate_base_url(p, errors);
        validate_env_key(p, errors);
    }
}

fn validate_provider_id(
    p: &super::ProviderSpec,
    errors: &mut Vec<String>,
    provider_ids: &mut HashSet<String>,
) {
    if p.id.is_empty() {
        errors.push("提供商 ID 不能为空。".into());
        return;
    }
    if !p
        .id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        errors.push(format!("提供商 ID「{}」只能包含字母、数字、- 和 _。", p.id));
    }
    if RESERVED_PROVIDER_IDS.contains(&p.id.as_str()) {
        errors.push(format!("提供商 ID「{}」是保留字，请换一个。", p.id));
    }
    if !provider_ids.insert(p.id.clone()) {
        errors.push(format!("提供商 ID「{}」重复。", p.id));
    }
}

fn validate_base_url(p: &super::ProviderSpec, errors: &mut Vec<String>) {
    let url = p.base_url.trim();
    if url.is_empty() {
        errors.push(format!(
            "提供商「{}」必须填写 Base URL，留空会回落到内置端点。",
            p.id
        ));
    } else if !(url.starts_with("http://") || url.starts_with("https://")) {
        errors.push(format!(
            "提供商「{}」的 Base URL 必须以 http:// 或 https:// 开头。",
            p.id
        ));
    }
}

/// 环境变量名规则：字母/数字/下划线，不能以数字开头。
/// 写不合法会导致 codex 启动时读不到 Key，表现为 401 而不是配置错误。
fn validate_env_key(p: &super::ProviderSpec, errors: &mut Vec<String>) {
    let Some(env_key) = &p.env_key else { return };
    let ok = env_key
        .chars()
        .enumerate()
        .all(|(i, c)| c == '_' || (c.is_ascii_alphanumeric() && !(i == 0 && c.is_ascii_digit())));
    if !ok {
        errors.push(format!(
            "提供商「{}」的环境变量名不合法（字母/数字/下划线，不能以数字开头）。",
            p.id
        ));
    }
}

fn validate_models(settings: &Settings, errors: &mut Vec<String>, provider_ids: &HashSet<String>) {
    let mut model_ids = HashSet::new();
    for m in &settings.models {
        if m.id.trim().is_empty() {
            errors.push("模型 ID 不能为空。".into());
            continue;
        }
        if !model_ids.insert(m.id.clone()) {
            errors.push(format!("模型 ID「{}」重复。", m.id));
        }
        if m.display_name.trim().is_empty() {
            errors.push(format!("模型「{}」缺少显示名称。", m.id));
        }
        if !provider_ids.contains(&m.provider_id) {
            errors.push(format!(
                "模型「{}」所属提供商「{}」不存在。",
                m.id, m.provider_id
            ));
        }
    }
    if let Some(active) = &settings.active_model_id {
        if !model_ids.contains(active) {
            errors.push(format!("当前选中的模型「{active}」不存在。"));
        }
    }
    if settings.models.iter().filter(|m| m.is_default).count() > 1 {
        errors.push("默认模型只能有一个。".into());
    }
}
