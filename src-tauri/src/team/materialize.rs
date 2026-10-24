//! 团队编制：从人才池**挑人**，为团队生成副本，原初成员不受影响。
//!
//! 副本名 `团队/成员`，是注册表里一条独立成员：
//! - 继承原初的 kind / path / model / skills / mcpServers
//! - `team` = 该团队，`derived_from` = 原初名
//! - `prompt` = 原初提示词 + 团队规范 + 团队流程
//!
//! **原初成员零改动**：它不"进团队"、不被消耗，多个团队可以同时挑中同一个人。
//! 团队用 `roster` 记住挑了谁；重跑幂等（同名覆盖），`prune` 清掉已不在
//! 花名册里的副本。

use serde_json::{json, Value};

/// 按花名册特化一个团队。返回 `{ team, roster, created, pruned }`。
///
/// `members`：本次挑选的原初成员（会写入并覆盖花名册）；`None` = 沿用
/// 已存花名册，花名册也为空时退化为"已在该团队里的原初成员"（旧用法）。
pub fn materialize(team: &str, members: Option<&[String]>, prune: bool) -> Result<Value, String> {
    let team = team.trim();
    if team.is_empty() {
        return Err("团队名不能为空".into());
    }
    let mut registry = crate::registry::load();
    let stored = registry
        .teams
        .get(team)
        .map(|meta| meta.roster.clone())
        .unwrap_or_default();
    let roster = match members {
        Some(list) => dedupe(list),
        None if !stored.is_empty() => stored,
        // 旧用法：没花名册时，把已经编在该团队里的原初成员当作编制。
        None => registry
            .agents
            .iter()
            .filter(|(_, entry)| {
                entry.team.as_deref() == Some(team) && entry.derived_from.is_none()
            })
            .map(|(name, _)| name.clone())
            .collect(),
    };
    // 显式传空数组 = 清空编制（合法操作）；完全没得挑才是错误。
    if roster.is_empty() && members.is_none() {
        return Err(format!("团队 {team} 还没有编制：先用 members 挑选现有成员"));
    }

    // 挑人只能从**人员池**里挑：池 = 未编队的原初成员。
    // - 副本（`团队/成员`）是别的团队的员工，不能二次挑选；
    // - 已属于某团队的原初成员也不行——那是"别的团队的人"，不太可能既在
    //   池里又在队里。要复用就先把它移出原团队（upsert team 为空）。
    for name in &roster {
        match registry.agents.get(name) {
            None => return Err(format!("未登记的成员：{name}")),
            Some(entry) if entry.derived_from.is_some() => {
                return Err(format!(
                    "{name} 是团队副本（{} 的员工），不能再次挑选",
                    entry.team.as_deref().unwrap_or("其它")
                ))
            }
            Some(entry) if entry.team.as_deref().is_some_and(|t| !t.trim().is_empty()) => {
                let team_name = entry.team.as_deref().unwrap_or_default();
                return Err(format!(
                    "{name} 已在团队「{team_name}」里；只能从人员池挑人（先把 TA 移出原团队）"
                ));
            }
            Some(_) => {}
        }
    }
    // 显式挑选/清空才落盘花名册：沿用已存值时不必重复写。
    if members.is_some() {
        let mut meta = registry.teams.remove(team).unwrap_or_default();
        meta.roster = roster.clone();
        let has_copies = registry
            .agents
            .values()
            .any(|entry| entry.team.as_deref() == Some(team) && entry.derived_from.is_some());
        // 花名册、流程、规范、副本全空：团队没有存在意义了。
        if !(meta.roster.is_empty()
            && meta.workflow.is_empty()
            && meta.spec.is_empty()
            && !has_copies)
        {
            registry.teams.insert(team.to_string(), meta);
        }
        crate::registry::save(&registry)?;
    }

    let meta = registry.teams.get(team).cloned().unwrap_or_default();
    let spec = meta.spec.trim().to_string();
    let workflow = meta.workflow.trim().to_string();

    let mut created = Vec::new();
    for base_name in &roster {
        let Some(entry) = registry.agents.get(base_name).cloned() else {
            continue;
        };
        let derived_name = format!("{team}/{base_name}");
        let input = crate::registry::AgentSpec {
            path: entry.path.clone(),
            desc: compose_desc(&entry.desc, team),
            kind: entry.kind,
            team: Some(team.to_string()),
            model: entry.model.clone(),
            skills: entry.skills.clone(),
            mcp_servers: entry.mcp_servers.clone(),
            prompt: Some(compose_prompt(
                entry.prompt.as_deref(),
                team,
                &spec,
                &workflow,
            )),
            derived_from: Some(base_name.clone()),
        };
        crate::registry::upsert(&derived_name, &input)?;
        created.push(derived_name);
    }

    let mut pruned = Vec::new();
    if prune {
        let keep: std::collections::BTreeSet<String> =
            roster.iter().map(|name| format!("{team}/{name}")).collect();
        let orphans: Vec<String> = registry
            .agents
            .iter()
            .filter(|(name, entry)| {
                entry.team.as_deref() == Some(team)
                    && entry.derived_from.is_some()
                    && !keep.contains(*name)
            })
            .map(|(name, _)| name.clone())
            .collect();
        for name in orphans {
            crate::registry::remove(&name)?;
            pruned.push(name);
        }
    }

    Ok(json!({ "team": team, "roster": roster, "created": created, "pruned": pruned }))
}

/// 去空、去重、保序：花名册是用户/模型给的名单，顺序即意图。
fn dedupe(names: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for name in names {
        let name = name.trim();
        if !name.is_empty() && !out.iter().any(|seen| seen == name) {
            out.push(name.to_string());
        }
    }
    out
}

/// 副本描述：原描述 + 特化标注（界面与派单说明共用这一句）。
fn compose_desc(desc: &str, team: &str) -> String {
    let desc = desc.trim();
    if desc.is_empty() {
        format!("{team} 特化成员")
    } else {
        format!("{desc}（{team} 特化）")
    }
}

/// 副本提示词：原角色 + 团队规范 + 团队流程，顺序固定便于人工核对。
fn compose_prompt(base: Option<&str>, team: &str, spec: &str, workflow: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(text) = base.map(str::trim).filter(|text| !text.is_empty()) {
        parts.push(text.to_string());
    }
    if !spec.is_empty() {
        parts.push(format!("## 团队规范（{team}）\n{spec}"));
    }
    if !workflow.is_empty() {
        parts.push(format!("## 团队流程（{team}）\n{workflow}"));
    }
    if parts.is_empty() {
        format!("你是「{team}」的成员，按主 agent 的派单完成任务。")
    } else {
        parts.join("\n\n")
    }
}

/// 测试在单独文件里（本文件已接近 200 行上限）。
#[cfg(test)]
#[path = "materialize_tests.rs"]
mod tests;
