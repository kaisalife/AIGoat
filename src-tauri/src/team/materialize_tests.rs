//! `materialize` 的纯函数单测。
//!
//! 单独成文件：`materialize.rs` 本身已接近 200 行上限，测试占 50 行会把
//! 生产代码挤出去。用 `#[path]` 挂回同一模块树，`super::` 仍可访问私有项。

use super::{compose_desc, compose_prompt, dedupe};

#[test]
fn 花名册去空去重保序() {
    let picked = vec![
        " reviewer ".to_string(),
        String::new(),
        "builder".to_string(),
        "reviewer".to_string(),
    ];
    assert_eq!(dedupe(&picked), vec!["reviewer", "builder"]);
}

#[test]
fn 提示词按原角色_规范_流程顺序拼接() {
    let text = compose_prompt(
        Some("你是评审员"),
        "游戏组",
        "命名用蛇形",
        "1. 策划\n2. 美术",
    );
    assert_eq!(
        text,
        "你是评审员\n\n## 团队规范（游戏组）\n命名用蛇形\n\n## 团队流程（游戏组）\n1. 策划\n2. 美术"
    );
}

#[test]
fn 空原角色与空团队信息时给兜底说明() {
    assert_eq!(
        compose_prompt(None, "游戏组", "", ""),
        "你是「游戏组」的成员，按主 agent 的派单完成任务。"
    );
    // 只有规范也成立：不留下空的原角色段。
    assert_eq!(
        compose_prompt(Some("  "), "游戏组", "只写规范", ""),
        "## 团队规范（游戏组）\n只写规范"
    );
}

#[test]
fn 副本描述带团队标注() {
    assert_eq!(
        compose_desc("评审素材", "游戏组"),
        "评审素材（游戏组 特化）"
    );
    assert_eq!(compose_desc("", "游戏组"), "游戏组 特化成员");
}
