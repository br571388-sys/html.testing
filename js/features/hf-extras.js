// ===== HF parity extras (v11b) =====
const hfJson = async (path, opts = {}) => {
    const res = await fetch(apiUrl(path), { ...opts, headers: { 'Authorization': `Bearer ${getToken()}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    let j = null; const raw = await res.text(); try { j = raw ? JSON.parse(raw) : null; } catch (_) {}
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(j && (j.error || j.message)) || raw.slice(0, 160) || 'request failed'}`);
    return j;
};
const hfOwnerOf = (id) => String(id).split('/')[0], hfNameOf = (id) => String(id).split('/')[1];
const hfHost = (id) => `https://${hfOwnerOf(id)}-${hfNameOf(id)}`.toLowerCase().replace(/[_.]/g, '-') + '.hf.space';
const HF_STAGE = {
    RUNNING: ['Running', '#3fb950'], RUNNING_BUILDING: ['Running, rebuilding', '#58a6ff'], BUILDING: ['Building', '#58a6ff'], APP_STARTING: ['Starting', '#58a6ff'],
    SLEEPING: ['Sleeping', '#e3b341'], PAUSED: ['Paused', '#e3b341'], STOPPED: ['Stopped', '#8b949e'], NO_APP_FILE: ['No app file', '#e3b341'],
    BUILD_ERROR: ['Build error', '#f85149'], RUNTIME_ERROR: ['Runtime error', '#f85149'], CONFIG_ERROR: ['Config error', '#f85149']
};
const hfStage = (s) => HF_STAGE[s] || [s || 'Unknown', '#8b949e'];
const HF_ERR_HINT = 'Your Hugging Face token needs the Write role, or a fine-grained token with write access to this Space.';
const hfHint = (e) => { const m = String((e && e.message) || e); return /\b(401|403)\b/.test(m) ? m + '. ' + HF_ERR_HINT : m; };
let lsReq = 0;
function renderLiveSpaces(body) {
    if (!getToken()) return notice(body, 'Load your Hugging Face account first.');
    const spaces = currentSpacesList.slice();
    if (!spaces.length) return notice(body, 'No spaces found for this account.');
    spaces.sort((a, b) => (a.id === activeRepoId ? -1 : b.id === activeRepoId ? 1 : 0));
    const top = document.createElement('div'); top.className = 'flex items-center justify-between mb-3';
    top.innerHTML = `<span class="text-[12px] text-gray-400">${spaces.length} space${spaces.length === 1 ? '' : 's'}</span>`;
    top.appendChild(iconBtn('refresh', 'Refresh', () => renderSettings()));
    body.appendChild(top);
    const cards = {};
    spaces.forEach(s => {
        const c = document.createElement('div');
        c.className = 'bg-[#161b22] border border-[#30363d] rounded-xl p-3 mb-3';
        c.innerHTML = `<div class="flex items-center gap-2"><span class="text-blue-400">${ic('globe')}</span><div class="min-w-0 flex-1"><div class="text-sm font-semibold text-gray-100 truncate">${esc(s.id)}${s.id === activeRepoId ? ' <span class="text-[10px] text-blue-400">(current)</span>' : ''}</div><div class="hf-meta text-[11px] text-gray-500">Checking...</div></div>${s.private ? ic('lock', 'ic-sm text-gray-500') : ''}</div>`;
        body.appendChild(c); cards[s.id] = c;
    });
    const req = ++lsReq;
    runConcurrent(spaces.slice(0, 60), 6, async (s) => {
        const c = cards[s.id];
        try {
            const info = await hfJson(`/api/spaces/${s.id}`);
            if (req !== lsReq || !c.isConnected) return;
            const stage = info.runtime && info.runtime.stage, [label, col] = hfStage(stage);
            c.querySelector('.hf-meta').innerHTML = `<span style="color:${col}">${esc(label)}</span> · ${esc(info.sdk || 'space')}${info.runtime && info.runtime.hardware && info.runtime.hardware.current ? ' · ' + esc(info.runtime.hardware.current) : ''}`;
            c.appendChild(linkRow('App', info.host || hfHost(s.id)));
            c.appendChild(linkRow('Space', `https://huggingface.co/spaces/${s.id}`));
        } catch (e) { if (c.isConnected) c.querySelector('.hf-meta').textContent = 'Could not read this space (' + e.message.slice(0, 60) + ')'; }
    });
}
lastResView = 'livepages';
settingsGo = function (v) {
    if (v === 'resources') v = isGH() ? lastResView : 'livespaces';
    if (v === 'livepages') { lastResView = v; lpRepo = null; }
    if (v === 'livegists') { lastResView = v; gistList = null; }
    settingsView = v;
    renderSettings();
};

renderSettings = function () {
    const body = $('settingsBody'), tabs = $('settingsTabs');
    if (!body || !tabs) return;
    body.innerHTML = ''; tabs.innerHTML = '';
    if (!isGH() && (settingsView === 'livepages' || settingsView === 'livegists')) settingsView = 'livespaces';
    if (isGH() && settingsView === 'livespaces') settingsView = lastResView;
    const main = settingsView === 'editor' ? 'editor' : settingsView === 'tokencheck' ? 'token' : 'resources';
    const row = document.createElement('div');
    row.className = 'stabs';
    [['editor', 'Code space', 'editor'], ['resources', 'My Resources', 'resources'], ['token', 'Token check', 'tokencheck']].forEach(([id, label, view]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'stab' + (id === main ? ' active' : ''); b.textContent = label;
        b.onclick = () => { if (id !== main) settingsGo(view); };
        row.appendChild(b);
    });
    tabs.appendChild(row);
    if (main === 'editor') { SETTINGS_SCHEMA.filter(s => s.id === 'editor').forEach(sec => sec.items.forEach(it => renderSettingItem(it, body))); return; }
    if (main === 'token') return renderTokenCheck(body);
    if (!isGH()) return renderLiveSpaces(body);
    const seg = document.createElement('div');
    seg.className = 'seg mb-4';
    [['livepages', 'Live pages', 'globe'], ['livegists', 'Live gists', 'file-text']].forEach(([v, l, i]) => {
        const b = document.createElement('button');
        b.className = settingsView === v ? 'active' : '';
        b.innerHTML = ic(i) + '<span>' + l + '</span>';
        b.onclick = () => settingsGo(v);
        seg.appendChild(b);
    });
    body.appendChild(seg);
    if (settingsView === 'livegists') renderLiveGists(body); else renderLivePages(body);
};
async function hfCmdLinks() {
    const K = 'editor';
    if (!activeRepoId) return cmdSay(K, 'Select a space from the menu first.');
    const wait = cmdSay(K, 'Checking your Space...');
    try {
        const info = await hfJson(`/api/spaces/${activeRepoId}`);
        const stage = info.runtime && info.runtime.stage, [label] = hfStage(stage);
        wait.setText(`${activeRepoId}: ${label}`);
        wait.addLinks([{ label: 'App', url: info.host || hfHost(activeRepoId) }, { label: 'Space', url: `https://huggingface.co/spaces/${activeRepoId}` }, { label: 'Files', url: `https://huggingface.co/spaces/${activeRepoId}/tree/main` }]);
        if (['PAUSED', 'SLEEPING', 'STOPPED', 'RUNTIME_ERROR', 'BUILD_ERROR', 'CONFIG_ERROR'].includes(stage)) {
            wait.addButtons([{ label: 'Restart space', fn: async () => { await hfJson(`/api/spaces/${activeRepoId}/restart`, { method: 'POST' }); wait.setText(`${activeRepoId}: restart requested. Watch it in the Logs tab.`); } }]);
        }
    } catch (e) { wait.setText('Error: ' + hfHint(e)); }
}
(function () {
    const _pl = cmdPageLive; cmdPageLive = async function () { if (!isGH()) return hfCmdLinks(); return _pl.apply(this, arguments); };
    const _pll = cmdPageLinks; cmdPageLinks = async function () { if (!isGH()) return hfCmdLinks(); return _pll.apply(this, arguments); };
    const e = CMD_DEFS.editor;
    Object.defineProperty(e[0], 'desc', { get() { return isGH() ? '.html: publish with GitHub Pages  |  .md: host as Gist (raw + preview)' : 'Space status and live links (app, page, files)'; } });
    Object.defineProperty(e[1], 'desc', { get() { return isGH() ? 'Live page links of this repo, plus its gists' : 'Same as /page-live: links to your Space'; } });
    const _rs = renderSidebarSpaces;
    renderSidebarSpaces = function () {
        const r = _rs.apply(this, arguments);
        const w = $('newRepoWrap'), l = $('newRepoLabel');
        if (w) w.classList.toggle('hidden', !currentUsername);
        if (l) l.textContent = isGH() ? 'New repository' : 'New space';
        return r;
    };
})();
