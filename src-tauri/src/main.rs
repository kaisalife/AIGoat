// AIGoat - AI助手应用（Tauri 外壳）
//
// 生产形态：壳内实现 bridge_* 命令层，spawn 真实的 codex app-server，
// 事件经 `agent-event` 通道推给前端。模型全部由用户自定义配置，
// codex 内置模型目录不参与链路（见 settings.rs）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cache;
mod codex;
mod commands;
mod fs;
mod map;
mod registry;
mod server_requests;
mod settings;
mod team;
mod workspaces;

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use tauri::Manager;

pub struct AppState {
    /// codex app-server 客户端。首次 bridge_connect 时启动。
    pub client: Mutex<Option<std::sync::Arc<codex::CodexClient>>>,
    /// 自定义模型配置（providers / models / active_model_id）。
    pub settings: Mutex<settings::Settings>,
    /// settings.json 的落盘位置，配置界面展示用。
    pub settings_path: Mutex<String>,
    /// 活动终端实例（重载重挂用，见 commands/verdict.rs）。运行期状态，不落盘。
    pub terminals: Arc<Mutex<HashSet<String>>>,
}

fn main() {
    // cache 目录最先就绪：建目录、迁移旧布局数据、注入 CODEX_HOME。
    // 后续所有落盘（settings / workspaces / ui-state / 注册表 / codex 数据）
    // 都依赖它，必须先于 settings::load 与任何 spawn。
    cache::init();
    // 默认技能装进 CODEX_HOME（幂等）。随后分流 CLI 子命令：
    // codex 经 shell 调 team-apply/team-list/agent-scaffold 时直接走完退出，
    // 不起窗口。
    team::skill::install_all();
    if let Some(code) = team::cli::run(std::env::args().skip(1)) {
        std::process::exit(code);
    }
    // WebView2 默认走**系统代理**。Tauri 在 Windows 上的应用源是
    // `http://tauri.localhost`，代理工具（Clash/v2rayN/公司代理）的绕过
    // 列表通常只写了 `localhost;127.0.0.1`，盖不住它——于是 WebView 把
    // 加载自己界面的请求发给代理，代理拒绝，窗口就是一张
    // 「tauri.localhost 拒绝了连接请求」的错误页。
    //
    // 本应用的 WebView 只访问**嵌入资源与 IPC**，不产生任何对外网络请求
    // （模型流量走 codex 子进程，与本变量无关），所以除非用户显式提供了
    // 自己的参数，否则一律禁用代理，让 exe 对系统代理免疫。
    if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--no-proxy-server");
    }
    tauri::Builder::default()
        .manage(AppState {
            client: Mutex::new(None),
            settings: Mutex::new(settings::Settings::default()),
            settings_path: Mutex::new(String::new()),
            terminals: Arc::new(Mutex::new(HashSet::new())),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let loaded = settings::load(&handle);
            let state: tauri::State<AppState> = app.state();
            *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = loaded;
            *state
                .settings_path
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = settings::config_path(&handle);

            // 初始窗口尺寸按显示器工作区钳一次（只缩不放）。
            // 配置里的 1440×900 是**逻辑像素**：在 125%/150% 系统缩放或小屏上，
            // 它比可视工作区还大——启动时底部（状态条、输入框）直接出屏，
            // 用户只能靠再点一次最大化把它拉回来。
            if let Some(window) = app.get_webview_window("main") {
                let monitor = window
                    .current_monitor()
                    .ok()
                    .flatten()
                    .or_else(|| window.primary_monitor().ok().flatten());
                if let Some(monitor) = monitor {
                    let area = monitor.work_area();
                    let scale = window.scale_factor().unwrap_or(1.0);
                    let max_w = area.size.width as f64 / scale;
                    let max_h = area.size.height as f64 / scale;
                    if let Ok(size) = window.outer_size() {
                        let cur_w = size.width as f64 / scale;
                        let cur_h = size.height as f64 / scale;
                        if cur_w > max_w || cur_h > max_h {
                            let _ = window.set_size(tauri::LogicalSize::new(
                                cur_w.min(max_w),
                                cur_h.min(max_h),
                            ));
                        }
                    }
                }
            }
            // 注册表变更 watcher：codex 经 CLI 改注册表后广播给前端「团队」tab。
            crate::registry::watch::spawn(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bridge_connect,
            commands::bridge_list_threads,
            commands::bridge_start_thread,
            commands::bridge_resume_thread,
            commands::bridge_fork_thread,
            commands::bridge_archive_thread,
            commands::bridge_unarchive_thread,
            commands::bridge_delete_thread,
            commands::bridge_rename_thread,
            commands::bridge_compact_thread,
            commands::bridge_send_message,
            commands::bridge_interrupt,
            commands::bridge_steer,
            commands::bridge_respond_approval,
            commands::bridge_respond_tool_result,
            commands::bridge_respond_user_input,
            commands::bridge_respond_elicitation,
            commands::bridge_respond_error,
            commands::bridge_terminal_exec,
            commands::bridge_terminal_write,
            commands::bridge_terminal_resize,
            commands::bridge_terminal_terminate,
            commands::bridge_terminal_list,
            commands::bridge_review_verdict,
            commands::bridge_thread_items,
            commands::bridge_thread_turns,
            commands::bridge_thread_revert,
            commands::bridge_save_thread_order,
            commands::bridge_goal_get,
            commands::bridge_goal_set,
            commands::bridge_goal_clear,
            commands::bridge_attachment_add,
            commands::bridge_attachment_list,
            commands::bridge_attachment_remove,
            commands::bridge_review,
            commands::bridge_permission_profiles,
            commands::bridge_sandbox_readiness,
            commands::bridge_settings_get,
            commands::bridge_settings_apply,
            commands::bridge_settings_set_active_model,
            commands::bridge_settings_set_ui,
            commands::bridge_settings_reveal,
            commands::bridge_ui_state_load,
            commands::bridge_ui_state_save,
            commands::bridge_ui_state_prune_dock,
            commands::bridge_ui_state_reveal,
            commands::bridge_mcp_servers,
            commands::bridge_skills,
            commands::bridge_mcp_definitions_read,
            commands::bridge_mcp_definition_write,
            commands::bridge_mcp_definition_remove,
            commands::bridge_skills_config_write,
            commands::bridge_skills_config_read,
            commands::bridge_skills_roots_set,
            commands::bridge_hooks,
            commands::bridge_config,
            commands::bridge_subagents_list,
            commands::bridge_subagents_register,
            commands::bridge_subagents_remove,
            commands::bridge_subagents_update,
            commands::bridge_subagents_instructions,
            commands::bridge_teams_list,
            commands::bridge_teams_set_workflow,
            commands::bridge_teams_set_spec,
            commands::bridge_teams_materialize,
            commands::bridge_workspaces_list,
            commands::bridge_workspaces_pick,
            commands::bridge_workspaces_activate,
            commands::bridge_workspaces_remove,
            commands::bridge_workspaces_reveal,
            commands::bridge_threads_batch_delete,
            commands::bridge_fs_list,
            commands::bridge_fs_read,
            commands::bridge_fs_write,
            commands::bridge_fs_reveal,
        ])
        .on_window_event(|window, event| match event {
            #[cfg(target_os = "windows")]
            tauri::WindowEvent::Resized(_) => compensate_maximized(window),
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running AIGoat application");
}

/// 无边框窗口最大化外溢补偿（仅 Windows）。
///
/// tao 对 `decorations: false` 的窗口走自己的最大化路径，会把窗口设成
/// 「整个显示器 + 隐形边框外溢」而不是工作区——内容超出屏幕、盖住任务栏；
/// 系统贴靠（Win+↑）走 Windows 自己的路径反而刚好。这里在最大化时把窗口
/// 尺寸/位置补偿回**显示器工作区**（去掉任务栏），两条路径就收敛到同一个
/// 几何；还原尺寸由系统的 rcNormalPosition 管理，不受影响。
#[cfg(target_os = "windows")]
fn compensate_maximized(window: &tauri::Window) {
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(true) = window.is_maximized() else {
            return;
        };
        if window.is_fullscreen().unwrap_or(false) {
            return;
        }
        let Some(monitor) = window.current_monitor().ok().flatten() else {
            return;
        };
        let area = monitor.work_area();
        // 已经在工作区几何上就不再设置：我们自己的 set 会再次触发 Resized，
        // 不加这道闸会来回打乒乓。
        let settled = window.outer_position().is_ok_and(|p| p == area.position)
            && window.outer_size().is_ok_and(|s| s == area.size);
        if settled {
            return;
        }
        let scale = window.scale_factor().unwrap_or(1.0);
        let _ = window.set_position(tauri::LogicalPosition::new(
            area.position.x as f64 / scale,
            area.position.y as f64 / scale,
        ));
        let _ = window.set_size(tauri::LogicalSize::new(
            area.size.width as f64 / scale,
            area.size.height as f64 / scale,
        ));
    });
}
