// ===== Bootstrap =====
window.onload = () => {
    try {
        ace.config.set('basePath', 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.36.2/');
        editor = ace.edit("mobileEditor");
        editor.setTheme("ace/theme/one_dark");
        editor.session.setMode("ace/mode/python");
        editor.setOptions({ fontSize: "13px", showPrintMargin: false, wrap: false, useSoftTabs: true, tabSize: 4 });
        editor.session.on('change', () => {
            updateEditorLineCount();
            if (loadingEditor || !currentEditFilePath) return;
            editorDirty = true;
            const saveBtn = $('saveChangesBtn');
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            scheduleDraftSave();
        });
        historyEditor = ace.edit("historyEditor");
        historyEditor.setTheme("ace/theme/one_dark");
        historyEditor.session.setMode("ace/mode/python");
        historyEditor.setOptions({ fontSize: "13px", showPrintMargin: false, wrap: false, useSoftTabs: true, tabSize: 4 });
    } catch (e) {
        console.error('Editor init failed:', e);
        showToast('Code editor failed to load — other tabs still work. Try reloading.');
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushDraft(); });
    window.addEventListener('pagehide', flushDraft);
    provider = localStorage.getItem('app_provider') === 'gh' ? 'gh' : 'hf';
    document.body.classList.remove('theme-hf', 'theme-gh');
    document.body.classList.add(provider === 'gh' ? 'theme-gh' : 'theme-hf');
    applyProviderUI();
    loadSavedAccounts();
    initLogsScrollTracking();
    const savedProxy = localStorage.getItem('hf_worker_proxy_url');
    workerProxyUrl = (savedProxy && savedProxy.trim()) ? savedProxy.trim().replace(/\/$/, '') : DEFAULT_WORKER_PROXY_URL;
    const proxyInput = $('workerProxyUrl');
    if (proxyInput) proxyInput.value = workerProxyUrl;
    updateTreeCacheToggle();
    mountCmdBar('editor');
    mountCmdBar('hist');
    hydrateIcons();
};
// Keep theme class in sync when provider changes
const _applyProviderUI_orig = applyProviderUI;
applyProviderUI = function () {
    _applyProviderUI_orig.apply(this, arguments);
    document.body.classList.remove('theme-hf', 'theme-gh');
    document.body.classList.add(isGH() ? 'theme-gh' : 'theme-hf');
};
