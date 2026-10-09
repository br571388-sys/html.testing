// ===== Actions tab wiring =====
(function () {
    const _sw = switchTab;
    switchTab = function (tabId) {
        updateModeClasses();
        const gh = document.body.classList.contains('gh-repo');
        if (tabId === 'serverlogs' && gh) tabId = 'actions';
        if (tabId === 'actions' && !gh) tabId = isGH() ? 'editor' : 'serverlogs';
        const r = _sw.call(this, tabId);
        if (tabId === 'actions') renderActions(); else stopActionsPoll();
        return r;
    };
    const _rs = renderSidebarSpaces;
    renderSidebarSpaces = function () { updateModeClasses(); return _rs.apply(this, arguments); };
    const _sel = selectSpace; selectSpace = function () { const r = _sel.apply(this, arguments); act.workflows = null; act.info = {}; act.wf = null; updateModeClasses(); return r; };
    const _ex = exitGistMode; exitGistMode = function () { const r = _ex.apply(this, arguments); updateModeClasses(); return r; };
    const _sg = selectGist; selectGist = async function () { const r = await _sg.apply(this, arguments); updateModeClasses(); return r; };
    const _bc = onBranchChange; onBranchChange = function () { const r = _bc.apply(this, arguments); act.info = {}; if ($('panel-actions') && $('panel-actions').classList.contains('active')) renderActions(); return r; };
})();

let act = { view: 'workflows', wf: null, branchMode: 'current', workflows: null, runs: null, info: {} };
let actReq = 0, actPollT = null, runDetail = null;
let runLogs = {}, runOpen = new Set(), runPollT = null;
const jobLogCache = new Map();
function updateModeClasses() { document.body.classList.toggle('gh-repo', isGH() && !gistMode); }
function stopActionsPoll() { clearTimeout(actPollT); actPollT = null; }
const ghRepoOk = () => isGH() && !gistMode && !!activeRepoId;
function runState(r) {
    if (r.status !== 'completed') return { k: r.status === 'in_progress' ? 'run' : 'wait', text: r.status === 'in_progress' ? 'Running' : 'Queued' };
    const c = r.conclusion || 'unknown';
    return { k: c === 'success' ? 'ok' : (c === 'failure' || c === 'timed_out' || c === 'startup_failure') ? 'bad' : 'off', text: c.replace('_', ' ') };
}
function stateBadge(s) {
    const col = { ok: '#3fb950', bad: '#f85149', run: '#58a6ff', wait: '#e3b341', off: '#8b949e' }[s.k];
    const icn = { ok: 'check', bad: 'x', run: 'refresh', wait: 'alert', off: 'x' }[s.k];
    return `<span class="${s.k === 'run' ? 'spin' : ''}" style="color:${col};display:inline-flex" title="${esc(s.text)}">${ic(icn)}</span>`;
}
function fmtDur(a, b) {
    if (!a) return '';
    const s = Math.max(0, Math.round(((b ? new Date(b) : new Date()) - new Date(a)) / 1000));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}
function actCard() { const c = document.createElement('div'); c.className = 'bg-[#161b22] border border-[#30363d] rounded-xl p-3 mb-3'; return c; }
async function renderActions() {
    const body = $('actionsBody');
    if (!body) return;
    body.innerHTML = '';
    stopActionsPoll();
    if (!ghRepoOk()) return notice(body, 'Actions are available for GitHub repositories. Select a repository from the menu.');
    const top = document.createElement('div');
    top.className = 'flex items-center gap-2 mb-3';
    const seg = document.createElement('div'); seg.className = 'seg flex-1';
    [['workflows', 'Workflows', 'play'], ['runs', 'Runs', 'terminal']].forEach(([v, l, i]) => {
        const b = document.createElement('button'); b.className = act.view === v ? 'active' : ''; b.innerHTML = ic(i) + '<span>' + l + '</span>';
        b.onclick = () => { act.view = v; renderActions(); }; seg.appendChild(b);
    });
    top.appendChild(seg);
    top.appendChild(iconBtn('refresh', 'Refresh', () => { act.workflows = null; act.info = {}; renderActions(); }));
    body.appendChild(top);
    body.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-gray-500 mb-3 truncate">${esc(activeRepoId)} on <span class="font-mono text-gray-300">${esc(activeBranch)}</span></p>`);
    const out = document.createElement('div'); body.appendChild(out);
    const req = ++actReq;
    if (act.view === 'workflows') loadWorkflows(out, req); else loadRuns(out, req);
}
async function ensureWorkflows() {
    if (act.workflows) return act.workflows;
    const j = await ghJson(`/repos/${activeRepoId}/actions/workflows?per_page=100`);
    act.workflows = j.workflows || [];
    return act.workflows;
}
function parseDispatch(text) {
    const res = { dispatch: false, inputs: [] };
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const ind = (l) => l.length - l.trimStart().length;
    const clean = (v) => String(v == null ? '' : v).replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
    if (/^\s*on:\s*workflow_dispatch\s*(#.*)?$/m.test(text) || /^\s*on:\s*\[[^\]]*workflow_dispatch[^\]]*\]/m.test(text) || /^\s*-\s*workflow_dispatch\s*(#.*)?$/m.test(text)) res.dispatch = true;
    const idx = lines.findIndex(l => /^\s*workflow_dispatch:/.test(l));
    if (idx < 0) return res;
    res.dispatch = true;
    const base = ind(lines[idx]);
    let i = idx + 1, inpAt = -1;
    for (; i < lines.length; i++) {
        const l = lines[i];
        if (!l.trim() || l.trim().startsWith('#')) continue;
        if (ind(l) <= base) break;
        if (/^\s*inputs:\s*(#.*)?$/.test(l)) { inpAt = i; break; }
    }
    if (inpAt < 0) return res;
    const ib = ind(lines[inpAt]);
    let keyInd = -1, cur = null;
    for (let k = inpAt + 1; k < lines.length; k++) {
        const l = lines[k];
        if (!l.trim() || l.trim().startsWith('#')) continue;
        const n = ind(l);
        if (n <= ib) break;
        if (keyInd < 0) keyInd = n;
        const t = l.trim();
        if (n === keyInd) {
            const m = t.match(/^(['"]?)([\w.-]+)\1:\s*(#.*)?$/);
            if (m) { cur = { key: m[2], label: m[2], type: 'string', required: false, default: null, description: '', options: [] }; res.inputs.push(cur); }
            continue;
        }
        if (!cur) continue;
        if (t.startsWith('- ') && cur.type === 'choice') { cur.options.push(clean(t.slice(2))); continue; }
        const kv = t.match(/^([\w-]+):\s*(.*)$/);
        if (!kv) continue;
        const v = clean(kv[2]);
        if (kv[1] === 'description') cur.description = v;
        else if (kv[1] === 'required') cur.required = v === 'true';
        else if (kv[1] === 'default') cur.default = v;
        else if (kv[1] === 'type') cur.type = v || 'string';
    }
    return res;
}
async function wfInfo(wf) {
    const key = wf.path + '@' + activeBranch;
    if (act.info[key]) return act.info[key];
    let info = { dispatch: false, inputs: [], ok: false };
    try {
        const r = await ghFetch(`/repos/${activeRepoId}/contents/${encPath(wf.path)}?ref=${encodeURIComponent(activeBranch)}`, { headers: { 'Accept': 'application/vnd.github.raw+json' } });
        if (r.ok) info = { ...parseDispatch(await r.text()), ok: true };
    } catch (e) {}
    act.info[key] = info;
    return info;
}
async function loadWorkflows(out, req) {
    out.innerHTML = '<p class="text-xs text-gray-500 text-center mt-8">Loading workflows...</p>';
    try {
        const wfs = await ensureWorkflows();
        if (req !== actReq) return;
        out.innerHTML = '';
        if (!wfs.length) {
            notice(out, 'This repository has no workflows yet.');
            const cb = document.createElement('button'); cb.className = 'mini-btn blue w-full mt-4';
            cb.innerHTML = ic('plus') + '<span>Create build workflow</span>';
            cb.onclick = () => createBuildWorkflow(); out.appendChild(cb);
            return;
        }
        wfs.forEach(wf => {
            const c = actCard();
            const active = wf.state === 'active';
            c.innerHTML = `<div class="flex items-center gap-2"><span class="text-blue-400">${ic('play', 'ic-sm')}</span><div class="min-w-0 flex-1"><div class="text-[13px] font-semibold text-gray-100 truncate">${esc(wf.name)}</div><div class="text-[10px] font-mono text-gray-500 truncate">${esc(wf.path)}</div></div><span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${active ? 'bg-[#13361f] text-green-400' : 'bg-[#3d2c0b] text-yellow-400'}">${active ? 'active' : 'disabled'}</span></div><p class="wf-note text-[11px] text-gray-500 mt-2">Reading trigger...</p>`;
            const row = document.createElement('div'); row.className = 'grid grid-cols-2 gap-2 mt-3';
            const run = document.createElement('button'); run.className = 'mini-btn blue'; run.innerHTML = ic('play', 'ic-sm') + '<span>Run</span>'; run.disabled = true; run.style.opacity = '.5';
            const runs = document.createElement('button'); runs.className = 'mini-btn'; runs.innerHTML = ic('terminal', 'ic-sm') + '<span>Runs</span>';
            runs.onclick = () => { act.view = 'runs'; act.wf = wf.id; renderActions(); };
            const open = document.createElement('button'); open.className = 'mini-btn'; open.innerHTML = ic('file-text', 'ic-sm') + '<span>Open file</span>';
            open.onclick = () => { switchTab('editor'); loadLiveFileIntoEditor(wf.path); };
            const tog = document.createElement('button'); tog.className = 'mini-btn'; tog.textContent = active ? 'Disable' : 'Enable';
            tog.onclick = async () => {
                if (active && !await askConfirm(`Disable "${wf.name}"?`)) return;
                try {
                    const r = await ghFetch(`/repos/${activeRepoId}/actions/workflows/${wf.id}/${active ? 'disable' : 'enable'}`, { method: 'PUT' });
                    if (r.status !== 204) throw new Error(`GitHub ${r.status}`);
                    act.workflows = null; showToast(active ? 'Workflow disabled' : 'Workflow enabled'); renderActions();
                } catch (e) { showToast(actErr(e)); }
            };
            row.appendChild(run); row.appendChild(runs); row.appendChild(open); row.appendChild(tog);
            c.appendChild(row); out.appendChild(c);
            wfInfo(wf).then(info => {
                if (!c.isConnected) return;
                const note = c.querySelector('.wf-note');
                if (!info.ok) { note.textContent = 'Could not read the workflow file.'; return; }
                if (info.dispatch) {
                    note.textContent = info.inputs.length ? `Manual run enabled. ${info.inputs.length} input(s)` : 'Manual run enabled.';
                    note.className = 'wf-note text-[11px] text-green-400 mt-2';
                    run.disabled = !active; run.style.opacity = active ? '1' : '.5';
                    run.onclick = () => runWorkflow(wf, info);
                } else {
                    note.innerHTML = 'No manual trigger.';
                }
            });
        });
    } catch (e) { if (req === actReq) out.innerHTML = `<p class="text-sm text-red-400 text-center mt-8">${esc(actErr(e))}</p>`; }
}
const ACTIONS_HINT = 'Your token needs "Actions: Read and write" (fine-grained) or the "repo" scope (classic).';
function actErr(e) { const m = String((e && e.message) || e); return /\b(401|403|404)\b/.test(m) ? `${m}. ${ACTIONS_HINT}` : m; }
async function runWorkflow(wf, info) {
    const branches = (branchNames.length ? branchNames : [activeBranch]).slice();
    if (!branches.includes(activeBranch)) branches.unshift(activeBranch);
    const fields = [{ key: '__ref', label: 'Branch to run on', type: 'choice', options: branches, default: activeBranch }];
    info.inputs.forEach(i => fields.push({ key: i.key, label: i.key, type: i.type === 'choice' && i.options.length ? 'choice' : (i.type === 'boolean' ? 'boolean' : (i.type === 'number' ? 'number' : 'string')), options: i.options, default: i.default, required: i.required, description: i.description }));
    const vals = await askForm({ title: `Run ${wf.name}`, ok: 'Run workflow', fields });
    if (!vals) return;
    const inputs = {};
    info.inputs.forEach(i => { const v = vals[i.key]; if (v !== '' && v != null) inputs[i.key] = String(v); });
    try {
        const r = await ghFetch(`/repos/${activeRepoId}/actions/workflows/${wf.id}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: vals.__ref, inputs }) });
        if (r.status !== 204) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error(`GitHub ${r.status}: ${m || 'dispatch failed'}`); }
        showToast('Workflow started');
        act.view = 'runs'; act.wf = wf.id; act.branchMode = 'all';
        renderActions();
    } catch (e) { showToast(actErr(e)); }
}
async function loadRuns(out, req) {
    out.innerHTML = '<p class="text-xs text-gray-500 text-center mt-8">Loading runs...</p>';
    try {
        const wfs = await ensureWorkflows().catch(() => []);
        let url = act.wf ? `/repos/${activeRepoId}/actions/workflows/${act.wf}/runs?per_page=30` : `/repos/${activeRepoId}/actions/runs?per_page=30`;
        if (act.branchMode === 'current') url += `&branch=${encodeURIComponent(activeBranch)}`;
        const j = await ghJson(url);
        if (req !== actReq) return;
        const runs = j.workflow_runs || [];
        act.runs = runs;
        out.innerHTML = '';
        const f = document.createElement('div'); f.className = 'grid grid-cols-2 gap-2 mb-3';
        f.innerHTML = `<select class="modern-input !mb-0 !py-2 text-xs"><option value="current">Branch: ${esc(activeBranch)}</option><option value="all">All branches</option></select><select class="modern-input !mb-0 !py-2 text-xs"><option value="">All workflows</option>${wfs.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select>`;
        const [s1, s2] = f.querySelectorAll('select'); s1.value = act.branchMode; s2.value = act.wf ? String(act.wf) : '';
        s1.onchange = () => { act.branchMode = s1.value; renderActions(); };
        s2.onchange = () => { act.wf = s2.value ? Number(s2.value) : null; renderActions(); };
        out.appendChild(f);
        if (!runs.length) { notice(out, 'No runs match these filters.'); return; }
        runs.forEach(r => {
            const st = runState(r), c = actCard();
            c.style.cursor = 'pointer';
            c.innerHTML = `<div class="flex items-start gap-2">${stateBadge(st)}<div class="min-w-0 flex-1"><div class="text-[13px] font-semibold text-gray-100 break-words">#${r.run_number} ${esc(r.display_title || r.name)}</div><div class="text-[11px] text-gray-400 mt-0.5">${esc(r.name)} · <span class="font-mono">${esc(r.head_branch || '')}</span> · ${esc(r.event)}</div><div class="text-[10px] text-gray-500 mt-0.5">${esc(st.text)} · ${esc(verAgo(r.created_at))}${r.run_started_at ? ' · ' + esc(fmtDur(r.run_started_at, r.status === 'completed' ? r.updated_at : null)) : ''}</div></div></div>`;
            const row = document.createElement('div'); row.className = 'flex gap-2 mt-2';
            if (r.status !== 'completed') {
                const cb = document.createElement('button'); cb.className = 'mini-btn danger-btn flex-1'; cb.textContent = 'Cancel';
                cb.onclick = (ev) => { ev.stopPropagation(); runAction(r.id, 'cancel'); };
                row.appendChild(cb);
            } else {
                const rb = document.createElement('button'); rb.className = 'mini-btn blue flex-1'; rb.innerHTML = ic('refresh', 'ic-sm') + '<span>Re-run</span>';
                rb.onclick = (ev) => { ev.stopPropagation(); runAction(r.id, 'rerun'); };
                row.appendChild(rb);
            }
            const db = document.createElement('button'); db.className = 'mini-btn flex-1'; db.textContent = 'Details';
            db.onclick = (ev) => { ev.stopPropagation(); openRunDetail(r.id); };
            row.appendChild(db);
            c.appendChild(row);
            c.onclick = () => openRunDetail(r.id);
            out.appendChild(c);
        });
        if (runs.some(r => r.status !== 'completed')) {
            stopActionsPoll();
            actPollT = setTimeout(() => { if ($('panel-actions').classList.contains('active') && act.view === 'runs' && !$('runPage').classList.contains('open')) renderActions(); }, 6000);
        }
    } catch (e) { if (req === actReq) out.innerHTML = `<p class="text-sm text-red-400 text-center mt-8">${esc(actErr(e))}</p>`; }
}
async function runAction(id, what) {
    const labels = { cancel: 'Cancel this run?', rerun: 'Re-run all jobs?', 'rerun-failed-jobs': 'Re-run failed jobs?' };
    if (!await askConfirm(labels[what] || 'Continue?', { title: 'Actions', ok: 'Yes', danger: what === 'cancel' })) return;
    try {
        const r = await ghFetch(`/repos/${activeRepoId}/actions/runs/${id}/${what}`, { method: 'POST' });
        if (![201, 202].includes(r.status)) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error(`GitHub ${r.status}: ${m || 'failed'}`); }
        showToast(what === 'cancel' ? 'Cancel requested' : 'Re-run started');
        setTimeout(() => { if (runDetail && runDetail.id === id) loadRunDetail(); else if ($('panel-actions').classList.contains('active')) renderActions(); }, 2500);
    } catch (e) { showToast(actErr(e)); }
}
function openRunDetail(id) {
    runDetail = { id }; runLogs = {}; runOpen = new Set(); jobLogCache.clear();
    $('runTitle').textContent = 'Run';
    $('runBody').innerHTML = '<p class="text-xs text-gray-500 text-center mt-10">Loading run...</p>';
    openPageById('runPage');
    loadRunDetail();
}
function closeRunPage() { clearTimeout(runPollT); runDetail = null; closePage('runPage'); if ($('panel-actions').classList.contains('active')) renderActions(); }
function logClean(l) { return l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''); }
function logErrors(text) {
    const lines = text.split('\n').map(logClean);
    const idx = lines.findIndex(l => l.includes('##[error]'));
    if (idx < 0) return { errors: [], before: lines.filter(l => l.trim()).slice(-12) };
    const errors = [...new Set(lines.filter(l => l.includes('##[error]')).map(l => l.replace(/^.*##\[error\]/, '').trim()).filter(Boolean))].slice(0, 12);
    const before = lines.slice(Math.max(0, idx - 14), idx).filter(l => l.trim() && !l.startsWith('##[group]') && !l.startsWith('##[endgroup]')).slice(-10);
    return { errors, before };
}
async function fetchJobLog(jobId) {
    if (jobLogCache.has(jobId)) return jobLogCache.get(jobId);
    const res = await ghFetch(`/repos/${activeRepoId}/actions/jobs/${jobId}/logs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const t = await res.text();
    jobLogCache.set(jobId, t);
    return t;
}
function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
async function downloadArtifact(a, runUrl, btn) {
    const old = btn.innerHTML; btn.disabled = true; btn.textContent = 'Downloading...';
    try {
        const res = await ghFetch(`/repos/${activeRepoId}/actions/artifacts/${a.id}/zip`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        saveAs(blob, a.name + '.zip');
        showToast('Downloaded ' + a.name + '.zip');
    } catch (e) { showToast(`Could not download (${e.message}). Opening GitHub.`); window.open(runUrl, '_blank', 'noopener'); }
    btn.disabled = false; btn.innerHTML = old;
}
async function openArtifactFiles(a, runUrl, box, btn) {
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden'); box.textContent = 'Reading the zip...';
    try {
        const res = await ghFetch(`/repos/${activeRepoId}/actions/artifacts/${a.id}/zip`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const zip = await JSZip.loadAsync(await res.blob());
        box.innerHTML = '';
        Object.values(zip.files).filter(f => !f.dir).forEach(f => {
            const row = document.createElement('div'); row.className = 'flex items-center gap-2 mt-2';
            row.innerHTML = `<span class="text-[12px] font-mono text-gray-200 truncate flex-1 min-w-0">${esc(f.name)}</span>`;
            const dl = document.createElement('button'); dl.className = 'mini-btn blue'; dl.textContent = 'Download';
            dl.onclick = async () => { const b = await f.async('blob'); saveAs(b, baseName(f.name)); };
            row.appendChild(dl); box.appendChild(row);
        });
        if (!box.children.length) box.textContent = 'The artifact is empty.';
    } catch (e) { box.textContent = `Could not read it here (${e.message}).`; }
}
async function loadArtifactsInto(body, runId, runUrl) {
    let arts = [];
    try { arts = (await ghJson(`/repos/${activeRepoId}/actions/runs/${runId}/artifacts?per_page=50`)).artifacts || []; } catch (e) { return; }
    if (!runDetail || runDetail.id !== runId) return;
    if (!arts.length) return;
    const c = actCard();
    c.innerHTML = `<div class="text-sm font-bold text-gray-100">Artifacts (${arts.length})</div><p class="text-[11px] text-gray-500 mt-0.5">Files produced by this run.</p>`;
    arts.forEach(a => {
        const row = document.createElement('div'); row.className = 'mt-3 p-2 rounded-lg border border-[#30363d] bg-[#0d1117]';
        row.innerHTML = `<div class="flex items-center gap-2"><span class="text-blue-400">${ic('archive', 'ic-sm')}</span><div class="min-w-0 flex-1"><div class="text-[13px] font-mono text-gray-100 truncate">${esc(a.name)}</div><div class="text-[10px] text-gray-500">${fmtSize(a.size_in_bytes)}${a.expired ? ' · expired' : ''}</div></div></div>`;
        if (!a.expired) {
            const btns = document.createElement('div'); btns.className = 'grid grid-cols-2 gap-2 mt-2';
            const dz = document.createElement('button'); dz.className = 'mini-btn blue'; dz.innerHTML = ic('download', 'ic-sm') + '<span>Download zip</span>';
            const fl = document.createElement('button'); fl.className = 'mini-btn'; fl.textContent = 'Files inside';
            const box = document.createElement('div'); box.className = 'hidden mt-1';
            dz.onclick = () => downloadArtifact(a, runUrl, dz);
            fl.onclick = () => openArtifactFiles(a, runUrl, box, fl);
            btns.appendChild(dz); btns.appendChild(fl); row.appendChild(btns); row.appendChild(box);
        }
        c.appendChild(row);
    });
    body.appendChild(c);
}
function logToolbar(getText, errText) {
    const bar = document.createElement('div'); bar.className = 'flex gap-2 mt-2';
    const cp = document.createElement('button'); cp.className = 'mini-btn flex-1'; cp.innerHTML = ic('copy', 'ic-sm') + '<span>Copy log</span>'; cp.onclick = () => copyText(getText());
    bar.appendChild(cp);
    if (errText) { const ce = document.createElement('button'); ce.className = 'mini-btn flex-1'; ce.innerHTML = ic('copy', 'ic-sm') + '<span>Copy errors</span>'; ce.onclick = () => copyText(errText); bar.appendChild(ce); }
    return bar;
}
async function loadRunDetail() {
    if (!runDetail) return;
    const id = runDetail.id, body = $('runBody'), keep = body.scrollTop;
    clearTimeout(runPollT);
    try {
        const [r, jj] = await Promise.all([ghJson(`/repos/${activeRepoId}/actions/runs/${id}`), ghJson(`/repos/${activeRepoId}/actions/runs/${id}/jobs?per_page=100`)]);
        if (!runDetail || runDetail.id !== id) return;
        $('runTitle').textContent = `Run #${r.run_number}`;
        const st = runState(r), jobs = jj.jobs || [];
        body.innerHTML = '';
        const sum = actCard();
        sum.innerHTML = `<div class="flex items-start gap-2">${stateBadge(st)}<div class="min-w-0 flex-1"><div class="text-sm font-bold text-gray-100 break-words">${esc(r.display_title || r.name)}</div><div class="text-[11px] text-gray-400 mt-1">${esc(r.name)} · <span class="font-mono">${esc(r.head_branch || '')}</span> · ${esc(r.event)}</div><div class="text-[11px] text-gray-500 mt-1">${esc(st.text)} · ${esc(fmtDur(r.run_started_at, r.status === 'completed' ? r.updated_at : null))} · commit <span class="font-mono">${esc((r.head_sha || '').slice(0, 7))}</span></div></div></div>`;
        const row = document.createElement('div'); row.className = 'grid grid-cols-2 gap-2 mt-3';
        const add = (label, fn, cls) => { const b = document.createElement('button'); b.className = 'mini-btn ' + (cls || ''); b.textContent = label; b.onclick = fn; row.appendChild(b); };
        if (r.status !== 'completed') add('Cancel run', () => runAction(id, 'cancel'), 'danger-btn');
        else {
            add('Re-run all', () => runAction(id, 'rerun'), 'blue');
            if (r.conclusion === 'failure') add('Re-run failed', () => runAction(id, 'rerun-failed-jobs'), 'blue');
            add('Delete run', async () => {
                if (!await askConfirm(`Delete run #${r.run_number}?`, { title: 'Delete run', ok: 'Delete', danger: true })) return;
                try { const d = await ghFetch(`/repos/${activeRepoId}/actions/runs/${id}`, { method: 'DELETE' }); if (d.status !== 204) throw new Error(`GitHub ${d.status}`); showToast('Run deleted'); closeRunPage(); } catch (e) { showToast(actErr(e)); }
            }, 'danger-btn');
        }
        add('Open on GitHub', () => window.open(r.html_url, '_blank', 'noopener'));
        sum.appendChild(row);
        body.appendChild(sum);
        const failed = jobs.filter(j => j.status === 'completed' && ['failure', 'timed_out', 'startup_failure'].includes(j.conclusion));
        if (failed.length) {
            const fc = actCard();
            fc.style.borderColor = '#6e2a2a'; fc.style.background = '#1a0f10';
            fc.innerHTML = '<div class="text-sm font-bold text-red-400">What failed</div><p class="fail-body text-[11px] text-gray-500 mt-1">Reading the error...</p>';
            body.appendChild(fc);
            (async () => {
                let report = '';
                const fb = fc.querySelector('.fail-body'); const parts = [];
                for (const j of failed) {
                    const steps = (j.steps || []).filter(s => s.conclusion === 'failure');
                    let msgs = [], before = [];
                    try { const t = await fetchJobLog(j.id); const e = logErrors(t); msgs = e.errors; before = e.before; } catch (e) {}
                    const stepTxt = steps.length ? steps.map(s => `step ${s.number}: ${s.name}`).join(', ') : 'unknown step';
                    parts.push({ job: j.name, stepTxt, msgs, before });
                    report += `Job: ${j.name}\nFailed at: ${stepTxt}\n` + (msgs.length ? 'Error:\n' + msgs.map(m => '  ' + m).join('\n') + '\n' : '') + '\n';
                }
                if (!fc.isConnected) return;
                fb.innerHTML = '';
                parts.forEach(p => {
                    const d = document.createElement('div'); d.className = 'mt-2';
                    d.innerHTML = `<div class="text-[12px] text-gray-200"><b>${esc(p.job)}</b> failed at <span class="font-mono text-red-300">${esc(p.stepTxt)}</span></div>` +
                        (p.msgs.length ? `<pre class="runlog" style="max-height:30vh;color:#ff9b94">${esc(p.msgs.join('\n'))}</pre>` : '<p class="text-[11px] text-gray-500 mt-1">No error text was returned.</p>');
                    fb.appendChild(d);
                });
                const cp = document.createElement('button'); cp.className = 'mini-btn w-full mt-3'; cp.innerHTML = ic('copy', 'ic-sm') + '<span>Copy failure report</span>'; cp.onclick = () => copyText(report.trim());
                fb.appendChild(cp);
            })();
        }
        if (!jobs.length) body.insertAdjacentHTML('beforeend', '<p class="text-sm text-gray-500 text-center mt-6">No jobs yet.</p>');
        jobs.forEach(job => {
            const live = job.status !== 'completed';
            const js = live ? { k: job.status === 'in_progress' ? 'run' : 'wait', text: job.status === 'in_progress' ? 'running' : 'queued' } : { k: job.conclusion === 'success' ? 'ok' : job.conclusion === 'failure' ? 'bad' : 'off', text: job.conclusion };
            const c = actCard();
            c.innerHTML = `<div class="flex items-center gap-2">${stateBadge(js)}<div class="min-w-0 flex-1"><div class="text-[13px] font-semibold text-gray-100 truncate">${esc(job.name)}</div><div class="text-[10px] text-gray-500">${esc(js.text)} · ${esc(fmtDur(job.started_at, job.completed_at))}</div></div>${live ? '<span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#1f3a66] text-blue-300">live</span>' : ''}</div>`;
            const steps = document.createElement('div'); steps.className = 'mt-2 flex flex-col gap-1';
            (job.steps || []).forEach(s => {
                const ss = s.status !== 'completed' ? { k: s.status === 'in_progress' ? 'run' : 'wait', text: s.status } : { k: s.conclusion === 'success' ? 'ok' : s.conclusion === 'failure' ? 'bad' : 'off', text: s.conclusion };
                steps.insertAdjacentHTML('beforeend', `<div class="flex items-center gap-2 text-[11px] ${s.status === 'in_progress' ? 'text-blue-300 font-semibold' : 'text-gray-300'}">${stateBadge(ss)}<span class="truncate flex-1">${s.number}. ${esc(s.name)}</span><span class="text-gray-600">${esc(fmtDur(s.started_at, s.completed_at))}</span></div>`);
            });
            c.appendChild(steps);
            if (live) {
                const lv = document.createElement('button'); lv.className = 'mini-btn w-full mt-2'; lv.innerHTML = ic('external-link', 'ic-sm') + '<span>Watch live on GitHub</span>'; lv.onclick = () => window.open(job.html_url, '_blank', 'noopener');
                c.appendChild(lv);
            } else {
                const lb = document.createElement('button'); lb.className = 'mini-btn blue w-full mt-3'; lb.innerHTML = ic('terminal', 'ic-sm') + '<span>Show logs</span>';
                const wrap = document.createElement('div'); wrap.className = 'hidden';
                const pre = document.createElement('pre'); pre.className = 'runlog';
                let text = '';
                const paint = () => {
                    pre.innerHTML = '';
                    const lines = text.split('\n'), shown = lines.slice(-1500);
                    shown.forEach(l => {
                        const d = document.createElement('div'), t = logClean(l);
                        if (/##\[error\]|\berror\b|failed|exception|traceback/i.test(t)) d.className = 'text-red-400';
                        else if (/##\[warning\]|\bwarn/i.test(t)) d.className = 'text-yellow-400';
                        else if (/^##\[group\]/.test(t)) d.className = 'text-blue-300 font-bold';
                        d.textContent = t.replace(/^##\[(group|endgroup|error|warning)\]/, ''); pre.appendChild(d);
                    });
                    pre.scrollTop = pre.scrollHeight;
                };
                const openLog = async () => {
                    wrap.classList.remove('hidden'); lb.querySelector('span').textContent = 'Hide logs'; runOpen.add(job.id);
                    if (!text) { pre.textContent = 'Loading logs...'; try { text = await fetchJobLog(job.id); } catch (e) { pre.textContent = `Could not load the log (${e.message}).`; return; } }
                    paint();
                };
                wrap.appendChild(logToolbar(() => text, null));
                wrap.appendChild(pre);
                lb.onclick = () => { if (!wrap.classList.contains('hidden')) { wrap.classList.add('hidden'); lb.querySelector('span').textContent = 'Show logs'; runOpen.delete(job.id); } else openLog(); };
                c.appendChild(lb); c.appendChild(wrap);
                if (runOpen.has(job.id)) openLog();
            }
            body.appendChild(c);
        });
        if (r.status === 'completed' && jobs.length) loadArtifactsInto(body, id, r.html_url);
        body.scrollTop = keep;
        if (r.status !== 'completed') runPollT = setTimeout(loadRunDetail, 3000);
    } catch (e) { if (runDetail && runDetail.id === id) body.innerHTML = `<p class="text-sm text-red-400 text-center mt-10 px-3 break-words">${esc(actErr(e))}</p>`; }
}
updateModeClasses();
setTimeout(updateModeClasses, 600);
