use serde::Serialize;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const FETCH_TIMEOUT: Duration = Duration::from_secs(12);
const NETWORK_GIT_TIMEOUT: Duration = Duration::from_secs(45);

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BranchInfo {
    name: String,
    last_commit_relative: String,
    last_commit_unix: i64,
}

fn apply_noninteractive_git_env(cmd: &mut Command) {
    // Credential helpers / prompts must never block the UI forever.
    cmd.env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .stdin(Stdio::null());
}

fn run_git(repo: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).args(args);
    apply_noninteractive_git_env(&mut cmd);

    let output = cmd
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

/// Runs git with a hard timeout. Used for network ops (pull/push) so auth or
/// hung remotes cannot freeze a worker indefinitely.
fn run_git_timeout(repo: &str, args: &[&str], timeout: Duration) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(repo)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_noninteractive_git_env(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|error| format!("failed to run git: {error}"))?;

    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture git stdout".to_string())?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture git stderr".to_string())?;

    let stdout_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout_pipe.read_to_end(&mut buf);
        buf
    });
    let stderr_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr_pipe.read_to_end(&mut buf);
        buf
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "git timed out after {}s",
                    timeout.as_secs()
                ));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(error) => return Err(format!("failed to wait for git: {error}")),
        }
    };

    let stdout = String::from_utf8_lossy(&stdout_handle.join().unwrap_or_default())
        .trim()
        .to_string();
    let stderr = String::from_utf8_lossy(&stderr_handle.join().unwrap_or_default())
        .trim()
        .to_string();

    if status.success() {
        Ok(stdout)
    } else {
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

fn worker_panic_state(folder: &str) -> RepositoryState {
    RepositoryState {
        folder: folder.to_string(),
        repo: repo_name(folder),
        branch: None,
        status: StatusLabel::Error,
        remote: RemoteLabel::Unknown,
        is_dirty: false,
        has_conflicts: false,
        is_detached: false,
        error: Some("internal error".to_string()),
    }
}

fn parse_remote(repo: &str) -> RemoteLabel {
    match run_git(
        repo,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    ) {
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

/// Best-effort remote ref refresh. Failures (offline, auth, timeout) are
/// ignored so callers can still inspect local state.
fn fetch_remote(repo: &str) {
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(repo)
        .args(["fetch", "--prune", "--quiet"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    apply_noninteractive_git_env(&mut cmd);

    let Ok(mut child) = cmd.spawn() else {
        return;
    };

    let deadline = Instant::now() + FETCH_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return,
        }
    }
}

const BRANCH_FORMAT: &str = "%(refname:short)|%(committerdate:relative)|%(committerdate:unix)";
const RECENT_BRANCH_CAP: usize = 20;

/// Parses `for-each-ref` output using BRANCH_FORMAT into BranchInfo, stripping
/// an optional remote prefix (e.g. "origin/") from the ref name and skipping
/// symbolic refs like "origin/HEAD".
fn parse_branch_lines(output: &str, strip_prefix: Option<&str>) -> Vec<BranchInfo> {
    let mut seen = std::collections::HashSet::new();
    let mut branches = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(3, '|');
        let raw_name = parts.next().unwrap_or("").trim();
        let relative = parts.next().unwrap_or("").trim().to_string();
        let unix = parts
            .next()
            .unwrap_or("0")
            .trim()
            .parse::<i64>()
            .unwrap_or(0);

        let name = match strip_prefix {
            Some(prefix) => raw_name
                .strip_prefix(prefix)
                .unwrap_or(raw_name)
                .to_string(),
            None => raw_name.to_string(),
        };

        if name.is_empty() || name == "HEAD" {
            continue;
        }
        if !seen.insert(name.clone()) {
            continue;
        }

        branches.push(BranchInfo {
            name,
            last_commit_relative: relative,
            last_commit_unix: unix,
        });
    }

    branches
}

fn list_recent_branches_sync(folder: &str) -> Result<Vec<BranchInfo>, String> {
    let remote_output = run_git(
        folder,
        &[
            "for-each-ref",
            "refs/remotes/origin",
            "--sort=-committerdate",
            &format!("--format={BRANCH_FORMAT}"),
        ],
    )
    .unwrap_or_default();

    let mut branches = parse_branch_lines(&remote_output, Some("origin/"));

    if branches.is_empty() {
        let local_output = run_git(
            folder,
            &[
                "for-each-ref",
                "refs/heads",
                "--sort=-committerdate",
                &format!("--format={BRANCH_FORMAT}"),
            ],
        )?;
        branches = parse_branch_lines(&local_output, None);
    }

    branches.truncate(RECENT_BRANCH_CAP);
    Ok(branches)
}

fn search_remote_branches_sync(folder: &str, query: &str) -> Result<Vec<BranchInfo>, String> {
    // Best-effort refresh of the remote ref cache; offline should still be
    // able to search whatever refs are already known locally.
    fetch_remote(folder);

    let remote_output = run_git(
        folder,
        &[
            "for-each-ref",
            "refs/remotes/origin",
            "--sort=-committerdate",
            &format!("--format={BRANCH_FORMAT}"),
        ],
    )
    .unwrap_or_default();

    let mut branches = parse_branch_lines(&remote_output, Some("origin/"));

    if branches.is_empty() {
        let local_output = run_git(
            folder,
            &[
                "for-each-ref",
                "refs/heads",
                "--sort=-committerdate",
                &format!("--format={BRANCH_FORMAT}"),
            ],
        )
        .unwrap_or_default();
        branches = parse_branch_lines(&local_output, None);
    }

    let needle = query.to_lowercase();
    Ok(branches
        .into_iter()
        .filter(|branch| branch.name.to_lowercase().contains(&needle))
        .collect())
}

fn pull_repository_sync(folder: &str) -> ActionResult {
    match run_git_timeout(folder, &["pull", "--ff-only"], NETWORK_GIT_TIMEOUT) {
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

fn push_repository_sync(folder: &str) -> ActionResult {
    match run_git_timeout(folder, &["push"], NETWORK_GIT_TIMEOUT) {
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

fn switch_repository_sync(folder: &str, branch: &str) -> ActionResult {
    match run_git(folder, &["switch", branch]) {
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

fn reveal_in_finder_sync(folder: &str) -> ActionResult {
    match Command::new("open").args(["-R", folder]).status() {
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

#[tauri::command]
async fn inspect_repository(folder: String) -> RepositoryState {
    let folder_for_err = folder.clone();
    tauri::async_runtime::spawn_blocking(move || inspect(&folder))
        .await
        .unwrap_or_else(|_| worker_panic_state(&folder_for_err))
}

#[tauri::command]
async fn refresh_repository(folder: String) -> RepositoryState {
    let folder_for_err = folder.clone();
    tauri::async_runtime::spawn_blocking(move || {
        fetch_remote(&folder);
        inspect(&folder)
    })
    .await
    .unwrap_or_else(|_| worker_panic_state(&folder_for_err))
}

#[tauri::command]
async fn list_recent_branches(folder: String) -> Result<Vec<BranchInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || list_recent_branches_sync(&folder))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn search_remote_branches(folder: String, query: String) -> Result<Vec<BranchInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || search_remote_branches_sync(&folder, &query))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn pull_repository(folder: String) -> ActionResult {
    tauri::async_runtime::spawn_blocking(move || pull_repository_sync(&folder))
        .await
        .unwrap_or_else(|error| ActionResult {
            ok: false,
            message: error.to_string(),
        })
}

#[tauri::command]
async fn push_repository(folder: String) -> ActionResult {
    tauri::async_runtime::spawn_blocking(move || push_repository_sync(&folder))
        .await
        .unwrap_or_else(|error| ActionResult {
            ok: false,
            message: error.to_string(),
        })
}

#[tauri::command]
async fn switch_repository(folder: String, branch: String) -> ActionResult {
    tauri::async_runtime::spawn_blocking(move || switch_repository_sync(&folder, &branch))
        .await
        .unwrap_or_else(|error| ActionResult {
            ok: false,
            message: error.to_string(),
        })
}

#[tauri::command]
async fn reveal_in_finder(folder: String) -> ActionResult {
    tauri::async_runtime::spawn_blocking(move || reveal_in_finder_sync(&folder))
        .await
        .unwrap_or_else(|error| ActionResult {
            ok: false,
            message: error.to_string(),
        })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            inspect_repository,
            refresh_repository,
            list_recent_branches,
            search_remote_branches,
            pull_repository,
            push_repository,
            switch_repository,
            reveal_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hamgit");
}
