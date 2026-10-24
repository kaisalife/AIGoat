//! codex app-server 客户端：进程生命周期与握手。
//!
//! 线格式（`app-server-protocol/src/rpc.rs`）：不是标准 JSON-RPC 2.0，
//! 没有 `jsonrpc` 字段；换行分隔 JSON；三类入站帧必须区分——
//! server→client 请求（有 id 有 method）、通知（有 method 无 id）、
//! 对我方请求的响应（有 id，`result` 或 `error`；`result: null` 合法，
//! 只能按 key 判断）。
//!
//! `initialize` 必须是第一个请求，之后必须发 `initialized` 通知，
//! 带 `experimentalApi: true` 才能收到较新的 item 类型。
//!
//! 分片：本文件只管「起来 + 握手」；发请求在 `api.rs`，应答在
//! `respond.rs`，入站帧分流在 `framing.rs`。

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI64};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use framing::dispatch_frame;

mod api;
mod framing;
mod resolve;
mod respond;

pub const EVENT_CHANNEL: &str = "agent-event";

/// 读线程结束时统一的连接丢失文案：既作为在途请求的错误，也作为前端提示。
const CONNECTION_LOST: &str = "与 codex 的连接已断开，请重新连接。";

/// server→client 请求的挂起记录：应答时需要 method 决定应答形状，
/// permissions 审批还要回显请求里的 profile。
pub(crate) struct PendingServerRequest {
    pub method: String,
    pub params: Value,
}

/// 等待应答的请求表：请求 id -> 回传结果的通道。
/// `request()` 靠它把 JSON-RPC 应答配回发起请求的那个任务。
pub(crate) type PendingMap =
    Arc<Mutex<HashMap<i64, tokio::sync::oneshot::Sender<Result<Value, String>>>>>;

pub struct CodexClient {
    /// 只在 Drop 里用（kill 子进程）。
    child: Mutex<Child>,
    /// 子线程句柄：Drop 时 join，避免线程泄漏。
    handles: Vec<std::thread::JoinHandle<()>>,
    /// 写线程唯一的发送端。`Option` 是为了在 `Drop` 里能 `take()` 掉它关闭
    /// 通道——通道不关，写线程会卡在 `recv()` 上，join 就永远等不到。
    tx: Option<std::sync::mpsc::Sender<String>>,
    next_id: AtomicI64,
    pending: PendingMap,
    server_requests: Arc<Mutex<HashMap<Value, PendingServerRequest>>>,
    /// **按线程**记录的活跃回合：threadId -> turnId。
    ///
    /// 曾经这里是单个 `Option<(String, String)>` 槽位，那是错的——本应用
    /// 支持子代理在各自线程里并发跑回合，单槽位只记得最后开始的那一个：
    /// 主会话 A 在跑、子代理 B 也开跑后，A 从槽位里消失，于是
    /// 「在 A 上点停止」会去打断 B，而 A 继续跑。
    ///
    /// 改成按线程存之后两件事才对：打断能按 turnId 精确命中；删除某个
    /// 线程时能正确判断「这个线程」是否在跑，而不是「有没有任意线程在跑」。
    active_turns: Arc<Mutex<HashMap<String, String>>>,
    /// initialize 应答里的连接信息，bridge_connect 直接取用。
    connect_info: Mutex<Option<ConnectInfo>>,
    /// 子进程是否还活着。读线程一退出就置 false——那意味着 codex 已死或
    /// stdout 断开。`bridge_connect` 靠它判断该复用还是**重新 spawn**：
    /// 复用一根已断的管道会让"重新连接"看着成功、之后所有请求都失败。
    alive: Arc<AtomicBool>,
}

impl Drop for CodexClient {
    fn drop(&mut self) {
        // 顺序有讲究：
        // 1) 先 kill 子进程——写线程若正卡在 `writeln!`（管道满）会因写失败退出；
        // 2) 再 drop 发送端关闭通道——写线程若卡在 `recv()` 会因通道关闭退出。
        //    必须在 join 之前做：`tx` 是本结构体的字段，不主动 take 的话它会
        //    活到 `Drop` 结束，写线程永远收不到「通道已关闭」，join 永久阻塞。
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            // 回收僵尸进程（Unix 上不 wait 会留下 zombie）。
            let _ = child.wait();
        }
        self.tx = None;
        for handle in self.handles.drain(..) {
            let _ = handle.join();
        }
    }
}

/// initialize 的应答，即前端 ConnectInfo 的来源。
#[derive(Clone)]
pub struct ConnectInfo {
    pub user_agent: String,
    pub codex_home: String,
    pub platform_family: String,
    pub platform_os: String,
}

impl CodexClient {
    /// 启动 codex app-server 并完成 initialize 握手。
    ///
    /// `settings` 决定 `-c` 覆盖项与环境变量：自定义 provider / 模型在这里
    /// 注入，codex 的内置模型目录不会出现在链路上。
    pub async fn launch_and_connect(
        app: AppHandle,
        settings: &crate::settings::Settings,
    ) -> Result<Arc<Self>, String> {
        let (mut extra_args, envs) = crate::settings::launch_overrides(settings);
        // codex 原生团队成员（注册表 kind=codex）落成角色文件，随本次启动被
        // codex 自动发现；存在原生成员时同时打开 multi_agent_v2 特性。
        extra_args.extend(crate::registry::launch_overrides()?);
        // exe 旁 bin\codex.exe（安装包捆绑）→ AIGOAT_CODEX_EXE → PATH（见 resolve.rs）。
        let mut cmd = Command::new(resolve::resolve());
        cmd.arg("app-server")
            .args(&extra_args)
            .env("AIGOAT_CUSTOM_PROVIDER", "1")
            .envs(envs)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        // release 壳没有控制台；别让子进程闪黑窗。
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("无法启动 codex app-server（已在安装目录 bin\\、AIGOAT_CODEX_EXE 与 PATH 中查找）：{e}"))?;

        let stdout = child.stdout.take().ok_or("无法读取 codex stdout")?;
        let stdin = child.stdin.take().ok_or("无法写入 codex stdin")?;

        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
        let server_requests: Arc<Mutex<HashMap<Value, PendingServerRequest>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let active_turns: Arc<Mutex<HashMap<String, String>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // 写线程：唯一持有 stdin 的地方。
        let write_handle = std::thread::spawn(move || {
            let mut stdin = stdin;
            for line in rx {
                if writeln!(stdin, "{line}").is_err() {
                    break;
                }
            }
        });

        // 读线程：分帧 + 分流。这里决定整个桥接的正确性。
        // 批量器放共享锁里：专职的 flush 线程每 16ms 冲一次，保证 turnComplete
        // 这类**尾事件**不被滞留（见 EventBatcher 的文档注释）。
        let batcher: Arc<Mutex<framing::EventBatcher>> = Arc::new(Mutex::new(
            framing::EventBatcher::new(app.clone(), EVENT_CHANNEL),
        ));
        let flush_done = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let alive = Arc::new(AtomicBool::new(true));
        let read_handle = {
            let pending = pending.clone();
            let server_requests = server_requests.clone();
            let active_turns = active_turns.clone();
            let batcher = batcher.clone();
            let flush_done = flush_done.clone();
            let alive = alive.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    let line = match line {
                        Ok(l) => l,
                        Err(_) => break,
                    };
                    if line.trim().is_empty() {
                        continue;
                    }
                    let Ok(frame) = serde_json::from_str::<Value>(&line) else {
                        continue;
                    };
                    // 锁只在分发期间持有，读完下一行之前必须释放——否则
                    // flush 线程在阻塞读的整个空闲窗口里都拿不到锁。
                    let mut guard = batcher.lock().unwrap_or_else(|e| e.into_inner());
                    dispatch_frame(
                        &app,
                        frame,
                        &pending,
                        &server_requests,
                        &active_turns,
                        &mut guard,
                    );
                }
                // 循环退出 = 子进程已死或 stdout 断开。先落这个标记，让
                // 后续的 bridge_connect 知道这根管道不能再复用、必须重启。
                alive.store(false, std::sync::atomic::Ordering::SeqCst);
                batcher.lock().unwrap_or_else(|e| e.into_inner()).flush();
                // 读线程退出 = 子进程已死或 stdout 断开。此时必须收尾：
                // 1) 让所有在途请求立刻失败——否则它们会各自等到超时，
                //    终端那条是 24h（见 api.rs DEFAULT_TIMEOUT 的注释）；
                // 2) 清空活跃回合表，避免「停止」按钮指向已不存在的回合；
                // 3) 通知前端连接已断，界面给出可重连的提示。
                for (_, sender) in pending.lock().unwrap_or_else(|e| e.into_inner()).drain() {
                    let _ = sender.send(Err(CONNECTION_LOST.into()));
                }
                active_turns
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clear();
                let _ = app.emit(
                    EVENT_CHANNEL,
                    json!({
                        "type": "error",
                        "message": CONNECTION_LOST,
                        // 与普通回合错误区分：前端据此把连接态切成 error，
                        // 状态栏才会出现「重新连接」入口（16 号板块）。
                        "connectionLost": true,
                    }),
                );
                // 收尾完成后才放行 flush 线程退出（它退出前不会再冲出东西）。
                flush_done.store(true, std::sync::atomic::Ordering::SeqCst);
            })
        };

        // 专职 flush 线程：turnComplete / 通知类尾事件之后 read thread 会阻塞
        // 在等下一行，没有定时冲刷的话缓冲里的最后一批事件永远发不出去。
        let timer_handle = {
            let batcher = batcher.clone();
            let flush_done = flush_done.clone();
            std::thread::spawn(move || {
                while !flush_done.load(std::sync::atomic::Ordering::SeqCst) {
                    std::thread::sleep(framing::EventBatcher::FLUSH_INTERVAL);
                    batcher.lock().unwrap_or_else(|e| e.into_inner()).flush();
                }
            })
        };

        let client = Arc::new(Self {
            child: Mutex::new(child),
            handles: vec![write_handle, read_handle, timer_handle],
            tx: Some(tx),
            next_id: AtomicI64::new(0),
            pending,
            server_requests,
            active_turns,
            connect_info: Mutex::new(None),
            alive,
        });

        client.initialize().await?;
        Ok(client)
    }

    async fn initialize(&self) -> Result<(), String> {
        let params = json!({
            "clientInfo": {
                "name": "AIGoat",
                "title": "AIGoat",
                "version": env!("CARGO_PKG_VERSION"),
            },
            "capabilities": {
                "experimentalApi": true,
                "requestAttestation": false,
            },
        });
        let resp = self.request("initialize", params).await?;
        // initialized 通知必须在 initialize 应答之后。
        self.notify("initialized", Value::Null)?;
        let info = ConnectInfo {
            user_agent: resp
                .get("userAgent")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string(),
            codex_home: resp
                .get("codexHome")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            platform_family: resp
                .get("platformFamily")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            platform_os: resp
                .get("platformOs")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        };
        *self.connect_info.lock().unwrap_or_else(|e| e.into_inner()) = Some(info);
        Ok(())
    }

    pub fn connect_info(&self) -> Option<ConnectInfo> {
        self.connect_info
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// 子进程是否仍连着。读线程退出（codex 死掉 / stdout 断开）后为 false。
    pub fn is_alive(&self) -> bool {
        self.alive.load(std::sync::atomic::Ordering::SeqCst)
    }
}

/// 取回并移出挂起表。返回 None = 已经应答过（重复应答是调用方的 bug）。
///
/// 三条应答命令共用：审批、工具结果、用户提问。形状不同但生命周期一样——
/// codex 那边都是等一个应答，移出挂起表才能让第二次应答被拒。
pub(crate) fn take_pending(
    server_requests: &Arc<Mutex<HashMap<Value, PendingServerRequest>>>,
    request_id: &Value,
) -> Option<PendingServerRequest> {
    server_requests
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(request_id)
}
