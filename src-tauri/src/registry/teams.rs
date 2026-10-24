//! 团队级操作：解散团队。
//!
//! 单独成文件：`registry/mod.rs` 是存量超长文件（>200 行），团队级的新增
//! 操作不再往里堆。

use super::{load, remove, save, Registry};

/// 解散团队（团队级"删除"）。
///
/// 语义按"人不可被消耗"定：**副本（团队成员）删掉，原初成员回到人员池**
/// （`team` 清空，能力与提示词一个字段都不动）。codex 原生副本的角色文件
/// 由 [`remove`] 顺带清理。
pub fn remove_team(team: &str) -> Result<Registry, String> {
    let team = team.trim();
    if team.is_empty() {
        return Err("团队名不能为空".into());
    }
    let mut registry = load();
    let had_meta = registry.teams.remove(team).is_some();
    let had_members = registry
        .agents
        .values()
        .any(|entry| entry.team.as_deref() == Some(team));
    if !had_meta && !had_members {
        return Err(format!("没有这个团队：{team}"));
    }
    // 原初成员只是"退出这个团队"，不是被删除。
    for entry in registry.agents.values_mut() {
        if entry.team.as_deref() == Some(team) && entry.derived_from.is_none() {
            entry.team = None;
        }
    }
    let copies: Vec<String> = registry
        .agents
        .iter()
        .filter(|(_, entry)| entry.team.as_deref() == Some(team) && entry.derived_from.is_some())
        .map(|(name, _)| name.clone())
        .collect();
    save(&registry)?;
    for name in copies {
        remove(&name)?;
    }
    Ok(load())
}
