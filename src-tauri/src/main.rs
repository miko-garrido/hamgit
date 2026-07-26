use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const FETCH_TIMEOUT: Duration = Duration::from_secs(30);
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

fn ssh_command_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn resolve_ssh_command(repo: &str) -> String {
    const BATCH: &str = "-oBatchMode=yes";

    if let Ok(existing) = std::env::var("GIT_SSH_COMMAND") {
        if existing.contains("BatchMode") {
            return existing;
        }
        return format!("{existing} {BATCH}");
    }

    if let Ok(cache) = ssh_command_cache().lock() {
        if let Some(cached) = cache.get(repo) {
            return cached.clone();
        }
    }

    // -C <repo> so local / worktree / includeIf-gitdir scopes all resolve.
    // Do not go through apply_noninteractive_git_env (would recurse).
    let resolved = if let Ok(output) = Command::new("git")
        .args(["-C", repo, "config", "--get", "core.sshCommand"])
        .stdin(Stdio::null())
        .output()
    {
        if output.status.success() {
            let configured = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !configured.is_empty() {
                if configured.contains("BatchMode") {
                    configured
                } else {
                    format!("{configured} {BATCH}")
                }
            } else {
                format!("ssh {BATCH}")
            }
        } else {
            format!("ssh {BATCH}")
        }
    } else {
        format!("ssh {BATCH}")
    };

    if let Ok(mut cache) = ssh_command_cache().lock() {
        cache.insert(repo.to_string(), resolved.clone());
    }
    resolved
}

fn apply_noninteractive_git_env(cmd: &mut Command, repo: &str) {
    // Never block on credential / SSH prompts — fail fast instead.
    // Preserve any user GIT_SSH_COMMAND / core.sshCommand; only add BatchMode.
    cmd.env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS_REQUIRE", "never")
        .env("GIT_SSH_COMMAND", resolve_ssh_command(repo))
        .stdin(Stdio::null());
}

#[cfg(unix)]
fn put_in_own_process_group(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    // So timeout can kill git AND helpers (ssh, git-remote-https, …).
    unsafe {
        cmd.pre_exec(|| {
            if libc::setpgid(0, 0) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
}

#[cfg(not(unix))]
fn put_in_own_process_group(_cmd: &mut Command) {}

fn kill_git_tree(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        // Negative pid → process group (set via setpgid in put_in_own_process_group).
        unsafe {
            let _ = libc::kill(-pid, libc::SIGTERM);
        }
        let grace = Instant::now() + Duration::from_secs(3);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) if Instant::now() >= grace => break,
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                Err(_) => break,
            }
        }
        unsafe {
            let _ = libc::kill(-pid, libc::SIGKILL);
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Join a reader thread without blocking forever if a grandchild still holds the pipe.
fn join_reader_bounded(
    handle: std::thread::JoinHandle<Vec<u8>>,
    deadline: Instant,
) -> Vec<u8> {
    loop {
        if handle.is_finished() {
            return handle.join().unwrap_or_default();
        }
        if Instant::now() >= deadline {
            // Dropping JoinHandle detaches; prefer an empty buffer over hanging.
            drop(handle);
            return Vec::new();
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn run_git(repo: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).args(args);
    apply_noninteractive_git_env(&mut cmd, repo);

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

/// Runs git with a hard timeout. Used for network / potentially-hanging ops.
fn run_git_timeout(repo: &str, args: &[&str], timeout: Duration) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(repo)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_noninteractive_git_env(&mut cmd, repo);
    put_in_own_process_group(&mut cmd);

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
                kill_git_tree(&mut child);
                // Bound pipe joins so orphaned helpers can't freeze the worker.
                let join_deadline = Instant::now() + Duration::from_millis(500);
                let _ = join_reader_bounded(stdout_handle, join_deadline);
                let _ = join_reader_bounded(stderr_handle, join_deadline);
                return Err(format!("git timed out after {}s", timeout.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(error) => return Err(format!("failed to wait for git: {error}")),
        }
    };

    let join_deadline = Instant::now() + Duration::from_secs(2);
    let stdout = String::from_utf8_lossy(&join_reader_bounded(stdout_handle, join_deadline))
        .trim()
        .to_string();
    let stderr = String::from_utf8_lossy(&join_reader_bounded(stderr_handle, join_deadline))
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

/// Best-effort remote ref refresh. Returns false on timeout / spawn failure so
/// callers can avoid presenting stale ahead/behind as current.
fn fetch_remote(repo: &str) -> bool {
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(repo)
        .args(["fetch", "--prune", "--quiet"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    apply_noninteractive_git_env(&mut cmd, repo);
    put_in_own_process_group(&mut cmd);

    let Ok(mut child) = cmd.spawn() else {
        return false;
    };

    let deadline = Instant::now() + FETCH_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if Instant::now() >= deadline => {
                kill_git_tree(&mut child);
                return false;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return false,
        }
    }
}

/// NUL-delimited so branch names containing `|` parse correctly.
const BRANCH_FORMAT: &str =
    "%(refname:short)%00%(committerdate:relative)%00%(committerdate:unix)";

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
        let mut parts = line.splitn(3, '\0');
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

        if name.is_empty() || name == "HEAD" || name == "origin" {
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

    // Return the full remote-tracking set so the palette can filter every
    // known origin branch while typing. The UI caps the empty-query view.
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
    // Hard-timeout only the network fetch. Local merge must not be SIGKILL'd
    // mid-checkout (leaves index.lock / half-swapped trees).
    if let Err(error) = run_git_timeout(folder, &["fetch", "--prune"], NETWORK_GIT_TIMEOUT) {
        return ActionResult {
            ok: false,
            message: error,
        };
    }
    match run_git(folder, &["merge", "--ff-only", "@{upstream}"]) {
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
    // Local checkout — no hard kill (same index.lock / half-tree risk as merge).
    // `--` so branch names can't be parsed as options.
    match run_git(folder, &["switch", "--", branch]) {
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
        .unwrap_or_else(|error| {
            eprintln!("inspect_repository worker failed: {error}");
            worker_panic_state(&folder_for_err)
        })
}

#[tauri::command]
async fn refresh_repository(folder: String) -> RepositoryState {
    let folder_for_err = folder.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let fetched = fetch_remote(&folder);
        let mut state = inspect(&folder);
        if !fetched {
            // Don't present stale ahead/behind as if the fetch succeeded.
            state.remote = RemoteLabel::Unknown;
        }
        state
    })
    .await
    .unwrap_or_else(|error| {
        eprintln!("refresh_repository worker failed: {error}");
        worker_panic_state(&folder_for_err)
    })
}

#[tauri::command]
async fn list_recent_branches(folder: String) -> Result<Vec<BranchInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || list_recent_branches_sync(&folder))
        .await
        .map_err(|error| {
            eprintln!("list_recent_branches worker failed: {error}");
            error.to_string()
        })?
}

#[tauri::command]
async fn search_remote_branches(folder: String, query: String) -> Result<Vec<BranchInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || search_remote_branches_sync(&folder, &query))
        .await
        .map_err(|error| {
            eprintln!("search_remote_branches worker failed: {error}");
            error.to_string()
        })?
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_branch_lines_handles_pipe_in_name() {
        let output = format!(
            "feat|x{nul}1 day ago{nul}1700000000\nmain{nul}2 hours ago{nul}1700000001\n",
            nul = '\0'
        );
        let branches = parse_branch_lines(&output, None);
        assert_eq!(branches.len(), 2);
        assert_eq!(branches[0].name, "feat|x");
        assert_eq!(branches[0].last_commit_relative, "1 day ago");
        assert_eq!(branches[1].name, "main");
    }

    #[test]
    fn parse_branch_lines_strips_origin_and_skips_head() {
        // Real git emits %(refname:short) "origin" for refs/remotes/origin/HEAD.
        let output = format!(
            "origin{nul}7 minutes ago{nul}1\norigin/feature{nul}3d ago{nul}1\n",
            nul = '\0'
        );
        let branches = parse_branch_lines(&output, Some("origin/"));
        assert_eq!(branches.len(), 1);
        assert_eq!(branches[0].name, "feature");
    }
}
