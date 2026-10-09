const CANCEL = '__cancel__';
let descPrompt = null;
const PROMPT_CMDS = [
    { cmd: '/skip', desc: 'Leave this version without a description', run: () => { if (descPrompt) descPrompt.resolve(null); } },
    { cmd: '/cancel', desc: 'Stop the deploy', run: () => { if (descPrompt) descPrompt.resolve(CANCEL); } }
];
const CMD_DEFS = {
    editor: [
        { cmd: '/page-live', desc: '.html: publish with GitHub Pages  |  .md: host as Gist', run: () => cmdPageLive() },
        { cmd: '/page-live-links', desc: 'Live page links of this repo, plus its gists', run: () => cmdPageLinks() },
        { cmd: '/preview', desc: 'Toggle Preview / Edit', run: () => {
            if (!getPreviewKind(currentEditFilePath)) return cmdSay('editor', 'No preview for this file (only .md, .html and .svg).');
            togglePreview();
        } },
        { cmd: '/description', alias: ['/discription', '/discprition', '/desc'], desc: 'Description of the selected version', run: () => cmdDescription() },
        { cmd: '/all-description', alias: ['/all-discription', '/all-discripition', '/all-desc', '/alldescription'], desc: 'Descriptions of every version', run: () => cmdAllDescriptions() }
    ],
    hist: [
        { cmd: '/copy', desc: 'Copy the whole file', run: () => { navigator.clipboard.writeText(historyEditor.getValue()).then(() => showToast('Copied!')); } },
        { cmd: '/download', desc: 'Download this file', run: () => downloadHistoryFile() }
    ]
};
function clearCmdReplies() { const b = $('cmdReplies-editor'); if (b) b.innerHTML = ''; }
function cmdSay(key, text, opts = {}) {
    if (key === 'hist') {
        if (!opts.me) showToast(text);
        return { el: null, setText() {}, addLinks() {}, addButtons() {}, addNode() {} };
    }
    const box = $('cmdReplies-' + key);
    const el = document.createElement('div');
    el.className = 'cmd-msg' + (opts.me ? ' me' : '');
    const t = document.createElement('div'); t.className = 'cmd-text'; t.textContent = text; el.appendChild(t);
    box.appendChild(el);
    while (box.children.length > 14) box.removeChild(box.firstChild);
    const reveal = () => requestAnimationFrame(() => { const h = $('cmdHost-' + key); if (h) h.scrollIntoView({ block: 'end', behavior: 'smooth' }); });
    const api = {
        el,
        setText(s) { t.textContent = s; },
        addLinks(list) { list.forEach(l => el.appendChild(linkRow(l.label, l.url))); reveal(); },
        addNode(n) { el.appendChild(n); reveal(); },
        addButtons(list) {
            const row = document.createElement('div'); row.className = 'cmd-btns';
            list.forEach(b => {
                const btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'cmd-btn' + (b.kind === 'no' ? ' no' : '');
                btn.textContent = b.label;
                btn.onclick = () => { row.querySelectorAll('button').forEach(x => x.disabled = true); btn.classList.add('picked'); Promise.resolve(b.fn()).catch(e => api.setText('Error: ' + e.message)); };
                row.appendChild(btn);
            });
            el.appendChild(row); reveal();
        }
    };
    reveal();
    return api;
}
function mountCmdBar(key) {
    const host = $('cmdHost-' + key);
    if (!host) return;
    host.innerHTML = `<div id="cmdReplies-${key}" class="cmd-replies"></div><div id="cmdMenu-${key}" class="cmd-menu hidden"></div><div class="cmd-bar"><button type="button" id="cmdSlash-${key}" class="cmd-slash" aria-label="Commands">/</button><input id="cmdInput-${key}" class="cmd-input" type="text" placeholder="Type a command..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"><button type="button" id="cmdRun-${key}" class="cmd-run" aria-label="Run">${ic('play')}</button></div>`;
    const input = $('cmdInput-' + key), menu = $('cmdMenu-' + key), slash = $('cmdSlash-' + key);
    const norm = (s) => s.trim().replace(/^\//, '').toLowerCase();
    const hideMenu = () => { menu.classList.add('hidden'); slash.classList.remove('on'); };
    function showMenu() {
        const q = norm(input.value);
        const list = (key === 'editor' && descPrompt) ? PROMPT_CMDS : CMD_DEFS[key].filter(c => !q || c.cmd.slice(1).includes(q));
        menu.innerHTML = '';
        if (!list.length) { hideMenu(); return; }
        list.forEach(c => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'cmd-item';
            b.innerHTML = `<b>${esc(c.cmd)}</b><span>${esc(c.desc)}</span>`;
            b.onclick = () => runCmd(c);
            menu.appendChild(b);
        });
        menu.classList.remove('hidden'); slash.classList.add('on');
    }
    async function runCmd(c) {
        hideMenu(); input.value = ''; input.blur();
        cmdSay(key, c.cmd, { me: true });
        try { await c.run(); } catch (e) { cmdSay(key, 'Error: ' + e.message); }
    }
    function submit() {
        if (key === 'editor' && descPrompt) {
            const raw = input.value.trim();
            if (!raw) return showMenu();
            input.value = ''; hideMenu();
            cmdSay(key, raw, { me: true });
            const low = raw.toLowerCase();
            descPrompt.resolve(low === '/skip' ? null : low === '/cancel' ? CANCEL : raw);
            return;
        }
        const q = input.value.trim().toLowerCase();
        if (!q) return showMenu();
        const full = q.startsWith('/') ? q : '/' + q;
        const exact = CMD_DEFS[key].find(c => c.cmd === full || (c.alias || []).includes(full));
        const partial = CMD_DEFS[key].filter(c => c.cmd.startsWith(full));
        const pick = exact || (partial.length === 1 ? partial[0] : null);
        if (pick) return runCmd(pick);
        hideMenu(); input.value = '';
        cmdSay(key, full, { me: true });
        cmdSay(key, full === '/skip' ? 'Nothing to skip.' : 'Unknown command. Tap "/" to see all commands.');
    }
    slash.onclick = () => { if (!menu.classList.contains('hidden')) hideMenu(); else { input.value = ''; showMenu(); } };
    input.addEventListener('input', () => { if (key === 'editor' && descPrompt) { hideMenu(); return; } if (input.value.trim()) showMenu(); else hideMenu(); });
    input.addEventListener('focus', () => { if (!input.value.trim()) return; showMenu(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    $('cmdRun-' + key).onclick = submit;
}
function askDescription(path, n) {
    return new Promise((resolve) => {
        const input = $('cmdInput-editor');
        const b = cmdSay('editor', `v${n} of ${path}: what changed? Type a description, or /skip. (/cancel stops the deploy)`);
        const done = (v) => {
            descPrompt = null;
            if (input) input.placeholder = 'Type a command...';
            if (b.el) { const row = b.el.querySelector('.cmd-btns'); if (row) row.remove(); }
            b.setText(v === CANCEL ? `v${n} of ${path}: deploy cancelled.` : v ? `v${n} of ${path}: description saved.` : `v${n} of ${path}: skipped.`);
            resolve(v);
        };
        descPrompt = { resolve: done };
        if (input) { input.placeholder = 'Describe the change, or /skip'; input.focus(); }
        b.addButtons([
            { label: 'Skip', fn: () => done(null) },
            { label: 'Cancel deploy', kind: 'no', fn: () => done(CANCEL) }
        ]);
    });
}
async function collectDescriptions(paths) {
    if (descPrompt) { showToast('Answer the description question in the Editor tab first.'); return null; }
    const prevTab = localStorage.getItem('hf_last_tab') || 'deploy';
    switchTab('editor');
    clearCmdReplies();
    cmdSay('editor', `Deploying ${paths.length} file${paths.length === 1 ? '' : 's'}. Add a short description for each one, or /skip.`);
    const out = {};
    for (const p of paths) {
        let n = 1;
        try { n = (await fetchFileCommits(activeRepoId, activeBranch, p)).length + 1; } catch (e) {}
        const r = await askDescription(p, n);
        if (r === CANCEL) { cmdSay('editor', 'Deploy cancelled.'); switchTab(prevTab); return null; }
        if (r) out[p] = r;
    }
    switchTab(prevTab);
    return out;
}
async function ensureVersionsForCmd() {
    const path = currentEditFilePath;
    if (!isGH() || !activeRepoId) { cmdSay('editor', 'Descriptions work with GitHub repositories.'); return null; }
    if (!path) { cmdSay('editor', 'No file is open.'); return null; }
    let items;
    try { items = await loadVersionsFor(path, false); } catch (e) { cmdSay('editor', 'Could not load versions: ' + e.message); return null; }
    if (!items.length) { cmdSay('editor', `${path} has no versions yet. Deploy it to create v1.`); return null; }
    return { path, items };
}
async function cmdDescription() {
    const r = await ensureVersionsForCmd(); if (!r) return;
    const n = (verState.path === r.path && verSel != null) ? verSel : r.items[0].n;
    const v = r.items.find(x => x.n === n) || r.items[0];
    const d = commitDesc(v.message, r.path);
    cmdSay('editor', d ? `v${v.n} (${verAgo(v.date)})\n${d}` : `v${v.n} has no description.`);
}
async function cmdAllDescriptions() {
    const r = await ensureVersionsForCmd(); if (!r) return;
    const rows = r.items.map(v => ({ v, d: commitDesc(v.message, r.path) }));
    if (!rows.some(x => x.d)) return cmdSay('editor', `No descriptions for ${r.path} yet.`);
    const b = cmdSay('editor', `${r.path}: ${rows.length} version${rows.length === 1 ? '' : 's'}`);
    const box = document.createElement('div'); box.className = 'mt-2 flex flex-col gap-1.5';
    rows.forEach(({ v, d }) => {
        const line = document.createElement('div');
        line.className = 'flex gap-2 text-[12px]';
        line.innerHTML = `<span class="font-mono font-bold text-blue-300 shrink-0 w-9">v${v.n}</span><span class="${d ? 'text-gray-200' : 'text-gray-500 italic'} min-w-0 break-words">${esc(d || 'no description')}</span>`;
        box.appendChild(line);
    });
    b.addNode(box);
}
function copyText(t) {
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = t; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); showToast('Link copied!'); } catch (e) { showToast('Copy failed'); }
        ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => showToast('Link copied!')).catch(fallback);
    else fallback();
}
function iconBtn(icon, title, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'icon-btn !w-8 !h-8'; b.title = title; b.innerHTML = ic(icon); b.onclick = fn;
    return b;
}
function linkRow(label, url) {
    const d = document.createElement('div');
    d.className = 'flex items-center gap-2 bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5 mt-2';
    d.innerHTML = `<span class="text-[11px] font-bold text-gray-400 shrink-0">${esc(label)}</span><span class="link-scroll text-[11px] font-mono text-blue-300 flex-1 min-w-0">${esc(url)}</span>`;
    d.appendChild(iconBtn('external-link', 'Open', () => window.open(url, '_blank', 'noopener')));
    d.appendChild(iconBtn('copy', 'Copy link', () => copyText(url)));
    return d;
}
function linkCell(label, url) {
    const d = document.createElement('div');
    d.className = 'flex items-center gap-1 min-w-0';
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'mini-btn blue flex-1 !px-2 !py-1.5 min-w-0';
    a.innerHTML = ic('external-link', 'ic-sm') + '<span>' + esc(label) + '</span>';
    d.appendChild(a);
    d.appendChild(iconBtn('copy', 'Copy ' + label + ' link', () => copyText(url)));
    return d;
}
let verState = { key: null, path: null, items: [] }, verSel = null, verReq = 0;
const verCache = new Map();
function verKey(repo, branch, path) { return `${repo}@${branch}:${path}`; }
function verAgo(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function commitDesc(message, path) {
    const lines = String(message || '').split('\n');
    const pre = `- ${path}: `;
    const hit = lines.find(l => l.startsWith(pre));
    if (hit) return hit.slice(pre.length).trim() || null;
    const title = (lines[0] || '').trim();
    if (/ via Mobile (Editor|App)$/.test(title) || /^Wiped \d+ files$/.test(title)) return null;
    return title || null;
}
function buildCommitMessage(summary, paths, descs) {
    const lines = paths.filter(p => descs && descs[p]).map(p => `- ${p}: ${descs[p].replace(/\s+/g, ' ').trim()}`);
    return lines.length ? summary + '\n\n' + lines.join('\n') : summary;
}
async function fetchFileCommits(repo, branch, path) {
    let all = [];
    for (let p = 1; p <= 3; p++) {
        const part = await ghJson(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=100&page=${p}`);
        all = all.concat(part);
        if (part.length < 100) break;
    }
    const total = all.length;
    return all.map((c, i) => ({
        n: total - i, sha: c.sha,
        message: (c.commit && c.commit.message) || '',
        date: (c.commit && c.commit.author && c.commit.author.date) || '',
        author: (c.commit && c.commit.author && c.commit.author.name) || ''
    }));
}
async function loadVersionsFor(path, force) {
    const key = verKey(activeRepoId, activeBranch, path);
    if (!force && verCache.has(key)) return verCache.get(key);
    const items = await fetchFileCommits(activeRepoId, activeBranch, path);
    verCache.set(key, items);
    return items;
}
function invalidateVersions() { verCache.clear(); if (typeof ownShaCache !== 'undefined' && ownShaCache.clear) ownShaCache.clear(); }
function clearVersionsUI() {
    verReq++; verState = { key: null, path: null, items: [] }; verSel = null;
    const w = $('versionWrap'); if (w) w.classList.add('hidden');
}
async function refreshVersions(force) {
    const wrap = $('versionWrap'); if (!wrap) return;
    const path = currentEditFilePath;
    if (!isGH() || !activeRepoId || !path) { clearVersionsUI(); return; }
    const my = ++verReq;
    wrap.classList.remove('hidden');
    $('versionFile').textContent = path.split('/').pop();
    const strip = $('versionStrip');
    if (force || !verCache.has(verKey(activeRepoId, activeBranch, path))) strip.innerHTML = '<span class="text-[11px] text-gray-500">Loading versions...</span>';
    try {
        const items = await loadVersionsFor(path, force);
        if (my !== verReq) return;
        verState = { key: verKey(activeRepoId, activeBranch, path), path, items };
        verSel = items.length ? items[0].n : null;
        renderVersionStrip();
    } catch (e) {
        if (my !== verReq) return;
        strip.innerHTML = `<span class="text-[11px] text-red-400">Could not load versions: ${esc(e.message)}</span>`;
    }
}
function renderVersionStrip() {
    const strip = $('versionStrip'), keep = strip.scrollLeft;
    strip.innerHTML = '';
    const items = verState.items;
    if (!items.length) { strip.innerHTML = '<span class="text-[11px] text-gray-500">No versions yet. Save and Deploy this file to create v1.</span>'; return; }
    items.forEach((v, idx) => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.n = v.n; b.className = 'ver-chip' + (v.n === verSel ? ' sel' : '');
        const d = commitDesc(v.message, verState.path);
        b.innerHTML = `<b>v${v.n}${idx === 0 ? '<span class="ver-latest">latest</span>' : ''}${v.inherited ? '<span class="ver-latest" style="background:#6e7681">base</span>' : ''}</b><small>${esc(verAgo(v.date))}</small><small class="${d ? '' : 'opacity-60'}">${esc(d || 'no description')}</small>`;
        b.onclick = () => { verSel = v.n; renderVersionStrip(); openCompare(v.n); };
        strip.appendChild(b);
    });
    strip.scrollLeft = keep;
}
(function () {
    const strip = $('versionStrip');
    if (!strip) return;
    let timer = null, fired = false, sx = 0, sy = 0;
    const clear = () => { clearTimeout(timer); timer = null; };
    strip.addEventListener('pointerdown', (e) => {
        const chip = e.target.closest('.ver-chip'); if (!chip) return;
        fired = false; sx = e.clientX; sy = e.clientY;
        timer = setTimeout(() => { fired = true; showVersionInfo(Number(chip.dataset.n)); }, 480);
    });
    strip.addEventListener('pointermove', (e) => { if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) clear(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => strip.addEventListener(t, clear));
    strip.addEventListener('scroll', clear);
    strip.addEventListener('contextmenu', (e) => e.preventDefault());
    strip.addEventListener('click', (e) => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
})();
async function showVersionInfo(n) {
    const v = verState.items.find(x => x.n === n); if (!v) return;
    const d = commitDesc(v.message, verState.path);
    const when = v.date ? new Date(v.date).toLocaleString() : '';
    const go = await dlgShow({ title: `${verState.path.split('/').pop()} v${v.n}${v.inherited ? ' (base)' : ''}`, message: `${when}${v.author ? '  by ' + v.author : ''}\n${v.sha.slice(0, 7)}${v.inherited ? '\nInherited from the branch this one was created from.' : ''}\n\n${d || 'No description.'}`, ok: 'Compare', cancel: 'Close', danger: false, input: false });
    if (go) { verSel = v.n; renderVersionStrip(); openCompare(v.n); }
}
