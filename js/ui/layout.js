function showToast(msg) {
    const toast = $('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}
function addLog(msg) {
    const logBox = $('logBox');
    const logContainer = $('logBoxContainer');
    if (logContainer.classList.contains('hidden')) logContainer.classList.remove('hidden');
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const p = document.createElement('div');
    p.innerText = `[${time}] ${msg}`;
    logBox.appendChild(p);
    logBox.scrollTop = logBox.scrollHeight;
}
function clearLogs() { $('logBox').innerHTML = ''; }
function copyWorkflowLogs() {
    navigator.clipboard.writeText($('logBox').innerText).then(() => showToast("Logs copied!"))
        .catch(() => showToast("Copy permission denied"));
}
function toggleSidebar() {
    $('sidebar').classList.toggle('open');
    $('drawerOverlay').classList.toggle('open');
}
function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tabId}`));
    if (tabId === 'editor' && typeof editor !== 'undefined') setTimeout(() => editor.resize(), 50);
    if (tabId === 'secrets' && activeRepoId) loadSecrets();
    localStorage.setItem('hf_last_tab', tabId);
}
function openModal(modalId) { $(modalId).classList.add('open'); }
function closeModal(modalId) { $(modalId).classList.remove('open'); }
function openAllSpacesModal() { openModal('allSpacesModal'); toggleSidebar(); }
function showGlobalProgress(status, stats) {
    $('globalProgress').classList.remove('hidden');
    $('statusText').innerText = status;
    $('fileStats').innerText = stats;
}
function updateProgressBar(percentage) { $('progressBar').style.width = `${percentage}%`; }
function hideGlobalProgress() { setTimeout(() => { $('globalProgress').classList.add('hidden'); }, 2000); }
let logsAutoScroll = true;
let errorsOnlyMode = false;
function initLogsScrollTracking() {
    const box = $('serverLogsBox');
    box.addEventListener('scroll', () => {
        logsAutoScroll = (box.scrollTop + box.clientHeight) >= (box.scrollHeight - 24);
    });
}
function toggleFullScreenLogs() {
    const container = $('serverLogsContainer');
    if (container.classList.contains('logs-fullscreen')) {
        container.classList.remove('logs-fullscreen');
        setLabel('fullscreenBtn', 'maximize', 'Full Screen');
    } else {
        container.classList.add('logs-fullscreen');
        setLabel('fullscreenBtn', 'minimize', 'Exit Full Screen');
    }
}
function clearServerLogs() { $('serverLogsBox').innerHTML = ''; logsAutoScroll = true; }
function toggleErrorsOnly() {
    errorsOnlyMode = !errorsOnlyMode;
    const box = $('serverLogsBox');
    const btn = $('errorsOnlyBtn');
    box.classList.toggle('errors-only-mode', errorsOnlyMode);
    if (errorsOnlyMode) { btn.classList.remove('text-green-400', 'text-gray-400'); btn.classList.add('text-red-500'); }
    else { btn.classList.remove('text-red-500', 'text-gray-400'); btn.classList.add('text-green-400'); }
}
function copyServerLogs() {
    navigator.clipboard.writeText($('serverLogsBox').innerText).then(() => showToast("Logs copied!"))
        .catch(() => showToast("Copy permission denied"));
}
function colorizeLogLine(p, lowerMsg) {
    const isError = lowerMsg.includes('error') || lowerMsg.includes('fail') || lowerMsg.includes('exception') || lowerMsg.includes('traceback');
    if (isError) p.classList.add('text-red-500', 'font-bold', 'log-error');
    else if (lowerMsg.includes('warn') || lowerMsg.includes('tip]')) p.classList.add('text-yellow-500');
    else p.classList.add('text-green-400');
}
function appendServerLogLine(msg) {
    const box = $('serverLogsBox');
    const cleanMsg = msg.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
    if (!cleanMsg) return;
    const p = document.createElement('div');
    p.className = 'log-line border-b border-[#30363d]/50 pb-1 mb-1 break-words';
    colorizeLogLine(p, cleanMsg.toLowerCase());
    p.innerText = cleanMsg;
    box.appendChild(p);
    if (logsAutoScroll) box.scrollTop = box.scrollHeight;
}
function logsAction1() { isGH() ? ghLoadRuns() : connectServerLogs('build'); }
function logsAction2() { isGH() ? ghShowLatestLogs() : connectServerLogs('run'); }
function restartAction() { isGH() ? ghRerunLatest() : restartSpace(); }
