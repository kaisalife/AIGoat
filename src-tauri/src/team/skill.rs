//! 默认技能的安装（`team-builder` / `external-employee-create`）。
//!
//! codex 的技能发现根是 `<CODEX_HOME>/skills/`（每个技能一个目录，内含
//! `SKILL.md`）。`.system` 子目录是 codex 内置技能区，每次启动都会被
//! codex 清空重写，**不能放那里**。
//!
//! 这些都是 AIGoat 托管名：用户若手放同名技能会被覆盖——模板升级与 exe
//! 挪位都要靠重写来纠正（见下）。
//!
//! 安装是**幂等**的：比对「渲染后」的内容（占位符已替换成当前 exe 绝对
//! 路径），一致就跳过。这样模板升级、exe 挪位置两种变化都会触发重写，
//! 平时启动不动文件（mtime 不变，codex 的技能 watcher 不会白响一次）。

use crate::cache;

/// 技能清单：目录名 → 模板。`{{AIGOAT_EXE}}` 由 [`install_all`] 替换。
///
/// `team-builder` 用早期单技能布局（`assets/SKILL.md`），保留原位不搬——
/// 搬动只会让历史路径失效，没有收益。
const SKILLS: &[(&str, &str)] = &[
    ("team-builder", include_str!("assets/SKILL.md")),
    (
        "external-employee-create",
        include_str!("assets/skills/external-employee-create/SKILL.md"),
    ),
];

/// 历史托管名：改名后清掉旧目录，避免 codex 里同时出现新旧两个技能。
const RETIRED: &[&str] = &["agent-importer"];

/// 启动时调用（GUI 与 CLI 模式都无害）。失败只打日志：技能装不上最多
/// 让 codex 少一个技能，不该拦着应用起来。
pub fn install_all() {
    let Ok(exe) = std::env::current_exe() else {
        eprintln!("[team] 无法定位本程序路径，跳过技能安装");
        return;
    };
    for dir in RETIRED {
        let _ = std::fs::remove_dir_all(cache::codex_home().join("skills").join(dir));
    }
    let exe = exe.to_string_lossy();
    for (dir, template) in SKILLS {
        let rendered = template.replace("{{AIGOAT_EXE}}", &exe);
        let path = cache::codex_home()
            .join("skills")
            .join(dir)
            .join("SKILL.md");
        if std::fs::read_to_string(&path).is_ok_and(|text| text == rendered) {
            continue;
        }
        if let Err(err) = crate::settings::config::write_text(&path, &rendered) {
            eprintln!("[team] 技能写入失败（{}）：{err}", path.display());
        }
    }
}
