;(function() {
'use strict';
const CF_PROXY_URL = 'https://wpstatus.fz-anime.workers.dev';
const $ = (id) => document.getElementById(id);
const h = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const enc = new TextEncoder(), dec = new TextDecoder();
const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const toast = (m) => showToast(m);
Object.assign(ICONS, {
    cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
});
SETTINGS_SCHEMA.push({ id: 'cfeditor', title: 'Cloudflare editor', icon: 'code', items: [
    { key: 'cfWrap', label: 'Word wrap', type: 'toggle', default: false, desc: 'Wrap long lines in the Worker / Pages code editor.' },
    { key: 'cfFont', label: 'Font size', type: 'choice', default: '13', desc: 'Text size of the Cloudflare code editor.',
      options: [{ value: '11', label: 'Small' }, { value: '13', label: 'Normal' }, { value: '16', label: 'Large' }] },
    { key: 'cfTab', label: 'Tab size', type: 'choice', default: '2', desc: 'Spaces inserted for one tab.',
      options: [{ value: '2', label: '2' }, { value: '4', label: '4' }] }
] });
loadSettings();
const S = {
    accounts: LS.get('cf_accounts', []), cur: null,
    sec: localStorage.getItem('cf_sec') || 'pages',
    lists: {}, sel: null, tab: null, req: 0, sub: undefined, onLeave: null, ghTok: null, tc: null, tcRun: false
};
const SEC = {
    pages:      { label: 'Pages',      icon: 'globe',    one: 'Pages project',     tabs: [['overview', 'Overview', 'globe'], ['deploys', 'Deploys', 'clock'], ['editor', 'Editor', 'edit'], ['logs', 'Logs', 'terminal'], ['settings', 'Settings', 'settings']] },
    workers:    { label: 'Workers',    icon: 'zap',      one: 'Worker',            tabs: [['overview', 'Overview', 'globe'], ['code', 'Code', 'code'], ['versions', 'Versions', 'clock'], ['logs', 'Logs', 'terminal'], ['settings', 'Settings', 'settings']] },
    d1:         { label: 'D1',         icon: 'database', one: 'D1 database',       tabs: [['tables', 'Tables', 'list'], ['sql', 'SQL', 'terminal'], ['settings', 'Settings', 'settings']] },
    kv:         { label: 'KV',         icon: 'key',      one: 'KV namespace',      tabs: [['keys', 'Keys', 'list'], ['settings', 'Settings', 'settings']] },
    r2:         { label: 'R2',         icon: 'archive',  one: 'R2 bucket',         tabs: [['settings', 'Settings', 'settings']] },
    queues:     { label: 'Queues',     icon: 'layers',   one: 'Queue',             tabs: [['settings', 'Settings', 'settings']] },
    vectorize:  { label: 'Vectorize',  icon: 'activity', one: 'Vectorize index',   tabs: [['settings', 'Settings', 'settings']] },
    hyperdrive: { label: 'Hyperdrive', icon: 'link',     one: 'Hyperdrive config', tabs: [['settings', 'Settings', 'settings']] }
};
const SEC_ORDER = ['pages', 'workers', 'd1', 'kv', 'r2', 'queues', 'vectorize', 'hyperdrive'];
const SETTINGS_TAB = 'settings';
function ago(iso) {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (isNaN(s)) return '';
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
}
const fmtBytes = (n) => n == null ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
function copy(t) {
    const fb = () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Copy failed'); } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => toast('Copied')).catch(fb); else fb();
}
function badge(text, kind) { return `<span class="cfbadge ${kind || ''}">${esc(text)}</span>`; }
function errMsg(e) {
    let m = String((e && e.message) || e);
    if (e && (e.status === 403 || /\b10000\b|Authentication error/i.test(m))) m += '  (Your key/token does not have permission for this resource. See Settings > Token check.)';
    return m;
}
function card(title, desc, danger) { return rsCard(title, desc, danger); }
function btn(label, cls, fn, icon) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mini-btn ' + (cls || '');
    b.innerHTML = (icon ? ic(icon) : '') + '<span>' + esc(label) + '</span>';
    b.onclick = async (ev) => {
        if (b.disabled) return; b.disabled = true; b.style.opacity = '.6';
        try { await fn(b, ev); } catch (e) { if (!(e && e.message === 'cancelled')) toast(errMsg(e)); console.error(e); }
        b.disabled = false; b.style.opacity = '';
    };
    return b;
}
function row(parent, cls) { const d = document.createElement('div'); d.className = cls || 'flex flex-wrap gap-2 mt-3'; parent.appendChild(d); return d; }
function kvRows(c, pairs) {
    pairs.filter(p => p[1] != null && p[1] !== '').forEach(([k, v, link]) => {
        const d = h(`<div class="flex items-center gap-2 mt-2 text-[12px]"><span class="text-gray-500 shrink-0 w-24">${esc(k)}</span><span class="link-scroll font-mono text-gray-200 flex-1 min-w-0">${esc(v)}</span></div>`);
        const b = document.createElement('button'); b.className = 'icon-btn !w-7 !h-7'; b.innerHTML = ic(link ? 'external-link' : 'copy');
        b.onclick = () => link ? window.open(v, '_blank', 'noopener') : copy(String(v)); d.appendChild(b); c.appendChild(d);
    });
}
function emptyNote(body, text) { body.insertAdjacentHTML('beforeend', `<p class="text-sm text-gray-500 text-center mt-10">${esc(text)}</p>`); }
function spinner(body, text) { const d = h(`<p class="text-sm text-gray-500 text-center mt-10">${esc(text || 'Loading...')}</p>`); body.appendChild(d); return d; }
function addBtn(c, label, cls, fn, icon) { const w = h('<div class="mt-3"></div>'); w.appendChild(btn(label, cls, fn, icon)); c.appendChild(w); return w; }
function toggleRow(c, label, desc, on, onToggle) {
    const r = h(`<div class="flex items-center justify-between gap-3 mt-3"><div class="min-w-0"><div class="text-[13px] font-semibold text-gray-200">${esc(label)}</div>${desc ? `<p class="text-[11px] text-gray-500">${esc(desc)}</p>` : ''}</div><button class="tgl ${on ? 'on' : ''}" aria-label="${esc(label)}"></button></div>`);
    const t = r.querySelector('.tgl');
    t.onclick = async () => { t.disabled = true; try { await onToggle(!t.classList.contains('on')); t.classList.toggle('on'); } catch (e) { toast(errMsg(e)); } t.disabled = false; };
    c.appendChild(r); return r;
}
function notice(body, text) { body.insertAdjacentHTML('beforeend', `<p class="text-sm text-gray-500 text-center mt-10">${text}</p>`); }
const hex = (u8) => [...u8].map(x => x.toString(16).padStart(2, '0')).join('');
function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBytes(b64) { const s = atob(String(b64).replace(/\s/g, '')); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
const looksText = (u8) => { const n = Math.min(u8.length, 8000); for (let i = 0; i < n; i++) if (u8[i] === 0) return false; return true; };
async function digestHex(u8, algo) {
    if (window.crypto && crypto.subtle) return hex(new Uint8Array(await crypto.subtle.digest(algo, u8)));
    let a = 0x811c9dc5, b = 0x1b873593, c = 0x9e3779b9, d = 0x85ebca6b;
    for (let i = 0; i < u8.length; i++) { const x = u8[i]; a = Math.imul(a ^ x, 16777619); b = Math.imul(b ^ a, 2246822507); c = Math.imul(c ^ b, 3266489909); d = Math.imul(d ^ c, 668265263); }
    return [a, b, c, d].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('') + '0'.repeat(32);
}
async function gitSha(u8) { const hd = enc.encode('blob ' + u8.length + '\0'); const all = new Uint8Array(hd.length + u8.length); all.set(hd); all.set(u8, hd.length); return (await digestHex(all, 'SHA-1')).slice(0, 40); }
const MIME = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'application/javascript', mjs: 'application/javascript', json: 'application/json', txt: 'text/plain', md: 'text/markdown', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', xml: 'application/xml', pdf: 'application/pdf', wasm: 'application/wasm', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', map: 'application/json' };
const extOf = (p) => { const m = /\.([A-Za-z0-9]+)$/.exec(p); return m ? m[1].toLowerCase() : ''; };
const mimeOf = (p) => MIME[extOf(p)] || 'application/octet-stream';
const aceModeOf = (p) => { try { return 'ace/mode/' + getAceMode(p); } catch (e) { return 'ace/mode/text'; } };
function parseJsonField(text, what) { try { return JSON.parse(text); } catch (e) { throw new Error(`${what} is not valid JSON: ${e.message}`); } }
function authH(extra) {
    const a = S.cur, hd = {};
    if (a.email) { hd['X-Auth-Email'] = a.email; hd['X-Auth-Key'] = a.key; } else hd['Authorization'] = 'Bearer ' + a.key;
    return Object.assign(hd, extra || {});
}
const apiBase = () => CF_PROXY_URL + '/client/v4';
async function rawFetch(path, opts = {}) {
    const headers = opts.noAuth ? Object.assign({}, opts.headers) : authH(opts.headers);
    let body = opts.body;
    if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
    try { return await fetch(apiBase() + path, { method: opts.method || 'GET', headers, body }); }
    catch (e) { throw new Error('Could not reach the proxy worker. Make sure the unified worker is deployed at ' + CF_PROXY_URL + ' and that you are online.'); }
}
async function api(path, opts) {
    const res = await rawFetch(path, opts);
    const txt = await res.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!res.ok || (j && j.success === false)) {
        const errs = j && j.errors && j.errors.length ? j.errors.map(e => (e.code ? `[${e.code}] ` : '') + e.message).join('; ') : (txt.slice(0, 200) || res.statusText);
        const err = new Error(`${res.status}: ${errs}`); err.status = res.status; err.codes = ((j && j.errors) || []).map(e => e.code); throw err;
    }
    return j || {};
}
const acc = (p) => `/accounts/${S.cur.accountId}${p}`;
const result = async (path, opts) => (await api(path, opts)).result;
const ghAccounts = () => LS.get('gh_saved_accounts', []);
async function ghToken() {
    const a = ghAccounts();
    if (!a.length) throw new Error('No GitHub token found. Open the GitHub section, load your token once and it will be saved.');
    if (a.length === 1) return a[0].token;
    if (S.ghTok && a.some(x => x.token === S.ghTok)) return S.ghTok;
    const r = await askForm({ title: 'GitHub account', fields: [{ key: 'who', label: 'Account', type: 'choice', options: a.map(x => x.name), default: a[0].name }], ok: 'Use' });
    if (!r) throw new Error('cancelled');
    S.ghTok = a.find(x => x.name === r.who).token; return S.ghTok;
}
async function gh(tok, path, opts = {}) {
    const res = await fetch(path.startsWith('http') ? path : 'https://api.github.com' + path, { ...opts, headers: { ...ghHeaders(tok), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
    if (!res.ok) { let m = await res.text(); try { m = JSON.parse(m).message || m; } catch (e) {} throw new Error('GitHub ' + res.status + ': ' + String(m).slice(0, 160)); }
    return res.status === 204 ? null : res.json();
}
async function ghPull(tok, repo, branch, dir, filter, onProgress) {
    const ref = await gh(tok, `/repos/${repo}/git/ref/heads/${encPath(branch)}`);
    const commit = await gh(tok, `/repos/${repo}/git/commits/${ref.object.sha}`);
    const tree = await gh(tok, `/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) toast('The repo is very large, some files may be skipped');
    const pre = dir ? dir.replace(/^\/+|\/+$/g, '') + '/' : '';
    const ents = tree.tree.filter(t => t.type === 'blob' && t.path.startsWith(pre) && (t.size || 0) <= 25 * 1048576 && (!filter || filter(t.path.slice(pre.length))));
    const files = new Map(); let done = 0;
    await runConcurrent(ents, 4, async (t) => {
        const b = await gh(tok, `/repos/${repo}/git/blobs/${t.sha}`);
        files.set(t.path.slice(pre.length), { bytes: b64ToBytes(b.content), sha: t.sha });
        if (onProgress) onProgress(++done, ents.length);
    });
    return files;
}
async function ghPush(tok, repo, branch, dir, message, changes, deletes, onProgress) {
    const pre = dir ? dir.replace(/^\/+|\/+$/g, '') + '/' : '';
    const ref = await gh(tok, `/repos/${repo}/git/ref/heads/${encPath(branch)}`);
    const head = await gh(tok, `/repos/${repo}/git/commits/${ref.object.sha}`);
    const entries = []; let done = 0;
    await runConcurrent(changes, 4, async (c) => {
        const b = await gh(tok, `/repos/${repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: bytesToB64(c.bytes), encoding: 'base64' }) });
        entries.push({ path: pre + c.path, mode: '100644', type: 'blob', sha: b.sha });
        if (onProgress) onProgress(++done, changes.length);
    });
    deletes.forEach(p => entries.push({ path: pre + p, mode: '100644', type: 'blob', sha: null }));
    const tree = await gh(tok, `/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: entries }) });
    const cm = await gh(tok, `/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }) });
    await gh(tok, `/repos/${repo}/git/refs/heads/${encPath(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: cm.sha }) });
    return cm.sha;
}
function gitCard(o) {
    const saved = LS.get('cf_git_' + o.key, {});
    const st = { repo: saved.repo || o.repo || '', branch: saved.branch || o.branch || 'main', dir: saved.dir != null ? saved.dir : (o.dir || '') };
    const c = card('GitHub push / pull', o.desc);
    c.insertAdjacentHTML('beforeend', `<div class="grid grid-cols-2 gap-2 mt-3"><input data-k="repo" class="modern-input !mb-0 text-xs font-mono col-span-2" placeholder="owner/repo" value="${esc(st.repo)}" autocapitalize="off" spellcheck="false"><input data-k="branch" class="modern-input !mb-0 text-xs font-mono" placeholder="branch" value="${esc(st.branch)}" autocapitalize="off"><input data-k="dir" class="modern-input !mb-0 text-xs font-mono" placeholder="folder (optional)" value="${esc(st.dir)}" autocapitalize="off"></div>`);
    const autoPullKey = 'cf_git_auto_pull_' + o.key;
    const autoPushKey = 'cf_git_auto_push_' + o.key;
    let autoPull = LS.get(autoPullKey, false);
    let autoPush = LS.get(autoPushKey, false);
    toggleRow(c, 'Auto-pull on open', 'Pull from GitHub automatically when opening this editor', autoPull, (v) => { autoPull = v; LS.set(autoPullKey, v); });
    toggleRow(c, 'Auto-push on save', 'Push to GitHub after every Deploy/Save', autoPush, (v) => { autoPush = v; LS.set(autoPushKey, v); });
    const msg = h('<p class="text-[11px] text-gray-500 mt-2 break-words"></p>');
    const read = () => {
        const v = {}; c.querySelectorAll('input[data-k]').forEach(i => v[i.dataset.k] = i.value.trim());
        if (!/^[\w.-]+\/[\w.-]+$/.test(v.repo)) throw new Error('Repo format: owner/repo');
        if (!v.branch) throw new Error('Enter a branch');
        LS.set('cf_git_' + o.key, v); return v;
    };
    const r = row(c, 'grid grid-cols-2 gap-2 mt-3');
    r.appendChild(btn('Pull', 'blue', async () => {
        const v = read(), tok = await ghToken();
        const cp = typeof o.confirmPull === 'function' ? o.confirmPull() : o.confirmPull;
        if (cp && !await askConfirm(cp, { title: 'Pull from GitHub', ok: 'Pull', danger: false })) return;
        msg.textContent = 'Pulling...';
        const files = await ghPull(tok, v.repo, v.branch, v.dir, o.filter, (d, t) => msg.textContent = `Pulling ${d}/${t}...`);
        o.base.map = new Map([...files].map(([p, f]) => [p, f.sha]));
        await o.apply(files);
        msg.textContent = `Pulled ${files.size} files from ${v.repo}@${v.branch}`; toast('Pull done');
    }, 'download'));
    r.appendChild(btn('Push', '', async () => {
        const v = read(), tok = await ghToken(), cur = o.collect();
        const changes = [], deletes = [];
        for (const [p, f] of cur) { const sha = await gitSha(f.bytes); if (!o.base.map || o.base.map.get(p) !== sha) changes.push({ path: p, bytes: f.bytes, sha }); }
        if (o.base.map) for (const p of o.base.map.keys()) if (!cur.has(p)) deletes.push(p);
        if (!changes.length && !deletes.length) { msg.textContent = 'Nothing changed, no push needed.'; return toast('Nothing to push'); }
        const m = await askPrompt(`${changes.length} changed, ${deletes.length} deleted → ${v.repo}@${v.branch}\nCommit message:`, 'Update via Cloudflare Manager', { title: 'Push to GitHub', ok: 'Push' });
        if (m == null) return;
        msg.textContent = 'Pushing...';
        const sha = await ghPush(tok, v.repo, v.branch, v.dir, m.trim() || 'Update', changes, deletes, (d, t) => msg.textContent = `Uploading ${d}/${t}...`);
        const nm = o.base.map || new Map(); changes.forEach(x => nm.set(x.path, x.sha)); deletes.forEach(p => nm.delete(p)); o.base.map = nm;
        msg.textContent = `Pushed ${sha.slice(0, 7)} to ${v.repo}@${v.branch}`; toast('Pushed to GitHub');
    }, 'upload'));
    c.appendChild(msg);
    return c;
}
function tailPanel(body, my, cfg) {
    const wrap = h(`<div class="flex flex-col gap-3"></div>`); body.appendChild(wrap);
    const bar = row(wrap, 'flex flex-wrap gap-2 items-center');
    const status = h('<span class="text-[11px] text-gray-500">Stopped</span>');
    const box = h('<div class="cfpre" style="height:55vh"></div>');
    let ws = null, tailId = null, errOnly = false;
    const line = (txt, cls) => { const d = document.createElement('div'); d.className = 'log-line ' + (cls || ''); d.textContent = txt; if (/error|exception|fail/i.test(txt) || cls === 'bad') d.dataset.err = '1'; if (errOnly && !d.dataset.err) d.style.display = 'none'; box.appendChild(d); box.scrollTop = box.scrollHeight; if (box.childElementCount > 600) box.firstChild.remove(); };
    const fmt = (m) => {
        const t = new Date(m.eventTimestamp || Date.now()).toLocaleTimeString('en-GB');
        const ev = m.event || {}; const rq = ev.request, rs = ev.response;
        let head = rq ? `${rq.method} ${rq.url}${rs ? ' → ' + rs.status : ''}` : (ev.cron ? 'CRON ' + ev.cron : (ev.queue ? 'QUEUE ' + ev.queue : 'event'));
        line(`[${t}] ${head} (${m.outcome || ''})`, m.outcome && m.outcome !== 'ok' ? 'bad' : '');
        (m.logs || []).forEach(l => line(`   ${l.level || 'log'}: ${(l.message || []).map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}`, l.level === 'error' ? 'bad' : ''));
        (m.exceptions || []).forEach(x => line(`   EXCEPTION ${x.name}: ${x.message}`, 'bad'));
    };
    async function stop(quiet) {
        if (ws) { try { ws.close(); } catch (e) {} ws = null; }
        if (tailId) { const id = tailId; tailId = null; try { await api(cfg.delPath(id), { method: 'DELETE' }); } catch (e) {} }
        status.textContent = 'Stopped'; startBtn.lastChild.textContent = 'Start';
        if (!quiet) toast('Tail stopped');
    }
    const startBtn = btn('Start', '', async () => {
        if (ws) return stop();
        status.textContent = 'Connecting...';
        const r = await result(cfg.startPath, { method: 'POST', json: {} });
        tailId = r.id;
        ws = new WebSocket(r.url, 'trace-v1');
        ws.onopen = () => { status.textContent = 'Live'; startBtn.lastChild.textContent = 'Stop'; try { ws.send(JSON.stringify({ debug: false })); } catch (e) {} };
        ws.onmessage = (ev) => { try { fmt(JSON.parse(ev.data)); } catch (e) { line(String(ev.data).slice(0, 300)); } };
        ws.onerror = () => line('WebSocket error', 'bad');
        ws.onclose = () => { if (ws) { ws = null; status.textContent = 'Closed'; startBtn.lastChild.textContent = 'Start'; } };
    }, 'play');
    bar.appendChild(startBtn);
    bar.appendChild(btn('Clear', 'cfgray', () => { box.innerHTML = ''; }));
    const eb = btn('Errors only', 'cfgray', () => { errOnly = !errOnly; eb.style.borderColor = errOnly ? '#f85149' : ''; box.querySelectorAll('.log-line').forEach(d => d.style.display = (errOnly && !d.dataset.err) ? 'none' : ''); });
    bar.appendChild(eb);
    bar.appendChild(btn('Copy', 'cfgray', () => copy(box.innerText)));
    wrap.appendChild(status); wrap.appendChild(box);
    wrap.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-gray-500">${esc(cfg.note || '')}</p>`);
    line('Press Start, then send a request to your worker / site.');
    const prev = S.onLeave; S.onLeave = () => { stop(true); if (prev) prev(); };
}
function sheet(title, build) {
    const ov = h(`<div class="sheet-ov open" style="z-index:1250"><div class="sheet" style="max-height:88vh"><div class="sheet-head"><span class="truncate">${esc(title)}</span><button type="button" class="text-gray-400 p-1" data-x>${ic('x')}</button></div><div class="p-3 overflow-y-auto flex flex-col gap-3" data-b></div></div></div>`);
    const close = () => ov.remove();
    ov.querySelector('[data-x]').onclick = close; ov.onclick = (e) => { if (e.target === ov) close(); };
    $('cfRoot').appendChild(ov); build(ov.querySelector('[data-b]'), close); return close;
}
function jsonCard(title, desc, loader, saver, example) {
    const c = card(title, desc);
    const ta = h('<textarea class="modern-input !mb-0 !mt-3 font-mono text-xs" rows="8" spellcheck="false" autocapitalize="off">Loading...</textarea>');
    c.appendChild(ta);
    loader().then(v => { ta.value = v == null ? (example || '') : JSON.stringify(v, null, 2); }).catch(e => { ta.value = example || ''; c.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-yellow-400 mt-2 break-words">${esc(errMsg(e))}</p>`); });
    addBtn(c, 'Save', 'blue', async () => { await saver(parseJsonField(ta.value, title)); toast(title + ' saved'); }, 'check');
    return c;
}
const fileBytes = (f) => f.text != null ? enc.encode(f.text) : (f.bytes || new Uint8Array(0));
const fileIsText = (f) => f.text != null || (f.bytes && looksText(f.bytes));
const fileText = (f) => f.text != null ? f.text : dec.decode(f.bytes || new Uint8Array(0));
async function importZipInto(files, file) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip did not load, please reload the app');
    const z = await JSZip.loadAsync(file);
    const names = Object.keys(z.files).filter(n => !z.files[n].dir && !/^__MACOSX\//.test(n));
    const tops = new Set(names.map(n => n.split('/')[0]));
    const strip = (tops.size === 1 && names.every(n => n.includes('/'))) ? [...tops][0] + '/' : '';
    for (const n of names) files.set(n.slice(strip.length), { bytes: await z.files[n].async('uint8array') });
    return names.length;
}
function fileEditor(body, ws, opts) {
    opts = opts || {};
    const top = h(`<div class="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden mb-3"><button type="button" data-pick class="w-full bg-[#0d1117] text-blue-300 p-3 flex justify-between items-center text-sm font-mono border-b border-[#30363d]"><span data-name class="truncate">Select a file...</span><span class="flex items-center gap-2 shrink-0"><span data-cnt class="text-[10px] text-gray-500"></span>${ic('chevron-down')}</span></button><div data-bar class="p-2 flex gap-2 overflow-x-auto scrollbar-hide items-center"></div></div>`);
    const host = h('<div class="rounded-lg border border-[#30363d] overflow-hidden" style="height:var(--ed-h);min-height:280px;background:#161b22"></div>');
    body.appendChild(top); body.appendChild(host);
    const bar = top.querySelector('[data-bar]'), nameEl = top.querySelector('[data-name]');
    let ed = null, loading = false;
    try {
        ed = ace.edit(host); ed.setTheme('ace/theme/one_dark');
        ed.setOptions({ fontSize: (getSetting('cfFont') || '13') + 'px', showPrintMargin: false, wrap: !!getSetting('cfWrap'), useSoftTabs: true, tabSize: Number(getSetting('cfTab') || 2) });
        ed.session.on('change', () => {
            if (loading || !ws.cur) return;
            const f = ws.files.get(ws.cur); if (!f) return;
            f.text = ed.getValue(); f.dirty = true; if (opts.onChange) opts.onChange(ws.cur);
        });
    } catch (e) { host.innerHTML = '<p class="p-4 text-sm text-red-400">The code editor did not load. Please reload the page.</p>'; }
    const prevLeave = S.onLeave; S.onLeave = () => { try { ed && ed.destroy(); } catch (e) {} if (prevLeave) prevLeave(); };
    function label() { nameEl.textContent = ws.cur || 'Select a file...'; top.querySelector('[data-cnt]').textContent = ws.files.size + ' files'; }
    function open(path) {
        const f = ws.files.get(path); if (!f || !ed) return;
        ws.cur = path; loading = true;
        if (fileIsText(f)) { ed.setReadOnly(false); ed.session.setMode(aceModeOf(path)); ed.setValue(fileText(f), -1); }
        else { ed.setReadOnly(true); ed.setValue(`[binary file, ${fmtBytes(fileBytes(f).length)}: cannot be edited here]`, -1); }
        loading = false; label(); setTimeout(() => ed.resize(), 30);
    }
    async function addFile() {
        const p = await askPrompt('File path (e.g. index.html or css/style.css):', '', { title: 'New file', placeholder: 'index.html' });
        const path = p && p.trim().replace(/^\/+/, ''); if (!path) return;
        if (ws.files.has(path)) return toast('That file already exists');
        ws.files.set(path, { text: '', dirty: true }); if (opts.onChange) opts.onChange(path); open(path);
    }
    function pick() {
        sheet('Files', (b, close) => {
            const top2 = row(b, 'flex gap-2 flex-wrap');
            top2.appendChild(btn('New file', 'blue', async () => { close(); await addFile(); }, 'plus'));
            if (opts.allowImport) {
                const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.className = 'hidden';
                inp.onchange = async () => { for (const f of inp.files) ws.files.set(f.name, { bytes: new Uint8Array(await f.arrayBuffer()), dirty: true }); if (opts.onChange) opts.onChange(); close(); label(); toast(inp.files.length + ' file(s) added'); };
                top2.appendChild(btn('Add files', 'blue', () => inp.click(), 'upload')); top2.appendChild(inp);
                const zin = document.createElement('input'); zin.type = 'file'; zin.accept = '.zip'; zin.className = 'hidden';
                zin.onchange = async () => { try { const n = await importZipInto(ws.files, zin.files[0]); if (opts.onChange) opts.onChange(); close(); label(); toast(n + ' files imported from ZIP'); } catch (e) { toast(errMsg(e)); } };
                top2.appendChild(btn('Import ZIP', 'blue', () => zin.click(), 'package')); top2.appendChild(zin);
            }
            const list = h('<div class="flex flex-col gap-1.5"></div>'); b.appendChild(list);
            const paths = [...ws.files.keys()].sort();
            if (!paths.length) list.innerHTML = '<p class="text-sm text-gray-500 text-center py-6">No files yet.</p>';
            paths.forEach(p => {
                const f = ws.files.get(p);
                const r = h(`<div class="flex items-center gap-2"><button type="button" class="es-item flex-1 min-w-0 !py-2" data-o><span class="es-ic">${ic(fileIsText(f) ? 'file-text' : 'file')}</span><span class="es-tx min-w-0"><b class="font-mono truncate">${esc(p)}</b><small>${fmtBytes(fileBytes(f).length)}${f.dirty ? ' • edited' : ''}</small></span></button><button type="button" class="icon-btn" data-d title="Delete">${ic('trash')}</button></div>`);
                r.querySelector('[data-o]').onclick = () => { close(); open(p); };
                r.querySelector('[data-d]').onclick = async () => {
                    if (!await askConfirm(`Delete ${p}?`, { title: 'Delete file', ok: 'Delete', danger: true })) return;
                    ws.files.delete(p); if (ws.cur === p) { ws.cur = null; if (ed) { loading = true; ed.setValue('', -1); loading = false; } }
                    if (opts.onChange) opts.onChange(p); r.remove(); label();
                };
                list.appendChild(r);
            });
        });
    }
    top.querySelector('[data-pick]').onclick = pick;
    (opts.buttons || []).forEach(([l, c, fn, i]) => bar.appendChild(btn(l, c, fn, i)));
    const tb = (l, fn) => { const b = document.createElement('button'); b.className = 'toolbar-btn'; b.textContent = l; b.onclick = fn; bar.appendChild(b); };
    tb('Undo', () => ed && ed.undo()); tb('Redo', () => ed && ed.redo());
    tb('Cut', () => { const t = ed && ed.getSelectedText(); if (t) { copy(t); ed.remove(); } });
    tb('Copy', () => ed && copy(ed.getSelectedText() || ed.getValue()));
    tb('Paste', async () => { try { const t = await navigator.clipboard.readText(); ed && ed.insert(t); } catch (e) { toast('Paste permission denied'); } });
    tb('All', () => ed && ed.selectAll());
    label();
    const first = ws.cur && ws.files.has(ws.cur) ? ws.cur : (opts.defaultFile && ws.files.has(opts.defaultFile) ? opts.defaultFile : [...ws.files.keys()].sort()[0]);
    if (first) open(first);
    return { open, label, get editor() { return ed; } };
}

const WK_COMPAT = '2025-06-01';
const WK_TPL = {
    'Hello World': ["export default {", "  async fetch(request, env, ctx) {", "    return new Response('Hello from Cloudflare Worker!');", "  }", "};", ""].join('\n'),
    'JSON API': ["export default {", "  async fetch(request, env, ctx) {", "    const url = new URL(request.url);", "    return Response.json({ ok: true, path: url.pathname, time: new Date().toISOString() });", "  }", "};", ""].join('\n'),
    'Telegram bot (webhook)': ["export default {", "  async fetch(request, env) {", "    if (request.method !== 'POST') return new Response('Bot is running');", "    const update = await request.json();", "    const msg = update.message;", "    if (msg && msg.text) {", "      await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/sendMessage', {", "        method: 'POST', headers: { 'content-type': 'application/json' },", "        body: JSON.stringify({ chat_id: msg.chat.id, text: 'You said: ' + msg.text })", "      });", "    }", "    return new Response('ok');", "  }", "};", ""].join('\n')
};
async function wkSubdomain() {
    if (S.sub !== undefined) return S.sub;
    try { S.sub = (await result(acc('/workers/subdomain'))).subdomain || null; } catch (e) { S.sub = null; }
    return S.sub;
}
const WK = { name: null, files: new Map(), cur: null, main: '', format: 'module', settings: null, base: { map: null }, loaded: false };
const SECRET_T = ['secret_text', 'secret_key'];
const iconBtn2 = (icon, title, fn) => { const b = document.createElement('button'); b.className = 'icon-btn !w-8 !h-8'; b.innerHTML = ic(icon); if (title) b.title = title; b.onclick = fn; return b; };
const listRow = (inner) => h(`<div class="flex items-center gap-2 mt-2"><div class="min-w-0 flex-1">${inner}</div></div>`);
const none = (c, t) => c.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-gray-600 mt-2">${esc(t)}</p>`);
const sp = (c) => c.appendChild(h('<div class="mt-3"></div>'));
async function wkPatch(name, patch) {
    const fd = new FormData();
    fd.append('settings', new Blob([JSON.stringify(patch)], { type: 'application/json' }));
    const r = await result(acc(`/workers/scripts/${name}/settings`), { method: 'PATCH', body: fd });
    if (WK.name === name && r) WK.settings = r;
    return r;
}
SEC.workers.load = async () => {
    const r = (await result(acc('/workers/scripts'))) || [];
    return r.map(x => ({ id: x.id, name: x.id, sub: ago(x.modified_on), raw: x, t: x.modified_on || '' })).sort((a, b) => b.t.localeCompare(a.t));
};
SEC.workers.create = async () => {
    const result = await new Promise((resolve) => {
        const ov = h(`<div class="sheet-ov open" style="z-index:1250"><div class="sheet" style="max-height:90vh"><div class="sheet-head"><span>New Worker</span><button type="button" class="text-gray-400 p-1" data-x>${ic('x')}</button></div><div class="p-3 overflow-y-auto" data-b style="flex:1"></div></div></div>`);
        const close = (v) => { ov.remove(); resolve(v); };
        ov.querySelector('[data-x]').onclick = () => close(null);
        ov.onclick = (e) => { if (e.target === ov) close(null); };
        document.getElementById('cfRoot').appendChild(ov);
        const body = ov.querySelector('[data-b]');
        let sourceType = 'template';
        let templateChoice = 'Hello World';
        let enableSub = true;
        const nameInp = h(`<input class="modern-input !mb-0 font-mono text-xs" placeholder="my-worker" autocapitalize="off" spellcheck="false">`);
        function render() {
            body.innerHTML = '';
            body.insertAdjacentHTML('beforeend', `<div class="text-[12px] font-bold text-gray-300 mb-1">Worker name</div>`);
            body.appendChild(nameInp);
            body.insertAdjacentHTML('beforeend', `<div class="text-[12px] font-bold text-gray-300 mt-4 mb-1">Start from</div>`);
            const seg = h(`<div class="seg mb-3"></div>`);
            [['template', 'Template', 'code'], ['empty', 'Empty', 'file']].forEach(([v, l, i]) => {
                const b = document.createElement('button');
                b.type = 'button'; b.className = sourceType === v ? 'active' : '';
                b.innerHTML = ic(i) + '<span>' + l + '</span>';
                b.onclick = () => { sourceType = v; render(); };
                seg.appendChild(b);
            });
            body.appendChild(seg);
            if (sourceType === 'template') {
                body.insertAdjacentHTML('beforeend', `<div class="text-[12px] font-bold text-gray-300 mb-1">Template</div>`);
                const sel = h(`<select class="modern-input !mb-0 font-mono text-xs">${Object.keys(WK_TPL).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>`);
                sel.value = templateChoice;
                sel.onchange = () => { templateChoice = sel.value; };
                body.appendChild(sel);
            } else {
                body.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-gray-500">Starts with an empty worker.js.</p>`);
            }
            const subRow = h(`<div class="flex items-center justify-between gap-3 mt-4"><div><div class="text-[13px] font-semibold text-gray-200">Enable workers.dev URL</div><p class="text-[11px] text-gray-500">Serve at name.subdomain.workers.dev</p></div><button class="tgl ${enableSub ? 'on' : ''}"></button></div>`);
            subRow.querySelector('.tgl').onclick = (e) => { enableSub = !enableSub; e.currentTarget.classList.toggle('on', enableSub); };
            body.appendChild(subRow);
            body.insertAdjacentHTML('beforeend', `<div class="mt-4"></div>`);
            const go = document.createElement('button');
            go.className = 'mini-btn blue w-full !py-3';
            go.innerHTML = ic('plus') + '<span>Create Worker</span>';
            go.onclick = () => {
                const nm = nameInp.value.trim().toLowerCase();
                if (!nm) { toast('Enter a worker name'); return; }
                if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(nm)) { toast('Name can only contain a-z, 0-9 and dashes'); return; }
                close({ name: nm, sourceType, templateChoice, enableSub });
            };
            body.appendChild(go);
        }
        render();
    });
    if (!result) return;
    const { name, sourceType, templateChoice, enableSub } = result;
    const initialCode = sourceType === 'template' ? WK_TPL[templateChoice] : WK_TPL['Hello World'];
    const fd = new FormData();
    fd.append('metadata', new Blob([JSON.stringify({ main_module: 'worker.js', compatibility_date: WK_COMPAT })], { type: 'application/json' }), 'metadata.json');
    fd.append('worker.js', new Blob([initialCode], { type: 'application/javascript+module' }), 'worker.js');
    await api(acc(`/workers/scripts/${name}`), { method: 'PUT', body: fd });
    if (enableSub) { try { await api(acc(`/workers/scripts/${name}/subdomain`), { method: 'POST', json: { enabled: true } }); } catch (e) { toast('Worker created, but workers.dev URL could not be enabled: ' + errMsg(e)); } }
    toast('Worker created'); return name;
};
SEC.workers.del = async (it) => { await api(acc(`/workers/scripts/${it.id}?force=true`), { method: 'DELETE' }); };
function wkReset(name) { Object.assign(WK, { name, files: new Map(), cur: null, main: '', format: 'module', settings: null, base: { map: null }, loaded: false }); }
async function wkLoad(name, force) {
    if (WK.name === name && WK.loaded && !force) return;
    wkReset(name);
    try { WK.settings = (await result(acc(`/workers/scripts/${name}/settings`))) || {}; } catch (e) { WK.settings = {}; }
    let res = await rawFetch(acc(`/workers/scripts/${name}`));
    if (!res.ok) res = await rawFetch(acc(`/workers/scripts/${name}/content/v2`));
    if (!res.ok) throw new Error(`Could not download the script: ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (/multipart\/form-data/i.test(ct)) {
        const fd = await new Response(await res.arrayBuffer(), { headers: { 'content-type': ct } }).formData();
        for (const [k, v] of fd.entries()) {
            if (typeof v === 'string') WK.files.set(k, { text: v, type: 'text/plain', dirty: false });
            else { const nm = v.name || k, bytes = new Uint8Array(await v.arrayBuffer()); WK.files.set(nm, { bytes, type: v.type }); }
        }
        WK.format = 'module';
        const ep = res.headers.get('cf-entrypoint');
        const names = [...WK.files.keys()];
        WK.main = (ep && WK.files.has(ep)) ? ep : (['worker.js', 'index.js', 'index.mjs', 'main.js'].find(n => WK.files.has(n)) || names.find(n => /\.m?js$/.test(n)) || names[0] || 'worker.js');
    } else {
        WK.files.set('worker.js', { bytes: new Uint8Array(await res.arrayBuffer()), type: 'application/javascript' });
        WK.format = 'sw'; WK.main = 'worker.js';
    }
    WK.cur = WK.main; WK.loaded = true; WK.base.map = null;
}
async function wkDeploy(note) {
    if (!WK.loaded) throw new Error('Open the Code tab first');
    const s = WK.settings || {};
    const meta = { compatibility_date: s.compatibility_date || WK_COMPAT };
    if (s.compatibility_flags && s.compatibility_flags.length) meta.compatibility_flags = s.compatibility_flags;
    meta.bindings = (s.bindings || []).filter(b => !SECRET_T.includes(b.type));
    meta.keep_bindings = SECRET_T;
    ['placement', 'logpush', 'tail_consumers', 'observability', 'limits'].forEach(k => { if (s[k] != null) meta[k] = s[k]; });
    const fd = new FormData();
    if (WK.format === 'module') {
        meta.main_module = WK.main;
        for (const [n, f] of WK.files) {
            const t = /\.m?js$/.test(n) ? 'application/javascript+module' : (f.type || (fileIsText(f) ? 'text/plain' : 'application/octet-stream'));
            fd.append(n, new Blob([fileBytes(f)], { type: t }), n);
        }
    } else {
        meta.body_part = 'script';
        fd.append('script', new Blob([fileBytes(WK.files.get(WK.main))], { type: 'application/javascript' }), 'script.js');
    }
    fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'metadata.json');
    await api(acc(`/workers/scripts/${WK.name}`), { method: 'PUT', body: fd });
    for (const f of WK.files.values()) f.dirty = false;
    try { WK.settings = (await result(acc(`/workers/scripts/${WK.name}/settings`))) || WK.settings; } catch (e) {}
    toast(note || 'Deployed');
}
SEC.workers.render = async function (tab, body, it, my) {
    const name = it.id;
    if (tab === 'overview') return wkOverview(body, it, my);
    if (tab === 'code') return wkCode(body, it, my);
    if (tab === 'versions') return wkVersions(body, it, my);
    if (tab === 'logs') return tailPanel(body, my, { startPath: acc(`/workers/scripts/${name}/tails`), delPath: (id) => acc(`/workers/scripts/${name}/tails/${id}`), note: 'Live tail: logs stream while this screen is open.' });
    if (tab === 'settings') return wkSettings(body, it, my);
};
async function wkOverview(body, it, my) {
    const name = it.id, w = spinner(body);
    const [sub, ss, sched] = await Promise.all([wkSubdomain(), result(acc(`/workers/scripts/${name}/subdomain`)).catch(() => null), result(acc(`/workers/scripts/${name}/schedules`)).catch(() => null)]);
    if (my !== S.req) return; w.remove();
    const url = sub ? `https://${name}.${sub}.workers.dev` : '';
    const c = card(name, 'Worker');
    c.insertAdjacentHTML('beforeend', `<div class="flex flex-wrap gap-1.5 mt-2">${badge(it.raw.has_modules === false ? 'service-worker' : 'ES module')}${badge('modified ' + ago(it.raw.modified_on))}${ss && ss.enabled ? badge('workers.dev ON', 'ok') : badge('workers.dev OFF')}</div>`);
    kvRows(c, [['URL', url && ss && ss.enabled ? url : '', true], ['Created', it.raw.created_on ? new Date(it.raw.created_on).toLocaleString() : ''], ['Cron', sched && sched.schedules && sched.schedules.map(x => x.cron).join(', ')]]);
    const r = row(c);
    if (url && ss && ss.enabled) r.appendChild(btn('Open', 'blue', () => window.open(url, '_blank', 'noopener'), 'external-link'));
    r.appendChild(btn(ss && ss.enabled ? 'Turn workers.dev OFF' : 'Turn workers.dev ON', 'cfgray', async () => {
        if (!sub) { const s = await wkEnsureSubdomain(); if (!s) return; }
        await api(acc(`/workers/scripts/${name}/subdomain`), { method: 'POST', json: { enabled: !(ss && ss.enabled) } });
        toast('Updated'); render();
    }, 'globe'));
    body.appendChild(c);
    if (!sub) {
        const c2 = card('Account subdomain not set', 'A workers.dev URL needs an account subdomain first.');
        c2.appendChild(btn('Set subdomain', 'blue', async () => { await wkEnsureSubdomain(); render(); }, 'plus')); c2.lastChild.classList.add('mt-3'); body.appendChild(c2);
    }
    const q = card('Quick actions');
    const qr = row(q);
    qr.appendChild(btn('Open code', 'blue', () => go('code'), 'code'));
    qr.appendChild(btn('Logs', 'cfgray', () => go('logs'), 'terminal'));
    qr.appendChild(btn('Settings', 'cfgray', () => go('settings'), 'settings'));
    body.appendChild(q);
}
async function wkEnsureSubdomain() {
    const f = await askForm({ title: 'workers.dev subdomain', message: 'All Workers in this account will be served at name.SUBDOMAIN.workers.dev.', fields: [{ key: 's', label: 'Subdomain', required: true }], ok: 'Set' });
    if (!f) return null;
    const j = await result(acc('/workers/subdomain'), { method: 'PUT', json: { subdomain: f.s.trim().toLowerCase() } });
    S.sub = (j && j.subdomain) || f.s.trim().toLowerCase(); toast('Subdomain set: ' + S.sub); return S.sub;
}
async function wkCode(body, it, my) {
    const name = it.id, w = spinner(body, 'Downloading the Worker code...');
    try { await wkLoad(name); } catch (e) { w.remove(); body.appendChild(card('Could not load the code', errMsg(e), true)); return; }
    if (my !== S.req) return; w.remove();
    const info = h(`<div class="flex flex-wrap gap-1.5 mb-3">${badge(WK.format === 'module' ? 'ES module' : 'service-worker')}${badge('main: ' + WK.main)}${badge((WK.settings.bindings || []).length + ' bindings')}</div>`);
    body.appendChild(info);
    const ws = { files: WK.files, get cur() { return WK.cur; }, set cur(v) { WK.cur = v; } };
    const doDeploy = async () => {
        if (!await askConfirm(`Deploy ${name} live?`, { title: 'Deploy Worker', ok: 'Deploy', danger: false })) return;
        await wkDeploy('Deployed ' + name);
    };
    const doZip = async () => {
        if (typeof JSZip === 'undefined') throw new Error('JSZip did not load');
        const z = new JSZip(); for (const [p, f] of WK.files) z.file(p, fileBytes(f));
        saveAs(await z.generateAsync({ type: 'blob' }), name + '.zip');
    };
    const doSync = async () => {
        if (!await askConfirm('Download the live deployed code from Cloudflare and replace the editor files?', { title: 'Sync from CF', ok: 'Sync', danger: true })) return;
        try { await wkLoad(name, true); render(); toast('Synced from Cloudflare'); }
        catch (e) { toast(errMsg(e)); }
    };
    fileEditor(body, ws, {
        allowImport: true,
        buttons: [
            ['Save & Deploy', '', doDeploy, 'upload'],
            ['Sync from CF', 'cfgray', doSync, 'download'],
            ['ZIP', 'cfgray', doZip, 'download']
        ],
        defaultFile: WK.main
    });
    body.appendChild(h('<div class="mb-3"></div>'));
    body.appendChild(gitCard({
        key: 'wk_' + name, desc: 'Pull the JS files of a repo into this Worker, or push the code here to a repo.',
        filter: (p) => /\.(m?js|cjs)$/.test(p), base: WK.base,
        confirmPull: 'Pulling replaces files with the same name in the editor (nothing is deployed yet). Continue?',
        collect: () => { const m = new Map(); for (const [p, f] of WK.files) m.set(p, { bytes: fileBytes(f) }); return m; },
        apply: async (files) => { for (const [p, f] of files) WK.files.set(p, { bytes: f.bytes, type: 'application/javascript+module', dirty: true }); if (!WK.files.has(WK.main)) WK.main = [...files.keys()][0] || WK.main; WK.cur = WK.main; WK.format = 'module'; render(); }
    }));
}
async function wkVersions(body, it, my) {
    const name = it.id, w = spinner(body);
    const [vs, ds] = await Promise.all([result(acc(`/workers/scripts/${name}/versions?per_page=25`)).catch(e => ({ err: e })), result(acc(`/workers/scripts/${name}/deployments`)).catch(() => null)]);
    if (my !== S.req) return; w.remove();
    if (vs && vs.err) return body.appendChild(card('Could not load versions', errMsg(vs.err), true));
    const items = (vs && vs.items) || [];
    const active = new Map(); (((ds && ds.deployments) || [])[0] || { versions: [] }).versions.forEach(v => active.set(v.version_id, v.percentage));
    if (!items.length) return emptyNote(body, 'No versions found.');
    body.insertAdjacentHTML('beforeend', '<p class="text-[11px] text-gray-500 mb-3">You can roll back by deploying an older version at 100%.</p>');
    items.forEach(v => {
        const md = v.metadata || {}, on = active.has(v.id);
        const c = card(`Version ${v.number != null ? '#' + v.number : v.id.slice(0, 8)}`, '');
        c.insertAdjacentHTML('beforeend', `<div class="flex flex-wrap gap-1.5 mt-1">${on ? badge('Active ' + active.get(v.id) + '%', 'ok') : ''}${badge(ago(md.created_on))}${md.source ? badge(md.source) : ''}</div><p class="text-[11px] font-mono text-gray-500 mt-2 break-all">${esc(v.id)}</p>`);
        if (!on) c.appendChild(h('<div class="mt-3"></div>')).appendChild(btn('Deploy this version', 'blue', async () => {
            if (!await askConfirm(`Deploy version ${v.number || v.id.slice(0, 8)} at 100%?`, { title: 'Rollback', ok: 'Deploy', danger: false })) return;
            await api(acc(`/workers/scripts/${name}/deployments`), { method: 'POST', json: { strategy: 'percentage', versions: [{ percentage: 100, version_id: v.id }], annotations: { 'workers/message': 'Deployed from Cloudflare Manager' } } });
            WK.loaded = false; toast('Deployed'); render();
        }, 'corner-left-up'));
        body.appendChild(c);
    });
}
async function wkSettings(body, it, my) {
    const name = it.id, w = spinner(body);
    try { await wkLoad(name); } catch (e) { w.remove(); body.appendChild(card('Could not load settings', errMsg(e), true)); return; }
    const [secrets, domains, sched, ss] = await Promise.all([
        result(acc(`/workers/scripts/${name}/secrets`)).catch(() => []),
        result(acc(`/workers/domains?service=${encodeURIComponent(name)}`)).catch(() => []),
        result(acc(`/workers/scripts/${name}/schedules`)).catch(() => null),
        result(acc(`/workers/scripts/${name}/subdomain`)).catch(() => null)]);
    if (my !== S.req) return; w.remove();
    const st = WK.settings || {};
    const binds = (st.bindings || []);
    const saveBinds = async (nb, msg) => { WK.settings.bindings = nb; await wkDeploy(msg || 'Saved (new version deployed)'); render(); };
    const ca = card('Access', 'How this Worker can be reached.');
    toggleRow(ca, 'workers.dev URL', 'Serve the Worker at name.subdomain.workers.dev', !!(ss && ss.enabled), async (v) => {
        if (v && !await wkSubdomain()) { if (!await wkEnsureSubdomain()) throw new Error('cancelled'); }
        await api(acc(`/workers/scripts/${name}/subdomain`), { method: 'POST', json: { enabled: v, previews_enabled: !!(ss && ss.previews_enabled) } });
    });
    toggleRow(ca, 'Preview URLs', 'Give every uploaded version its own preview URL', !!(ss && ss.previews_enabled), async (v) => {
        await api(acc(`/workers/scripts/${name}/subdomain`), { method: 'POST', json: { enabled: !!(ss && ss.enabled), previews_enabled: v } });
    });
    body.appendChild(ca);
    const cv = card('Environment variables', 'Plain text / JSON variables. Saving deploys a new version.');
    const vars = binds.filter(b => b.type === 'plain_text' || b.type === 'json');
    vars.forEach(b => {
        const r = listRow(`<div class="text-[12px] font-mono font-bold text-gray-200 truncate">${esc(b.name)}</div><div class="text-[11px] font-mono text-gray-500 truncate">${esc(b.type === 'json' ? JSON.stringify(b.json) : b.text)}</div>`);
        r.appendChild(iconBtn2('edit', 'Edit', async () => { const f = await askForm({ title: 'Edit ' + b.name, fields: [{ key: 'v', label: 'Value', default: b.type === 'json' ? JSON.stringify(b.json) : b.text }], ok: 'Save' }); if (!f) return; try { const nb = binds.map(x => x === b ? (b.type === 'json' ? { ...b, json: JSON.parse(f.v) } : { ...b, text: f.v }) : x); await saveBinds(nb); } catch (er) { toast(errMsg(er)); } }));
        r.appendChild(iconBtn2('trash', 'Delete', async () => { if (!await askConfirm(`Delete variable ${b.name}?`, { ok: 'Delete', danger: true })) return; try { await saveBinds(binds.filter(x => x !== b)); } catch (er) { toast(errMsg(er)); } }));
        cv.appendChild(r);
    });
    if (!vars.length) none(cv, 'No variables.');
    sp(cv).appendChild(btn('Add variable', 'blue', async () => {
        const f = await askForm({ title: 'New variable', fields: [{ key: 'n', label: 'Name', required: true }, { key: 'v', label: 'Value', required: true }, { key: 'j', label: 'Value is JSON?', type: 'boolean', default: 'false' }], ok: 'Add' });
        if (!f) return; const n = f.n.trim();
        if (binds.some(b => b.name === n)) throw new Error('A binding with this name already exists');
        await saveBinds([...binds, f.j === 'true' ? { type: 'json', name: n, json: parseJsonField(f.v, 'Value') } : { type: 'plain_text', name: n, text: f.v }]);
    }, 'plus'));
    body.appendChild(cv);
    const cs = card('Secrets', 'Encrypted, the value can never be read back. Applies immediately.');
    (secrets || []).forEach(s => {
        const r = listRow(`<div class="text-[12px] font-mono font-bold text-gray-200 truncate">${esc(s.name)}</div>`);
        r.appendChild(iconBtn2('edit', 'Update', async () => { const f = await askForm({ title: 'Update ' + s.name, fields: [{ key: 'v', label: 'New value', required: true }], ok: 'Save' }); if (!f) return; try { await api(acc(`/workers/scripts/${name}/secrets`), { method: 'PUT', json: { name: s.name, text: f.v, type: 'secret_text' } }); toast('Secret updated'); } catch (er) { toast(errMsg(er)); } }));
        r.appendChild(iconBtn2('trash', 'Delete', async () => { if (!await askConfirm(`Delete secret ${s.name}?`, { ok: 'Delete', danger: true })) return; try { await api(acc(`/workers/scripts/${name}/secrets/${encodeURIComponent(s.name)}`), { method: 'DELETE' }); toast('Deleted'); render(); } catch (er) { toast(errMsg(er)); } }));
        cs.appendChild(r);
    });
    if (!(secrets || []).length) none(cs, 'No secrets.');
    const sr = row(cs);
    sr.appendChild(btn('Add secret', 'blue', async () => {
        const f = await askForm({ title: 'New secret', fields: [{ key: 'n', label: 'Name', required: true }, { key: 'v', label: 'Value', required: true }], ok: 'Add' });
        if (!f) return; await api(acc(`/workers/scripts/${name}/secrets`), { method: 'PUT', json: { name: f.n.trim(), text: f.v, type: 'secret_text' } }); toast('Secret saved'); render();
    }, 'plus'));
    sr.appendChild(btn('Bulk (KEY=value)', 'cfgray', async () => {
        const f = await askForm({ title: 'Bulk secrets', message: 'One per line: NAME=value.', fields: [{ key: 't', label: 'Lines', required: true }], ok: 'Save' });
        if (!f) return; const lines = f.t.split(/\r?\n|;;/).map(x => x.trim()).filter(x => x.includes('='));
        for (const l of lines) { const i = l.indexOf('='); await api(acc(`/workers/scripts/${name}/secrets`), { method: 'PUT', json: { name: l.slice(0, i).trim(), text: l.slice(i + 1), type: 'secret_text' } }); }
        toast(lines.length + ' secrets saved'); render();
    }));
    body.appendChild(cs);
    const cb = card('Connections (bindings)', 'Connect D1, KV, R2, Queues, Vectorize, Hyperdrive, other Workers or AI to this Worker.');
    const conn = binds.filter(b => !['plain_text', 'json'].includes(b.type) && !SECRET_T.includes(b.type));
    conn.forEach(b => {
        const target = b.namespace_id || b.id || b.bucket_name || b.queue_name || b.index_name || b.service || b.dataset || '';
        const r = listRow(`<div class="text-[12px] font-mono font-bold text-gray-200 truncate">${esc(b.name)} ${badge(b.type)}</div><div class="text-[11px] font-mono text-gray-500 truncate">${esc(target)}</div>`);
        r.appendChild(iconBtn2('trash', 'Remove', async () => { if (!await askConfirm(`Remove binding ${b.name}?`, { ok: 'Remove', danger: true })) return; try { await saveBinds(binds.filter(x => x !== b)); } catch (er) { toast(errMsg(er)); } }));
        cb.appendChild(r);
    });
    if (!conn.length) none(cb, 'No connections yet.');
    sp(cb).appendChild(btn('Add connection', 'blue', async () => {
        const types = ['D1 database', 'KV namespace', 'R2 bucket', 'Queue (producer)', 'Vectorize index', 'Hyperdrive', 'Service (another Worker)', 'Workers AI'];
        const f = await askForm({ title: 'Add connection', fields: [{ key: 't', label: 'Type', type: 'choice', options: types, default: types[0] }, { key: 'n', label: 'Binding name', required: true, default: 'DB' }], ok: 'Next' });
        if (!f) return; const bn = f.n.trim(); if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(bn)) throw new Error('Binding name: letters, numbers and _ only');
        if (f.t === 'Workers AI') return saveBinds([...binds, { type: 'ai', name: bn }]);
        const secMap = { 'D1 database': 'd1', 'KV namespace': 'kv', 'R2 bucket': 'r2', 'Queue (producer)': 'queues', 'Vectorize index': 'vectorize', 'Hyperdrive': 'hyperdrive', 'Service (another Worker)': 'workers' };
        const res = await pickResourceFrom(secMap[f.t], f.t); if (!res) return;
        const nb = { 'D1 database': { type: 'd1', name: bn, id: res.id },
                     'KV namespace': { type: 'kv_namespace', name: bn, namespace_id: res.id },
                     'R2 bucket': { type: 'r2_bucket', name: bn, bucket_name: res.id },
                     'Queue (producer)': { type: 'queue', name: bn, queue_name: res.name },
                     'Vectorize index': { type: 'vectorize', name: bn, index_name: res.id },
                     'Hyperdrive': { type: 'hyperdrive', name: bn, id: res.id },
                     'Service (another Worker)': { type: 'service', name: bn, service: res.id, environment: 'production' } }[f.t];
        await saveBinds([...binds, nb]);
    }, 'link'));
    body.appendChild(cb);
    const cd = card('Custom domains', 'The domain must be in your Cloudflare account.');
    (domains || []).forEach(d0 => {
        const r = listRow(`<div class="text-[12px] font-mono text-gray-200 truncate">${esc(d0.hostname)}</div>`);
        r.appendChild(iconBtn2('external-link', 'Open', () => window.open('https://' + d0.hostname, '_blank', 'noopener')));
        r.appendChild(iconBtn2('trash', 'Remove', async () => { if (!await askConfirm(`Remove ${d0.hostname}?`, { ok: 'Remove', danger: true })) return; try { await api(acc(`/workers/domains/${d0.id}`), { method: 'DELETE' }); toast('Removed'); render(); } catch (er) { toast(errMsg(er)); } }));
        cd.appendChild(r);
    });
    if (!(domains || []).length) none(cd, 'No custom domains.');
    sp(cd).appendChild(btn('Add domain', 'blue', async () => {
        const f = await askForm({ title: 'Custom domain', fields: [{ key: 'd', label: 'Hostname', required: true, description: 'e.g. api.example.com' }], ok: 'Add' });
        if (!f) return; const hn = f.d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const zone = await findZone(hn); if (!zone) throw new Error('No zone for this hostname was found in your account.');
        await api(acc('/workers/domains'), { method: 'PUT', json: { hostname: hn, service: name, zone_id: zone.id, environment: 'production' } });
        toast('Domain attached'); render();
    }, 'globe'));
    body.appendChild(cd);
    const cro = card('Routes', 'Route patterns (e.g. example.com/api/*) that send traffic to this Worker.');
    const rb = h('<div></div>'); cro.appendChild(rb);
    const loadRoutes = async () => {
        rb.innerHTML = '<p class="text-[11px] text-gray-600 mt-2">Loading routes...</p>';
        let zones = []; try { zones = (await result(`/zones?account.id=${S.cur.accountId}&per_page=50`)) || []; } catch (e) { rb.innerHTML = ''; none(rb, 'Could not list zones: ' + errMsg(e)); return; }
        rb.innerHTML = ''; let n = 0;
        await Promise.all(zones.map(async z => {
            const rs = await result(`/zones/${z.id}/workers/routes`).catch(() => []);
            (rs || []).filter(x => x.script === name).forEach(x => {
                n++; const r = listRow(`<div class="text-[12px] font-mono text-gray-200 truncate">${esc(x.pattern)}</div><div class="text-[11px] text-gray-500">${esc(z.name)}</div>`);
                r.appendChild(iconBtn2('trash', 'Remove', async () => { if (!await askConfirm(`Remove route ${x.pattern}?`, { ok: 'Remove', danger: true })) return; try { await api(`/zones/${z.id}/workers/routes/${x.id}`, { method: 'DELETE' }); toast('Removed'); loadRoutes(); } catch (er) { toast(errMsg(er)); } }));
                rb.appendChild(r);
            });
        }));
        if (!n) none(rb, zones.length ? 'No routes for this Worker.' : 'No zones in this account.');
    };
    loadRoutes();
    sp(cro).appendChild(btn('Add route', 'blue', async () => {
        const f = await askForm({ title: 'New route', fields: [{ key: 'p', label: 'Route pattern', required: true, description: 'e.g. example.com/api/*' }], ok: 'Add' });
        if (!f) return; const pat = f.p.trim(); const zone = await findZone(pat.replace(/^\*\./, '').replace(/^https?:\/\//, '').split('/')[0]);
        if (!zone) throw new Error('No zone for this pattern was found in your account.');
        await api(`/zones/${zone.id}/workers/routes`, { method: 'POST', json: { pattern: pat, script: name } }); toast('Route added'); loadRoutes();
    }, 'plus'));
    body.appendChild(cro);
    const cc = card('Cron triggers', 'Runs the Worker\'s scheduled() handler on a schedule. Times are UTC.');
    const crons = ((sched && sched.schedules) || []).map(x => x.cron);
    crons.forEach(cr => {
        const r = listRow(`<div class="text-[12px] font-mono text-gray-200">${esc(cr)}</div>`);
        r.appendChild(iconBtn2('trash', 'Remove', async () => { try { await api(acc(`/workers/scripts/${name}/schedules`), { method: 'PUT', json: crons.filter(x => x !== cr).map(c => ({ cron: c })) }); toast('Removed'); render(); } catch (er) { toast(errMsg(er)); } }));
        cc.appendChild(r);
    });
    if (!crons.length) none(cc, 'No cron triggers.');
    sp(cc).appendChild(btn('Add cron', 'blue', async () => {
        const f = await askForm({ title: 'Cron trigger', fields: [{ key: 'c', label: 'Cron', required: true, default: '*/30 * * * *', description: 'min hour day month weekday' }], ok: 'Add' });
        if (!f) return; await api(acc(`/workers/scripts/${name}/schedules`), { method: 'PUT', json: [...crons, f.c.trim()].map(c => ({ cron: c })) }); toast('Cron added'); render();
    }, 'clock'));
    body.appendChild(cc);
    const cr = card('Runtime', 'Compatibility date and flags. Saved without redeploying the code.');
    cr.insertAdjacentHTML('beforeend', `<label class="text-[11px] text-gray-500 block mt-3">Compatibility date</label><input id="cfCompat" class="modern-input !mb-0 text-xs font-mono" value="${esc(st.compatibility_date || WK_COMPAT)}" placeholder="YYYY-MM-DD"><label class="text-[11px] text-gray-500 block mt-3">Compatibility flags (comma separated)</label><input id="cfFlags" class="modern-input !mb-0 text-xs font-mono" value="${esc((st.compatibility_flags || []).join(', '))}" placeholder="nodejs_compat" autocapitalize="off">`);
    const crr = row(cr);
    crr.appendChild(btn('Save runtime', 'blue', async () => {
        const v = $('cfCompat').value.trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Date format must be YYYY-MM-DD');
        const flags = $('cfFlags').value.split(',').map(x => x.trim()).filter(Boolean);
        await wkPatch(name, { compatibility_date: v, compatibility_flags: flags }); toast('Runtime saved'); render();
    }, 'check'));
    crr.appendChild(btn('+ nodejs_compat', 'cfgray', () => { const i = $('cfFlags'); const f = i.value.split(',').map(x => x.trim()).filter(Boolean); if (!f.includes('nodejs_compat')) f.push('nodejs_compat'); i.value = f.join(', '); }));
    body.appendChild(cr);
    const cpl = card('Placement', 'Smart Placement runs the Worker closer to your backend / database.');
    toggleRow(cpl, 'Smart Placement', null, !!(st.placement && st.placement.mode === 'smart'), async (v) => { await wkPatch(name, { placement: v ? { mode: 'smart' } : {} }); });
    body.appendChild(cpl);
    const co = card('Observability & logs', 'Workers Logs, sampling, Logpush and tail consumers.');
    const ob = st.observability || {};
    toggleRow(co, 'Workers Logs', 'Store invocation logs in the dashboard', !!ob.enabled, async (v) => { await wkPatch(name, { observability: { ...ob, enabled: v } }); });
    toggleRow(co, 'Logpush', 'Send logs to your Logpush destination', !!st.logpush, async (v) => { await wkPatch(name, { logpush: v }); });
    body.appendChild(co);
    const cj = jsonCard('Raw settings (advanced)', 'The full settings object of this Worker.', async () => (await result(acc(`/workers/scripts/${name}/settings`))) || {}, async (v) => { await wkPatch(name, v); render(); }, '{}');
    body.appendChild(cj);
    const dz = card('Danger zone', 'Deleting a Worker also removes its code, secrets and routes.', true);
    sp(dz).appendChild(btn('Delete Worker', 'cfdanger', () => deleteCurrent(), 'trash'));
    body.appendChild(dz);
}
async function findZone(host) {
    const parts = host.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
        const cand = parts.slice(i).join('.');
        try { const z = await result(`/zones?name=${encodeURIComponent(cand)}&account.id=${S.cur.accountId}`); if (z && z.length) return z[0]; } catch (e) {}
    }
    return null;
}
async function pickResourceFrom(sec, title) {
    const items = await SEC[sec].load(); if (!items.length) throw new Error(`No ${SEC[sec].one} found. Create one first.`);
    const labels = items.map(i => `${i.name}${i.sub ? ' (' + i.sub + ')' : ''}`);
    const r = await askForm({ title, fields: [{ key: 'p', label: SEC[sec].one, type: 'choice', options: labels, default: labels[0] }], ok: 'Select' });
    return r ? items[labels.indexOf(r.p)] : null;
}
const PGWS = {};
const pgGit = (p) => p && p.source && p.source.type === 'github' ? p.source.config : null;
const stageKind = (s) => s === 'success' ? 'ok' : (s === 'failure' || s === 'canceled') ? 'bad' : (s === 'active' ? 'run' : '');
async function pgProject(name) { return await result(acc(`/pages/projects/${encodeURIComponent(name)}`)); }
SEC.pages.load = async () => {
    const m = new Map();
    for (let p = 1; p <= 30; p++) { const r = (await result(acc(`/pages/projects?page=${p}&per_page=10`))) || []; r.forEach(x => m.set(x.name, x)); if (r.length < 10) break; }
    return [...m.values()].map(x => ({ id: x.name, name: x.name, sub: x.subdomain || '', raw: x, t: x.created_on || '' })).sort((a, b) => b.t.localeCompare(a.t));
};
SEC.pages.create = async () => {
    const f = await askForm({ title: 'New Pages project', message: 'Leave the repo empty for Direct Upload.', fields: [
        { key: 'name', label: 'Project name', required: true },
        { key: 'branch', label: 'Production branch', default: 'main', required: true },
        { key: 'repo', label: 'GitHub repo (optional)', description: 'owner/repo' },
        { key: 'cmd', label: 'Build command (optional)' },
        { key: 'out', label: 'Output directory (optional)', default: '' }], ok: 'Create' });
    if (!f) return;
    const name = f.name.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,57}$/.test(name)) throw new Error('Name can only contain a-z, 0-9 and dashes');
    const body = { name, production_branch: f.branch.trim() };
    if (f.repo.trim()) {
        const m = /^([\w.-]+)\/([\w.-]+)$/.exec(f.repo.trim()); if (!m) throw new Error('Repo format: owner/repo');
        body.source = { type: 'github', config: { owner: m[1], repo_name: m[2], production_branch: body.production_branch, pr_comments_enabled: true, deployments_enabled: true, production_deployments_enabled: true, preview_deployment_setting: 'all' } };
        body.build_config = { build_command: f.cmd.trim(), destination_dir: f.out.trim(), root_dir: '' };
    }
    try { await api(acc('/pages/projects'), { method: 'POST', json: body }); }
    catch (e) { if (body.source) e.message += '\n(GitHub connect failed? Authorize the GitHub app from the dashboard.)'; throw e; }
    toast('Project created'); return name;
};
SEC.pages.del = async (it) => { await api(acc(`/pages/projects/${encodeURIComponent(it.id)}`), { method: 'DELETE' }); };
SEC.pages.render = async function (tab, body, it, my) {
    if (tab === 'overview') return pgOverview(body, it, my);
    if (tab === 'deploys') return pgDeploys(body, it, my);
    if (tab === 'editor') return pgEditor(body, it, my);
    if (tab === 'logs') return pgLogs(body, it, my);
    if (tab === 'settings') return pgSettings(body, it, my);
};
async function pgOverview(body, it, my) {
    const w = spinner(body); let p;
    try { p = await pgProject(it.id); } catch (e) { w.remove(); return body.appendChild(card('Could not load', errMsg(e), true)); }
    if (my !== S.req) return; w.remove();
    const g = pgGit(p), ld = p.latest_deployment, url = 'https://' + p.subdomain;
    const c = card(p.name, 'Cloudflare Pages');
    c.insertAdjacentHTML('beforeend', `<div class="flex flex-wrap gap-1.5 mt-2">${g ? badge('GitHub ' + g.owner + '/' + g.repo_name, 'ok') : badge('Direct Upload')}${badge('branch: ' + p.production_branch)}${badge('created ' + ago(p.created_on))}</div>`);
    const extra = (p.domains || []).filter(d => d !== p.subdomain);
    kvRows(c, [['URL', url, true], ['Custom', extra.join(', ')], ['Project ID', p.id]]);
    const r = row(c);
    r.appendChild(btn('Open site', 'blue', () => window.open(url, '_blank', 'noopener'), 'external-link'));
    if (g) r.appendChild(btn('Trigger build', '', async () => {
        if (!await askConfirm(`Trigger a new build from ${p.production_branch}?`, { title: 'New deployment', ok: 'Build', danger: false })) return;
        const fd = new FormData(); fd.append('branch', p.production_branch);
        await api(acc(`/pages/projects/${encodeURIComponent(p.name)}/deployments`), { method: 'POST', body: fd });
        toast('Build started'); go('deploys');
    }, 'play'));
    else r.appendChild(btn('Deploy from editor', '', () => go('editor'), 'edit'));
    r.appendChild(btn('Settings', 'cfgray', () => go('settings'), 'settings'));
    body.appendChild(c);
    if (ld) {
        const st = ld.latest_stage || {}, md = (ld.deployment_trigger && ld.deployment_trigger.metadata) || {};
        const c2 = card('Latest deployment', ago(ld.created_on));
        c2.insertAdjacentHTML('beforeend', `<div class="flex flex-wrap gap-1.5 mt-2">${badge(ld.environment, ld.environment === 'production' ? 'ok' : '')}${badge((st.name || '') + ': ' + (st.status || ''), stageKind(st.status))}${md.branch ? badge(md.branch) : ''}</div>${md.commit_message ? `<p class="text-[12px] text-gray-300 mt-2 break-words">${esc(md.commit_message)}</p>` : ''}`);
        kvRows(c2, [['Deploy URL', ld.url, true]]);
        sp(c2).appendChild(btn('Build history', 'cfgray', () => go('deploys'), 'clock'));
        body.appendChild(c2);
    }
}
async function pgDeploys(body, it, my) {
    const name = it.id, w = spinner(body);
    let list;
    try { list = (await result(acc(`/pages/projects/${encodeURIComponent(name)}/deployments`))) || []; } catch (e) { w.remove(); return body.appendChild(card('Could not load deployments', errMsg(e), true)); }
    if (my !== S.req) return; w.remove();
    let canon = null; try { canon = (await pgProject(name)).canonical_deployment; } catch (e) {}
    if (!list.length) return emptyNote(body, 'No deployments yet.');
    const tb = row(body, 'flex gap-2 mb-3'); tb.appendChild(btn('Refresh', 'cfgray', () => render(), 'refresh'));
    list.forEach(d => {
        const st = d.latest_stage || {}, md = (d.deployment_trigger && d.deployment_trigger.metadata) || {};
        const isCanon = canon && canon.id === d.id;
        const c = card((md.commit_message || (d.deployment_trigger && d.deployment_trigger.type) || 'deployment').slice(0, 70), '');
        c.insertAdjacentHTML('beforeend', `<div class="flex flex-wrap gap-1.5 mt-2">${badge(d.environment, d.environment === 'production' ? 'ok' : '')}${isCanon ? badge('LIVE', 'ok') : ''}${badge((st.name || '') + ': ' + (st.status || ''), stageKind(st.status))}${md.branch ? badge(md.branch) : ''}${badge(ago(d.created_on))}${badge(d.short_id || d.id.slice(0, 8))}</div>`);
        const logBox = h('<div class="cfpre hidden mt-3" style="max-height:45vh"></div>');
        const r = row(c);
        r.appendChild(btn('Open', 'cfgray', () => window.open(d.url, '_blank', 'noopener'), 'external-link'));
        r.appendChild(btn('Build logs', 'blue', async () => {
            logBox.classList.remove('hidden'); logBox.textContent = 'Loading...';
            const j = await result(acc(`/pages/projects/${encodeURIComponent(name)}/deployments/${d.id}/history/logs`));
            const lines = (j && j.data) || [];
            logBox.textContent = lines.length ? lines.map(l => (l.ts ? '[' + new Date(l.ts).toLocaleTimeString('en-GB') + '] ' : '') + l.line).join('\n') : 'This deployment has no build logs.';
            logBox.scrollTop = logBox.scrollHeight;
        }, 'terminal'));
        r.appendChild(btn('Retry', 'cfgray', async () => { await api(acc(`/pages/projects/${encodeURIComponent(name)}/deployments/${d.id}/retry`), { method: 'POST' }); toast('Retry started'); render(); }, 'refresh'));
        if (d.environment === 'production' && !isCanon && st.status === 'success') r.appendChild(btn('Rollback', 'cfgray', async () => {
            if (!await askConfirm('Roll production back to this deployment?', { title: 'Rollback', ok: 'Rollback', danger: false })) return;
            await api(acc(`/pages/projects/${encodeURIComponent(name)}/deployments/${d.id}/rollback`), { method: 'POST' }); toast('Rolled back'); render();
        }, 'corner-left-up'));
        if (!isCanon) r.appendChild(btn('Delete', 'cfdanger', async () => {
            if (!await askConfirm('Delete this deployment?', { title: 'Delete deployment', ok: 'Delete', danger: true })) return;
            await api(acc(`/pages/projects/${encodeURIComponent(name)}/deployments/${d.id}?force=true`), { method: 'DELETE' }); toast('Deleted'); render();
        }, 'trash'));
        c.appendChild(logBox); body.appendChild(c);
    });
}
async function pgEditor(body, it, my) {
    const name = it.id, w = spinner(body); let p;
    try { p = await pgProject(name); } catch (e) { w.remove(); return body.appendChild(card('Could not load', errMsg(e), true)); }
    if (my !== S.req) return; w.remove();
    const ws = PGWS[name] || (PGWS[name] = { files: new Map(), cur: null, base: { map: null } });
    const g = pgGit(p);
    const info = h(`<div class="text-[11px] text-gray-500 mb-3 leading-relaxed">${g ? 'This project is <b>GitHub-connected</b>.' : 'This is a <b>Direct Upload</b> project.'}</div>`);
    body.appendChild(info);
    const msg = h('<p class="text-[11px] text-gray-500 mb-3 break-words"></p>');
    const buttons = [];
    if (!g) buttons.push(['Deploy', '', async () => {
        if (!ws.files.size) throw new Error('The workspace is empty');
        const f = await askForm({ title: 'Deploy to Pages', message: `${ws.files.size} files → ${name}`, fields: [{ key: 'b', label: 'Branch', default: p.production_branch, required: true, description: `${p.production_branch} = production, anything else = preview` }], ok: 'Deploy' });
        if (!f) return;
        const d = await pgDeploy(name, ws.files, f.b.trim(), (t) => { msg.textContent = t; });
        for (const x of ws.files.values()) x.dirty = false;
        msg.textContent = 'Deployed: ' + (d.url || ''); toast('Deployed to Pages');
        if (d.url) body.insertBefore(linkRow('Deployed', d.url), msg);
    }, 'upload']);
    buttons.push(['ZIP', 'cfgray', async () => {
        if (typeof JSZip === 'undefined') throw new Error('JSZip did not load');
        const z = new JSZip(); for (const [pth, f] of ws.files) z.file(pth, fileBytes(f));
        saveAs(await z.generateAsync({ type: 'blob' }), name + '.zip');
    }, 'download']);
    fileEditor(body, ws, { allowImport: true, buttons, defaultFile: 'index.html' });
    body.appendChild(h('<div class="mb-3"></div>')); body.appendChild(msg);
    body.appendChild(gitCard({
        key: 'pg_' + name, repo: g ? `${g.owner}/${g.repo_name}` : '', branch: g ? p.production_branch : 'main',
        desc: g ? 'The connected repo is pre-filled.' : 'Pull files from any repo, or push the source here to a repo as a backup.',
        filter: (pth) => !/^(node_modules|\.git)\//.test(pth), base: ws.base,
        confirmPull: () => ws.files.size ? 'Pulling replaces all files in the workspace. Continue?' : null,
        collect: () => { const m = new Map(); for (const [pth, f] of ws.files) m.set(pth, { bytes: fileBytes(f) }); return m; },
        apply: async (files) => { ws.files.clear(); for (const [pth, f] of files) ws.files.set(pth, { bytes: f.bytes }); ws.cur = null; render(); }
    }));
}
const PG_SPECIAL = ['_headers', '_redirects', '_routes.json', '_worker.js'];
async function pgDeploy(name, files, branch, say) {
    const manifest = {}, assets = new Map();
    say('Hashing files...');
    for (const [pth, f] of files) {
        if (PG_SPECIAL.includes(pth)) continue;
        const bytes = fileBytes(f);
        if (bytes.length > 25 * 1048576) throw new Error(pth + ' is larger than the 25MB limit');
        const b64 = bytesToB64(bytes);
        const hash = (await digestHex(enc.encode(b64 + extOf(pth)), 'SHA-256')).slice(0, 32);
        manifest['/' + pth] = hash;
        assets.set(hash, { key: hash, value: b64, metadata: { contentType: mimeOf(pth) }, base64: true });
    }
    const hashes = [...assets.keys()];
    if (!hashes.length && !files.has('_worker.js')) throw new Error('At least one file is needed to deploy');
    let jwt;
    if (hashes.length) {
        say('Getting an upload token...');
        jwt = (await result(acc(`/pages/projects/${encodeURIComponent(name)}/upload-token`))).jwt;
        const jh = { 'Authorization': 'Bearer ' + jwt };
        let missing = hashes;
        try { const m = await result('/pages/assets/check-missing', { method: 'POST', headers: jh, noAuth: true, json: { hashes } }); if (Array.isArray(m)) missing = m; } catch (e) {}
        const todo = missing.map(k => assets.get(k)).filter(Boolean);
        let batch = [], size = 0, done = 0;
        const flush = async () => { if (!batch.length) return; await api('/pages/assets/upload', { method: 'POST', headers: jh, noAuth: true, json: batch }); done += batch.length; say(`Uploading ${done}/${todo.length}...`); batch = []; size = 0; };
        for (const a of todo) { if (batch.length >= 40 || size + a.value.length > 12 * 1048576) await flush(); batch.push(a); size += a.value.length; }
        await flush();
        await api('/pages/assets/upsert-hashes', { method: 'POST', headers: jh, noAuth: true, json: { hashes } });
    }
    say('Creating the deployment...');
    const fd = new FormData();
    fd.append('manifest', JSON.stringify(manifest)); fd.append('branch', branch);
    for (const s2 of PG_SPECIAL) if (files.has(s2)) fd.append(s2, new Blob([fileBytes(files.get(s2))], { type: s2.endsWith('.json') ? 'application/json' : 'text/plain' }), s2);
    return await result(acc(`/pages/projects/${encodeURIComponent(name)}/deployments`), { method: 'POST', body: fd });
}
async function pgLogs(body, it, my) {
    const name = it.id, w = spinner(body); let p;
    try { p = await pgProject(name); } catch (e) { w.remove(); return body.appendChild(card('Could not load', errMsg(e), true)); }
    if (my !== S.req) return; w.remove();
    const d = p.canonical_deployment || p.latest_deployment;
    if (!d) return emptyNote(body, 'There is no deployment yet.');
    body.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-gray-500 mb-3">Live runtime logs (Pages Functions) of deployment <span class="font-mono">${esc(d.short_id || d.id.slice(0, 8))}</span>.</p>`);
    tailPanel(body, my, { startPath: acc(`/pages/projects/${encodeURIComponent(name)}/deployments/${d.id}/tails`), delPath: (id) => acc(`/pages/projects/${encodeURIComponent(name)}/deployments/${d.id}/tails/${id}`), note: 'Only console.log output of Functions appears here, not static files.' });
}
async function pgSettings(body, it, my) {
    const name = it.id, w = spinner(body); let p, doms;
    try { [p, doms] = await Promise.all([pgProject(name), result(acc(`/pages/projects/${encodeURIComponent(name)}/domains`)).catch(() => [])]); } catch (e) { w.remove(); return body.appendChild(card('Could not load settings', errMsg(e), true)); }
    if (my !== S.req) return; w.remove();
    const g = pgGit(p), base = acc(`/pages/projects/${encodeURIComponent(name)}`);
    const patch = async (json, msg) => { await api(base, { method: 'PATCH', json }); toast(msg || 'Saved'); render(); };
    const patchQuiet = async (json) => { await api(base, { method: 'PATCH', json }); };
    const dc = p.deployment_configs || { production: {}, preview: {} };
    let env = LS.get('cf_pg_env', 'production');
    const cp = card('Project', 'General project settings.');
    kvRows(cp, [['Name', p.name], ['Subdomain', p.subdomain], ['Project ID', p.id], ['Created', p.created_on ? new Date(p.created_on).toLocaleString() : '']]);
    cp.insertAdjacentHTML('beforeend', `<label class="text-[11px] text-gray-500 block mt-3">Production branch</label><input id="cfPgBranch" class="modern-input !mb-0 text-xs font-mono" value="${esc(p.production_branch || '')}" autocapitalize="off">`);
    sp(cp).appendChild(btn('Save production branch', 'blue', async () => {
        const v = $('cfPgBranch').value.trim(); if (!v) throw new Error('Enter a branch');
        await patch(g ? { production_branch: v, source: { type: 'github', config: { ...g, production_branch: v } } } : { production_branch: v });
    }, 'check'));
    body.appendChild(cp);
    const cg = card('GitHub connection', g ? `${g.owner}/${g.repo_name}` : 'Direct Upload project');
    cg.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-gray-500 mt-2 leading-relaxed">${g ? 'Every push to the repo triggers a Cloudflare build.' : 'Cloudflare does not allow connecting a Direct Upload project to Git later.'}</p>`);
    if (g) {
        const cfgPatch = async (k, v) => { await patchQuiet({ source: { type: 'github', config: { ...g, [k]: v } } }); g[k] = v; };
        toggleRow(cg, 'Automatic deployments', 'Build when you push to the repo', g.deployments_enabled !== false, (v) => cfgPatch('deployments_enabled', v));
        toggleRow(cg, 'Production deployments', 'Build the production branch on push', g.production_deployments_enabled !== false, (v) => cfgPatch('production_deployments_enabled', v));
        toggleRow(cg, 'Pull request comments', 'Comment the preview URL on pull requests', g.pr_comments_enabled !== false, (v) => cfgPatch('pr_comments_enabled', v));
        const pv = h(`<div class="mt-3"><label class="text-[11px] text-gray-500 block">Preview deployments</label><select id="cfPgPrev" class="modern-input !mb-0 text-xs"><option value="all">All non-production branches</option><option value="custom">Custom branches</option><option value="none">None</option></select></div>`);
        cg.appendChild(pv); const sel = pv.querySelector('select'); sel.value = g.preview_deployment_setting || 'all';
        sel.onchange = async () => { try { await cfgPatch('preview_deployment_setting', sel.value); toast('Saved'); } catch (e) { toast(errMsg(e)); } };
        const r = row(cg);
        r.appendChild(btn('Open repo', 'cfgray', () => window.open(`https://github.com/${g.owner}/${g.repo_name}`, '_blank', 'noopener'), 'github'));
    }
    body.appendChild(cg);
    const sw = h(`<div class="seg mb-4"><button data-e="production">Production</button><button data-e="preview">Preview</button></div>`);
    sw.querySelectorAll('button').forEach(b => { b.classList.toggle('active', b.dataset.e === env); b.onclick = () => { LS.set('cf_pg_env', b.dataset.e); render(); }; });
    body.appendChild(sw);
    const cfg = dc[env] || {};
    const dcPatch = (o, msg) => patch({ deployment_configs: { [env]: o } }, msg);
    const cv = card(`Variables & secrets (${env})`, 'New deployments use these values.');
    const ev = cfg.env_vars || {};
    Object.keys(ev).sort().forEach(k => {
        const v = ev[k] || {};
        const r = listRow(`<div class="text-[12px] font-mono font-bold text-gray-200 truncate">${esc(k)} ${v.type === 'secret_text' ? badge('secret') : ''}</div><div class="text-[11px] font-mono text-gray-500 truncate">${v.type === 'secret_text' ? '••••••••' : esc(v.value)}</div>`);
        r.appendChild(iconBtn2('edit', 'Edit', async () => { const f = await askForm({ title: 'Edit ' + k, fields: [{ key: 'v', label: 'New value', required: true, default: v.type === 'secret_text' ? '' : v.value }], ok: 'Save' }); if (!f) return; try { await dcPatch({ env_vars: { [k]: { type: v.type || 'plain_text', value: f.v } } }); } catch (er) { toast(errMsg(er)); } }));
        r.appendChild(iconBtn2('trash', 'Delete', async () => { if (!await askConfirm(`Delete ${k}?`, { ok: 'Delete', danger: true })) return; try { await dcPatch({ env_vars: { [k]: null } }, 'Deleted'); } catch (er) { toast(errMsg(er)); } }));
        cv.appendChild(r);
    });
    if (!Object.keys(ev).length) none(cv, 'No variables.');
    const vr = row(cv);
    vr.appendChild(btn('Add variable', 'blue', async () => {
        const f = await askForm({ title: 'New variable', fields: [{ key: 'n', label: 'Name', required: true }, { key: 'v', label: 'Value', required: true }, { key: 't', label: 'Type', type: 'choice', options: ['plain_text', 'secret_text'], default: 'plain_text' }], ok: 'Add' });
        if (!f) return; await dcPatch({ env_vars: { [f.n.trim()]: { type: f.t, value: f.v } } });
    }, 'plus'));
    body.appendChild(cv);
    const cc = card(`Runtime (${env})`, 'Functions runtime options.');
    cc.insertAdjacentHTML('beforeend', `<label class="text-[11px] text-gray-500 block mt-3">Compatibility date</label><input id="cfPgCompat" class="modern-input !mb-0 text-xs font-mono" value="${esc(cfg.compatibility_date || '')}" placeholder="YYYY-MM-DD"><label class="text-[11px] text-gray-500 block mt-3">Compatibility flags (comma separated)</label><input id="cfPgFlags" class="modern-input !mb-0 text-xs font-mono" value="${esc((cfg.compatibility_flags || []).join(', '))}" placeholder="nodejs_compat" autocapitalize="off">`);
    sp(cc).appendChild(btn('Save runtime', 'blue', async () => {
        const v = $('cfPgCompat').value.trim(); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Date format must be YYYY-MM-DD');
        const o = { compatibility_flags: $('cfPgFlags').value.split(',').map(x => x.trim()).filter(Boolean) };
        if (v) o.compatibility_date = v; await dcPatch(o);
    }, 'check'));
    body.appendChild(cc);
    const cd = card('Custom domains', 'After adding a domain, point a CNAME to ' + p.subdomain + '.');
    (doms || []).forEach(d0 => {
        const ok = d0.status === 'active';
        const r = listRow(`<div class="text-[12px] font-mono text-gray-200 truncate">${esc(d0.name)}</div><div class="mt-0.5">${badge(d0.status || '', ok ? 'ok' : 'run')}</div>`);
        r.appendChild(iconBtn2('external-link', 'Open', () => window.open('https://' + d0.name, '_blank', 'noopener')));
        r.appendChild(iconBtn2('trash', 'Remove', async () => { if (!await askConfirm(`Remove ${d0.name}?`, { ok: 'Remove', danger: true })) return; try { await api(acc(`/pages/projects/${encodeURIComponent(name)}/domains/${encodeURIComponent(d0.name)}`), { method: 'DELETE' }); toast('Removed'); render(); } catch (er) { toast(errMsg(er)); } }));
        cd.appendChild(r);
    });
    if (!(doms || []).length) none(cd, 'No custom domains.');
    const dr = row(cd);
    dr.appendChild(btn('Add domain', 'blue', async () => {
        const f = await askForm({ title: 'Custom domain', fields: [{ key: 'd', label: 'Domain', required: true, description: 'e.g. site.example.com' }], ok: 'Add' });
        if (!f) return; await api(acc(`/pages/projects/${encodeURIComponent(name)}/domains`), { method: 'POST', json: { name: f.d.trim().toLowerCase().replace(/^https?:\/\//, '') } }); toast('Domain added'); render();
    }, 'globe'));
    body.appendChild(cd);
    const dz = card('Danger zone', 'Deleting a project also deletes all of its deployments.', true);
    sp(dz).appendChild(btn('Delete project', 'cfdanger', () => deleteCurrent(), 'trash'));
    body.appendChild(dz);
}
// ===== D1 =====
const LOCS = ['auto', 'wnam', 'enam', 'weur', 'eeur', 'apac', 'oc'];
const qid = (n) => '"' + String(n).replace(/"/g, '""') + '"';
function snippet(title, text) {
    const c = card(title, 'Paste into wrangler.toml');
    c.insertAdjacentHTML('beforeend', `<pre class="cfpre mt-3">${esc(text)}</pre>`);
    sp(c).appendChild(btn('Copy', 'cfgray', () => copy(text), 'copy'));
    return c;
}
function dataTable(rows) {
    if (!rows || !rows.length) return h('<p class="text-[11px] text-gray-500 py-2">0 rows</p>');
    const cols = []; rows.forEach(r => Object.keys(r).forEach(k => { if (!cols.includes(k)) cols.push(k); }));
    const wrap = h('<div class="overflow-x-auto border border-[#30363d] rounded-lg"><table class="cftable"></table></div>');
    const t = wrap.firstElementChild;
    t.innerHTML = '<thead><tr>' + cols.map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + cols.map(c => { const v = r[c]; return v == null ? '<td><i class="text-gray-600">NULL</i></td>' : `<td title="${esc(typeof v === 'object' ? JSON.stringify(v) : v)}">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td>`; }).join('') + '</tr>').join('') + '</tbody>';
    return wrap;
}
function infoPage(body, it, rows, opts) {
    opts = opts || {};
    const c = card(it.name, SEC[S.sel.sec].one); kvRows(c, rows); body.appendChild(c);
    if (opts.extra) opts.extra(body);
    if (opts.snippet) body.appendChild(snippet('Binding snippet', opts.snippet));
    const dz = card('Danger zone', opts.dangerNote || 'Deleted data cannot be recovered.', true);
    sp(dz).appendChild(btn('Delete ' + SEC[S.sel.sec].one, 'cfdanger', () => deleteCurrent(), 'trash'));
    body.appendChild(dz);
}
SEC.d1.load = async () => ((await result(acc('/d1/database?per_page=100'))) || []).map(x => ({ id: x.uuid, name: x.name, sub: x.num_tables != null ? x.num_tables + ' tables' : '', raw: x }));
SEC.d1.create = async () => {
    const f = await askForm({ title: 'New D1 database', fields: [{ key: 'n', label: 'Name', required: true }, { key: 'l', label: 'Location hint', type: 'choice', options: LOCS, default: 'auto' }], ok: 'Create' });
    if (!f) return; const body = { name: f.n.trim() }; if (f.l !== 'auto') body.primary_location_hint = f.l;
    const r = await result(acc('/d1/database'), { method: 'POST', json: body }); toast('D1 created'); return r.uuid;
};
SEC.d1.del = async (it) => { await api(acc(`/d1/database/${it.id}`), { method: 'DELETE' }); };
async function d1q(id, sql, params) { return (await result(acc(`/d1/database/${id}/query`), { method: 'POST', json: params ? { sql, params } : { sql } })) || []; }
SEC.d1.render = async function (tab, body, it, my) {
    if (tab === 'tables') return d1Tables(body, it, my);
    if (tab === 'sql') return d1Sql(body, it, my);
    return d1Settings(body, it, my);
};
async function d1Settings(body, it, my) {
    const w = spinner(body);
    const info = await result(acc(`/d1/database/${it.id}`)).catch(() => it.raw || {});
    if (my !== S.req) return; w.remove();
    const x = info || {}, dp = acc(`/d1/database/${it.id}`);
    infoPage(body, it, [['Name', x.name], ['UUID', x.uuid || it.id], ['Created', x.created_at], ['Tables', x.num_tables], ['Size', x.file_size != null ? fmtBytes(x.file_size) : ''], ['Version', x.version], ['Region', x.running_in_region]], {
        snippet: `[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${it.name}"\ndatabase_id = "${it.id}"`,
        dangerNote: 'Deleting a D1 database removes all of its tables and data.',
        extra: (b) => {
            const ex = card('Export', 'Download the whole database as a .sql file.');
            const exr = row(ex);
            const doExport = async (opts2) => {
                let j = await result(`${dp}/export`, { method: 'POST', json: { output_format: 'polling', ...opts2 } });
                for (let i = 0; i < 60 && j && j.status !== 'complete'; i++) {
                    if (j.status === 'error') throw new Error(j.error || 'Export failed');
                    await new Promise(r => setTimeout(r, 1500));
                    j = await result(`${dp}/export`, { method: 'POST', json: { output_format: 'polling', current_bookmark: j.at_bookmark } });
                }
                if (!j || j.status !== 'complete') throw new Error('Export timed out');
                const url = j.result && j.result.signed_url; if (!url) throw new Error('No download URL');
                window.open(url, '_blank', 'noopener'); toast('Export ready');
            };
            exr.appendChild(btn('Export schema + data', 'blue', () => doExport({}), 'download'));
            exr.appendChild(btn('Schema only', 'cfgray', () => doExport({ dump_options: { no_data: true } })));
            b.appendChild(ex);
        }
    });
}
async function d1Tables(body, it, my) {
    const w = spinner(body); let rows;
    try { const r = await d1q(it.id, "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"); rows = (r[0] && r[0].results) || []; }
    catch (e) { w.remove(); return body.appendChild(card('Could not load tables', errMsg(e), true)); }
    if (my !== S.req) return; w.remove();
    const tb = row(body, 'flex gap-2 mb-3'); tb.appendChild(btn('Refresh', 'cfgray', () => render(), 'refresh'));
    tb.appendChild(btn('New table (SQL)', 'blue', () => go('sql'), 'plus'));
    if (!rows.length) return emptyNote(body, 'No tables yet. Run CREATE TABLE in the SQL tab.');
    rows.forEach(t => {
        const b = h(`<button type="button" class="es-item mb-2"><span class="es-ic">${ic('list')}</span><span class="es-tx"><b class="font-mono">${esc(t.name)}</b><small>${esc(t.type)}</small></span></button>`);
        b.onclick = () => d1Browse(it, t.name); body.appendChild(b);
    });
}
function d1Browse(it, table) {
    sheet(table, async (b) => {
        let off = 0; const PAGE = 50;
        const info = h('<div class="text-[11px] text-gray-500"></div>'), out = h('<div></div>');
        const nav = row(b, 'flex gap-2 flex-wrap');
        const load = async () => {
            out.innerHTML = '<p class="text-sm text-gray-500 py-4 text-center">Loading...</p>';
            try {
                const [cnt, data] = await Promise.all([d1q(it.id, `SELECT COUNT(*) AS c FROM ${qid(table)}`), d1q(it.id, `SELECT * FROM ${qid(table)} LIMIT ${PAGE} OFFSET ${off}`)]);
                const total = cnt[0].results[0].c, rows = data[0].results || [];
                info.textContent = `${total} rows • showing ${total ? off + 1 : 0}-${off + rows.length}`; out.innerHTML = ''; out.appendChild(dataTable(rows));
                prev.disabled = off === 0; next.disabled = off + PAGE >= total;
            } catch (e) { out.innerHTML = ''; out.appendChild(card('Error', errMsg(e), true)); }
        };
        const prev = btn('Prev', 'cfgray', async () => { off = Math.max(0, off - PAGE); await load(); }), next = btn('Next', 'cfgray', async () => { off += PAGE; await load(); });
        nav.appendChild(prev); nav.appendChild(next);
        nav.appendChild(btn('Schema', 'blue', async () => { const r = await d1q(it.id, `PRAGMA table_info(${qid(table)})`); out.innerHTML = ''; out.appendChild(dataTable((r[0] && r[0].results) || [])); }));
        nav.appendChild(btn('Data', 'blue', load));
        nav.appendChild(btn('Drop table', 'cfdanger', async () => { if (!await askConfirm(`DROP TABLE ${table}? This cannot be undone.`, { title: 'Drop table', ok: 'Drop', danger: true })) return; await d1q(it.id, `DROP TABLE ${qid(table)}`); toast('Table dropped'); b.closest('.sheet-ov').remove(); render(); }, 'trash'));
        b.appendChild(info); b.appendChild(out); await load();
    });
}
async function d1Sql(body, it, my) {
    const hist = LS.get('cf_sql_hist', []);
    const ta = h(`<textarea class="modern-input font-mono text-xs !mb-2" rows="6" spellcheck="false" autocapitalize="off" placeholder="SELECT * FROM table;">${esc(LS.get('cf_sql_last_' + it.id, "SELECT name FROM sqlite_master WHERE type='table';"))}</textarea>`);
    const out = h('<div class="flex flex-col gap-3 mt-3"></div>');
    body.appendChild(ta);
    const bar = row(body, 'flex gap-2 flex-wrap');
    bar.appendChild(btn('Run', '', async () => {
        const sql = ta.value.trim(); if (!sql) return; LS.set('cf_sql_last_' + it.id, sql);
        if (/\b(drop|delete|truncate|alter)\b/i.test(sql) && !await askConfirm('This query contains a destructive command. Run it?', { title: 'Run SQL', ok: 'Run', danger: true })) return;
        out.innerHTML = '<p class="text-sm text-gray-500">Running...</p>';
        const t0 = performance.now();
        try {
            const r = await d1q(it.id, sql); out.innerHTML = '';
            const h2 = [sql, ...hist.filter(x => x !== sql)].slice(0, 10); LS.set('cf_sql_hist', h2);
            r.forEach((q, i) => {
                const m = q.meta || {};
                const c = h(`<div><div class="text-[11px] text-gray-500 mb-1">#${i + 1} • ${(q.results || []).length} rows • changes ${m.changes ?? 0} • ${m.duration != null ? m.duration.toFixed(1) + ' ms' : Math.round(performance.now() - t0) + ' ms'}</div></div>`);
                c.appendChild(dataTable(q.results || [])); out.appendChild(c);
            });
            if (!r.length) out.innerHTML = '<p class="text-sm text-gray-500">Done (no result set)</p>';
        } catch (e) { out.innerHTML = ''; out.appendChild(card('SQL error', errMsg(e), true)); }
    }, 'play'));
    bar.appendChild(btn('Clear', 'cfgray', () => { ta.value = ''; out.innerHTML = ''; }));
    body.appendChild(out);
}
// ===== KV =====
SEC.kv.load = async () => ((await result(acc('/storage/kv/namespaces?per_page=100'))) || []).map(x => ({ id: x.id, name: x.title, sub: x.id.slice(0, 8), raw: x }));
SEC.kv.create = async () => {
    const f = await askForm({ title: 'New KV namespace', fields: [{ key: 't', label: 'Title', required: true }], ok: 'Create' }); if (!f) return;
    const r = await result(acc('/storage/kv/namespaces'), { method: 'POST', json: { title: f.t.trim() } }); toast('KV created'); return r.id;
};
SEC.kv.del = async (it) => { await api(acc(`/storage/kv/namespaces/${it.id}`), { method: 'DELETE' }); };
async function kvAllKeys(kvp, onProgress) {
    const names = []; let cursor = '';
    do {
        const j = await api(`${kvp}/keys?limit=1000${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
        (j.result || []).forEach(k => names.push(k.name)); cursor = (j.result_info && j.result_info.cursor) || '';
        if (onProgress) onProgress(names.length);
    } while (cursor);
    return names;
}
SEC.kv.render = async function (tab, body, it, my) {
    if (tab === 'keys') return kvKeys(body, it, my);
    const kvp = acc(`/storage/kv/namespaces/${it.id}`);
    infoPage(body, it, [['Title', it.name], ['Namespace ID', it.id]], {
        snippet: `[[kv_namespaces]]\nbinding = "KV"\nid = "${it.id}"`,
        dangerNote: 'Deleting a namespace removes every key in it.',
        extra: (b) => {
            const c = card('Rename', 'Change the namespace title.'); c.insertAdjacentHTML('beforeend', `<input id="cfKvName" class="modern-input !mb-0 !mt-3 text-xs" value="${esc(it.name)}">`);
            sp(c).appendChild(btn('Save name', 'blue', async () => { await api(kvp, { method: 'PUT', json: { title: $('cfKvName').value.trim() } }); toast('Renamed'); await refreshList(); render(); }, 'check')); b.appendChild(c);
            const bw = card('Bulk write', 'JSON array: [{"key":"a","value":"1"}] (up to 10,000 items).');
            bw.insertAdjacentHTML('beforeend', '<textarea id="cfKvBulk" class="modern-input !mb-0 !mt-3 font-mono text-xs" rows="6" spellcheck="false" autocapitalize="off" placeholder=\'[{"key":"hello","value":"world"}]\'></textarea>');
            sp(bw).appendChild(btn('Write keys', 'blue', async () => { const arr = parseJsonField($('cfKvBulk').value, 'Bulk write'); if (!Array.isArray(arr)) throw new Error('Must be a JSON array'); await api(`${kvp}/bulk`, { method: 'PUT', json: arr }); toast(arr.length + ' keys written'); }, 'upload')); b.appendChild(bw);
        }
    });
};
async function kvKeys(body, it, my) {
    const id = it.id, kvp = acc(`/storage/kv/namespaces/${id}`);
    const bar = h(`<div class="flex gap-2 mb-3"><input class="modern-input !mb-0 flex-1 text-xs font-mono" placeholder="Key prefix filter" autocapitalize="off"></div>`);
    const inp = bar.firstElementChild; body.appendChild(bar);
    const list = h('<div class="flex flex-col gap-1.5"></div>'), more = h('<div class="mt-3"></div>');
    let cursor = '', prefix = '';
    const editKey = async (key, meta, exp) => {
        let val = '', binary = false, isNew = key == null;
        if (!isNew) { const res = await rawFetch(`${kvp}/values/${encodeURIComponent(key)}`); if (!res.ok) throw new Error('Could not load the value: ' + res.status); const buf = new Uint8Array(await res.arrayBuffer()); binary = !looksText(buf); val = binary ? '' : dec.decode(buf); }
        sheet(isNew ? 'New key' : key, (b, close) => {
            const kin = h(`<input class="modern-input !mb-0 font-mono text-xs" placeholder="key name" value="${esc(key || '')}" ${isNew ? '' : 'readonly'}>`);
            const ta = h(`<textarea class="modern-input !mb-0 font-mono text-xs" rows="12" spellcheck="false">${esc(val)}</textarea>`);
            if (binary) { ta.value = '[binary value: cannot be edited here]'; ta.readOnly = true; }
            const mi = h(`<input class="modern-input !mb-0 font-mono text-xs" placeholder='metadata JSON (optional)' value="${esc(meta ? JSON.stringify(meta) : '')}" autocapitalize="off">`);
            const ttl = h(`<input class="modern-input !mb-0 font-mono text-xs" placeholder="expiration TTL in seconds (optional)" inputmode="numeric">`);
            b.appendChild(kin); b.appendChild(ta); b.appendChild(mi); b.appendChild(ttl);
            if (exp) b.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-gray-500">Current expiry: ${esc(new Date(exp * 1000).toLocaleString())}</p>`);
            const r = row(b, 'flex flex-wrap gap-2');
            if (!binary) r.appendChild(btn('Save', '', async () => {
                const k = kin.value.trim(); if (!k) throw new Error('Enter a key name');
                const m = mi.value.trim() ? parseJsonField(mi.value, 'Metadata') : {};
                const fd = new FormData(); fd.append('value', ta.value); fd.append('metadata', JSON.stringify(m));
                const q = ttl.value.trim() ? `?expiration_ttl=${encodeURIComponent(ttl.value.trim())}` : '';
                await api(`${kvp}/values/${encodeURIComponent(k)}${q}`, { method: 'PUT', body: fd }); toast('Saved'); close(); loadKeys(true);
            }, 'check'));
            r.appendChild(btn('Copy', 'cfgray', () => copy(ta.value), 'copy'));
            if (!isNew) r.appendChild(btn('Delete', 'cfdanger', async () => { if (!await askConfirm(`Delete key ${key}?`, { ok: 'Delete', danger: true })) return; await api(`${kvp}/values/${encodeURIComponent(key)}`, { method: 'DELETE' }); toast('Deleted'); close(); loadKeys(true); }, 'trash'));
        });
    };
    const loadKeys = async (reset) => {
        if (reset) { cursor = ''; list.innerHTML = ''; }
        const q = `?limit=50${prefix ? '&prefix=' + encodeURIComponent(prefix) : ''}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
        const j = await api(`${kvp}/keys${q}`);
        (j.result || []).forEach(k => {
            const b = h(`<button type="button" class="es-item !py-2"><span class="es-ic">${ic('key')}</span><span class="es-tx min-w-0"><b class="font-mono truncate">${esc(k.name)}</b>${k.expiration ? `<small>expires ${new Date(k.expiration * 1000).toLocaleString()}</small>` : ''}</span></button>`);
            b.onclick = async () => { try { await editKey(k.name, k.metadata, k.expiration); } catch (e) { toast(errMsg(e)); } }; list.appendChild(b);
        });
        if (!list.childElementCount) list.innerHTML = '<p class="text-sm text-gray-500 text-center py-6">No keys.</p>';
        cursor = (j.result_info && j.result_info.cursor) || ''; more.innerHTML = '';
        if (cursor) more.appendChild(btn('Load more', 'cfgray', () => loadKeys(false)));
    };
    const tb = row(body, 'flex gap-2 mb-3');
    tb.appendChild(btn('Search', 'blue', async () => { prefix = inp.value.trim(); await loadKeys(true); }, 'refresh'));
    tb.appendChild(btn('New key', '', () => editKey(null), 'plus'));
    body.appendChild(list); body.appendChild(more);
    try { await loadKeys(true); } catch (e) { list.innerHTML = ''; list.appendChild(card('Could not load keys', errMsg(e), true)); }
}
// ===== R2 =====
SEC.r2.load = async () => { const r = (await result(acc('/r2/buckets'))) || {}; return (r.buckets || r || []).map(x => ({ id: x.name, name: x.name, sub: x.location || '', raw: x })); };
SEC.r2.create = async () => {
    const f = await askForm({ title: 'New R2 bucket', fields: [{ key: 'n', label: 'Bucket name', required: true, description: 'lowercase, 3-63 characters' }, { key: 'l', label: 'Location hint', type: 'choice', options: LOCS, default: 'auto' }, { key: 's', label: 'Default storage class', type: 'choice', options: ['Standard', 'InfrequentAccess'], default: 'Standard' }], ok: 'Create' }); if (!f) return;
    const body = { name: f.n.trim().toLowerCase(), storageClass: f.s }; if (f.l !== 'auto') body.locationHint = f.l;
    await api(acc('/r2/buckets'), { method: 'POST', json: body }); toast('R2 bucket created'); return body.name;
};
SEC.r2.del = async (it) => { await api(acc(`/r2/buckets/${encodeURIComponent(it.id)}`), { method: 'DELETE' }); };
SEC.r2.render = async function (tab, body, it, my) {
    const x = it.raw || {}, bp = acc(`/r2/buckets/${encodeURIComponent(it.id)}`);
    const [managed, custom] = await Promise.all([result(`${bp}/domains/managed`).catch(() => null), result(`${bp}/domains/custom`).catch(() => null)]);
    if (my !== S.req) return;
    infoPage(body, it, [['Name', x.name], ['Created', x.creation_date], ['Location', x.location], ['Storage class', x.storage_class], ['Jurisdiction', x.jurisdiction]], {
        dangerNote: 'All objects must be deleted from a bucket before the bucket itself can be deleted.',
        snippet: `[[r2_buckets]]\nbinding = "BUCKET"\nbucket_name = "${it.id}"`,
        extra: (b) => {
            const c = card('Public access (r2.dev)', 'Exposes the bucket on a public r2.dev URL.');
            if (managed) {
                toggleRow(c, 'r2.dev URL', null, !!managed.enabled, async (on) => {
                    if (on && !await askConfirm('Every object in this bucket becomes public. Enable?', { title: 'Public access', ok: 'Enable', danger: true })) throw new Error('cancelled');
                    await api(`${bp}/domains/managed`, { method: 'PUT', json: { enabled: on } }); render();
                });
                if (managed.enabled && managed.domain) kvRows(c, [['URL', 'https://' + managed.domain, true]]);
            } else none(c, 'Could not load the public access info.');
            b.appendChild(c);
            const cd = card('Custom domains', 'The domain must be a zone in your Cloudflare account.');
            ((custom && custom.domains) || []).forEach(d0 => {
                const r = listRow(`<div class="text-[12px] font-mono text-gray-200 truncate">${esc(d0.domain)}</div><div class="mt-0.5">${badge((d0.status && d0.status.ssl) || (d0.enabled ? 'enabled' : 'disabled'))}</div>`);
                r.appendChild(iconBtn2('trash', 'Remove', async () => { if (!await askConfirm(`Remove ${d0.domain}?`, { ok: 'Remove', danger: true })) return; try { await api(`${bp}/domains/custom/${encodeURIComponent(d0.domain)}`, { method: 'DELETE' }); toast('Removed'); render(); } catch (e) { toast(errMsg(e)); } }));
                cd.appendChild(r);
            });
            b.appendChild(cd);
            const cors = jsonCard('CORS policy', 'Which websites may read this bucket from a browser.', async () => (await result(`${bp}/cors`)) || null, async (v) => { await api(`${bp}/cors`, { method: 'PUT', json: v.rules ? v : { rules: v } }); }, '{\n  "rules": [\n    {\n      "allowed": { "origins": ["*"], "methods": ["GET"], "headers": ["*"] },\n      "maxAgeSeconds": 3600\n    }\n  ]\n}');
            b.appendChild(cors);
            b.appendChild(h('<p class="text-[11px] text-gray-500 mb-4">Note: browsing / uploading R2 objects is not available through the Cloudflare REST API.</p>'));
        }
    });
};
// ===== Queues =====
SEC.queues.load = async () => ((await result(acc('/queues'))) || []).map(x => ({ id: x.queue_id, name: x.queue_name, sub: `${x.producers_total_count || 0}P / ${x.consumers_total_count || 0}C`, raw: x }));
SEC.queues.create = async () => {
    const f = await askForm({ title: 'New Queue', fields: [{ key: 'n', label: 'Queue name', required: true }], ok: 'Create' }); if (!f) return;
    const r = await result(acc('/queues'), { method: 'POST', json: { queue_name: f.n.trim() } }); toast('Queue created'); return r && r.queue_id;
};
SEC.queues.del = async (it) => { await api(acc(`/queues/${it.id}`), { method: 'DELETE' }); };
SEC.queues.render = async function (tab, body, it, my) {
    const qp = acc(`/queues/${it.id}`);
    const [x, cons] = await Promise.all([result(qp).catch(() => it.raw || {}), result(`${qp}/consumers`).catch(() => [])]);
    if (my !== S.req) return;
    const se = x.settings || {};
    infoPage(body, it, [['Name', x.queue_name], ['Queue ID', x.queue_id], ['Created', x.created_on], ['Producers', x.producers_total_count], ['Consumers', x.consumers_total_count]], {
        snippet: `[[queues.producers]]\nqueue = "${it.name}"\nbinding = "QUEUE"`,
        dangerNote: 'Deleting a queue also deletes the messages waiting in it.',
        extra: (b) => {
            const cs = card('Queue settings', 'Delivery behaviour of this queue.');
            toggleRow(cs, 'Pause delivery', 'Stop delivering messages to consumers', !!se.delivery_paused, async (v) => { await api(qp, { method: 'PATCH', json: { settings: { delivery_paused: v } } }); });
            cs.insertAdjacentHTML('beforeend', `<div class="grid grid-cols-2 gap-2 mt-3"><div><label class="text-[11px] text-gray-500 block">Delivery delay (seconds)</label><input id="cfQDelay" class="modern-input !mb-0 text-xs font-mono" value="${esc(String(se.delivery_delay != null ? se.delivery_delay : 0))}" inputmode="numeric"></div><div><label class="text-[11px] text-gray-500 block">Message retention (seconds)</label><input id="cfQRet" class="modern-input !mb-0 text-xs font-mono" value="${esc(String(se.message_retention_period != null ? se.message_retention_period : 345600))}" inputmode="numeric"></div></div>`);
            sp(cs).appendChild(btn('Save settings', 'blue', async () => { await api(qp, { method: 'PATCH', json: { settings: { delivery_delay: Number($('cfQDelay').value), message_retention_period: Number($('cfQRet').value) } } }); toast('Saved'); }, 'check'));
            b.appendChild(cs);
            const sm = card('Send a test message', 'Pushes one message into the queue.');
            sm.insertAdjacentHTML('beforeend', '<textarea id="cfQMsg" class="modern-input !mb-0 !mt-3 font-mono text-xs" rows="3" spellcheck="false" autocapitalize="off">{"hello":"world"}</textarea>');
            const smr = row(sm);
            smr.appendChild(btn('Send', 'blue', async () => {
                const raw = $('cfQMsg').value; let body2, ct = 'json'; try { body2 = JSON.parse(raw); } catch (e) { body2 = raw; ct = 'text'; }
                await api(`${qp}/messages`, { method: 'POST', json: { body: body2, content_type: ct } }); toast('Message sent');
            }, 'play'));
            smr.appendChild(btn('Purge all messages', 'cfdanger', async () => {
                if (!await askConfirm('Delete all messages in this queue?', { title: 'Purge queue', ok: 'Purge', danger: true })) return;
                await api(`${qp}/purge`, { method: 'POST', json: { delete_messages_permanently: true } }); toast('Purge started');
            }, 'trash'));
            b.appendChild(sm);
        }
    });
};
// ===== Vectorize =====
SEC.vectorize.load = async () => ((await result(acc('/vectorize/v2/indexes'))) || []).map(x => ({ id: x.name, name: x.name, sub: x.config ? `${x.config.dimensions}d ${x.config.metric}` : '', raw: x }));
SEC.vectorize.create = async () => {
    const f = await askForm({ title: 'New Vectorize index', fields: [{ key: 'n', label: 'Index name', required: true }, { key: 'd', label: 'Dimensions', type: 'number', default: '768', required: true }, { key: 'm', label: 'Metric', type: 'choice', options: ['cosine', 'euclidean', 'dot-product'], default: 'cosine' }, { key: 'ds', label: 'Description (optional)' }], ok: 'Create' }); if (!f) return;
    const json = { name: f.n.trim(), config: { dimensions: Number(f.d), metric: f.m } }; if (f.ds.trim()) json.description = f.ds.trim();
    await api(acc('/vectorize/v2/indexes'), { method: 'POST', json }); toast('Index created'); return f.n.trim();
};
SEC.vectorize.del = async (it) => { await api(acc(`/vectorize/v2/indexes/${encodeURIComponent(it.id)}`), { method: 'DELETE' }); };
SEC.vectorize.render = async function (tab, body, it, my) {
    const x = it.raw || {}, ip = acc(`/vectorize/v2/indexes/${encodeURIComponent(it.id)}`);
    const [inf, mi] = await Promise.all([result(`${ip}/info`).catch(() => null), result(`${ip}/metadata_index/list`).catch(() => null)]);
    if (my !== S.req) return;
    infoPage(body, it, [['Name', x.name], ['Dimensions', x.config && x.config.dimensions], ['Metric', x.config && x.config.metric], ['Vectors', inf && inf.vectorCount], ['Created', x.created_on], ['Description', x.description]], {
        snippet: `[[vectorize]]\nbinding = "VECTORIZE"\nindex_name = "${it.id}"`,
        extra: (b) => {
            const c = card('Metadata indexes', 'Properties you can filter on in queries.');
            ((mi && mi.metadataIndexes) || []).forEach(m => {
                const r = listRow(`<div class="text-[12px] font-mono font-bold text-gray-200 truncate">${esc(m.propertyName)} ${badge(m.indexType)}</div>`);
                r.appendChild(iconBtn2('trash', 'Delete', async () => { if (!await askConfirm(`Delete the metadata index ${m.propertyName}?`, { ok: 'Delete', danger: true })) return; try { await api(`${ip}/metadata_index/delete`, { method: 'POST', json: { propertyName: m.propertyName } }); toast('Deleted'); render(); } catch (er) { toast(errMsg(er)); } }));
                c.appendChild(r);
            });
            if (!(mi && (mi.metadataIndexes || []).length)) none(c, 'No metadata indexes.');
            sp(c).appendChild(btn('Add metadata index', 'blue', async () => {
                const f = await askForm({ title: 'New metadata index', fields: [{ key: 'p', label: 'Property name', required: true }, { key: 't', label: 'Type', type: 'choice', options: ['string', 'number', 'boolean'], default: 'string' }], ok: 'Create' });
                if (!f) return; await api(`${ip}/metadata_index/create`, { method: 'POST', json: { propertyName: f.p.trim(), indexType: f.t } }); toast('Created'); render();
            }, 'plus'));
            b.appendChild(c);
        }
    });
};
// ===== Hyperdrive =====
SEC.hyperdrive.load = async () => ((await result(acc('/hyperdrive/configs'))) || []).map(x => ({ id: x.id, name: x.name, sub: x.origin ? x.origin.host : '', raw: x }));
SEC.hyperdrive.create = async () => {
    const f = await askForm({ title: 'New Hyperdrive config', fields: [{ key: 'n', label: 'Config name', required: true }, { key: 's', label: 'Database', type: 'choice', options: ['postgres', 'mysql'], default: 'postgres' }, { key: 'h', label: 'Host', required: true }, { key: 'p', label: 'Port', type: 'number', default: '5432', required: true }, { key: 'd', label: 'Database name', required: true }, { key: 'u', label: 'User', required: true }, { key: 'w', label: 'Password', required: true }], ok: 'Create' }); if (!f) return;
    const r = await result(acc('/hyperdrive/configs'), { method: 'POST', json: { name: f.n.trim(), origin: { scheme: f.s, host: f.h.trim(), port: Number(f.p), database: f.d.trim(), user: f.u.trim(), password: f.w } } }); toast('Hyperdrive created'); return r && r.id;
};
SEC.hyperdrive.del = async (it) => { await api(acc(`/hyperdrive/configs/${it.id}`), { method: 'DELETE' }); };
SEC.hyperdrive.render = async function (tab, body, it, my) {
    const hp = acc(`/hyperdrive/configs/${it.id}`);
    const x = await result(hp).catch(() => it.raw || {}); if (my !== S.req) return;
    const o = x.origin || {}, ca = x.caching || {};
    infoPage(body, it, [['Name', x.name], ['ID', x.id], ['Scheme', o.scheme], ['Host', o.host], ['Port', o.port], ['Database', o.database], ['User', o.user], ['Caching', ca.disabled ? 'disabled' : 'enabled']], {
        snippet: `[[hyperdrive]]\nbinding = "HYPERDRIVE"\nid = "${it.id}"`,
        extra: (b) => {
            const c = card('Edit connection', 'Leave the password empty to keep the current one.');
            c.insertAdjacentHTML('beforeend', `<div class="grid gap-2 mt-3"><input data-k="name" class="modern-input !mb-0 text-xs" placeholder="Config name" value="${esc(x.name || '')}"><input data-k="host" class="modern-input !mb-0 text-xs font-mono" placeholder="Host" value="${esc(o.host || '')}" autocapitalize="off"><input data-k="port" class="modern-input !mb-0 text-xs font-mono" placeholder="Port" value="${esc(String(o.port || ''))}" inputmode="numeric"><input data-k="database" class="modern-input !mb-0 text-xs font-mono" placeholder="Database" value="${esc(o.database || '')}" autocapitalize="off"><input data-k="user" class="modern-input !mb-0 text-xs font-mono" placeholder="User" value="${esc(o.user || '')}" autocapitalize="off"><input data-k="password" type="password" class="modern-input !mb-0 text-xs font-mono" placeholder="New password (optional)" autocomplete="off"></div>`);
            sp(c).appendChild(btn('Save connection', 'blue', async () => {
                const v = {}; c.querySelectorAll('input[data-k]').forEach(i => v[i.dataset.k] = i.value.trim());
                const origin = { scheme: o.scheme, host: v.host, port: Number(v.port), database: v.database, user: v.user }; if (v.password) origin.password = v.password;
                await api(hp, { method: 'PATCH', json: { name: v.name, origin } }); toast('Saved'); await refreshList(); render();
            }, 'check'));
            b.appendChild(c);
        }
    });
};

// ===== SHELL / CSS / ROOT / DRAWER / ROUTING =====
const CSS = `
#settingsPage{z-index:1200}
.cfrow{display:flex;gap:6px;align-items:stretch;flex-shrink:0}
.cfrow .cfgearbtn{width:34px;flex-shrink:0;border-radius:8px;border:1px solid #30363d;background:#161b22;color:#8b949e;display:flex;align-items:center;justify-content:center}
.cfsec{display:flex;align-items:center;gap:5px;padding:6px 11px;border-radius:999px;border:1px solid #30363d;background:#0d1117;color:#8b949e;font-size:11px;font-weight:700;flex-shrink:0;white-space:nowrap}
.cfsec.active{color:#f6821f;border-color:#f6821f;background:rgba(246,130,31,.12)}
#cfNav .nav-btn{width:auto;flex:1;min-width:0}
#cfNav .nav-btn.active{color:#f6821f}
#cfRoot .cfdanger{background:#da3633!important;border-color:#ff7b72!important;color:#fff!important}
#cfRoot .cfgray{background:#21262d!important;border-color:#30363d!important;color:#c9d1d9!important}
.cfbadge{display:inline-block;font-size:10px;font-weight:700;padding:1px 8px;border-radius:999px;background:#21262d;color:#9da7b3;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.cfbadge.ok{background:rgba(46,160,67,.2);color:#3fb950}.cfbadge.bad{background:rgba(248,81,73,.2);color:#f85149}.cfbadge.run{background:rgba(210,153,34,.2);color:#e3b341}
.cfpre{background:#000;border:1px solid #30363d;border-radius:8px;padding:8px;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d1d9;white-space:pre-wrap;word-break:break-word;overflow:auto}
.cfpre .log-line[data-err]{color:#f85149}
.cftable{border-collapse:collapse;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d1d9;width:max-content;min-width:100%}
.cftable th{background:#161b22;color:#8b949e;text-align:left;position:sticky;top:0}
.cftable th,.cftable td{border:1px solid #30363d;padding:4px 8px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.cfhome{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cftile{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:12px;border:1px solid #30363d;background:#161b22;text-align:left;color:#e6edf3}
.cftile:active{background:#21262d}.cftile b{font-size:14px}.cftile small{color:#8b949e;font-size:11px}
.cftile .ic{width:20px;height:20px;color:#f6821f}
#cfBody details>summary{list-style:none}#cfBody details>summary::-webkit-details-marker{display:none}
`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));

const root = h(`
<div id="cfRoot" class="spage">
  <div class="drawer-overlay" id="cfOv"></div>
  <div class="drawer" id="cfDrawer">
    <div class="shrink-0" style="padding:12px 12px 10px;background:#0d1117;border-bottom:1px solid #30363d">
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-xs font-bold flex items-center gap-1.5" style="color:#f6821f">${ic('cloud')}Cloudflare</span>
        <span id="cfAccName" class="text-[11px] text-emerald-400 font-semibold truncate"></span>
      </div>
      <div id="cfChips" class="hidden mb-2 flex gap-1.5 overflow-x-auto scrollbar-hide"></div>
      <input id="cfEmail" type="email" class="modern-input !mb-2 !py-2 !px-3 text-xs" placeholder="Email (for Global API Key)" autocapitalize="off" autocomplete="off" spellcheck="false">
      <div class="flex gap-2">
        <input id="cfKey" type="password" class="modern-input !mb-0 !py-2 !px-3 text-xs flex-1 min-w-0 font-mono" placeholder="Global API Key / API Token" autocomplete="off">
        <button id="cfLoad" class="mini-btn shrink-0">Load</button>
      </div>
    </div>
    <div class="px-3 pt-2 shrink-0"><div id="cfSecs" class="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1"></div></div>
    <div class="px-3 pt-1 shrink-0"><button id="cfNew" class="mini-btn blue w-full"></button></div>
    <div class="px-3 pt-2 shrink-0"><input id="cfFilter" class="modern-input !mb-0 !py-1.5 !px-3 text-xs" placeholder="Filter..."></div>
    <div id="cfList" class="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 min-h-0 custom-scrollbar"></div>
    <div class="shrink-0 flex flex-col gap-2" style="padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#161b22;border-top:1px solid #30363d">
      <div class="flex items-center gap-2"><div class="prov-switch flex-1">
        <button class="prov-btn" id="cfPHF">${ic('smile')}<span>HF</span></button>
        <button class="prov-btn" id="cfPGH">${ic('github')}<span>GitHub</span></button>
        <button class="prov-btn active" style="color:#f6821f">${ic('cloud')}<span>Cloudflare</span></button>
      </div><button id="cfGear" class="icon-btn shrink-0" title="Settings" aria-label="Settings">${ic('settings')}</button></div>
    </div>
  </div>
  <header class="header">
    <button id="cfMenu" class="text-gray-300 p-2 -ml-2"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
    <span id="cfTitle" class="font-bold text-lg truncate max-w-[220px]" style="color:#f6821f">Cloudflare</span>
    <button id="cfRefresh" class="icon-btn" title="Refresh">${ic('refresh')}</button>
  </header>
  <main id="cfBody" class="flex-1 overflow-y-auto p-4 custom-scrollbar" style="padding-bottom:90px"></main>
  <nav id="cfNav" class="bottom-nav" style="display:none"></nav>
</div>`);
document.body.appendChild(root);

const drawer = (on) => { $('cfDrawer').classList.toggle('open', on); $('cfOv').classList.toggle('open', on); };
$('cfMenu').onclick = () => drawer(!$('cfDrawer').classList.contains('open'));
$('cfOv').onclick = () => drawer(false);
$('cfRefresh').onclick = async () => { if (!S.cur) return; try { await loadList(true); } catch (e) {} render(); };
$('cfPHF').onclick = () => { closeCF(); if (provider !== 'hf') setProvider('hf'); };
$('cfPGH').onclick = () => { closeCF(); if (provider !== 'gh') setProvider('gh'); };
$('cfGear').onclick = () => { drawer(false); openSettings(); };

function paintChips() {
    const box = $('cfChips'); box.innerHTML = '';
    box.classList.toggle('hidden', !S.accounts.length);
    S.accounts.forEach((a, i) => {
        const chip = h(`<div class="chip ${S.cur && S.cur.key === a.key && S.cur.accountId === a.accountId ? 'active' : ''}"><button class="chip-name">${ic('user', 'ic-sm')}<span>${esc(a.name || a.email || 'token')}</span></button><button class="chip-x">${ic('x', 'ic-sm')}</button></div>`);
        chip.querySelector('.chip-name').onclick = () => { $('cfEmail').value = a.email || ''; $('cfKey').value = a.key; useAccount(a); };
        chip.querySelector('.chip-x').onclick = async (e) => {
            e.stopPropagation(); if (!await askConfirm(`Remove the saved account "${a.name || a.email}"?`, { ok: 'Remove', danger: true })) return;
            S.accounts.splice(i, 1); LS.set('cf_accounts', S.accounts); if (S.cur && S.cur.key === a.key) logout(); paintChips();
        };
        box.appendChild(chip);
    });
}
function logout() { S.cur = null; S.sel = null; S.lists = {}; S.sub = undefined; $('cfAccName').textContent = ''; paintList(); render(); }
async function useAccount(a) {
    S.cur = { email: a.email || '', key: a.key, accountId: a.accountId, name: a.name }; S.sub = undefined; S.lists = {}; S.sel = null;
    $('cfAccName').textContent = a.name || ''; paintChips();
    try { await loadList(true); } catch (e) { toast(errMsg(e)); }
    restoreSel(); render();
    Promise.allSettled(SEC_ORDER.filter(s => s !== S.sec).map(s => SEC[s].load().then(r => { S.lists[s] = r; }))).then(() => { if (!S.sel) render(); });
}
$('cfLoad').onclick = async () => {
    const email = $('cfEmail').value.trim(), key = $('cfKey').value.trim();
    if (!key) return toast('Enter your API key / token');
    const b = $('cfLoad'); b.disabled = true; b.textContent = '...';
    try {
        S.cur = { email, key, accountId: '' };
        const list = (await api('/accounts?per_page=50')).result || [];
        if (!list.length) throw new Error('No account was found for this credential');
        let a = list[0];
        if (list.length > 1) {
            const labels = list.map(x => `${x.name} (${x.id.slice(0, 6)})`);
            const r = await askForm({ title: 'Choose an account', fields: [{ key: 'a', label: 'Account', type: 'choice', options: labels, default: labels[0] }], ok: 'Use' });
            if (!r) { S.cur = null; return; } a = list[labels.indexOf(r.a)];
        }
        const rec = { email, key, accountId: a.id, name: a.name };
        S.accounts = S.accounts.filter(x => !(x.key === key && x.accountId === a.id)); S.accounts.unshift(rec); LS.set('cf_accounts', S.accounts);
        await useAccount(rec); toast('Logged in: ' + a.name);
    } catch (e) { S.cur = null; toast('Login failed: ' + errMsg(e)); }
    b.disabled = false; b.textContent = 'Load';
};

function paintSecs() {
    const box = $('cfSecs'); box.innerHTML = '';
    SEC_ORDER.forEach(k => { const b = h(`<button class="cfsec ${k === S.sec ? 'active' : ''}">${ic(SEC[k].icon, 'ic-sm')}<span>${SEC[k].label}</span></button>`); b.onclick = () => setSec(k); box.appendChild(b); });
    $('cfNew').innerHTML = ic('plus') + '<span>New ' + esc(SEC[S.sec].one) + '</span>';
}
async function setSec(k) { S.sec = k; localStorage.setItem('cf_sec', k); $('cfFilter').value = ''; paintSecs(); paintList(); if (S.cur) { try { await loadList(true); } catch (e) {} } }
async function loadList(force) {
    const sec = S.sec;
    if (!S.cur) return paintList();
    if (!force && S.lists[sec]) return paintList();
    $('cfList').innerHTML = '<p class="text-xs text-gray-500 text-center mt-10">Loading...</p>';
    try { S.lists[sec] = await SEC[sec].load(); }
    catch (e) { if (sec === S.sec) $('cfList').innerHTML = `<p class="text-xs text-red-400 text-center mt-6 px-2 break-words">${esc(errMsg(e))}</p>`; throw e; }
    if (sec === S.sec) paintList();
}
const refreshList = () => loadList(true);
function paintList() {
    const box = $('cfList'); box.innerHTML = '';
    if (!S.cur) { box.innerHTML = '<p class="text-xs text-gray-500 text-center mt-10 px-3 leading-relaxed">Enter your Email + Global API Key and press Load.</p>'; return; }
    const q = ($('cfFilter').value || '').toLowerCase();
    const items = (S.lists[S.sec] || []).filter(x => x.name.toLowerCase().includes(q));
    if (!items.length) { box.innerHTML = `<p class="text-xs text-gray-500 text-center mt-10">${S.lists[S.sec] ? 'Nothing found.' : ''}</p>`; return; }
    items.forEach(x => {
        const on = S.sel && S.sel.sec === S.sec && S.sel.item.id === x.id;
        const w = h(`<div class="cfrow"><button class="flex-1 min-w-0 text-left bg-gray-800 border p-2 rounded-lg text-[13px] text-gray-200 flex items-center gap-2 ${on ? 'border-orange-500' : 'border-gray-700'}"><span style="color:#f6821f" class="flex">${ic(SEC[S.sec].icon, 'ic-sm')}</span><span class="truncate flex-1">${esc(x.name)}</span><span class="text-[10px] text-gray-500 truncate max-w-[80px]">${esc(x.sub || '')}</span></button><button class="cfgearbtn" title="Settings" aria-label="Settings">${ic('settings', 'ic-sm')}</button></div>`);
        const sec = S.sec;
        w.children[0].onclick = () => selectItem(sec, x);
        w.children[1].onclick = () => selectItem(sec, x, false, SETTINGS_TAB);
        box.appendChild(w);
    });
}
$('cfFilter').oninput = paintList;
$('cfNew').onclick = async () => {
    if (!S.cur) return toast('Load an account first');
    const sec = S.sec; $('cfNew').disabled = true;
    try {
        const made = await SEC[sec].create();
        if (made === undefined || made === null) return;
        await loadList(true);
        const it = (S.lists[sec] || []).find(x => x.id === made || x.name === made);
        if (it) selectItem(sec, it);
    } catch (e) { toast(errMsg(e)); console.error(e); }
    finally { $('cfNew').disabled = false; }
};

function selectItem(sec, item, silent, tab) {
    S.sel = { sec, item }; S.tab = tab || SEC[sec].tabs[0][0]; LS.set('cf_last_sel', { sec, id: item.id });
    if (sec === 'workers' && WK.name !== item.id) wkReset(item.id);
    if (!silent) drawer(false);
    paintList(); render();
}
function restoreSel() {
    const l = LS.get('cf_last_sel', null); if (!l) return;
    const it = (S.lists[l.sec] || []).find(x => x.id === l.id); if (it && l.sec === S.sec) selectItem(l.sec, it, true);
}
function go(tab) { S.tab = tab; render(); }
let lastKey = '';
function setCfTitle() {
    const el = $('cfTitle');
    if (!S.sel) { el.textContent = 'Cloudflare'; el.style.cursor = ''; el.onclick = null; el.removeAttribute('title'); return; }
    el.textContent = S.sel.item.name;
    el.style.cursor = ''; el.onclick = null; el.removeAttribute('title');
    const sec = S.sel.sec, item = S.sel.item, acct = S.cur && S.cur.accountId;
    if (!acct) return;
    let url = null;
    if (sec === 'pages') url = `https://dash.cloudflare.com/${acct}/pages/view/${encodeURIComponent(item.name)}`;
    else if (sec === 'workers') url = `https://dash.cloudflare.com/${acct}/workers/services/view/${encodeURIComponent(item.id)}/production`;
    else if (sec === 'd1') url = `https://dash.cloudflare.com/${acct}/workers/d1/databases/${encodeURIComponent(item.id)}`;
    else if (sec === 'kv') url = `https://dash.cloudflare.com/${acct}/workers/kv/namespaces/${encodeURIComponent(item.id)}`;
    else if (sec === 'r2') url = `https://dash.cloudflare.com/${acct}/r2/default/buckets/${encodeURIComponent(item.id)}`;
    else if (sec === 'queues') url = `https://dash.cloudflare.com/${acct}/workers/queues/${encodeURIComponent(item.id)}`;
    else if (sec === 'vectorize') url = `https://dash.cloudflare.com/${acct}/workers/vectorize/${encodeURIComponent(item.id)}`;
    else if (sec === 'hyperdrive') url = `https://dash.cloudflare.com/${acct}/workers/hyperdrive/${encodeURIComponent(item.id)}`;
    if (!url) return;
    el.style.cursor = 'pointer'; el.title = 'Open in Cloudflare Dashboard';
    el.onclick = () => window.open(url, '_blank', 'noopener');
}
function render() {
    const my = ++S.req;
    if (S.onLeave) { try { S.onLeave(); } catch (e) {} S.onLeave = null; }
    const body = $('cfBody'), key = S.sel ? S.sel.sec + S.sel.item.id + S.tab : 'home', keep = key === lastKey ? body.scrollTop : 0; lastKey = key;
    body.innerHTML = ''; setCfTitle();
    const nav = $('cfNav');
    if (S.sel) {
        nav.style.display = 'flex'; body.style.paddingBottom = '90px';
        nav.innerHTML = SEC[S.sel.sec].tabs.map(([k, l, i]) => `<button class="nav-btn ${k === S.tab ? 'active' : ''}" data-t="${k}">${ic(i)}${l}</button>`).join('');
        nav.querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.t));
    } else { nav.style.display = 'none'; body.style.paddingBottom = '24px'; }
    if (!S.cur) return welcome(body);
    if (!S.sel) return home(body);
    const p = Promise.resolve().then(() => SEC[S.sel.sec].render(S.tab, body, S.sel.item, my));
    p.catch(e => { if (my === S.req) body.appendChild(card('Error', errMsg(e), true)); console.error(e); }).finally(() => { if (keep && my === S.req) body.scrollTop = keep; });
}
function welcome(body) {
    const c = card('Cloudflare Manager', 'Pages, Workers, D1, KV, R2, Queues, Vectorize and Hyperdrive in one place.');
    c.insertAdjacentHTML('beforeend', `<ol class="text-[12px] text-gray-300 mt-3 leading-relaxed list-decimal pl-5 space-y-1.5"><li>Open the menu and enter your <b>Email + Global API Key</b> (or only an API Token and leave the email empty).</li><li>Press <b>Load</b>. Pick a section, then tap a resource. The gear next to each resource opens its settings.</li></ol>`);
    const r = row(c); r.appendChild(btn('Open menu', 'blue', () => drawer(true), 'key')); r.appendChild(btn('Settings', 'cfgray', () => openSettings(), 'settings'));
    body.appendChild(c);
    body.appendChild(card('Security note', 'A Global API Key gives full access to the whole account. It is stored only in this device\'s localStorage and is sent only to your own proxy worker.'));
}
function home(body) {
    const c = card(S.cur.name || 'Account', 'Choose a section, or pick a resource from the menu.');
    kvRows(c, [['Account ID', S.cur.accountId], ['Login', S.cur.email || 'API token']]);
    wkSubdomain().then(s => { if (s && !S.sel) kvRows(c, [['workers.dev', s + '.workers.dev']]); });
    body.appendChild(c);
    const g = h('<div class="cfhome"></div>');
    SEC_ORDER.forEach(k => {
        const n = S.lists[k] ? S.lists[k].length : null;
        const t = h(`<button class="cftile">${ic(SEC[k].icon)}<b>${SEC[k].label}</b><small>${n == null ? 'tap to load' : n + ' items'}</small></button>`);
        t.onclick = async () => { await setSec(k); drawer(true); }; g.appendChild(t);
    });
    body.appendChild(g);
}
async function deleteCurrent() {
    const { sec, item } = S.sel, meta = SEC[sec];
    const f = await askForm({ title: `Delete ${meta.one}`, message: `"${item.name}" will be permanently deleted. Type its name to confirm.`, fields: [{ key: 'n', label: 'Name', required: true }], ok: 'Delete' });
    if (!f) return; if (f.n.trim() !== item.name) return toast('The name does not match');
    await meta.del(item); toast('Deleted ' + item.name);
    S.sel = null; LS.del('cf_last_sel'); try { await loadList(true); } catch (e) {} render();
}
const CF_VIEWS = ['cfeditor', 'cfres', 'cftoken'];
const cfIsOpen = () => $('cfRoot').classList.contains('open');
const _rs = renderSettings, _sg = settingsGo, _os = openSettings;
settingsGo = function (v) { if (!cfIsOpen()) return _sg(v); settingsView = v; renderSettings(); };
openSettings = function () { _os(); if (cfIsOpen()) { if (!CF_VIEWS.includes(settingsView)) settingsView = 'cfeditor'; renderSettings(); } };
renderSettings = function () {
    if (!cfIsOpen()) return _rs();
    const body = $('settingsBody'), tabs = $('settingsTabs'); if (!body || !tabs) return;
    if (!CF_VIEWS.includes(settingsView)) settingsView = 'cfeditor';
    body.innerHTML = ''; tabs.innerHTML = '';
    $('settingsTitle').innerText = 'Cloudflare settings';
    const row2 = document.createElement('div'); row2.className = 'stabs';
    [['cfeditor', 'Code space'], ['cfres', 'My Resources'], ['cftoken', 'Token check']].forEach(([v, l]) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'stab' + (v === settingsView ? ' active' : ''); b.textContent = l;
        b.onclick = () => { if (v !== settingsView) settingsGo(v); }; row2.appendChild(b);
    });
    tabs.appendChild(row2);
    if (settingsView === 'cfeditor') { SETTINGS_SCHEMA.filter(s => s.id === 'cfeditor').forEach(sec => sec.items.forEach(it => renderSettingItem(it, body))); return; }
    if (settingsView === 'cfres') return cfResources(body);
    return cfTokenCheck(body);
};
async function cfResources(body) {
    if (!S.cur) return emptyNote(body, 'Load your Cloudflare account first.');
    const w = spinner(body);
    try { await Promise.all(['pages', 'workers'].map(async s => { if (!S.lists[s]) S.lists[s] = await SEC[s].load(); })); } catch (e) { w.remove(); return body.appendChild(card('Could not load', errMsg(e), true)); }
    const sub = await wkSubdomain(); w.remove();
    const cp = card('Pages sites', 'Live *.pages.dev URLs');
    (S.lists.pages || []).forEach(p => cp.appendChild(linkRow(p.name, 'https://' + p.sub)));
    if (!(S.lists.pages || []).length) none(cp, 'No Pages projects.');
    body.appendChild(cp);
    const cw = card('Workers', sub ? `Live ${sub}.workers.dev URLs (when enabled)` : 'No workers.dev subdomain set.');
    if (sub) (S.lists.workers || []).forEach(x => cw.appendChild(linkRow(x.name, `https://${x.name}.${sub}.workers.dev`)));
    if (!(S.lists.workers || []).length) none(cw, 'No Workers.');
    body.appendChild(cw);
}
async function cfTokenCheck(body) {
    if (!S.cur) return emptyNote(body, 'Load your Cloudflare account first.');
    const c = card('Token check', 'Read-only probes of each API area.');
    const list = h('<div class="flex flex-col gap-1.5 mt-3"></div>'); c.appendChild(list); body.appendChild(c);
    const A = S.cur.accountId;
    const probes = [
        ['Account', '/accounts/' + A, 'Account Settings: Read'], ['Workers scripts', `/accounts/${A}/workers/scripts`, 'Workers Scripts: Read'],
        ['Workers subdomain', `/accounts/${A}/workers/subdomain`, 'Workers Scripts: Read'], ['Pages projects', `/accounts/${A}/pages/projects`, 'Cloudflare Pages: Read'],
        ['D1', `/accounts/${A}/d1/database?per_page=1`, 'D1: Read'], ['KV', `/accounts/${A}/storage/kv/namespaces?per_page=1`, 'Workers KV Storage: Read'],
        ['R2', `/accounts/${A}/r2/buckets`, 'Workers R2 Storage: Read'], ['Queues', `/accounts/${A}/queues`, 'Queues: Read'],
        ['Vectorize', `/accounts/${A}/vectorize/v2/indexes`, 'Vectorize: Read'], ['Hyperdrive', `/accounts/${A}/hyperdrive/configs`, 'Hyperdrive: Read'],
        ['Zones', `/zones?account.id=${A}&per_page=5`, 'Zone: Read']];
    const rows = probes.map(([l, , hint]) => { const r = h(`<div class="flex items-center gap-2 text-[12px]"><span class="flex-1 text-gray-200">${esc(l)}</span><span class="text-gray-500 text-[10px]">...</span></div>`); list.appendChild(r); return r; });
    await Promise.all(probes.map(async ([l, path, hint], i) => {
        const st = rows[i].lastElementChild;
        try { await api(path); st.outerHTML = badge('OK', 'ok'); }
        catch (e) { st.outerHTML = badge(e.status ? String(e.status) : 'fail', 'bad'); rows[i].title = hint + ' | ' + errMsg(e); }
    }));
    body.insertAdjacentHTML('beforeend', '<p class="text-[11px] text-gray-500 mt-3">Write access cannot be tested without changing something.</p>');
}
function openCF() {
    const sb = $('sidebar'); if (sb && sb.classList.contains('open')) toggleSidebar();
    $('cfRoot').classList.add('open'); localStorage.setItem('cf_open', '1');
    paintSecs(); paintChips(); paintList(); render();
    if (!S.cur && S.accounts.length) useAccount(S.accounts[0]);
}
function closeCF() {
    drawer(false); $('cfRoot').classList.remove('open'); localStorage.removeItem('cf_open');
    try { closeSettings(); } catch (e) {}
    if (CF_VIEWS.includes(settingsView)) settingsView = 'editor';
    if (S.onLeave) { try { S.onLeave(); } catch (e) {} S.onLeave = null; }
}
window.cfOpen = openCF; window.cfClose = closeCF;
window.addEventListener('load', () => { if (localStorage.getItem('cf_open') === '1') openCF(); });
})();
