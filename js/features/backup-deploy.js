// ===== Backup / Deploy / Wipe =====
function getFormattedDateTime() {
    const now = new Date();
    return `${now.toISOString().split('T')[0]}_${now.toTimeString().split(' ')[0].replace(/:/g, '-')}`;
}
function safeRef(r) { return String(r).replace(/[^\w.-]+/g, '-'); }
async function startDownload() {
    if (!activeRepoId) return showToast("Select from the menu first!");
    clearLogs();
    addLog(`Starting full backup${isGH() ? ` of ${activeBranch}` : ''}...`);
    showGlobalProgress("Fetching tree...", "0/0");
    try {
        const ref = activeBranch;
        const fileList = await listRepoFiles(activeRepoId, ref);
        const total = fileList.length;
        const zip = new JSZip();
        let downloadedCount = 0;
        $('fileStats').innerText = `0/${total}`;
        await runConcurrent(fileList, conc(), async (f) => {
            const blob = await getFileBlob(activeRepoId, ref, f);
            if (blob) { zip.file(f.path, blob); addLog(`Downloaded: ${f.path}`); }
            downloadedCount++;
            updateProgressBar(Math.round((downloadedCount / total) * 100));
            $('fileStats').innerText = `${downloadedCount}/${total}`;
        });
        $('statusText').innerText = "Zipping...";
        const zipContent = await zip.generateAsync({ type: "blob" });
        const [owner, name] = activeRepoId.split('/');
        const branchPart = isGH() ? `_${safeRef(ref)}` : '';
        saveAs(zipContent, `${name}_${owner}${branchPart}_${getFormattedDateTime()}.zip`);
        showToast("Backup Complete!");
    } catch (e) {
        showToast("Backup Error: " + e.message);
    }
    hideGlobalProgress();
}
async function startAllSpacesDownload(mode) {
    closeModal('allSpacesModal');
    if (!currentSpacesList || currentSpacesList.length === 0) return showToast("Nothing loaded.");
    clearLogs();
    const datetime = getFormattedDateTime();
    showGlobalProgress(`Batch ${mode} mode...`, `0/${currentSpacesList.length}`);
    const refOf = (s) => isGH() ? (s.default_branch || 'main') : 'main';
    const folderOf = (s) => isGH() ? s.id.replace('/', '__') : shortName(s.id);
    try {
        if (mode === 'single') {
            let zip = new JSZip();
            for (let s = 0; s < currentSpacesList.length; s++) {
                const sp = currentSpacesList[s];
                const spaceName = folderOf(sp);
                $('statusText').innerText = `Fetching ${spaceName}`;
                updateProgressBar(Math.round(((s + 1) / currentSpacesList.length) * 100));
                try {
                    const ref = refOf(sp);
                    const fileList = await listRepoFiles(sp.id, ref);
                    let folder = zip.folder(spaceName);
                    await runConcurrent(fileList, conc(), async (f) => {
                        const blob = await getFileBlob(sp.id, ref, f);
                        if (blob) folder.file(f.path, blob);
                    });
                } catch (e) { addLog(`Error on ${spaceName}: ${e.message}`); }
            }
            saveAs(await zip.generateAsync({ type: "blob" }), `All_${isGH() ? 'Repos' : 'Spaces'}_${currentUsername}_${datetime}.zip`);
        } else {
            for (let s = 0; s < currentSpacesList.length; s++) {
                const sp = currentSpacesList[s];
                const spaceName = folderOf(sp);
                $('statusText').innerText = `Processing ${spaceName}`;
                updateProgressBar(Math.round(((s + 1) / currentSpacesList.length) * 100));
                try {
                    const ref = refOf(sp);
                    const fileList = await listRepoFiles(sp.id, ref);
                    let zip = new JSZip();
                    let downloaded = 0;
                    await runConcurrent(fileList, conc(), async (f) => {
                        const blob = await getFileBlob(sp.id, ref, f);
                        if (blob) { zip.file(f.path, blob); downloaded++; }
                    });
                    if (downloaded > 0) {
                        saveAs(await zip.generateAsync({ type: "blob" }), `${spaceName}_${currentUsername}_${datetime}.zip`);
                        await new Promise(r => setTimeout(r, 1500));
                    }
                } catch (e) { addLog(`Error on ${spaceName}: ${e.message}`); }
            }
        }
        showToast("Batch Backup Complete!");
    } catch (e) {
        showToast("Batch Error");
    }
    hideGlobalProgress();
}
function showSelectedFileInfo() {
    const fileInput = $('zipFileInput');
    const info = $('zipFileInfo');
    if (!fileInput.files.length) { info.innerText = ''; return; }
    const f = fileInput.files[0];
    const sizeKB = (f.size / 1024).toFixed(1);
    const modified = f.lastModified ? new Date(f.lastModified).toLocaleString('en-US') : 'unknown';
    info.innerText = `Selected: ${f.name} · ${sizeKB} KB · modified ${modified}`;
}
async function startUpload() {
    if (!activeRepoId) return showToast("Select from the menu first!");
    const token = getToken();
    const fileInput = $('zipFileInput');
    if (!fileInput.files.length) return showToast("Select a ZIP file.");
    const selectedFile = fileInput.files[0];
    clearLogs();
    addLog(`Reading: ${selectedFile.name} (${(selectedFile.size/1024).toFixed(1)} KB)`);
    showGlobalProgress("Reading ZIP...", "0/0");
    try {
        const zip = await JSZip.loadAsync(selectedFile);
        const entries = [];
        zip.forEach((path, entry) => { if (!entry.dir && !path.startsWith('.git/')) entries.push({ path, entry }); });
        const total = entries.length;
        $('fileStats').innerText = `0/${total}`;
        const hubFiles = [];
        for (let i = 0; i < total; i++) {
            const { path, entry } = entries[i];
            const blob = await entry.async("blob");
            hubFiles.push({ path, content: blob });
            updateProgressBar(Math.round(((i + 1) / total) * 40));
            $('fileStats').innerText = `${i + 1}/${total}`;
        }
        if (isGH()) {
            $('statusText').innerText = `Deploying to ${activeBranch}...`;
            const modeMap = {};
            try { (await listRepoFiles(activeRepoId, activeBranch)).forEach(f => { modeMap[f.path] = f.mode; }); } catch (_) {}
            const r = await ghCommit({
                repo: activeRepoId, branch: activeBranch,
                message: `Deployed ${total} files via Mobile App`,
                upserts: hubFiles.map(f => ({ path: f.path, content: f.content, mode: modeMap[f.path] })),
                onProgress: (d, t, p) => { updateProgressBar(40 + Math.round((d / t) * 60)); $('fileStats').innerText = `${d}/${t}`; }
            });
            if (r.unchanged) { showToast("No changes — ZIP matches the branch already."); }
            else { showToast("Deployment Complete!"); }
        } else {
            $('statusText').innerText = "Deploying to HF (auto LFS/Xet)...";
            const { uploadFilesWithProgress } = await loadHubModule();
            let uploadedCount = 0;
            for await (const ev of uploadFilesWithProgress({
                repo: { type: "space", name: activeRepoId },
                accessToken: token,
                files: hubFiles,
                commitTitle: `Deployed ${total} files via Mobile App`
            })) {
                if (ev.event === "phase") $('statusText').innerText = `Deploy: ${ev.phase}...`;
                else if (ev.event === "fileProgress" && ev.progress >= 1) {
                    uploadedCount++;
                    updateProgressBar(40 + Math.round((uploadedCount / total) * 60));
                    $('fileStats').innerText = `${uploadedCount}/${total}`;
                }
            }
            showToast("Deployment Complete!");
        }
        activeFileList = [];
    } catch (e) {
        showToast("Upload Error: " + e.message);
    }
    fileInput.value = '';
    $('zipFileInfo').innerText = '';
    hideGlobalProgress();
}
async function startDeletion() {
    if (!activeRepoId) return showToast("Select from the menu first!");
    const token = getToken();
    if (!await askConfirm(isGH() ? `Delete all files on branch "${activeBranch}" (except protected ones)?` : "Delete all internal files?")) return;
    clearLogs();
    showGlobalProgress("Fetching tree...", "");
    try {
        const fileList = await listRepoFiles(activeRepoId, activeBranch);
        const keep = protectedFiles();
        const toDelete = fileList.filter(f => !keep.includes(f.path));
        if (toDelete.length === 0) { showToast("Already clean"); hideGlobalProgress(); return; }
        $('statusText').innerText = `Wiping ${toDelete.length} files...`;
        if (!isGH()) {
            const ops = toDelete.map(f => ({ key: "deletedFile", value: { path: f.path } }));
            const res = await fetch(`https://huggingface.co/api/spaces/${activeRepoId}/commit/main`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-ndjson' },
                body: [JSON.stringify({ key: "header", value: { summary: `Wiped ${toDelete.length} files` } }), ...ops.map(o => JSON.stringify(o))].join("\n")
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } else {
            await ghCommit({ repo: activeRepoId, branch: activeBranch, message: `Wiped ${toDelete.length} files`, deletes: toDelete.map(f => f.path) });
        }
        activeFileList = [];
        showToast("Wipe Complete!");
    } catch (e) {
        showToast("Wipe Error: " + e.message);
    }
    hideGlobalProgress();
}
async function structCommit({ message, upserts = [], moves = [], deletes = [], deleteFolders = [], onProgress }) {
    const repo = activeRepoId;
    if (!isGH()) {
        const lines = [JSON.stringify({ key: 'header', value: { summary: message } })];
        for (const u of upserts) {
            const size = typeof u.content === 'string' ? u.content.length : u.content.size;
            if (size > 10 * 1024 * 1024) throw new Error(`${u.path} is larger than 10 MB. Use the Deploy tab for big files.`);
            const b64 = typeof u.content === 'string' ? utf8ToBase64(u.content) : await blobToBase64(u.content);
            lines.push(JSON.stringify({ key: 'file', value: { path: u.path, content: b64, encoding: 'base64' } }));
        }
        for (const m of moves) {
            const r = await fetch(`https://huggingface.co/spaces/${repo}/resolve/main/${encPath(m.from)}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            if (!r.ok) throw new Error(`Could not read ${m.from} (HTTP ${r.status})`);
            const blob = await r.blob();
            if (blob.size > 10 * 1024 * 1024) throw new Error(`${m.from} is too large to move.`);
            lines.push(JSON.stringify({ key: 'file', value: { path: m.to, content: await blobToBase64(blob), encoding: 'base64' } }));
            lines.push(JSON.stringify({ key: 'deletedFile', value: { path: m.from } }));
        }
        deletes.filter(p => !deleteFolders.some(d => p.startsWith(d + '/'))).forEach(p => lines.push(JSON.stringify({ key: 'deletedFile', value: { path: p } })));
        deleteFolders.forEach(p => lines.push(JSON.stringify({ key: 'deletedFolder', value: { path: p } })));
        const res = await fetch(`https://huggingface.co/api/spaces/${repo}/commit/main`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/x-ndjson' }, body: lines.join('\n') });
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${await res.text()}`);
    } else {
        const up = upserts.slice();
        moves.forEach(m => up.push({ path: m.to, sha: m.f.sha, mode: m.f.mode }));
        await ghCommit({ repo, branch: activeBranch, message, upserts: up, deletes: deletes.concat(moves.map(m => m.from)), onProgress });
    }
    activeFileList = [];
    invalidateVersions();
}
function afterStructChange() {
    activeFileList = [];
    updatePendingDeployBar(); updateCurrentFileLabel();
    saveSession({ pending: pendingEdits, file: currentEditFilePath });
    refreshVersions(true);
}
async function promptNewFolder(parent) {
    if (gistMode) return showToast('Gists cannot contain folders.');
    const raw = await askPrompt(parent ? `New folder inside "${parent}/":` : 'New folder name:', '', { title: 'New folder', ok: 'Create' });
    if (raw === null) return;
    const clean = cleanFolderPath(raw);
    if (badFolderPath(clean)) return showToast('Invalid folder name.');
    const full = parent ? `${parent}/${clean}` : clean;
    try {
        const files = await listRepoFiles(activeRepoId, activeBranch);
        if (files.some(f => f.path === full || f.path.startsWith(full + '/'))) return showToast('That folder already exists.');
        try { await structCommit({ message: `Create folder ${full}`, upserts: [{ path: full + '/.gitkeep', content: '' }] }); }
        catch (e) { await structCommit({ message: `Create folder ${full}`, upserts: [{ path: full + '/.gitkeep', content: '\n' }] }); }
        showToast(`Created folder ${full}`);
        openLiveFileSelector();
    } catch (e) { showToast(ghHint(e)); }
}
async function promptRenameFolder(oldPath) {
    if (gistMode) return showToast('Gists cannot contain folders.');
    const raw = await askPrompt('Rename / move folder. Edit the full path:', oldPath, { title: 'Rename folder', ok: 'Rename' });
    if (raw === null) return;
    const np = cleanFolderPath(raw);
    if (badFolderPath(np)) return showToast('Invalid folder name.');
    if (np === oldPath) return;
    if (np.startsWith(oldPath + '/')) return showToast('A folder cannot be moved inside itself.');
    try {
        const files = await listRepoFiles(activeRepoId, activeBranch);
        const moving = files.filter(f => f.path.startsWith(oldPath + '/'));
        if (!moving.length) return showToast('That folder has no files.');
        if (files.some(f => f.path === np || f.path.startsWith(np + '/'))) return showToast('The target folder already exists.');
        if (!await askConfirm(`Rename "${oldPath}" to "${np}"?\n${moving.length} file(s) are moved in one commit.`, { title: 'Rename folder', ok: 'Rename', danger: false })) return;
        await structCommit({ message: `Rename folder ${oldPath} to ${np}`, moves: moving.map(f => ({ from: f.path, to: np + f.path.slice(oldPath.length), f })) });
        const remap = (p) => p.startsWith(oldPath + '/') ? np + p.slice(oldPath.length) : p;
        const np2 = {}; Object.keys(pendingEdits).forEach(k => { np2[remap(k)] = pendingEdits[k]; }); pendingEdits = np2;
        if (currentEditFilePath) currentEditFilePath = remap(currentEditFilePath);
        afterStructChange();
        showToast(`Renamed to ${np}`);
        openLiveFileSelector();
    } catch (e) { showToast(ghHint(e)); }
}
async function promptDeleteFolder(path) {
    try {
        const files = await listRepoFiles(activeRepoId, activeBranch);
        const under = files.filter(f => f.path.startsWith(path + '/'));
        if (!under.length) return showToast('Folder not found.');
        const real = under.filter(f => baseName(f.path) !== '.gitkeep');
        if (real.length) {
            if (!await askConfirm(`Folder "${path}" contains ${real.length} file(s). Delete all of them?`, { title: 'Delete folder', ok: `Delete ${real.length} files`, danger: true })) return;
        }
        await structCommit({ message: `Delete folder ${path}`, deletes: under.map(f => f.path), deleteFolders: [path] });
        Object.keys(pendingEdits).forEach(k => { if (k.startsWith(path + '/')) delete pendingEdits[k]; });
        if (currentEditFilePath && currentEditFilePath.startsWith(path + '/')) { setEditorContent('', null); currentEditFilePath = null; }
        afterStructChange();
        showToast(`Deleted folder ${path}`);
        openLiveFileSelector();
    } catch (e) { showToast(ghHint(e)); }
}
async function promptRenameFile(path) {
    const raw = await askPrompt('Rename / move file. Edit the full path:', path, { title: 'Rename file', ok: 'Rename' });
    if (raw === null) return;
    const np = String(raw).trim().replace(/^\/+/, '');
    if (!np || np === path) return;
    if (/[\\:*?"<>|]/.test(np) || np.split('/').some(s => !s || s === '.' || s === '..')) return showToast('Invalid file name.');
    if (gistMode && np.includes('/')) return showToast('Gist file names cannot contain "/".');
    try {
        const files = await listRepoFiles(activeRepoId, activeBranch);
        const f = files.find(x => x.path === path);
        if (!f) return showToast('File not found. Deploy it first.');
        if (files.some(x => x.path === np)) return showToast('A file with that name already exists.');
        await structCommit({ message: `Rename ${path} to ${np}`, moves: [{ from: path, to: np, f }] });
        if (pendingEdits[path] != null) { pendingEdits[np] = pendingEdits[path]; delete pendingEdits[path]; }
        if (currentEditFilePath === path) { currentEditFilePath = np; setEditorContent(editor.getValue(), np); }
        afterStructChange();
        showToast(`Renamed to ${np}`);
        openLiveFileSelector();
    } catch (e) { showToast(ghHint(e)); }
}
async function promptDeleteFile(path) {
    if (!await askConfirm(`Delete "${path}"?`, { title: 'Delete file', ok: 'Delete', danger: true })) return;
    try {
        const files = await listRepoFiles(activeRepoId, activeBranch);
        if (files.some(f => f.path === path)) await structCommit({ message: `Delete ${path}`, deletes: [path] });
        delete pendingEdits[path];
        if (currentEditFilePath === path) { setEditorContent('', null); currentEditFilePath = null; }
        afterStructChange();
        showToast(`Deleted ${path}`);
    } catch (e) { showToast(ghHint(e)); }
}
const BUILD_TEMPLATES = {
    'Android APK (Gradle)': `name: Build Android APK\non:\n  workflow_dispatch:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: 17\n      - uses: gradle/actions/setup-gradle@v4\n      - name: Build debug APK\n        run: gradle assembleDebug --no-daemon\n      - uses: actions/upload-artifact@v4\n        with:\n          name: app-debug-apk\n          path: app/build/outputs/apk/debug/*.apk\n`,
    'Node.js (npm build)': `name: Build Node app\non:\n  workflow_dispatch:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci || npm install\n      - run: npm run build --if-present\n`,
    'Python script': `name: Run Python\non:\n  workflow_dispatch:\n    inputs:\n      script:\n        description: Script to run\n        default: main.py\njobs:\n  run:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - run: python "$SCRIPT"\n        env:\n          SCRIPT: \${{ inputs.script }}\n`,
    'Docker image': `name: Docker build\non:\n  workflow_dispatch:\njobs:\n  docker:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: docker build -t app:latest .\n`,
    'Manual (empty)': `name: Manual job\non:\n  workflow_dispatch:\njobs:\n  hello:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo "Edit this workflow"\n`
};
async function createBuildWorkflow() {
    if (!isGH() || gistMode) return showToast('Build workflows are for GitHub repositories.');
    const vals = await askForm({ title: 'Create build workflow', ok: 'Create', fields: [
        { key: 'tpl', label: 'Template', type: 'choice', options: Object.keys(BUILD_TEMPLATES), default: 'Android APK (Gradle)' },
        { key: 'name', label: 'File name', type: 'string', default: 'build.yml', required: true }
    ] });
    if (!vals) return;
    let name = vals.name.trim().replace(/^.*\//, '');
    if (!/\.ya?ml$/i.test(name)) name += '.yml';
    const path = `.github/workflows/${name}`;
    try {
        const files = await listRepoFiles(activeRepoId, activeBranch).catch(() => []);
        if (files.some(f => f.path === path) && !await askConfirm(`${path} already exists. Replace?`, { title: 'Replace workflow?', ok: 'Replace', danger: true })) return;
    } catch (e) {}
    createNewFileInEditor(path);
    editor.setValue(BUILD_TEMPLATES[vals.tpl], -1);
    try { await savePendingEdit(); } catch (e) {}
    showToast('Template ready. Tap Deploy All.');
}
