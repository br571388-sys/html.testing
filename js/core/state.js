// ===== GLOBAL STATE =====
let provider = 'hf';
let currentUsername = "";
let currentSpacesList = [];
let activeRepoId = null;
let activeBranch = 'main';
let savedAccounts = [];
let editor, historyEditor;
let currentEditFilePath = null;
let pendingEdits = {};
let hvRepoId = null, hvCommitId = null, hvFilePath = null;
let activeFileList = [];
let histFileList = [];
let logStreamController = null;
let currentLogMode = 'run';
let lastRunId = null;
let workerProxyUrl = DEFAULT_WORKER_PROXY_URL;

const isGH = () => provider === 'gh';
const getToken = () => document.getElementById('apiToken').value.trim();
const conc = () => isGH() ? GH_CONCURRENCY : DOWNLOAD_CONCURRENCY;
const protectedFiles = () => PROTECTED[provider];

let loadingEditor = false, editorDirty = false, draftTimer = null;
function sessKey() { return `sess_${provider}_${activeRepoId}_${activeBranch}`; }
function loadSession() {
    try { return JSON.parse(localStorage.getItem(sessKey()) || '{}') || {}; } catch (e) { return {}; }
}
function saveSession(patch) {
    if (!activeRepoId) return;
    try { const cur = loadSession(); Object.assign(cur, patch); localStorage.setItem(sessKey(), JSON.stringify(cur)); }
    catch (e) { console.warn('session save failed', e); }
}
function scheduleDraftSave() { clearTimeout(draftTimer); draftTimer = setTimeout(flushDraft, 700); }
function flushDraft() {
    clearTimeout(draftTimer);
    if (!editorDirty || !currentEditFilePath || !activeRepoId || !editor) return;
    saveSession({ file: currentEditFilePath, draft: { path: currentEditFilePath, content: editor.getValue() } });
}
function setEditorContent(text, path) {
    clearTimeout(draftTimer);
    loadingEditor = true;
    try {
        if (path && editor) editor.session.setMode(`ace/mode/${getAceMode(path)}`);
        if (editor) { editor.setValue(text, -1); editor.clearSelection(); }
    } finally { loadingEditor = false; }
    editorDirty = false;
}
function getAceMode(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const modes = { 'py':'python','html':'html','css':'css','js':'javascript','ts':'typescript','json':'json','md':'markdown','go':'golang','sh':'sh','yaml':'yaml','yml':'yaml','xml':'xml','svg':'xml','htm':'html','markdown':'markdown','sql':'sql','php':'php' };
    return modes[ext] || 'text';
}
const BINARY_EXT = {
    image: ['png','jpg','jpeg','gif','webp','bmp','ico','avif'],
    audio: ['mp3','wav','ogg','m4a','aac','flac','opus'],
    video: ['mp4','webm','mov','m4v','ogv','avi'],
    pdf: ['pdf']
};
function getBinaryKind(path) {
    const ext = String(path || '').split('.').pop().toLowerCase();
    for (const k of Object.keys(BINARY_EXT)) if (BINARY_EXT[k].includes(ext)) return k;
    return null;
}
function isBinaryPath(path) { return !!getBinaryKind(path); }
let treeCacheEnabled = localStorage.getItem('tree_cache') !== '0';
function updateTreeCacheToggle() { const t = $('treeCacheToggle'); if (t) t.classList.toggle('on', treeCacheEnabled); }
function toggleTreeCache() {
    treeCacheEnabled = !treeCacheEnabled;
    localStorage.setItem('tree_cache', treeCacheEnabled ? '1' : '0');
    updateTreeCacheToggle();
    showToast(treeCacheEnabled ? 'Cache ON — showing local edits + server state' : 'Cache OFF — showing exact GitHub/server state');
    if ($('fileTreeModal').classList.contains('open')) openLiveFileSelector();
}
window.addEventListener('error', (e) => {
    try {
        const toast = document.getElementById('toast');
        if (toast) { toast.innerText = `App error: ${e.message} (line ${e.lineno})`; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 6000); }
    } catch(_) {}
    console.error('Uncaught error:', e.message, e.filename, e.lineno);
});
