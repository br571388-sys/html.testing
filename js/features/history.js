// ===== Commit History =====
async function loadCommitHistory() {
    if (!activeRepoId) return showToast("Select from the menu first!");
    const token = getToken();
    const list = $('commitsList');
    list.innerHTML = '<div class="text-center text-gray-500 text-sm py-4">Fetching history...</div>';
    try {
        let commits;
        if (!isGH()) {
            const res = await fetch(`https://huggingface.co/api/spaces/${activeRepoId}/commits/main`, { headers: authHeaders(token) });
            if (!res.ok) throw new Error("Fetch failed");
            commits = await res.json();
        } else {
            const arr = await ghJson(`/repos/${activeRepoId}/commits?sha=${encodeURIComponent(activeBranch)}&per_page=50`);
            commits = arr.map(x => ({
                id: x.sha,
                title: ((x.commit.message || '').split('\n')[0]) || '(no message)',
                date: x.commit.author && x.commit.author.date
            }));
        }
        list.innerHTML = '';
        commits.forEach((c) => {
            const dateObj = new Date(c.date);
            const dateStr = dateObj.toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
            const div = document.createElement('div');
            div.className = "bg-[#161b22] border border-[#30363d] p-3 rounded-lg active:bg-[#21262d] cursor-pointer shadow-sm";
            div.onclick = () => openHistoryViewer(activeRepoId, c.id, c.title, dateStr);
            div.innerHTML = `
                <div class="flex justify-between items-start gap-2">
                    <div class="flex-1 min-w-0">
                        <h4 class="text-sm font-bold text-gray-200 break-words mb-1">${esc(c.title)}</h4>
                        <div class="flex justify-between items-center text-xs text-blue-400 font-mono">
                            <span>${esc(c.id.substring(0,7))}</span>
                            <span class="text-gray-500">${esc(dateStr)}</span>
                        </div>
                    </div>
                    <div class="flex gap-1 shrink-0">
                        <button data-role="restore" class="p-2 bg-[#21262d] hover:bg-[#30363d] rounded-lg text-[#f0883e] border border-[#30363d]" title="Restore"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"></path><polyline points="3 3 3 9 9 9"></polyline></svg></button>
                        <button data-role="download" class="p-2 bg-[#21262d] hover:bg-[#30363d] rounded-lg text-blue-400 border border-[#30363d]" title="Download"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4"></path></svg></button>
                    </div>
                </div>
            `;
            div.querySelector('[data-role="download"]').onclick = (event) => downloadSpecificCommit(event, c.id);
            div.querySelector('[data-role="restore"]').onclick = (event) => revertToCommit(event, c.id, c.title);
            list.appendChild(div);
        });
    } catch (e) { list.innerHTML = `<div class="text-red-400 text-center py-4">${esc(e.message)}</div>`; }
}
async function revertToCommit(event, commitId, title) {
    event.stopPropagation();
    if (!activeRepoId) return showToast("Select from the menu first!");
    const target = isGH() ? activeBranch : 'main';
    if (!await askConfirm(`Restore "${title}" (${commitId.substring(0,7)}) to ${target}?\n\nOverwrites current files with content from this commit.`)) return;
    const token = getToken();
    clearLogs();
    addLog(`Starting restore of commit ${commitId.substring(0,7)}...`);
    showGlobalProgress(`Restoring commit ${commitId.substring(0,7)}...`, "0/0");
    try {
        const fileList = await listRepoFiles(activeRepoId, commitId);
        const total = fileList.length;
        $('fileStats').innerText = `0/${total}`;
        if (isGH()) {
            addLog(`Re-pointing ${total} file(s) to versions from ${commitId.substring(0,7)}...`);
            const r = await ghCommit({
                repo: activeRepoId, branch: activeBranch,
                message: `Restore files from commit ${commitId.substring(0,7)} (${title})`,
                upserts: fileList.map(f => ({ path: f.path, sha: f.sha, mode: f.mode }))
            });
            updateProgressBar(100);
            $('fileStats').innerText = `${total}/${total}`;
            if (r.unchanged) { showToast("Already identical to that commit."); addLog("Branch already matches that commit."); }
            else { showToast(`Restored ${total} file(s)!`); addLog(`Successfully restored ${total} file(s).`); }
            loadCommitHistory();
            hideGlobalProgress();
            return;
        }
        const hubFiles = new Array(total);
        let fetched = 0;
        await runConcurrent(fileList, DOWNLOAD_CONCURRENCY, async (f, i) => {
            const blob = await getFileBlob(activeRepoId, commitId, f);
            if (blob) { hubFiles[i] = { path: f.path, content: blob }; addLog(`Fetched: ${f.path}`); }
            fetched++;
            updateProgressBar(Math.round((fetched / total) * 50));
            $('fileStats').innerText = `${fetched}/${total}`;
        });
        const validFiles = hubFiles.filter(Boolean);
        $('statusText').innerText = "Committing restore...";
        const { uploadFilesWithProgress } = await loadHubModule();
        let uploadedCount = 0;
        for await (const ev of uploadFilesWithProgress({
            repo: { type: "space", name: activeRepoId },
            accessToken: token,
            files: validFiles,
            commitTitle: `Restore files from commit ${commitId.substring(0,7)} (${title})`
        })) {
            if (ev.event === "phase") $('statusText').innerText = `Restore: ${ev.phase}...`;
            else if (ev.event === "fileProgress" && ev.progress >= 1) {
                uploadedCount++;
                addLog(`Restored: ${ev.path}`);
                updateProgressBar(50 + Math.round((uploadedCount / validFiles.length) * 50));
                $('fileStats').innerText = `${uploadedCount}/${validFiles.length}`;
            }
        }
        showToast(`Restored ${validFiles.length} file(s)!`);
        loadCommitHistory();
    } catch (e) {
        showToast("Restore failed: " + e.message);
        addLog(`Restore Error: ${e.message}`);
    }
    hideGlobalProgress();
}
async function downloadSpecificCommit(event, commitId) {
    event.stopPropagation();
    if (!activeRepoId) return showToast("Select from the menu first!");
    clearLogs();
    addLog(`Downloading commit ${commitId.substring(0,7)}...`);
    showGlobalProgress(`Downloading commit ${commitId.substring(0,7)}...`, "0/0");
    try {
        const fileList = await listRepoFiles(activeRepoId, commitId);
        const total = fileList.length;
        const zip = new JSZip();
        let downloadedCount = 0;
        $('fileStats').innerText = `0/${total}`;
        await runConcurrent(fileList, conc(), async (f) => {
            const blob = await getFileBlob(activeRepoId, commitId, f);
            if (blob) { zip.file(f.path, blob); addLog(`Fetched: ${f.path}`); }
            downloadedCount++;
            updateProgressBar(Math.round((downloadedCount / total) * 100));
            $('fileStats').innerText = `${downloadedCount}/${total}`;
        });
        $('statusText').innerText = "Zipping...";
        const zipContent = await zip.generateAsync({ type: "blob" });
        saveAs(zipContent, `${shortName(activeRepoId)}_commit_${commitId.substring(0,7)}.zip`);
        showToast("Commit Downloaded!");
    } catch (e) {
        showToast("Commit Download Error: " + e.message);
    }
    hideGlobalProgress();
}
async function openHistoryViewer(repoId, commitId, title, dateStr) {
    hvRepoId = repoId; hvCommitId = commitId; hvFilePath = null;
    openModal('historyViewerModal');
    $('hvTitle').innerText = title;
    $('hvSubtitle').innerText = `${commitId.substring(0,8)} | ${dateStr}`;
    $('hvFileName').innerText = "Select a file...";
    $('hvEmptyState').innerText = "Select a file to view code";
    $('hvEmptyState').classList.remove('hidden');
    $('historyEditor').classList.add('hidden');
    $('historyToolbar').classList.add('hidden');
    try { histFileList = await listRepoFiles(repoId, commitId); }
    catch (e) { showToast("Failed to load file tree."); histFileList = []; }
}
function openHistoryFileSelector() {
    if (histFileList.length === 0) return showToast("No files found.");
    openModal('fileTreeModal');
    $('fileTreeTitle').innerText = `Files in ${hvCommitId.substring(0,7)}`;
    renderFileTree($('fileTreeList'), histFileList, loadHistoryFileCode);
}
async function loadHistoryFileCode(filePath) {
    hvFilePath = filePath;
    $('hvFileName').innerText = filePath;
    const emptyState = $('hvEmptyState');
    emptyState.innerText = "Loading code...";
    emptyState.classList.remove('hidden');
    $('historyEditor').classList.add('hidden');
    $('historyToolbar').classList.add('hidden');
    historyEditor.setValue("Loading...");
    try {
        const f = histFileList.find(x => x.path === filePath) || { path: filePath };
        const text = await getFileText(hvRepoId, hvCommitId, f);
        emptyState.classList.add('hidden');
        $('historyEditor').classList.remove('hidden');
        $('historyToolbar').classList.remove('hidden');
        historyEditor.session.setMode(`ace/mode/${getAceMode(filePath)}`);
        historyEditor.setValue(text, -1);
        setTimeout(() => historyEditor.resize(), 50);
    } catch (e) {
        emptyState.innerText = "Binary or error loading file. Please download.";
        emptyState.classList.remove('hidden');
    }
}
async function downloadHistoryFile() {
    if (!hvFilePath) return;
    try {
        const f = histFileList.find(x => x.path === hvFilePath) || { path: hvFilePath };
        const blob = await getFileBlob(hvRepoId, hvCommitId, f);
        if (!blob) throw new Error("Download failed");
        saveAs(blob, hvFilePath.split('/').pop());
        showToast("File Downloaded!");
    } catch (e) { showToast("Download error: " + e.message); }
}
