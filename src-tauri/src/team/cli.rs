//! `aigoat.exe` 的 CLI 子命令：`team-apply` / `team-list`。
//!
//! main() 在 GUI 之前先问 [`run`]：返回 `None` 才继续起窗口。codex 经
//! shell 调用时是独立进程，与 GUI 并发——注册表操作全部复用 `registry::`
//! 的校验与原子写（并发丢更新的取舍见 `team/mod.rs` 头注释）。
//!
//! 本程序是 Windows GUI 子系统 exe：stdout 没接管道时写不出去，所以输出
//! 一律走 `--out <文件>` 落盘；`println!` 只是管道场景下的附赠。

use serde::Deserialize;
use serde_json::{json, Value};

use super::report::{error_report, finish, split_out};

/// CLI 分流入口。`args` 是去掉程序名后的参数（`std::env::args().skip(1)`）。
/// 返回 `Some(退出码)` = 本次是 CLI 调用（main 应立即 exit，0 成功 / 1
/// 失败，与 AF 任务单协议一致）；`None` = 继续 GUI 启动。
pub fn run<I: Iterator<Item = String>>(args: I) -> Option<i32> {
    let args: Vec<String> = args.collect();
    match args.first().map(String::as_str) {
        Some("team-apply") => Some(apply(&args[1..])),
        Some("team-list") => Some(list(&args[1..])),
        Some("agent-scaffold") => Some(super::scaffold::run(&args[1..])),
        _ => None,
    }
}

/// 变更单顶层：`{ "ops": [ ... ] }`。
#[derive(Deserialize)]
struct SpecFile {
    ops: Vec<Op>,
}

/// 变更单里的一条操作。camelCase 与前端契约（SubAgentSpec）一致。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Op {
    op: String,
    name: Option<String>,
    kind: Option<String>,
    path: Option<String>,
    desc: Option<String>,
    team: Option<String>,
    model: Option<String>,
    #[serde(default)]
    skills: Option<Vec<String>>,
    #[serde(default)]
    mcp_servers: Option<Vec<String>>,
    prompt: Option<String>,
    workflow: Option<String>,
    /// `spec` op：团队规范全文（空串 = 清除）。
    spec: Option<String>,
    /// `materialize` op：是否清掉原初已离队的副本。
    prune: Option<bool>,
    /// `materialize` op：本次挑选的原初成员（覆盖团队花名册）。
    members: Option<Vec<String>>,
}

impl Op {
    /// 转注册表规格。kind 默认 codex（原生协作成员最常用；external 有 exe
    /// 校验，填错会在执行时报中文错误）。名字用 `to_spec` 而非 `into_spec`：
    /// 借用以保留 op 给失败报告用。
    fn to_spec(&self) -> crate::registry::AgentSpec {
        crate::registry::AgentSpec {
            path: self.path.clone().unwrap_or_default(),
            desc: self.desc.clone().unwrap_or_default(),
            kind: crate::registry::AgentKind::parse(self.kind.as_deref().unwrap_or("codex")),
            team: self.team.clone(),
            model: self.model.clone(),
            skills: self.skills.clone().unwrap_or_default(),
            mcp_servers: self.mcp_servers.clone().unwrap_or_default(),
            prompt: self.prompt.clone(),
            // 副本标记只由 materialize 写入：变更单里的 upsert 一律视为原初成员。
            derived_from: None,
        }
    }
}

/// `team-apply <spec.json> [--out report.json]`：按序执行变更单。
/// 单条失败不中断后续（改一条就能重跑，upsert 幂等），汇总三态。
fn apply(args: &[String]) -> i32 {
    let (positional, out) = split_out(args);
    let Some(spec_path) = positional.first() else {
        let msg = "用法：aigoat team-apply <spec.json> [--out report.json]";
        return finish(&error_report(msg), out.as_deref());
    };
    let text = match std::fs::read_to_string(spec_path) {
        Ok(mut text) => {
            // 容忍 BOM：PowerShell 5 等写 UTF-8 带 BOM，serde_json 不认。
            if text.starts_with('\u{feff}') {
                text.remove(0);
            }
            text
        }
        Err(err) => {
            let msg = format!("读不了变更单 {spec_path}：{err}");
            return finish(&error_report(msg), out.as_deref());
        }
    };
    let spec: SpecFile = match serde_json::from_str(&text) {
        Ok(spec) => spec,
        Err(err) => {
            let msg = format!("变更单 JSON 解析失败：{err}");
            return finish(&error_report(msg), out.as_deref());
        }
    };

    let mut applied = Vec::new();
    let mut failed = Vec::new();
    for (index, op) in spec.ops.iter().enumerate() {
        match exec_one(op) {
            Ok(message) => applied.push(json!({ "message": message })),
            Err(error) => failed.push(json!({
                "index": index, "op": op.op, "name": op.name, "error": error,
            })),
        }
    }
    let status = if failed.is_empty() {
        "ok"
    } else if applied.is_empty() {
        "error"
    } else {
        "partial"
    };
    let total = spec.ops.len();
    finish(
        &json!({
            "status": status,
            "message": format!("共 {total} 条：成功 {}，失败 {}", applied.len(), failed.len()),
            "data": { "applied": applied, "failed": failed, "teams": crate::registry::teams() },
            "error": Value::Null,
        }),
        out.as_deref(),
    )
}

/// 执行单条 op，返回给报告看的结果语。
fn exec_one(op: &Op) -> Result<String, String> {
    match op.op.as_str() {
        "upsert" => {
            let name = op.name.clone().ok_or("upsert 缺 name")?;
            crate::registry::upsert(&name, &op.to_spec())?;
            Ok(format!("已登记/更新成员 {name}"))
        }
        "remove" => {
            let name = op.name.clone().ok_or("remove 缺 name")?;
            crate::registry::remove(&name)?;
            Ok(format!("已注销成员 {name}"))
        }
        "workflow" => {
            let team = op.team.clone().ok_or("workflow 缺 team")?;
            crate::registry::set_team_workflow(&team, op.workflow.as_deref().unwrap_or(""))?;
            Ok(format!("已更新团队 {team} 的工作流"))
        }
        "spec" => {
            let team = op.team.clone().ok_or("spec 缺 team")?;
            crate::registry::set_team_spec(&team, op.spec.as_deref().unwrap_or(""))?;
            Ok(format!("已更新团队 {team} 的规范"))
        }
        "materialize" => {
            let team = op.team.clone().ok_or("materialize 缺 team")?;
            let data = super::materialize::materialize(
                &team,
                op.members.as_deref(),
                op.prune.unwrap_or(false),
            )?;
            let count = data["created"].as_array().map(Vec::len).unwrap_or(0);
            Ok(format!("已按编制组建团队 {team}：{count} 个副本"))
        }
        other => Err(format!(
            "未知 op：{other}（支持 upsert/remove/workflow/spec/materialize）"
        )),
    }
}

/// `team-list [--out report.json]`：成员与团队现状（只读）。
fn list(args: &[String]) -> i32 {
    let (_, out) = split_out(args);
    finish(
        &json!({
            "status": "ok",
            "data": { "rows": crate::registry::rows(), "teams": crate::registry::teams() },
            "error": Value::Null,
        }),
        out.as_deref(),
    )
}
