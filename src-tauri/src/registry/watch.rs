//! 注册表变更感知：GUI 怎么知道 codex（经 CLI）改了注册表。
//!
//! `team-apply` 是独立进程，改完不会通知壳。这里起一个常驻线程，每 3s
//! 读一次 registry.json 与上次内容比对，变了就广播 `registry-changed`
//! 事件——前端「团队」tab 收到后重新拉取。独立事件通道，不走
//! agent-event、不进 map/ 层，与字段契约门禁无关。
//!
//! 为什么不用 notify 之类的文件监听 crate：不为一个 3s 轮询引新依赖。
//! 读失败（正好撞上 tmp+rename 的窗口）表现为「文件暂时消失」，归一成
//! None 参与比对，下轮自然恢复，不需要特判。

use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter};

/// 注册表变更事件名（前端 `listen` 这个名字）。
pub const REGISTRY_EVENT: &str = "registry-changed";

/// 轮询间隔。注册表就一个小 json，整文件比对成本可忽略。
const INTERVAL: Duration = Duration::from_secs(3);

/// 启动常驻 watcher 线程（GUI setup 时调用一次）。进程退出即回收。
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let path = super::db_path();
        let mut last = std::fs::read(&path).ok();
        loop {
            std::thread::sleep(INTERVAL);
            let cur = std::fs::read(&path).ok();
            if cur != last {
                last = cur;
                let _ = app.emit(REGISTRY_EVENT, json!({}));
            }
        }
    });
}
