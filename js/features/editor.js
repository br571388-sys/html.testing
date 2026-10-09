// ===== Live Editor =====
async function promptAddFile(folderPath) {
    const name = await askPrompt(folderPath ? `New file name inside "${folderPath}/".\nTip: write sub/app.py to create a new sub-folder together with the file:` : "New file name (e.g. app.py).\nTip: write folder/app.py to create a new folder together with the file:");
    if (!name || !name.trim()) return;
    const cleanName = name.trim().replace(/^\/+/, '');
    const fullPath = folderPath ? `${folderPath}/${cleanName}` : cleanName;
    createNewFileInEditor(fullPath);
}
function createNewFileInEditor(fullPath) {
    clearCmdReplies();
    currentEditFilePath = fullPath;
    previewReset();
    togglePreviewButtonVisibility(fullPath);
    updateCurrentFileLabel();
    if (isBinaryPath(fullPath)) {
        showBinaryViewer(fullPath, null);
        saveSession({ file: fullPath, draft: null });
        switchTab('editor');
        showToast(`New ${getBinaryKind(fullPath)} file ready — upload from device to save as "${fullPath}"`);
        return;
    }
    setEditorContent('', fullPath);
    editorDirty = true;
    const saveBtn = $('saveChangesBtn');
    saveBtn.disabled = false;
    saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    saveSession({ file: fullPath, draft: { path: fullPath, content: '' } });
    switchTab('editor');
    showToast(`New file "${fullPath}" ready — type your content, then tap Save.`);
}
async function openLiveFileSelector() {
    if (!activeRepoId) return showToast("Select from the menu first!");
    openModal('fileTreeModal');
    $('fileTreeTitle').innerText = `Live Files (${activeBranch})${treeCacheEnabled ? ' · cached' : ' · live'}`;
    const list = $('fileTreeList');
    list.innerHTML = '<div class="text-center text-gray-500 text-sm py-4">Loading tree...</div>';
    try {
        let files;
        if (treeCacheEnabled && activeFileList.length) files = activeFileList.slice();
        else { files = await listRepoFiles(activeRepoId, activeBranch); activeFileList = files; }
        if (treeCacheEnabled) {
            const existing = new Set(files.map(f => f.path));
            Object.keys(pendingEdits).forEach(p => {
                if (!existing.has(p)) files.push({ path: p, local: true, pending: true });
                else { const f = files.find(x => x.path === p); if (f) f.pending = true; }
            });
        }
        const sess = loadSession();
        const startFolder = (typeof sess.folder === 'string') ? sess.folder : dirname(currentEditFilePath);
        renderFileTree(list, files, loadLiveFileIntoEditor, {
            allowAdd: true,
            onAddFile: promptAddFile,
            startPath: startFolder,
            onNavigate: (path) => saveSession({ folder: path }),
            collapsed: sess.collapsed || [],
            onCollapseChange: (arr) => saveSession({ collapsed: arr })
        });
    } catch (e) { list.innerHTML = `<div class="text-red-400 text-sm p-2">Error: ${esc(e.message)}</div>`; }
}
async function loadLiveFileIntoEditor(filePath, opts = {}) {
    clearCmdReplies();
    clearTimeout(draftTimer);
    currentEditFilePath = filePath;
    editorDirty = false;
    updateCurrentFileLabel();
    previewReset();
    const saveBtn = $('saveChangesBtn');
    const setSaveEnabled = (on) => {
        saveBtn.disabled = !on;
        saveBtn.classList.toggle('opacity-50', !on);
        saveBtn.classList.toggle('cursor-not-allowed', !on);
    };
    setSaveEnabled(false);
    saveSession({ file: filePath, draft: null });
    if (isBinaryPath(filePath)) {
        if (activeFileList.length === 0 || !activeFileList.some(x => x.path === filePath)) {
            try { activeFileList = await listRepoFiles(activeRepoId, activeBranch); } catch (e) {}
        }
        const entry = activeFileList.find(x => x.path === filePath) || null;
        await showBinaryViewer(filePath, entry, opts);
        return;
    }
    if (opts.draft != null) {
        setEditorContent(opts.draft, filePath);
        editorDirty = true;
        togglePreviewButtonVisibility(filePath);
        setSaveEnabled(true);
        if (!opts.silent) showToast("Restored your unsaved draft.");
        return;
    }
    if (Object.prototype.hasOwnProperty.call(pendingEdits, filePath)) {
        setEditorContent(pendingEdits[filePath], filePath);
        togglePreviewButtonVisibility(filePath);
        if (!opts.silent) showToast("Loaded your locally saved (not yet deployed) version.");
        return;
    }
    setEditorContent("Loading code from cloud...", filePath);
    try {
        let f = activeFileList.find(x => x.path === filePath);
        if (isGH() && (!f || !f.sha)) {
            activeFileList = await listRepoFiles(activeRepoId, activeBranch);
            f = activeFileList.find(x => x.path === filePath);
            if (!f) throw new Error("File not found on this branch");
        }
        if (!f) f = { path: filePath };
        const text = await getFileText(activeRepoId, activeBranch, f);
        if (currentEditFilePath !== filePath) return;
        setEditorContent(text, filePath);
        togglePreviewButtonVisibility(filePath);
        if (!opts.silent) showToast("File loaded for editing!");
    } catch (e) {
        if (currentEditFilePath !== filePath) return;
        setEditorContent("", null);
        currentEditFilePath = null;
        updateCurrentFileLabel();
        saveSession({ file: null, draft: null });
        showToast(e.message === "Binary file" ? "Binary file — can't edit here." : (opts.silent ? "Couldn't reopen your last file." : "Error loading file."));
    }
}
function updateEditorLineCount() {
    const badge = $('editorLineCount');
    if (!currentEditFilePath) { badge.classList.add('hidden'); return; }
    const lines = editor.session.getLength();
    badge.innerText = `${lines} line${lines === 1 ? '' : 's'}`;
    badge.classList.remove('hidden');
}
function togglePreviewButtonVisibility(filePath) {
    const btn = $('mdPreviewBtn');
    const on = !!getPreviewKind(filePath);
    btn.classList.toggle('hidden', !on);
    btn.classList.toggle('flex', on);
}
function updateCurrentFileLabel() {
    const label = $('currentFileName');
    if (!currentEditFilePath) { label.innerText = "Select a file to edit..."; return; }
    const hasPending = Object.prototype.hasOwnProperty.call(pendingEdits, currentEditFilePath);
    label.innerText = currentEditFilePath + (hasPending ? "  •  saved, not deployed" : "");
}
function getPreviewKind(path) {
    const ext = (path || '').split('.').pop().toLowerCase();
    if (ext === 'md' || ext === 'markdown') return 'md';
    if (ext === 'html' || ext === 'htm' || ext === 'svg') return 'html';
    return null;
}
function previewReset() {
    const box = $('mdPreviewBox');
    box.classList.add('hidden');
    box.innerHTML = '';
    $('mobileEditor').classList.remove('hidden');
    setLabel('mdPreviewBtn', 'eye', 'Preview');
    hideBinaryViewer();
}
function togglePreview() {
    const box = $('mdPreviewBox');
    if (!box.classList.contains('hidden')) { previewReset(); setTimeout(() => editor.resize(), 50); return; }
    const kind = getPreviewKind(currentEditFilePath);
    if (!kind) return;
    const code = editor.getValue();
    box.classList.toggle('html-mode', kind === 'html');
    box.classList.toggle('markdown-preview', kind === 'md');
    box.innerHTML = '';
    if (kind === 'md') {
        if (typeof marked === 'undefined') { showToast("Markdown library failed to load."); return; }
        try {
            const html = marked.parse(code);
            if (typeof DOMPurify !== 'undefined') box.innerHTML = DOMPurify.sanitize(html);
            else { const pre = document.createElement('pre'); pre.innerText = code; box.appendChild(pre); }
        } catch (e) { box.innerHTML = '<p style="color:red">Could not render Markdown.</p>'; }
    } else {
        const ext = currentEditFilePath.split('.').pop().toLowerCase();
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
        frame.className = 'html-frame';
        frame.srcdoc = (ext === 'svg') ? `<!doctype html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff">${code}</body>` : code;
        box.appendChild(frame);
    }
    $('mobileEditor').classList.add('hidden');
    box.classList.remove('hidden');
    setLabel('mdPreviewBtn', 'edit', 'Edit');
    if (kind === 'md') mdEnhance(box);
}
function updatePendingDeployBar() {
    const count = Object.keys(pendingEdits).length;
    const bar = $('pendingDeployBar');
    const text = $('pendingCountText');
    if (count > 0) { bar.classList.remove('hidden'); bar.classList.add('flex'); text.innerText = `${count} file${count > 1 ? 's' : ''} saved, not deployed yet`; }
    else { bar.classList.add('hidden'); bar.classList.remove('flex'); }
}
function savePendingEdit() {
    if (!currentEditFilePath) return;
    pendingEdits[currentEditFilePath] = editor.getValue();
    editorDirty = false;
    clearTimeout(draftTimer);
    saveSession({ file: currentEditFilePath, pending: pendingEdits, draft: null });
    const saveBtn = $('saveChangesBtn');
    saveBtn.disabled = true;
    saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
    updateCurrentFileLabel();
    updatePendingDeployBar();
    showToast(`Saved "${currentEditFilePath}" locally. Tap Deploy All when you're done editing.`);
}
async function deployAllPendingEdits() {
    const paths = Object.keys(pendingEdits);
    if (paths.length === 0) return showToast("No saved changes to deploy.");
    if (!activeRepoId) return showToast("Select from the menu first!");
    const token = getToken();
    let descs = null;
    if (isGH()) { descs = await collectDescriptions(paths); if (descs === null) return; }
    clearLogs();
    addLog(`Starting batch deployment for ${paths.length} file(s)${isGH() ? ` to ${activeBranch}` : ''}...`);
    showGlobalProgress(`Deploying ${paths.length} file(s)...`, `0/${paths.length}`);
    try {
        const summary = paths.length === 1 ? `Update ${paths[0]} via Mobile Editor` : `Update ${paths.length} files via Mobile Editor`;
        paths.forEach(p => addLog(`Queued: ${p}`));
        if (!isGH()) {
            const ops = paths.map(p => ({ key: "file", value: { path: p, content: utf8ToBase64(pendingEdits[p]), encoding: "base64" } }));
            const lines = [JSON.stringify({ key: "header", value: { summary } }), ...ops.map(o => JSON.stringify(o))];
            const res = await fetch(`https://huggingface.co/api/spaces/${activeRepoId}/commit/main`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-ndjson' },
                body: lines.join("\n")
            });
            if (!res.ok) { const errorText = await res.text(); throw new Error(`HTTP ${res.status} - ${errorText}`); }
        } else {
            const modeMap = {};
            activeFileList.forEach(f => { modeMap[f.path] = f.mode; });
            const r = await ghCommit({
                repo: activeRepoId, branch: activeBranch, message: buildCommitMessage(summary, paths, descs),
                upserts: paths.map(p => ({ path: p, content: pendingEdits[p], mode: modeMap[p] })),
                onProgress: (d, t, p) => { addLog(`Uploaded: ${p}`); updateProgressBar(Math.round((d / t) * 100)); $('fileStats').innerText = `${d}/${t}`; }
            });
            if (r.unchanged) addLog("No changes: content is identical to what's already on the branch.");
        }
        addLog(`Successfully deployed ${paths.length} file(s)!`);
        showToast(`${paths.length} file(s) deployed!`);
        await syncAfterDeploy(paths);
        invalidateVersions(); refreshVersions(true);
        pendingEdits = {};
        saveSession({ pending: {} });
        activeFileList = [];
        updatePendingDeployBar();
        updateCurrentFileLabel();
    } catch (e) {
        addLog(`Deploy Error: ${e.message}`);
        showToast("Deploy Failed: " + e.message);
    } finally { hideGlobalProgress(); }
}
function hideBinaryViewer() {
    const box = $('binaryViewer');
    if (!box) return;
    box.classList.add('hidden');
    if (box._blobUrl) { try { URL.revokeObjectURL(box._blobUrl); } catch (e) {} box._blobUrl = null; }
}
async function showBinaryViewer(filePath, fileEntry, opts = {}) {
    const box = $('binaryViewer');
    const kind = getBinaryKind(filePath) || 'file';
    box.classList.remove('hidden');
    $('mobileEditor').classList.add('hidden');
    $('mdPreviewBox').classList.add('hidden');
    const saveBtn = $('saveChangesBtn');
    saveBtn.disabled = true;
    saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
    if (!fileEntry) {
        box.innerHTML = `
            <div class="p-3 bg-[#161b22] border-b border-[#30363d] flex items-center gap-2">
                <div class="min-w-0 flex-1">
                    <div class="text-xs font-mono text-gray-300 truncate">${esc(filePath)}</div>
                    <div class="text-[10px] text-gray-500">New ${kind} file — upload from device to save with this name</div>
                </div>
                <button onclick="uploadBinaryForCurrent()" class="mini-btn blue shrink-0">${ic('upload')}<span>Upload</span></button>
            </div>
            <div class="p-8 text-center">
                <p class="text-sm text-gray-400 mb-4">This is a <b class="text-gray-200">${kind}</b> file. Upload from device to save it as <span class="font-mono text-gray-200">${esc(filePath)}</span>.</p>
                <button onclick="uploadBinaryForCurrent()" class="mini-btn blue mx-auto">${ic('upload')}<span>Choose file &amp; upload</span></button>
            </div>`;
        return;
    }
    box.innerHTML = `<div class="p-6 text-center text-gray-500 text-xs">Loading ${kind} preview...</div>`;
    try {
        const blob = await getFileBlob(activeRepoId, activeBranch, fileEntry);
        if (!blob) throw new Error('Could not fetch file from server');
        if (box._blobUrl) { try { URL.revokeObjectURL(box._blobUrl); } catch (e) {} }
        const url = URL.createObjectURL(blob);
        box._blobUrl = url;
        let media = '';
        if (kind === 'image') media = `<img src="${url}" alt="${esc(filePath)}" style="max-width:100%;max-height:65vh;display:block;margin:0 auto;border-radius:4px;">`;
        else if (kind === 'audio') media = `<div style="padding:24px;"><audio controls src="${url}" style="width:100%"></audio></div>`;
        else if (kind === 'video') media = `<video controls src="${url}" style="max-width:100%;max-height:65vh;display:block;margin:0 auto;background:#000"></video>`;
        else if (kind === 'pdf') media = `<iframe src="${url}" style="width:100%;height:65vh;border:0;background:#fff"></iframe>`;
        else media = `<p class="text-sm text-gray-500 text-center py-8">Binary file (${kind}). Download or replace below.</p>`;
        box.innerHTML = `
            <div class="p-3 bg-[#161b22] border-b border-[#30363d] flex items-center gap-2">
                <div class="min-w-0 flex-1">
                    <div class="text-xs font-mono text-gray-300 truncate">${esc(filePath)}</div>
                    <div class="text-[10px] text-gray-500">${kind.toUpperCase()} · ${(blob.size/1024).toFixed(1)} KB · ${esc(blob.type || 'application/octet-stream')}</div>
                </div>
                <button onclick="uploadBinaryForCurrent()" class="mini-btn blue shrink-0">${ic('upload')}<span>Replace</span></button>
                <button onclick="downloadBinaryCurrent()" class="icon-btn shrink-0" title="Download">${ic('download')}</button>
            </div>
            <div class="bg-black/40">${media}</div>`;
    } catch (e) {
        box.innerHTML = `
            <div class="p-3 bg-[#161b22] border-b border-[#30363d]">
                <div class="text-xs font-mono text-gray-300 truncate">${esc(filePath)}</div>
            </div>
            <div class="p-6 text-center">
                <p class="text-red-400 text-sm mb-3">${esc(e.message)}</p>
                <button onclick="uploadBinaryForCurrent()" class="mini-btn blue mx-auto">${ic('upload')}<span>Upload a file with this name</span></button>
            </div>`;
    }
}
async function uploadBinaryForCurrent() {
    if (!currentEditFilePath) return showToast('No file selected');
    const targetPath = currentEditFilePath;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '*/*';
    inp.onchange = async () => {
        const file = inp.files[0];
        if (!file) return;
        if (!await askConfirm(`Save "${file.name}" as "${targetPath}" (${(file.size/1024).toFixed(1)} KB)?\nThis creates a commit right away.`, { title: 'Upload binary file', ok: 'Upload', danger: false })) return;
        try {
            showGlobalProgress('Uploading...', '');
            if (isGH()) {
                const modeMap = {};
                activeFileList.forEach(f => modeMap[f.path] = f.mode);
                await ghCommit({
                    repo: activeRepoId, branch: activeBranch,
                    message: `Add/Replace ${targetPath} via Mobile Editor`,
                    upserts: [{ path: targetPath, content: file, mode: modeMap[targetPath] || '100644' }]
                });
            } else {
                const b64 = await blobToBase64(file);
                const lines = [
                    JSON.stringify({ key: 'header', value: { summary: `Add/Replace ${targetPath}` } }),
                    JSON.stringify({ key: 'file', value: { path: targetPath, content: b64, encoding: 'base64' } })
                ];
                const res = await fetch(`https://huggingface.co/api/spaces/${activeRepoId}/commit/main`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/x-ndjson' },
                    body: lines.join('\n')
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            }
            hideGlobalProgress();
            showToast('Uploaded ' + targetPath);
            activeFileList = [];
            await loadLiveFileIntoEditor(targetPath, { silent: true });
        } catch (e) {
            hideGlobalProgress();
            showToast('Upload failed: ' + e.message);
        }
    };
    inp.click();
}
async function downloadBinaryCurrent() {
    if (!currentEditFilePath) return;
    try {
        const f = activeFileList.find(x => x.path === currentEditFilePath) || { path: currentEditFilePath };
        const blob = await getFileBlob(activeRepoId, activeBranch, f);
        if (!blob) throw new Error('Download failed');
        saveAs(blob, currentEditFilePath.split('/').pop());
    } catch (e) { showToast('Download error: ' + e.message); }
}
function actionCopy(targetEditor) {
    const text = targetEditor.getSelectedText() || targetEditor.getValue();
    navigator.clipboard.writeText(text).then(() => showToast("Copied!"));
}
async function actionPaste(targetEditor) {
    try { const text = await navigator.clipboard.readText(); targetEditor.insert(text); showToast("Pasted!"); }
    catch (e) { showToast("Paste permission denied"); }
}
function actionCut(targetEditor) {
    const text = targetEditor.getSelectedText();
    if (text) { navigator.clipboard.writeText(text).then(() => { targetEditor.remove(); showToast("Cut Selected!"); }); }
    else { navigator.clipboard.writeText(targetEditor.getValue()).then(() => { targetEditor.setValue(""); showToast("Cut All!"); }); }
}
function openEditorMenu() {
    if (!activeRepoId) return showToast('Select from the menu first!');
    let ov = $('editorSheet');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'editorSheet'; ov.className = 'sheet-ov';
        ov.innerHTML = '<div class="sheet"><div class="sheet-head"><span>File actions</span><button type="button" id="esClose" class="icon-btn !w-8 !h-8" aria-label="Close"></button></div><div id="esList" class="sheet-list"></div></div>';
        document.body.appendChild(ov);
        $('esClose').innerHTML = ic('x'); $('esClose').onclick = () => ov.classList.remove('open');
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('open'); });
    }
    const list = $('esList'); list.innerHTML = '';
    const add = (icon, title, desc, fn, danger) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'es-item' + (danger ? ' danger' : '');
        b.innerHTML = `<span class="es-ic">${ic(icon)}</span><span class="es-tx"><b>${esc(title)}</b><small>${esc(desc)}</small></span>`;
        b.onclick = () => { ov.classList.remove('open'); fn(); };
        list.appendChild(b);
    };
    const cur = currentEditFilePath;
    add('upload', 'Upload from computer', gistMode ? 'Text files only' : 'Any file: code, images, archives, documents', uploadFromComputer);
    if (isGH() && !gistMode) add('play', 'Create build workflow', 'Adds .github/workflows/build.yml from a template', createBuildWorkflow);
    if (!gistMode) add('folder', 'New folder', 'Create an empty folder', () => promptNewFolder(cur ? dirName(cur) : ''));
    if (cur) {
        add('edit', 'Rename file', cur, () => promptRenameFile(cur));
        add('trash', 'Delete file', cur, () => promptDeleteFile(cur), true);
    }
    ov.classList.add('open');
}
async function uploadFromComputer() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => {
        const files = [...inp.files]; inp.remove();
        if (!files.length) return;
        let folder = '';
        if (!gistMode) {
            const f = await askPrompt(`Upload ${files.length} file${files.length === 1 ? '' : 's'} to which folder?\nLeave empty for the root.`, currentEditFilePath ? dirName(currentEditFilePath) : '', { title: 'Upload files', ok: 'Upload' });
            if (f === null) return;
            folder = cleanFolderPath(f);
            if (folder && badFolderPath(folder)) return showToast('Invalid folder name.');
        }
        const path = (file) => (folder ? folder + '/' : '') + file.name;
        try {
            const existing = await listRepoFiles(activeRepoId, activeBranch).catch(() => []);
            const clash = files.filter(f => existing.some(e => e.path === path(f)));
            if (clash.length && !await askConfirm(`${clash.length} file${clash.length === 1 ? '' : 's'} already exist and will be replaced:\n${clash.slice(0, 6).map(f => '- ' + path(f)).join('\n')}`, { title: 'Replace files?', ok: 'Replace', danger: true })) return;
            const ups = [];
            for (const f of files) {
                if (gistMode) {
                    const buf = new Uint8Array(await f.arrayBuffer());
                    if (buf.includes(0)) return showToast(`"${f.name}" is a binary file. Gists only hold text.`);
                    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return showToast(`"${f.name}" is not UTF-8 text.`); }
                    ups.push({ path: f.name, content: text });
                } else ups.push({ path: path(f), content: f });
            }
            showGlobalProgress(`Uploading ${files.length} file(s)...`, '');
            await structCommit({ message: `Upload ${files.length === 1 ? files[0].name : files.length + ' files'} via Mobile Editor`, upserts: ups });
            hideGlobalProgress();
            showToast(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}`);
            refreshVersions(true);
            if (files.length === 1 && files[0].size < 1048576 && /^(text\/|application\/(json|xml|javascript))/.test(files[0].type || 'text/')) loadLiveFileIntoEditor(ups[0].path, { silent: true });
        } catch (e) { hideGlobalProgress(); showToast('Upload failed: ' + ghHint(e)); }
    };
    inp.click();
}
