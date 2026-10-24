//! 配置命令：自定义模型、通用 UI 偏好、`ui-state.json`。
//!
//! 两个落盘通道别混：
//! - `settings.json` 的 `ui` 段：跟着账号走的通用偏好（主题/字号/密度/发送行为），
//!   改它不需要重启 codex（`bridge_settings_set_ui`）。
//! - `ui-state.json`：布局、右栏 dock 这类高频变动的界面状态，前端 500ms 防抖后
//!   整文件覆盖写（`bridge_ui_state_save`）。不用 localStorage，见 ui_state.rs。

use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::settings::{ui_state, Settings, UiSettings};
use crate::AppState;

#[tauri::command]
pub async fn bridge_settings_get(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let settings = crate::commands::with_settings(&state, |s| s.clone())?;
    let ui_state_path = ui_state::ui_state_file(&app)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut value = serde_json::to_value(&settings).map_err(|e| e.to_string())?;
    redact_api_keys(&mut value);
    Ok(json!({
        "settings": value,
        "configPath": state.settings_path.lock().map_err(|e| format!("settings_path lock poisoned: {e}"))?.clone(),
        "uiStatePath": ui_state_path,
    }))
}

/// 把响应里的明文 API Key 抹掉，换成 `hasApiKey` 标记。
///
/// Key 是长期凭据，整个 settings 对象原样回传等于把它复制进渲染进程内存
/// （任何注入都能顺走）。表单留空 = 保持不变，由 `bridge_settings_apply`
/// 侧的合并规则补回。
fn redact_api_keys(value: &mut Value) {
    let Some(providers) = value.get_mut("providers").and_then(Value::as_array_mut) else {
        return;
    };
    for provider in providers {
        let has = provider
            .get("apiKey")
            .and_then(Value::as_str)
            .map(|k| !k.trim().is_empty())
            .unwrap_or(false);
        if has {
            provider["hasApiKey"] = json!(true);
        }
        provider["apiKey"] = Value::Null;
    }
}

/// apply 的 Key 合并规则（与前端表单约定，见 `contract.ts` 的注释）。
///
/// 壳**从不下发** Key（读取时一律抹成 null），所以前端回传的 `apiKey`
/// 不存在"清除"这个语义——三种形态全都是"保持原 Key"：
/// - `Some(非空)` → 用户填了新 Key，采用
/// - `Some("")`   → local 模式留空 = 保持原 Key
/// - `None`       → 模型域整表回传（读取时被抹成 null）/ 表单未触碰该字段
///   = **保持原 Key**。之前把 None 当"清除"，导致任何一次模型域保存都会
///   把存好的 Key 抹掉，重启后就得重填。
///
/// （Key 的显式清除目前没有界面入口，需要时手改配置文件。）
fn restore_blank_api_keys(incoming: &mut Settings, existing: &Settings) {
    for provider in incoming.providers.iter_mut() {
        let blank = match provider.api_key.as_deref() {
            None | Some("") => true,
            Some(_) => false,
        };
        if !blank {
            continue;
        }
        if let Some(old) = existing.provider(&provider.id) {
            provider.api_key = old.api_key.clone();
        }
    }
}

/// 在资源管理器里定位配置文件。
#[tauri::command]
pub fn bridge_settings_reveal(app: AppHandle) -> Result<(), String> {
    crate::settings::reveal_in_explorer(&app)
}

/// 定位 ui-state.json（布局状态的落盘位置）。
#[tauri::command]
pub fn bridge_ui_state_reveal(app: AppHandle) -> Result<(), String> {
    crate::settings::config::reveal_path(&app, &ui_state::ui_state_file(&app)?)
}

/// 校验 → 落盘 → 用新配置重启 codex（旧子进程被回收）。
/// 提供商/模型变更必须重启才生效；只改选中模型用 set_active_model 即可。
#[tauri::command]
pub async fn bridge_settings_apply(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Value, String> {
    crate::settings::validate(&settings).map_err(|errors| errors.join("\n"))?;

    // 表单里留空的 Key = 保持不变（壳侧从不下发明文，见 bridge_settings_get）。
    let mut settings = settings;
    restore_blank_api_keys(
        &mut settings,
        &crate::commands::with_settings(&state, |s| s.clone())?,
    );

    // 顺序：**先用候选配置把 codex 拉起来**，成功后才落盘 + 换内存。
    // 反过来的话，启动失败会把坏配置留在磁盘和内存里，而函数却返回错误，
    // 用户下次启动仍在坏配置上，且没有任何回退点。
    let old = state
        .client
        .lock()
        .map_err(|e| format!("client lock poisoned: {e}"))?
        .clone();
    let new_client = crate::codex::CodexClient::launch_and_connect(app.clone(), &settings).await?;
    let path = match crate::settings::save(&app, &settings) {
        Ok(path) => path,
        Err(e) => {
            // 落盘失败：丢弃刚拉起的连接，磁盘/内存保持原样。
            drop(new_client);
            return Err(e);
        }
    };
    crate::commands::with_settings(&state, |s| *s = settings.clone())?;
    *state
        .settings_path
        .lock()
        .map_err(|e| format!("settings_path lock poisoned: {e}"))? =
        path.to_string_lossy().to_string();

    // 旧 client 先取出来，新连接就位后再丢弃（Drop 回收子进程）。
    *state
        .client
        .lock()
        .map_err(|e| format!("client lock poisoned: {e}"))? = Some(new_client.clone());
    if let Some(old) = old {
        drop(old);
    }
    super::connect_info_json(&new_client)
}

/// 只切换选中的模型：下次 thread/start 即生效，无需重启连接。
#[tauri::command]
pub async fn bridge_settings_set_active_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    crate::commands::with_settings(&state, |settings| {
        if !model_id.is_empty() && !settings.models.iter().any(|m| m.id == model_id) {
            return Err(format!("模型「{model_id}」不存在"));
        }
        settings.active_model_id = if model_id.is_empty() {
            None
        } else {
            Some(model_id)
        };
        crate::settings::save(&app, settings)?;
        Ok(())
    })?
}

/// 写通用偏好（主题/内容字号/密度/发送行为/默认权限档位）。
/// 与 apply 的区别：**不重启 codex**——主题切换不该打断正在跑的会话。
#[tauri::command]
pub fn bridge_settings_set_ui(
    app: AppHandle,
    state: State<'_, AppState>,
    ui: UiSettings,
) -> Result<(), String> {
    crate::commands::with_settings(&state, |settings| {
        let mut next = ui;
        next.content_size = crate::settings::clamp_content_size(next.content_size);
        next.theme = match next.theme.as_str() {
            t @ ("light" | "dark" | "system") => t.to_string(),
            _ => "light".into(),
        };
        next.density = match next.density.as_str() {
            d @ ("comfortable" | "compact") => d.to_string(),
            _ => "comfortable".into(),
        };
        settings.ui = next;
        crate::settings::save(&app, settings)?;
        Ok(())
    })?
}

// ------------------------------------------------------- ui-state.json

#[tauri::command]
pub fn bridge_ui_state_load(app: AppHandle) -> Result<Value, String> {
    Ok(ui_state::load(&app))
}

#[tauri::command]
pub fn bridge_ui_state_save(app: AppHandle, state: Value) -> Result<(), String> {
    ui_state::save(&app, &state)
}

/// 清掉 dock 段的残留条目（会话被删后布局还留着，文件只会一直变大）。
#[tauri::command]
pub fn bridge_ui_state_prune_dock(app: AppHandle, keep: Vec<String>) -> Result<(), String> {
    ui_state::prune_dock(&app, &keep)
}

/// 落盘会话列表的置顶与手工顺序（03 号文件）。
///
/// 存 threadId 列表而不是索引：会话会被删，索引一删就全错位；按 id 存的话
/// 被删的那几条直接被忽略即可。落盘**不做校验**——列表在前端已经过滤过，
/// 壳再校验一遍只会两边规则不一致。
#[tauri::command]
pub fn bridge_save_thread_order(
    app: AppHandle,
    state: State<'_, AppState>,
    pinned: Vec<String>,
    order: Vec<String>,
) -> Result<(), String> {
    crate::commands::with_settings(&state, |settings| {
        settings.pinned_threads = pinned;
        settings.thread_order = order;
        crate::settings::save(&app, settings)?;
        Ok(())
    })?
}
