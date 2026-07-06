use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryState {
    folder: String,
    repo: String,
    branch: Option<String>,
    status: StatusLabel,
    remote: RemoteLabel,
    is_dirty: bool,
    has_conflicts: bool,
    is_detached: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
enum StatusLabel {
    Clean,
    Dirty,
    Conflict,
    Detached,
    Error,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum RemoteLabel {
    UpToDate,
    Ahead(u32),
    Behind(u32),
    AheadBehind { ahead: u32, behind: u32 },
    NoUpstream,
    Unknown,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActionResult {
    ok: bool,
    message: String,
}

fn run_git(repo: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|error| format!("failed to run git: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn repo_name(folder: &str) -> String {
    Path::new(folder)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(folder)
        .to_string()
}

fn parse_remote(repo: &str) -> RemoteLabel {
    match run_git(repo, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]) {
        Ok(output) => {
            let mut parts = output.split_whitespace();
            let ahead = parts.next().and_then(|value| value.parse::<u32>().ok());
            let behind = parts.next().and_then(|value| value.parse::<u32>().ok());

            match (ahead, behind) {
                (Some(0), Some(0)) => RemoteLabel::UpToDate,
                (Some(ahead), Some(0)) => RemoteLabel::Ahead(ahead),
                (Some(0), Some(behind)) => RemoteLabel::Behind(behind),
                (Some(ahead), Some(behind)) => RemoteLabel::AheadBehind { ahead, behind },
                _ => RemoteLabel::Unknown,
            }
        }
        Err(message) if message.contains("no upstream") || message.contains("no such ref") => {
            RemoteLabel::NoUpstream
        }
        Err(_) => RemoteLabel::Unknown,
    }
}

fn inspect(repo: &str) -> RepositoryState {
    if !Path::new(repo).is_dir() {
        return RepositoryState {
            folder: repo.to_string(),
            repo: repo_name(repo),
            branch: None,
            status: StatusLabel::Error,
            remote: RemoteLabel::Unknown,
            is_dirty: false,
            has_conflicts: false,
            is_detached: false,
            error: Some("folder does not exist".to_string()),
        };
    }

    if let Err(error) = run_git(repo, &["rev-parse", "--show-toplevel"]) {
        return RepositoryState {
            folder: repo.to_string(),
            repo: repo_name(repo),
            branch: None,
            status: StatusLabel::Error,
            remote: RemoteLabel::Unknown,
            is_dirty: false,
            has_conflicts: false,
            is_detached: false,
            error: Some(error),
        };
    }

    let branch = run_git(repo, &["branch", "--show-current"]).unwrap_or_default();
    let is_detached = branch.is_empty();
    let status_output = run_git(repo, &["status", "--porcelain"]);

    match status_output {
        Ok(output) => {
            let has_conflicts = output.lines().any(|line| {
                matches!(
                    line.get(0..2),
                    Some("UU" | "AA" | "DD" | "AU" | "UA" | "DU" | "UD")
                )
            });
            let is_dirty = !output.is_empty();
            let status = if has_conflicts {
                StatusLabel::Conflict
            } else if is_detached {
                StatusLabel::Detached
            } else if is_dirty {
                StatusLabel::Dirty
            } else {
                StatusLabel::Clean
            };

            RepositoryState {
                folder: repo.to_string(),
                repo: repo_name(repo),
                branch: if is_detached { None } else { Some(branch) },
                status,
                remote: parse_remote(repo),
                is_dirty,
                has_conflicts,
                is_detached,
                error: None,
            }
        }
        Err(error) => RepositoryState {
            folder: repo.to_string(),
            repo: repo_name(repo),
            branch: if is_detached { None } else { Some(branch) },
            status: StatusLabel::Error,
            remote: RemoteLabel::Unknown,
            is_dirty: false,
            has_conflicts: false,
            is_detached,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn inspect_repository(folder: String) -> RepositoryState {
    inspect(&folder)
}

#[tauri::command]
fn list_branches(folder: String) -> Result<Vec<String>, String> {
    let output = run_git(
        &folder,
        &["for-each-ref", "refs/heads", "--format=%(refname:short)"],
    )?;
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect())
}

#[tauri::command]
fn pull_repository(folder: String) -> ActionResult {
    match run_git(&folder, &["pull", "--ff-only"]) {
        Ok(output) => ActionResult {
            ok: true,
            message: if output.is_empty() {
                "Pulled".to_string()
            } else {
                output
            },
        },
        Err(error) => ActionResult {
            ok: false,
            message: error,
        },
    }
}

#[tauri::command]
fn push_repository(folder: String) -> ActionResult {
    match run_git(&folder, &["push"]) {
        Ok(output) => ActionResult {
            ok: true,
            message: if output.is_empty() {
                "Pushed".to_string()
            } else {
                output
            },
        },
        Err(error) => ActionResult {
            ok: false,
            message: error,
        },
    }
}

#[tauri::command]
fn switch_repository(folder: String, branch: String) -> ActionResult {
    match run_git(&folder, &["switch", &branch]) {
        Ok(output) => ActionResult {
            ok: true,
            message: if output.is_empty() {
                format!("Switched to {branch}")
            } else {
                output
            },
        },
        Err(error) => ActionResult {
            ok: false,
            message: error,
        },
    }
}

#[tauri::command]
fn open_in_vscode(folder: String) -> ActionResult {
    let result = Command::new("code").arg(&folder).status().or_else(|_| {
        Command::new("open")
            .args(["-a", "Visual Studio Code", &folder])
            .status()
    });

    match result {
        Ok(status) if status.success() => ActionResult {
            ok: true,
            message: "Opened in VS Code".to_string(),
        },
        Ok(status) => ActionResult {
            ok: false,
            message: format!("VS Code exited with status {status}"),
        },
        Err(error) => ActionResult {
            ok: false,
            message: error.to_string(),
        },
    }
}

#[tauri::command]
fn reveal_in_finder(folder: String) -> ActionResult {
    match Command::new("open").args(["-R", &folder]).status() {
        Ok(status) if status.success() => ActionResult {
            ok: true,
            message: "Revealed in Finder".to_string(),
        },
        Ok(status) => ActionResult {
            ok: false,
            message: format!("Finder exited with status {status}"),
        },
        Err(error) => ActionResult {
            ok: false,
            message: error.to_string(),
        },
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            inspect_repository,
            list_branches,
            pull_repository,
            push_repository,
            switch_repository,
            open_in_vscode,
            reveal_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hamgit");
}
