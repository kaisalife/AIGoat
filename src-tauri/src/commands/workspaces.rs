//! 工作区命令：登记、切换、移出（可连带删会话）、在资源管理器中打开。
//!
//! 工作区 = 一个文件夹，是 AIGoat 既有概念（对齐 dsh Workspaces），
//! 落在 `workspaces.json`，与 settings.json 同目录。

use serde_json::{json, Value};
use tauri::{AppHandle, State};

use super::client;
use crate::workspaces::Workspaces;
use crate::AppState;

/// 删工作区时捞会话的上限。200 条足够覆盖一个目录的会话量；
/// 再大就该让用户在会话列表里自己挑了。
const DELETE_SCAN_LIMIT: u64 = 200;

fn workspaces_payload(list: &Workspaces) -> Value {
    json!({
        "workspaces": crate::workspaces::summaries(list),
        "active": list.active,
    })
}

/// 附加两个便捷字段：`path`（本次新打开的，None = 用户取消）与 `canceled`。
fn pick_payload(list: &Workspaces, path: Option<String>) -> Value {
    let mut payload = workspaces_payload(list);
    payload["path"] = match &path {
        Some(p) => json!(p),
        None => Value::Null,
    };
    payload["canceled"] = json!(path.is_none());
    payload
}

#[tauri::command]
pub fn bridge_workspaces_list(app: AppHandle) -> Result<Value, String> {
    Ok(workspaces_payload(&crate::workspaces::load(&app)))
}

/// 弹系统目录选择框；选中即登记并设为当前。
///
/// 必须回到主线程执行：原生对话框基于 COM，而 Tauri 的 WebView2 只在主线程
/// 初始化了 COM（STA）。本命令是 async 的，不在主线程上跑，所以转过去是安全的。
#[tauri::command]
pub async fn bridge_workspaces_pick(app: AppHandle) -> Result<Value, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(crate::workspaces::pick_folder());
    })
    .map_err(|e| format!("无法打开文件夹选择器：{e}"))?;
    let picked = rx.await.map_err(|_| "文件夹选择器已被关闭".to_string())?;

    // 用户取消不是错误，但也不能悄悄切工作区——原样回列表让界面复位。
    let Some(picked) = picked else {
        let list = crate::workspaces::load(&app);
        return Ok(pick_payload(&list, None));
    };
    let mut list = crate::workspaces::load(&app);
    let path = crate::workspaces::add_or_touch(&mut list, &picked)?;
    list.active = Some(path.clone());
    crate::workspaces::save(&app, &list)?;
    Ok(pick_payload(&list, Some(path)))
}

#[tauri::command]
pub fn bridge_workspaces_activate(app: AppHandle, path: String) -> Result<Value, String> {
    let mut list = crate::workspaces::load(&app);
    crate::workspaces::set_active(&mut list, &path)?;
    crate::workspaces::save(&app, &list)?;
    Ok(workspaces_payload(&list))
}

/// 移出工作区。`delete_sessions` 为真时连带删掉该工作区的全部会话。
/// 磁盘上的文件一律不动。
#[tauri::command]
pub async fn bridge_workspaces_remove(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    delete_sessions: bool,
) -> Result<Value, String> {
    let mut list = crate::workspaces::load(&app);
    // 不在列表里就没什么可删的——而且必须在这里挡住：否则下面的"连带删会话"
    // 会去清一个从未登记过的目录，那是用户没要求的破坏。
    if !list.workspaces.iter().any(|w| w.path == path) {
        return Err("该工作区不在列表里。".into());
    }
    let mut deleted_ids: Vec<String> = Vec::new();
    let mut failed = Vec::new();

    if delete_sessions {
        let Ok(client) = client(&state) else {
            return Err("尚未连接 app-server，无法删除会话".into());
        };
        // 归档的会话也算：用户要的是"这个文件夹里一个都不留"。
        for archived in [false, true] {
            let threads =
                super::threads::list_threads(&client, Some(&path), DELETE_SCAN_LIMIT, archived)
                    .await?;
            for thread in threads {
                delete_one(&client, &thread, &mut deleted_ids, &mut failed).await;
            }
        }
    }

    crate::workspaces::remove(&mut list, &path);
    crate::workspaces::save(&app, &list)?;
    let mut payload = workspaces_payload(&list);
    payload["deletedSessions"] = json!(deleted_ids.len());
    // 把删掉的 id 回给前端：`thread/delete` 已经硬删了 codex 那边的 rollout /
    // DB 记录，但壳自己在 ui-state.json（dock 布局、恢复游标）与 settings.json
    // （置顶/顺序）里也记了这些 id，前端要靠这份清单把它们一起清掉，否则配置
    // 文件只增不减、还会把已删会话的布局在下次落盘时又写回去。
    payload["deletedIds"] = json!(deleted_ids);
    payload["failed"] = json!(failed);
    Ok(payload)
}

/// 删一个会话并记账。缺 id 或删不掉都只记失败，不中断整批。
async fn delete_one(
    client: &std::sync::Arc<crate::codex::CodexClient>,
    thread: &Value,
    deleted_ids: &mut Vec<String>,
    failed: &mut Vec<Value>,
) {
    let Some(id) = thread.get("id").and_then(Value::as_str) else {
        return;
    };
    match super::delete::delete_thread(client, id).await {
        Ok(()) => deleted_ids.push(id.to_string()),
        Err(error) => failed.push(json!({ "id": id, "error": error })),
    }
}

/// 在资源管理器里打开工作区目录。
#[tauri::command]
pub fn bridge_workspaces_reveal(path: String) -> Result<(), String> {
    let canonical = std::fs::canonicalize(&path).map_err(|e| format!("路径不存在：{e}"))?;
    if !canonical.is_dir() {
        return Err("工作区文件夹已不存在".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&canonical)
            .spawn()
            .map_err(|e| format!("无法打开资源管理器：{e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("当前平台暂不支持直接打开目录".into())
    }
}
