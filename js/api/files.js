// ===== Provider-neutral file helpers =====
function runConcurrent(items, limit, worker) {
    return new Promise((resolve, reject) => {
        let idx = 0, active = 0, settled = false;
        if (items.length === 0) return resolve();
        function next() {
            if (settled) return;
            if (idx >= items.length && active === 0) { settled = true; return resolve(); }
            while (active < limit && idx < items.length) {
                const item = items[idx]; const i = idx; idx++;
                active++;
                Promise.resolve(worker(item, i))
                    .then(() => { active--; next(); })
                    .catch((err) => { if (!settled) { settled = true; reject(err); } });
            }
        }
        next();
    });
}

async function listRepoFiles(repoId, ref) {
    const token = getToken();
    if (!isGH()) {
        const res = await fetch(`https://huggingface.co/api/spaces/${repoId}/tree/${ref}?recursive=true`, { headers: authHeaders(token) });
        if (!res.ok) throw new Error("Metadata fetch failed");
        const items = await res.json();
        return items.filter(i => i.type === 'file' && !i.path.startsWith('.git/'));
    }
    const commitSha = await ghResolveCommit(repoId, ref);
    const c = await ghJson(`/repos/${repoId}/git/commits/${commitSha}`);
    const t = await ghJson(`/repos/${repoId}/git/trees/${c.tree.sha}?recursive=1`);
    if (t.truncated) showToast("Repo is very large: GitHub truncated the file list.");
    return t.tree.filter(i => i.type === 'blob').map(i => ({ type: 'file', path: i.path, sha: i.sha, mode: i.mode, size: i.size }));
}

async function getFileBlob(repoId, ref, f) {
    if (!isGH()) {
        const res = await fetch(`https://huggingface.co/spaces/${repoId}/resolve/${ref}/${f.path}`, { headers: authHeaders(getToken()) });
        return res.ok ? res.blob() : null;
    }
    const res = await ghFetch(`/repos/${repoId}/git/blobs/${f.sha}`, { headers: { 'Accept': 'application/vnd.github.raw+json' } });
    return res.ok ? res.blob() : null;
}

async function getFileText(repoId, ref, f) {
    const blob = await getFileBlob(repoId, ref, f);
    if (!blob) throw new Error("Load failed");
    const text = await blob.text();
    if (text.indexOf('\u0000') !== -1) throw new Error("Binary file");
    return text;
}

const accountsKey = () => isGH() ? 'gh_saved_accounts' : 'hf_saved_accounts';
const lastSpaceKey = () => isGH() ? 'gh_last_space' : 'hf_last_space';

function applyProviderUI() {
    const gh = isGH();
    $('provHF').classList.toggle('active', !gh);
    $('provGH').classList.toggle('active', gh);
    $('apiToken').placeholder = gh ? 'Paste GitHub Token (ghp_... / github_pat_...)' : 'Paste HF Token (hf_...)';
    const hint = $('tokenHint');
    hint.classList.toggle('hidden', !gh);
    hint.innerText = gh ? 'Token needs: Contents (read/write) + Actions + Secrets access. Classic tokens: "repo" + "workflow" scopes.' : '';
    $('loadBtn').innerText = 'Load';
    $('spaceFilter').placeholder = gh ? 'Filter repos...' : 'Filter spaces...';
    setLabel('backupAllBtn', 'package', gh ? 'Backup all repos' : 'Backup all spaces');
    setLabel('backupTitle', 'download', gh ? 'Backup Repo' : 'Backup Space');
    $('backupDesc').innerText = gh ? 'Download the selected branch of the repo as a local ZIP file.' : 'Download entire source code of the selected space into a local ZIP file.';
    $('targetLabel').innerText = gh ? 'Target Repo' : 'Target Space ID';
    $('deployDesc').innerText = gh ? 'Upload a local ZIP file to add/overwrite files on the selected branch (one commit).' : 'Upload a local ZIP file to overwrite/add files in the Space.';
    $('uploadBtn').innerText = gh ? 'Deploy to GitHub' : 'Deploy to Hugging Face';
    $('wipeDesc').innerText = gh ? 'Delete all files on this branch except protected ones (README.md, .gitignore, LICENSE).' : 'Delete all internal files except protected ones (README.md).';
    setLabel('logsBtn1', gh ? 'list' : 'terminal', gh ? 'Workflow Runs' : 'Build Logs');
    setLabel('logsBtn2', gh ? 'file-text' : 'play', gh ? 'Latest Run Log' : 'Run Logs');
    setLabel('restartBtn', 'refresh', gh ? 'Re-run Latest' : 'Restart');
    $('serverLogsLabel').innerText = gh ? 'GitHub Actions' : 'Live Build & Runtime Logs';
    $('secretsTitle').innerText = gh ? 'Actions Secrets' : 'Space Secrets';
    $('workerProxyBlock').classList.toggle('hidden', gh);
    $('ghSecretsNote').classList.toggle('hidden', !gh);
    $('branchBar').classList.toggle('hidden', !gh || !activeRepoId);
    $('branchBar').classList.toggle('flex', gh && !!activeRepoId);
    if (!activeRepoId) {
        const ht = $('headerTitle');
        ht.innerText = gh ? 'GH Manager' : 'HF Manager';
        ht.href = '#';
    }
    $('serverLogsBox').innerHTML = gh
        ? '<div class="text-gray-600 mb-2 italic">Select a repo, then tap "Workflow Runs" to list GitHub Actions runs.</div>'
        : '<div class="text-gray-600 mb-2 italic">Select a space, then tap "Build Logs" or "Run Logs" to view live events...</div>';
}

function clearSession() {
    if (logStreamController) { logStreamController.abort(); logStreamController = null; }
    activeRepoId = null; activeBranch = 'main'; currentUsername = ""; currentSpacesList = []; lastRunId = null;
    starredList = null; gistList = null; sideView = 'repos';
    $('apiToken').value = '';
    $('accountNameDisplay').innerText = '';
    $('targetSpaceInput').value = '';
    $('spaceFilter').value = '';
    $('spacesList').innerHTML = '<p class="text-xs text-gray-500 text-center mt-10">Nothing loaded yet.</p>';
    $('secretsList').innerHTML = '<div class="text-center text-gray-500 text-sm py-4">Select an item from the menu to view secrets...</div>';
    resetWorkspaceState();
    applyProviderUI();
}

function setProvider(p) {
    if (p === provider) return;
    flushDraft();
    provider = p;
    localStorage.setItem('app_provider', p);
    clearSession();
    loadSavedAccounts();
    showToast(p === 'gh' ? 'Switched to GitHub' : 'Switched to Hugging Face');
}

function resetWorkspaceState() {
    clearCmdReplies();
    clearTimeout(draftTimer);
    currentEditFilePath = null;
    editorDirty = false;
    pendingEdits = {};
    updateCurrentFileLabel();
    updatePendingDeployBar();
    if (editor) setEditorContent("", null);
    const saveBtn = $('saveChangesBtn');
    saveBtn.disabled = true;
    saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
    previewReset();
    $('mdPreviewBtn').classList.add('hidden');
    $('mdPreviewBtn').classList.remove('flex');
    $('commitsList').innerHTML = '<div class="text-center text-gray-500 text-sm py-10">Press Refresh to load commits</div>';
    if (logStreamController) { logStreamController.abort(); logStreamController = null; }
    clearServerLogs();
}

function updateHeaderLink() {
    const ht = $('headerTitle');
    paintBranchBtn();
    ht.innerText = shortName(activeRepoId);
    ht.href = isGH()
        ? `https://github.com/${activeRepoId}/tree/${encPath(activeBranch)}`
        : `https://huggingface.co/spaces/${activeRepoId}/tree/main`;
}

function selectSpace(repoId, opts = {}) {
    flushDraft();
    activeRepoId = repoId;
    const sp = currentSpacesList.concat(starredList || []).find(x => x.id === repoId);
    const savedBranch = localStorage.getItem('branch_' + repoId);
    activeBranch = isGH() ? ((opts.silent && savedBranch) ? savedBranch : ((sp && sp.default_branch) || savedBranch || 'main')) : 'main';
    $('targetSpaceInput').value = repoId;
    updateHeaderLink();
    resetWorkspaceState();
    $('branchBar').classList.toggle('hidden', !isGH());
    $('branchBar').classList.toggle('flex', isGH());
    if (isGH()) loadBranches();
    restoreEditorSession();
    loadSecrets();
    localStorage.setItem(lastSpaceKey(), repoId);
    renderSidebarSpaces();
    if (!opts.silent) { toggleSidebar(); showToast(`Selected: ${shortName(repoId)}`); }
}

async function loadBranches() {
    const sel = $('branchSelect');
    sel.innerHTML = `<option>${esc(activeBranch)}</option>`;
    paintBranchBtn();
    const repoAtStart = activeRepoId;
    try {
        let all = [];
        for (let page = 1; page <= 5; page++) {
            const part = await ghJson(`/repos/${repoAtStart}/branches?per_page=100&page=${page}`);
            all = all.concat(part);
            if (part.length < 100) break;
        }
        if (repoAtStart !== activeRepoId) return;
        const names = all.map(b => b.name);
        if (!names.includes(activeBranch)) names.unshift(activeBranch);
        sel.innerHTML = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
        sel.value = activeBranch;
        branchNames = names.slice(); paintBranchBtn();
    } catch (e) { showToast("Couldn't load branches: " + e.message); }
}

function onBranchChange() {
    const newBranch = $('branchSelect').value;
    if (!newBranch || newBranch === activeBranch) return;
    flushDraft();
    activeBranch = newBranch;
    localStorage.setItem('branch_' + activeRepoId, newBranch);
    resetWorkspaceState();
    updateHeaderLink();
    restoreEditorSession();
    showToast(`Branch: ${activeBranch}`);
}

async function restoreEditorSession() {
    const sess = loadSession();
    pendingEdits = (sess.pending && typeof sess.pending === 'object') ? sess.pending : {};
    updatePendingDeployBar();
    if (sess.file) {
        const draft = (sess.draft && sess.draft.path === sess.file && typeof sess.draft.content === 'string') ? sess.draft.content : null;
        loadLiveFileIntoEditor(sess.file, { draft, silent: true });
    }
}
