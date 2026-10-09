// ===== HF SSE logs =====
async function connectServerLogs(type, preserve = false) {
    if (!activeRepoId) return showToast("Select a space first!");
    const token = getToken();
    if (!token) return showToast("Enter your HF Token first!");
    currentLogMode = (type === 'build') ? 'build' : 'run';
    $('serverLogsLabel').innerText = currentLogMode === 'build' ? 'Live Build Logs' : 'Live Runtime Logs';
    if (logStreamController) logStreamController.abort();
    const myController = new AbortController();
    logStreamController = myController;
    if (!preserve) clearServerLogs();
    else appendServerLogLine(`[System] ---- Switching to ${currentLogMode} logs ----`);
    appendServerLogLine(`[System] Connecting to live ${currentLogMode} logs...`);
    try {
        const response = await fetch(`https://huggingface.co/api/spaces/${activeRepoId}/logs/${currentLogMode}`, {
            headers: { ...authHeaders(token), 'Accept': 'text/event-stream' },
            signal: myController.signal
        });
        if (!response.ok) {
            if (response.status === 404) throw new Error("404_NOT_FOUND");
            if (response.status === 401 || response.status === 403) throw new Error("AUTH_ERROR");
            throw new Error(`HTTP Error ${response.status}`);
        }
        appendServerLogLine("[System] Connected successfully! Waiting for events...");
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) { appendServerLogLine("[System] Stream ended by server."); break; }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (let line of lines) {
                if (line.startsWith('data:')) {
                    let logText = line.substring(5).trim();
                    try {
                        const parsed = JSON.parse(logText);
                        if (typeof parsed === 'string') logText = parsed;
                        else if (parsed && parsed.data) logText = parsed.data;
                    } catch (e) {}
                    appendServerLogLine(logText);
                }
            }
        }
        if (currentLogMode === 'build' && logStreamController === myController) {
            appendServerLogLine("[System] Build complete — switching to Run logs...");
            setTimeout(() => { if (logStreamController === myController) connectServerLogs('run', true); }, 1200);
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            if (e.message.includes('404_NOT_FOUND')) {
                appendServerLogLine(`[System Error] 404 Not Found for "${currentLogMode}" logs.`);
                appendServerLogLine(`[Tip] The space hasn't produced that type of log yet.`);
                appendServerLogLine(`[Action] Try the other log type, or tap "Restart".`);
            } else if (e.message.includes('AUTH_ERROR')) {
                appendServerLogLine(`[System Error] Authentication failed (401/403).`);
                appendServerLogLine(`[Tip] Make sure the token has "write" access.`);
            } else {
                appendServerLogLine(`[System Error] Log stream disconnected: ${e.message}`);
            }
        }
    }
}
async function restartSpace() {
    if (!activeRepoId) return showToast("Select a space first!");
    const token = getToken();
    if (!await askConfirm("Are you sure you want to restart this space?")) return;
    showToast("Restarting space...");
    switchTab('serverlogs');
    appendServerLogLine("[System] Sending restart command...");
    try {
        const res = await fetch(`https://huggingface.co/api/spaces/${activeRepoId}/restart`, { method: 'POST', headers: authHeaders(token) });
        if (!res.ok) throw new Error("Restart API failed.");
        showToast("Space Restarted!");
        setTimeout(() => connectServerLogs('build'), 2500);
    } catch (e) { appendServerLogLine(`[System Error] Restart failed: ${e.message}`); }
}
function runIcon(r) {
    if (r.status !== 'completed') return ic('clock');
    const m = { success: 'check-circle', failure: 'x-circle', cancelled: 'slash', skipped: 'slash', timed_out: 'clock' };
    return ic(m[r.conclusion] || 'activity');
}
async function ghLoadRuns() {
    if (!activeRepoId) return showToast("Select a repo first!");
    if (!getToken()) return showToast("Enter your GitHub Token first!");
    $('serverLogsLabel').innerText = `Workflow Runs · ${activeBranch}`;
    clearServerLogs();
    appendServerLogLine('[System] Loading workflow runs...');
    try {
        const j = await ghJson(`/repos/${activeRepoId}/actions/runs?per_page=20&branch=${encodeURIComponent(activeBranch)}`);
        clearServerLogs();
        const runs = j.workflow_runs || [];
        if (!runs.length) { appendServerLogLine('[System] No workflow runs on this branch yet.'); return; }
        lastRunId = runs[0].id;
        const box = $('serverLogsBox');
        runs.forEach(r => {
            const p = document.createElement('div');
            p.className = 'log-line run-row border-b border-[#30363d]/50 py-2 mb-1 break-words';
            colorizeLogLine(p, r.conclusion === 'failure' ? 'fail' : (r.status !== 'completed' ? 'warn' : 'ok'));
            p.innerHTML = `<span class="flex items-center gap-2">${runIcon(r)}<span class="min-w-0 break-words">#${r.run_number} ${esc(r.display_title || r.name)} · ${esc(r.event)} · ${r.head_sha.slice(0, 7)}</span></span>`;
            p.onclick = () => ghShowRunLogs(r.id);
            box.appendChild(p);
        });
        appendServerLogLine('[System] Tap a run to open its jobs and logs.');
    } catch (e) { appendServerLogLine(`[System Error] ${e.message}`); }
}
async function ghShowLatestLogs() {
    if (!activeRepoId) return showToast("Select a repo first!");
    try {
        const j = await ghJson(`/repos/${activeRepoId}/actions/runs?per_page=1&branch=${encodeURIComponent(activeBranch)}`);
        if (!j.workflow_runs || !j.workflow_runs.length) { clearServerLogs(); return appendServerLogLine('[System] No workflow runs.'); }
        ghShowRunLogs(j.workflow_runs[0].id);
    } catch (e) { clearServerLogs(); appendServerLogLine(`[System Error] ${e.message}`); }
}
async function ghShowRunLogs(runId) {
    clearServerLogs();
    lastRunId = runId;
    $('serverLogsLabel').innerText = `Run ${runId}`;
    try {
        const j = await ghJson(`/repos/${activeRepoId}/actions/runs/${runId}/jobs?per_page=50`);
        clearServerLogs();
        const jobs = j.jobs || [];
        if (!jobs.length) appendServerLogLine('[System] No jobs found for this run yet.');
        for (const job of jobs) {
            appendServerLogLine(`=== Job: ${job.name} — ${job.conclusion || job.status} ===`);
            (job.steps || []).forEach(s => appendServerLogLine(`  ${s.number}. ${s.name} — ${s.conclusion || s.status}`));
            try {
                const res = await ghFetch(`/repos/${activeRepoId}/actions/jobs/${job.id}/logs`);
                if (res.ok) {
                    const lines = (await res.text()).split('\n');
                    const shown = lines.slice(-800);
                    shown.forEach(l => appendServerLogLine(l));
                } else appendServerLogLine(`[System] Raw log not available (HTTP ${res.status}).`);
            } catch (e) { appendServerLogLine(`[System] Could not fetch raw log.`); }
        }
    } catch (e) { appendServerLogLine(`[System Error] ${e.message}`); }
}
async function ghRerunLatest() {
    if (!activeRepoId) return showToast("Select a repo first!");
    if (!await askConfirm("Re-run the latest workflow run?")) return;
    switchTab('serverlogs');
    try {
        const j = await ghJson(`/repos/${activeRepoId}/actions/runs?per_page=1&branch=${encodeURIComponent(activeBranch)}`);
        if (!j.workflow_runs || !j.workflow_runs.length) return showToast("No workflow runs.");
        const id = j.workflow_runs[0].id;
        const res = await ghFetch(`/repos/${activeRepoId}/actions/runs/${id}/rerun`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showToast("Re-run started!");
        setTimeout(ghLoadRuns, 2500);
    } catch (e) { showToast("Re-run failed: " + e.message); }
}
