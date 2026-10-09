// ===== Hugging Face Hub Client =====
let _hubModulePromise = null;
function loadHubModule() {
    if (!_hubModulePromise) _hubModulePromise = import('https://cdn.jsdelivr.net/npm/@huggingface/hub@2.15.0/+esm');
    return _hubModulePromise;
}
function authHeaders(token) { return token ? { 'Authorization': `Bearer ${token}` } : {}; }
function apiUrl(path) {
    if (workerProxyUrl) return `${workerProxyUrl}/proxy${path}`;
    return `https://huggingface.co${path}`;
}
function saveWorkerProxyUrl() {
    const raw = $('workerProxyUrl').value.trim().replace(/\/$/, '');
    const val = raw || DEFAULT_WORKER_PROXY_URL;
    workerProxyUrl = val;
    $('workerProxyUrl').value = val;
    localStorage.setItem('hf_worker_proxy_url', val);
    showToast("Proxy URL saved!");
    if (activeRepoId && !isGH()) loadSecrets();
}
function utf8ToBase64(str) { return window.btoa(unescape(encodeURIComponent(str))); }
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
