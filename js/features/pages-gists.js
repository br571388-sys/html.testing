// ===== Live Pages, Gists, Markdown Enhance, /page-live =====
let gistList = null;
let gistDiag = { error: null, listed: 0, extra: 0 };
let lpRepo = null, lpReq = 0;
function ghSlug(text, seen) {
    const s = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const n = seen[s] || 0; seen[s] = n + 1;
    return n ? `${s}-${n}` : s;
}
function mdEnhance(box) {
    const seen = {};
    box.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { if (!h.id) h.id = ghSlug(h.textContent, seen); });
    box.querySelectorAll('a[href]').forEach(a => {
        if (/^(https?:|mailto:)/i.test(a.getAttribute('href') || '')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    });
    box.scrollTop = 0;
}
function mdJump(id) {
    const box = $('mdPreviewBox');
    const low = id.toLowerCase();
    let el = null;
    box.querySelectorAll('[id],a[name]').forEach(n => {
        if (el) return;
        const v = n.id || n.getAttribute('name') || '';
        if (v === id || v.toLowerCase() === low || v === 'user-content-' + id) el = n;
    });
    if (!el) return showToast('Section not found: ' + id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('md-flash');
    setTimeout(() => el.classList.remove('md-flash'), 1400);
}
async function openRepoRelativeLink(href) {
    if (!activeRepoId) return;
    const [pathPart, hash] = href.split('#');
    if (!pathPart) return;
    const clean = decodeURIComponent(pathPart.split('?')[0]);
    const parts = clean.startsWith('/') ? [] : dirname(currentEditFilePath || '').split('/').filter(Boolean);
    clean.split('/').forEach(s => { if (!s || s === '.') return; if (s === '..') parts.pop(); else parts.push(s); });
    const target = parts.join('/');
    try { if (!activeFileList.length) activeFileList = await listRepoFiles(activeRepoId, activeBranch); } catch (e) {}
    if (!activeFileList.some(f => f.path === target)) return showToast('File not found in repo: ' + target);
    await loadLiveFileIntoEditor(target, { silent: true });
    if (getPreviewKind(target) && currentEditFilePath === target) {
        previewReset(); togglePreview();
        if (hash) setTimeout(() => mdJump(decodeURIComponent(hash)), 80);
    }
}
$('mdPreviewBox').addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^(https?:|mailto:)/i.test(href)) return;
    e.preventDefault();
    if (href.startsWith('#')) mdJump(decodeURIComponent(href.slice(1)));
    else openRepoRelativeLink(href);
});
function gistRawUrl(owner, id, filename) { return `https://gist.githubusercontent.com/${owner}/${id}/raw/${encodeURIComponent(filename)}`; }
function gistLinks(g, filename) {
    const owner = (g.owner && g.owner.login) || currentUsername;
    return [{ label: 'Preview', url: g.html_url }, { label: 'Raw', url: gistRawUrl(owner, g.id, filename) }];
}
function gistCard(g) {
    const owner = (g.owner && g.owner.login) || currentUsername;
    const files = Object.values(g.files || {});
    const card = document.createElement('div');
    card.className = 'bg-[#161b22] border border-[#30363d] rounded-xl p-3 shrink-0';
    const title = (g.description || (files[0] && files[0].filename) || g.id);
    card.innerHTML = `<div class="flex items-center gap-2 mb-2"><span class="text-blue-400">${ic('file-text')}</span><span class="text-[13px] font-semibold text-gray-100 truncate flex-1">${esc(title)}</span>${g.public ? '' : ic('lock', 'ic-sm text-gray-500')}</div>`;
    files.forEach(f => {
        const row = document.createElement('div');
        row.className = 'mb-2 last:mb-0';
        row.innerHTML = `<div class="text-[11px] font-mono text-gray-400 truncate mb-1">${esc(f.filename)}</div>`;
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-2';
        grid.appendChild(linkCell('Preview', g.html_url));
        grid.appendChild(linkCell('Raw', gistRawUrl(owner, g.id, f.filename)));
        row.appendChild(grid);
        card.appendChild(row);
    });
    return card;
}
async function fetchGists() {
    gistDiag = { error: null, listed: 0, extra: 0 };
    let all = [];
    try {
        for (let p = 1; p <= 3; p++) {
            const part = await ghJson(`/gists?per_page=100&page=${p}`);
            all = all.concat(part);
            if (part.length < 100) break;
        }
    } catch (e) { gistDiag.error = e.message; }
    gistDiag.listed = all.length;
    const have = new Set(all.map(g => g.id));
    for (const v of Object.values(gistMap())) {
        if (have.has(v.id)) continue;
        try { const g = await ghJson(`/gists/${v.id}`); all.push(g); have.add(g.id); gistDiag.extra++; } catch (e) {}
    }
    return all.sort((x, y) => String(y.updated_at || '').localeCompare(String(x.updated_at || '')));
}
function gistHelp() {
    const fine = (getToken() || '').startsWith('github_pat_');
    const fix = fine
        ? 'Your token is a fine-grained token. Add the "Gists" account permission (Read and write), or use a classic token with the "gist" scope.'
        : 'Make sure your token has the "gist" scope.';
    if (gistDiag.error) return `GitHub refused the gist list: ${gistDiag.error}. ${fix}`;
    return `GitHub returned 0 gists for this token. ${fine ? 'Fine-grained tokens may not be able to see gists. ' : ''}${fix}`;
}
function gistPartialNote() {
    return (gistDiag.listed === 0 && gistDiag.extra > 0) ? `Showing only the ${gistDiag.extra} gist(s) created by this app.` : '';
}
function gistMap() { try { return JSON.parse(localStorage.getItem('gist_map_v1') || '{}') || {}; } catch (e) { return {}; } }
function saveGistMap(m) { try { localStorage.setItem('gist_map_v1', JSON.stringify(m)); } catch (e) {} }
async function allGists(force) {
    if (force || gistList === null) gistList = await fetchGists();
    return gistList;
}
async function gistFor(repo, p) {
    const m = gistMap()[repo + '::' + p];
    const desc = `${repo}/${p}`;
    let list = [];
    try { list = await allGists(); } catch (e) {}
    let g = list.find(x => (x.description || '') === desc) || (m && list.find(x => x.id === m.id));
    if (!g && m) { try { g = await ghJson(`/gists/${m.id}`); } catch (e) {} }
    if (!g) return null;
    const base = p.split('/').pop();
    const filename = (m && g.files && g.files[m.filename]) ? m.filename : ((g.files && g.files[base]) ? base : Object.keys(g.files || {})[0]);
    return { g, filename };
}
async function getLivePages(repo) {
    const st = await pagesState(repo);
    if (st.state === 'off') return { enabled: false };
    if (st.state === 'denied') throw new Error(`Your token cannot read GitHub Pages for this repository. ${PAGES_PERM_HINT}`);
    if (st.state === 'error') throw new Error(st.msg);
    const info = st.info;
    const sp = (info.source && info.source.path) || '/';
    const known = currentSpacesList.concat(starredList || []).find(x => x.id === repo);
    const branch = (info.source && info.source.branch) || (known && known.default_branch) || 'main';
    const files = await listRepoFiles(repo, branch);
    const pre = sp === '/' ? '' : sp.replace(/^\//, '').replace(/\/$/, '') + '/';
    const base = pagesBase(info, repo);
    const items = files.filter(f => /\.html?$/i.test(f.path) && f.path.startsWith(pre)).map(f => {
        const rel = f.path.slice(pre.length);
        const parts = rel.split('/');
        const name = parts.pop();
        return { path: f.path, name, folder: parts.join('/'), url: base + encPath(rel) };
    }).sort((x, y) => x.folder.localeCompare(y.folder) || x.name.localeCompare(y.name));
    return { enabled: true, info, branch, base, source: sp, items };
}
function pageCard(item, repo) {
    const d = document.createElement('div');
    d.className = 'bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 mt-2';
    d.innerHTML = `<div class="flex items-center gap-2 mb-1"><span class="text-blue-400">${ic('globe', 'ic-sm')}</span><span class="text-[13px] font-semibold text-gray-100 truncate">${esc(item.name)}</span></div><div class="text-[11px] text-gray-400 leading-5"><div class="truncate"><span class="text-gray-500">Repository:</span> <span class="font-mono">${esc(repo)}</span></div><div class="truncate"><span class="text-gray-500">Folder:</span> <span class="font-mono">${esc(item.folder ? '/' + item.folder : '/ (root)')}</span></div></div>`;
    d.appendChild(linkRow('Link', item.url));
    return d;
}
function notice(body, text) { body.insertAdjacentHTML('beforeend', `<p class="text-sm text-gray-500 text-center mt-10">${text}</p>`); }
function lpOptions() {
    const seen = new Set(), out = [];
    const add = (s) => { if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s); } };
    if (activeRepoId) add(currentSpacesList.concat(starredList || []).find(s => s.id === activeRepoId) || { id: activeRepoId });
    currentSpacesList.filter(s => s.has_pages).forEach(add);
    return out;
}
function renderLivePages(body) {
    if (!isGH()) return notice(body, 'Live pages need GitHub. Switch to GitHub from the menu and load your account.');
    const opts = lpOptions();
    if (!opts.length) return notice(body, 'No repository with GitHub Pages found.');
    if (!lpRepo || !opts.some(o => o.id === lpRepo)) lpRepo = opts[0].id;
    const bar = document.createElement('div');
    bar.className = 'flex items-end gap-2 mb-4';
    bar.innerHTML = '<div class="flex-1 min-w-0"><label class="text-[11px] font-bold text-gray-500 block mb-1">Repository</label><select id="lpSelect" class="modern-input !mb-0 !py-2 text-xs font-mono w-full"></select></div>';
    const sel = bar.querySelector('select');
    opts.forEach(o => {
        const op = document.createElement('option');
        op.value = o.id;
        op.textContent = o.id + (o.id === activeRepoId ? '  (current)' : '') + ((o.has_pages === false) ? '  (Pages off)' : '');
        sel.appendChild(op);
    });
    sel.value = lpRepo;
    sel.onchange = () => { lpRepo = sel.value; renderSettings(); };
    const rf = document.createElement('button');
    rf.className = 'icon-btn'; rf.title = 'Refresh'; rf.innerHTML = ic('refresh');
    rf.onclick = () => renderSettings();
    bar.appendChild(rf);
    body.appendChild(bar);
    const out = document.createElement('div');
    body.appendChild(out);
    loadLivePages(lpRepo, out, ++lpReq);
}
async function loadLivePages(repo, out, req) {
    out.innerHTML = '<p class="text-xs text-gray-500 text-center mt-6">Fetching from GitHub...</p>';
    try {
        const lp = await getLivePages(repo);
        if (req !== lpReq) return;
        out.innerHTML = '';
        if (!lp.enabled) return notice(out, 'GitHub Pages is not enabled for this repository.<br><span class="text-[11px]">Open an .html file in the editor and run /page-live.</span>');
        const head = document.createElement('div');
        head.className = 'text-[11px] text-gray-500 mb-1 leading-5';
        head.innerHTML = `Branch <span class="font-mono text-gray-300">${esc(lp.branch)}</span>, folder <span class="font-mono text-gray-300">${esc(lp.source)}</span>, ${lp.items.length} page${lp.items.length === 1 ? '' : 's'}`;
        out.appendChild(head);
        if (lp.base) out.appendChild(linkRow('Site', lp.base));
        if (!lp.items.length) return notice(out, 'No .html files are being served.');
        lp.items.forEach(it => out.appendChild(pageCard(it, repo)));
    } catch (e) {
        if (req !== lpReq) return;
        out.innerHTML = `<p class="text-sm text-red-400 text-center mt-6">Error: ${esc(e.message)}</p>`;
    }
}
function renderLiveGists(body) {
    if (!isGH()) return notice(body, 'Gists need GitHub. Switch to GitHub from the menu and load your account.');
    if (!getToken()) return notice(body, 'Load your GitHub account first.');
    const top = document.createElement('button');
    top.className = 'mini-btn blue w-full mb-3';
    top.innerHTML = ic('refresh') + '<span>Refresh</span>';
    top.onclick = () => { gistList = null; renderSettings(); };
    body.appendChild(top);
    if (gistList === null) {
        body.insertAdjacentHTML('beforeend', '<p class="text-xs text-gray-500 text-center mt-6">Fetching gists from GitHub...</p>');
        loadGists(); return;
    }
    if (!gistList.length) return notice(body, esc(gistHelp()));
    if (gistPartialNote()) body.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-yellow-500 mb-3">${esc(gistPartialNote())}</p>`);
    gistList.forEach(g => { const c = gistCard(g); c.classList.add('mb-3'); body.appendChild(c); });
}
async function cmdPageLive() {
    const K = 'editor';
    if (!isGH()) return cmdSay(K, '/page-live works only in GitHub mode.');
    if (!activeRepoId) return cmdSay(K, 'Select a repository from the menu first.');
    const p = currentEditFilePath;
    if (!p) return cmdSay(K, 'No file is open. Switch to an .html file.');
    const ext = p.split('.').pop().toLowerCase();
    if (ext === 'html' || ext === 'htm') return liveHtml(p);
    if (ext === 'md' || ext === 'markdown') return liveMd(p);
    cmdSay(K, 'Switch to an .html file.');
}
async function liveHtml(p) {
    const K = 'editor', repo = activeRepoId, branch = activeBranch;
    if (editorDirty || Object.prototype.hasOwnProperty.call(pendingEdits, p)) {
        const b = cmdSay(K, 'This file has changes that are not deployed yet. Save it, tap Deploy All, then run /page-live again.');
        if (Object.keys(pendingEdits).length) b.addButtons([{ label: 'Deploy All', fn: () => deployAllPendingEdits() }]);
        return;
    }
    const wait = cmdSay(K, 'Checking GitHub Pages...');
    const st = await pagesState(repo);
    if (st.state === 'on') return finishHtml(wait, repo, p, st.info, false);
    if (st.state === 'denied') return wait.setText(`Your token cannot access GitHub Pages for ${repo}. ${PAGES_PERM_HINT}`);
    if (st.state === 'error') return wait.setText('Error: ' + st.msg);
    wait.setText(`GitHub Pages is off for ${repo}. Allow it to publish this repository? (branch: ${branch}, folder: root)`);
    wait.addButtons([
        { label: 'Allow', fn: async () => {
            wait.setText('Turning on GitHub Pages...');
            const created = await enablePages(repo, branch, '/');
            setHasPages(repo, true);
            finishHtml(wait, repo, p, created, true);
        } },
        { label: 'Cancel', kind: 'no', fn: () => wait.setText('Cancelled.') }
    ]);
}
function finishHtml(bubble, repo, p, info, fresh) {
    let rel = p;
    const sp = info && info.source && info.source.path;
    if (sp && sp !== '/') {
        const pre = sp.replace(/^\//, '') + '/';
        if (!p.startsWith(pre)) return bubble.setText(`Pages is serving the "${sp}" folder, this file is outside it.`);
        rel = p.slice(pre.length);
    }
    const url = pagesBase(info, repo) + encPath(rel);
    let msg = (fresh ? 'GitHub Pages is on. ' : '') + 'Your page is live. The first build can take 1-2 minutes.';
    const sb = info && info.source && info.source.branch;
    if (sb && sb !== activeBranch) msg += ` Note: Pages serves branch "${sb}".`;
    bubble.setText(msg);
    bubble.addLinks([{ label: 'Page', url }]);
}
async function liveMd(p) {
    const K = 'editor', repo = activeRepoId;
    const fname = p.split('/').pop();
    const content = editor.getValue();
    if (!content.trim()) return cmdSay(K, 'The file is empty.');
    const b = cmdSay(K, 'Looking for an existing gist of this file...');
    let found = null;
    try { found = await gistFor(repo, p); } catch (e) {}
    if (found) {
        b.setText('Updating your gist...');
        try {
            const g = await ghJson(`/gists/${found.g.id}`, { method: 'PATCH', body: JSON.stringify({ files: { [found.filename]: { content } } }) });
            gistList = null;
            b.setText('Gist updated.');
            b.addLinks(gistLinks(g, found.filename));
        } catch (e) { b.setText('Error: ' + e.message); }
        return;
    }
    b.setText(`Host "${fname}" as a GitHub Gist?`);
    const make = (pub) => async () => {
        b.setText('Creating gist...');
        const g = await ghJson('/gists', { method: 'POST', body: JSON.stringify({ description: `${repo}/${p}`, public: pub, files: { [fname]: { content } } }) });
        const m = gistMap(); m[repo + '::' + p] = { id: g.id, filename: fname, owner: (g.owner && g.owner.login) || currentUsername, public: pub };
        saveGistMap(m); gistList = null;
        b.setText(`Gist is ready (${pub ? 'public' : 'secret'}).`);
        b.addLinks(gistLinks(g, fname));
    };
    b.addButtons([
        { label: 'Public', fn: make(true) },
        { label: 'Secret', fn: make(false) },
        { label: 'Cancel', kind: 'no', fn: () => b.setText('Cancelled.') }
    ]);
}
async function cmdPageLinks() {
    const K = 'editor', repo = activeRepoId;
    if (!isGH() || !repo) return cmdSay(K, 'Select a GitHub repository first.');
    const wait = cmdSay(K, 'Fetching links from GitHub...');
    let shown = 0;
    try {
        const lp = await getLivePages(repo);
        if (lp.enabled && lp.items.length) {
            const MAX = 25;
            wait.setText(`Live pages in ${repo} (${lp.items.length})`);
            lp.items.slice(0, MAX).forEach(it => wait.addNode(pageCard(it, repo)));
            shown += lp.items.length;
        } else if (!lp.enabled) {
            wait.setText('GitHub Pages is not enabled for this repository.');
        } else {
            wait.setText('GitHub Pages is on, but no .html file is being served.');
        }
    } catch (e) { wait.setText('Could not read Pages: ' + e.message); }
    try {
        const gl = await allGists(true);
        const mine = gl.filter(g => (g.description || '').startsWith(repo + '/'));
        if (mine.length) {
            const gb = cmdSay(K, `Gists from files of ${repo} (${mine.length})`);
            mine.forEach(g => {
                const fname = Object.keys(g.files)[0];
                const card = document.createElement('div');
                card.className = 'bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 mt-2';
                card.innerHTML = `<div class="flex items-center gap-2"><span class="text-blue-400">${ic('file-text', 'ic-sm')}</span><span class="text-[13px] font-semibold text-gray-100 truncate">${esc(g.description.slice(repo.length + 1))}</span></div>`;
                gistLinks(g, fname).forEach(l => card.appendChild(linkRow(l.label, l.url)));
                gb.addNode(card);
            });
            shown += mine.length;
        }
    } catch (e) {}
    if (!shown && wait.el) cmdSay(K, 'No live pages or gists found.');
}
async function syncAfterDeploy(paths) {
    if (!isGH()) return;
    const repo = activeRepoId;
    for (const p of paths) {
        if (!/\.(md|markdown)$/i.test(p)) continue;
        try {
            const found = await gistFor(repo, p);
            if (!found) continue;
            await ghJson(`/gists/${found.g.id}`, { method: 'PATCH', body: JSON.stringify({ files: { [found.filename]: { content: pendingEdits[p] } } }) });
            gistList = null; addLog(`Gist updated: ${p}`);
        } catch (e) { addLog(`Gist update failed (${p}): ${e.message}`); }
    }
    if (paths.some(p => /\.html?$/i.test(p))) {
        try { const r = await ghFetch(`/repos/${repo}/pages`); if (r.ok) addLog('GitHub Pages will refresh the live page in 1-2 minutes.'); } catch (e) {}
    }
}
let gistMode = null;
const gistObjCache = new Map();
const gistFileStore = new Map();
const isGistId = (r) => String(r || '').startsWith('gist:');
const gistIdOf = (r) => String(r).split('/').pop();
async function loadGistObj(id, rev, force) {
    const key = rev ? id + '@' + rev : id;
    if (!force && !rev && gistObjCache.has(id) && Date.now() - gistObjCache.get(id)._t < 4000) return gistObjCache.get(id);
    const g = await ghJson(rev ? `/gists/${id}/${rev}` : `/gists/${id}`);
    g._t = Date.now();
    if (!rev) gistObjCache.set(id, g);
    return g;
}
function gistFileEntries(g, ref) {
    return Object.values(g.files || {}).map(f => {
        const sha = `g:${ref}:${f.filename}`;
        gistFileStore.set(sha, { content: f.truncated ? null : f.content, raw_url: f.raw_url, encoding: f.encoding, size: f.size });
        return { type: 'file', path: f.filename, sha, mode: '100644', size: f.size };
    });
}
async function gistEntryText(e) {
    if (e.content != null) return e.content;
    const res = await fetch(e.raw_url);
    if (!res.ok) throw new Error('Could not load the gist file');
    return res.text();
}
(function () {
    const _list = listRepoFiles;
    listRepoFiles = async function (repoId, ref) {
        if (!isGistId(repoId)) return _list.apply(this, arguments);
        const id = gistIdOf(repoId), rev = /^[0-9a-f]{40}$/i.test(ref || '') ? ref : null;
        const g = await loadGistObj(id, rev, !rev);
        return gistFileEntries(g, rev || 'cur');
    };
    const _blob = getFileBlob;
    getFileBlob = async function (repoId, ref, f) {
        if (!isGistId(repoId)) return _blob.apply(this, arguments);
        const e = gistFileStore.get(f.sha);
        if (!e) return null;
        try {
            if (e.encoding === 'base64' && e.content != null) { const bin = atob(e.content); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u]); }
            return new Blob([await gistEntryText(e)]);
        } catch (err) { return null; }
    };
    const _commit = ghCommit;
    ghCommit = async function (opts) {
        if (!isGistId(opts.repo)) return _commit.apply(this, arguments);
        const id = gistIdOf(opts.repo), files = {};
        for (const u of (opts.upserts || [])) {
            if (u.path.includes('/')) throw new Error('Gists cannot contain folders.');
            let text;
            if (u.sha) { const e = gistFileStore.get(u.sha); if (!e) continue; text = await gistEntryText(e); }
            else text = (typeof u.content === 'string') ? u.content : await u.content.text();
            files[u.path] = { content: text === '' ? '\n' : text };
        }
        for (const p of (opts.deletes || [])) files[p] = null;
        if (!Object.keys(files).length) throw new Error('Nothing to commit');
        const cur = await loadGistObj(id, null, true);
        const remaining = new Set(Object.keys(cur.files));
        Object.entries(files).forEach(([k, v]) => { if (v === null) remaining.delete(k); else remaining.add(k); });
        if (!remaining.size) throw new Error('A gist must keep at least one file.');
        const before = cur.history && cur.history[0] && cur.history[0].version;
        const j = await ghJson(`/gists/${id}`, { method: 'PATCH', body: JSON.stringify({ files }) });
        j._t = Date.now(); gistObjCache.set(id, j); gistList = null;
        const after = j.history && j.history[0] && j.history[0].version;
        return { unchanged: before === after, sha: after };
    };
    const _fetchCommits = fetchFileCommits;
    fetchFileCommits = async function (repo, branch, path) {
        if (!isGistId(repo)) return _fetchCommits.apply(this, arguments);
        const g = await loadGistObj(gistIdOf(repo), null, true);
        const h = g.history || [];
        return h.map((x, i) => {
            const cs = x.change_status || {};
            return { n: h.length - i, sha: x.version, message: `+${cs.additions || 0} -${cs.deletions || 0} lines`, date: x.committed_at, author: x.user && x.user.login };
        });
    };
    const _textAt = fetchTextAt;
    fetchTextAt = async function (repo, path, ref) {
        if (!isGistId(repo)) return _textAt.apply(this, arguments);
        const g = await loadGistObj(gistIdOf(repo), ref, false);
        const f = g.files && g.files[path];
        if (!f) throw new Error('This file did not exist in that revision.');
        return gistEntryText({ content: f.truncated ? null : f.content, raw_url: f.raw_url });
    };
    const _hist = loadCommitHistory;
    loadCommitHistory = async function () {
        if (!gistMode) return _hist.apply(this, arguments);
        const list = $('commitsList');
        list.innerHTML = '<div class="text-center text-gray-500 text-sm py-4">Fetching revisions...</div>';
        try {
            const g = await loadGistObj(gistMode.id, null, true);
            const h = g.history || [];
            list.innerHTML = '';
            h.forEach((x, i) => {
                const cs = x.change_status || {};
                const title = `Revision ${h.length - i}: +${cs.additions || 0} -${cs.deletions || 0} lines`;
                const dateStr = new Date(x.committed_at).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
                const div = document.createElement('div');
                div.className = 'bg-[#161b22] border border-[#30363d] p-3 rounded-lg active:bg-[#21262d] cursor-pointer shadow-sm';
                div.onclick = () => openHistoryViewer(activeRepoId, x.version, title, dateStr);
                div.innerHTML = `<div class="flex justify-between items-start gap-2"><div class="flex-1 min-w-0"><h4 class="text-sm font-bold text-gray-200 break-words mb-1">${esc(title)}</h4><div class="flex justify-between items-center text-xs text-blue-400 font-mono"><span>${esc(x.version.substring(0, 7))}</span><span class="text-gray-500">${esc(dateStr)}</span></div></div><div class="flex gap-1 shrink-0"><button data-role="restore" class="p-2 bg-[#21262d] rounded-lg text-[#f0883e] border border-[#30363d]">${ic('refresh')}</button><button data-role="download" class="p-2 bg-[#21262d] rounded-lg text-blue-400 border border-[#30363d]">${ic('download')}</button></div></div>`;
                div.querySelector('[data-role="download"]').onclick = (ev) => downloadSpecificCommit(ev, x.version);
                div.querySelector('[data-role="restore"]').onclick = (ev) => revertToCommit(ev, x.version, title);
                list.appendChild(div);
            });
            if (!h.length) list.innerHTML = '<div class="text-center text-gray-500 text-sm py-6">No revisions.</div>';
        } catch (e) { list.innerHTML = `<div class="text-red-400 text-center py-4">${esc(ghHint(e))}</div>`; }
    };
    const _br = loadBranches; loadBranches = function () { if (gistMode) return; return _br.apply(this, arguments); };
    const _sec = loadSecrets; loadSecrets = function () { if (gistMode) return; return _sec.apply(this, arguments); };
    const _cd = collectDescriptions; collectDescriptions = async function (p) { if (gistMode) return {}; return _cd.apply(this, arguments); };
    const _sad = syncAfterDeploy; syncAfterDeploy = async function () { if (gistMode) return; return _sad.apply(this, arguments); };
    const _uhl = updateHeaderLink;
    updateHeaderLink = function () {
        if (!gistMode) return _uhl.apply(this, arguments);
        const g = gistObjCache.get(gistMode.id), ht = $('headerTitle');
        ht.innerText = (g && (g.description || Object.keys(g.files || {})[0])) || 'Gist';
        ht.href = (g && g.html_url) || 'https://gist.github.com/';
    };
    const _sel = selectSpace;
    selectSpace = function () { if (gistMode) exitGistMode(); return _sel.apply(this, arguments); };
    const _sp = setProvider;
    setProvider = function () { if (gistMode) exitGistMode(); return _sp.apply(this, arguments); };
    const _cs = clearSession;
    clearSession = function () { if (gistMode) exitGistMode(); return _cs.apply(this, arguments); };
    const _sw = switchTab;
    switchTab = function (tabId) {
        if ((tabId === 'gdetails' || tabId === 'gshare') && !gistMode) tabId = 'editor';
        if ((tabId === 'serverlogs' || tabId === 'secrets') && gistMode) tabId = 'editor';
        const r = _sw.call(this, tabId);
        if (tabId === 'gdetails') renderGistDetails();
        if (tabId === 'gshare') renderGistShare();
        return r;
    };
    const _gc = gistCard;
    gistCard = function (g) {
        const c = _gc.apply(this, arguments);
        c.style.cursor = 'pointer';
        if (gistMode && gistMode.id === g.id) c.classList.add('!border-blue-500');
        const head = c.firstElementChild;
        if (head) head.insertAdjacentHTML('beforeend', `<span class="text-[10px] font-bold uppercase text-blue-400 shrink-0">Edit</span>`);
        c.addEventListener('click', (e) => { if (e.target.closest('a,button')) return; closeSettings(); selectGist(g.id); });
        return c;
    };
    const _pl = cmdPageLive;
    cmdPageLive = async function () { if (!gistMode) return _pl.apply(this, arguments); return gistCmdLinks(true); };
    const _pll = cmdPageLinks;
    cmdPageLinks = async function () { if (!gistMode) return _pll.apply(this, arguments); return gistCmdLinks(false); };
})();
async function selectGist(id) {
    if (!getToken()) return showToast('Load your GitHub account first.');
    flushDraft();
    let g;
    try { g = await loadGistObj(id, null, true); } catch (e) { return showToast("Couldn't open gist: " + ghHint(e)); }
    const owner = (g.owner && g.owner.login) || currentUsername;
    gistMode = { id, owner, pseudo: `gist:${owner}/${id}` };
    document.body.classList.add('gist-mode');
    activeRepoId = gistMode.pseudo; activeBranch = 'gist';
    $('targetSpaceInput').value = `Gist ${id}`;
    $('branchBar').classList.add('hidden'); $('branchBar').classList.remove('flex');
    updateHeaderLink();
    resetWorkspaceState();
    restoreEditorSession();
    const names = Object.keys(g.files || {});
    if (!currentEditFilePath && names.length === 1) loadLiveFileIntoEditor(names[0], { silent: true });
    renderSidebarSpaces();
    toggleSidebar();
    switchTab('editor');
    showToast(`Editing gist: ${(g.description || names[0] || id).slice(0, 40)}`);
}
function exitGistMode() {
    gistMode = null;
    document.body.classList.remove('gist-mode');
    const t = localStorage.getItem('hf_last_tab');
    if (t === 'gdetails' || t === 'gshare') switchTab('editor');
}
async function gistCmdLinks(single) {
    const K = 'editor';
    const g = await loadGistObj(gistMode.id, null, true);
    const names = single && currentEditFilePath ? [currentEditFilePath] : Object.keys(g.files);
    const b = cmdSay(K, single ? 'Gist links:' : `Links for this gist (${names.length} file${names.length === 1 ? '' : 's'}):`);
    b.addLinks([{ label: 'Preview', url: g.html_url }]);
    names.forEach(n => b.addLinks([{ label: 'Raw ' + n.slice(0, 18), url: gistRawUrl(gistMode.owner, gistMode.id, n) }]));
}
let gdStar = null;
async function gistPatch(payload) {
    const g = await ghJson(`/gists/${gistMode.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    g._t = Date.now(); gistObjCache.set(gistMode.id, g); gistList = null; activeFileList = [];
    updateHeaderLink(); renderSidebarSpaces();
    return g;
}
async function renderGistDetails() {
    const body = $('gdetailsBody');
    if (!gistMode || !body) return;
    body.innerHTML = '<p class="text-xs text-gray-500 text-center mt-10">Loading gist...</p>';
    let g;
    try { g = await loadGistObj(gistMode.id, null, true); } catch (e) { body.innerHTML = `<p class="text-sm text-red-400 text-center mt-10">${esc(ghHint(e))}</p>`; return; }
    if (!gistMode) return;
    body.innerHTML = '';
    const fmt = (s) => s ? new Date(s).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
    const card = (title, desc) => {
        const c = document.createElement('div');
        c.className = 'bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-4';
        c.innerHTML = `<div class="text-sm font-bold text-gray-100">${esc(title)}</div>` + (desc ? `<p class="text-[11px] text-gray-500 mt-0.5">${esc(desc)}</p>` : '');
        return c;
    };
    const names = Object.keys(g.files || {});
    const ov = card('Overview');
    ov.insertAdjacentHTML('beforeend', `<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] mt-2"><div class="text-gray-500">Visibility</div><div class="${g.public ? 'text-green-400' : 'text-yellow-400'}">${g.public ? 'Public' : 'Secret'}</div><div class="text-gray-500">Files</div><div class="text-gray-200">${names.length}</div><div class="text-gray-500">Revisions</div><div class="text-gray-200">${(g.history || []).length}</div><div class="text-gray-500">Created</div><div class="text-gray-200">${esc(fmt(g.created_at))}</div><div class="text-gray-500">Updated</div><div class="text-gray-200">${esc(fmt(g.updated_at))}</div></div>`);
    body.appendChild(ov);
    const ds = card('Description');
    ds.insertAdjacentHTML('beforeend', `<input id="gdDesc" class="modern-input !mb-0 !mt-3" value="${esc(g.description || '')}" placeholder="What is this gist?" autocomplete="off">`);
    const sv = document.createElement('button');
    sv.className = 'mini-btn blue w-full mt-3'; sv.innerHTML = ic('check') + '<span>Save description</span>';
    sv.onclick = async () => {
        const v = $('gdDesc').value.trim();
        if (v === (g.description || '')) return showToast('Nothing to save.');
        sv.disabled = true;
        try { await gistPatch({ description: v }); showToast('Saved'); renderGistDetails(); } catch (e) { showToast(ghHint(e)); }
        sv.disabled = false;
    };
    ds.appendChild(sv);
    body.appendChild(ds);
    const fl = card('Files', 'Rename or delete files. To add a file use the Editor tab (file list > Add File).');
    names.forEach(n => {
        const f = g.files[n];
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 mt-3';
        row.innerHTML = `<span class="text-blue-400">${ic('file-text', 'ic-sm')}</span><div class="min-w-0 flex-1"><div class="text-[13px] font-mono text-gray-100 truncate">${esc(n)}</div><div class="text-[10px] text-gray-500">${esc(f.language || 'Text')}, ${f.size} bytes</div></div>`;
        row.appendChild(iconBtn('edit', 'Rename', async () => {
            const nn = await askPrompt(`Rename "${n}" to:`, n, { title: 'Rename file', ok: 'Rename' });
            if (nn === null) return;
            const name = nn.trim();
            if (!name || name === n) return;
            if (name.includes('/')) return showToast('Gist file names cannot contain "/".');
            if (names.includes(name)) return showToast('A file with that name already exists.');
            try {
                await gistPatch({ files: { [n]: { filename: name } } });
                if (pendingEdits[n] != null) { pendingEdits[name] = pendingEdits[n]; delete pendingEdits[n]; saveSession({ pending: pendingEdits }); updatePendingDeployBar(); }
                if (currentEditFilePath === n) { currentEditFilePath = name; updateCurrentFileLabel(); saveSession({ file: name }); }
                showToast('Renamed'); renderGistDetails();
            } catch (e) { showToast(ghHint(e)); }
        }));
        row.appendChild(iconBtn('trash', 'Delete file', async () => {
            if (names.length <= 1) return showToast('A gist must keep at least one file.');
            if (!await askConfirm(`Delete "${n}" from this gist?`, { title: 'Delete file', ok: 'Delete', danger: true })) return;
            try {
                await gistPatch({ files: { [n]: null } });
                delete pendingEdits[n]; saveSession({ pending: pendingEdits }); updatePendingDeployBar();
                if (currentEditFilePath === n) { setEditorContent('', null); currentEditFilePath = null; updateCurrentFileLabel(); saveSession({ file: null, draft: null }); }
                showToast('Deleted'); renderGistDetails();
            } catch (e) { showToast(ghHint(e)); }
        }));
        fl.appendChild(row);
    });
    body.appendChild(fl);
    const st = card('Star');
    const starBtn = document.createElement('button');
    starBtn.className = 'mini-btn w-full mt-3'; starBtn.textContent = 'Checking...';
    st.appendChild(starBtn); body.appendChild(st);
    ghFetch(`/gists/${gistMode.id}/star`).then(r => {
        gdStar = r.status === 204;
        const paint = () => { starBtn.innerHTML = ic('star', 'ic-sm') + `<span>${gdStar ? 'Starred. Tap to unstar' : 'Star this gist'}</span>`; };
        paint();
        starBtn.onclick = async () => {
            const r2 = await ghFetch(`/gists/${gistMode.id}/star`, { method: gdStar ? 'DELETE' : 'PUT' });
            if (r2.ok) { gdStar = !gdStar; paint(); } else showToast(`GitHub ${r2.status}`);
        };
    }).catch(() => { starBtn.textContent = 'Could not check star'; });
    const dz = card('Danger zone', 'Deleting a gist cannot be undone.');
    dz.className = 'bg-[#1a0f10] border border-[#6e2a2a] rounded-xl p-4 mb-6';
    dz.firstChild.className = 'text-sm font-bold text-red-400';
    const del = document.createElement('button');
    del.className = 'mini-btn danger-btn w-full mt-3'; del.innerHTML = ic('trash') + '<span>Delete this gist</span>';
    del.onclick = async () => {
        const typed = await askPrompt(`Type the gist ID to confirm deletion:\n${gistMode.id}`, '', { title: 'Delete gist', ok: 'Delete', placeholder: 'gist ID' });
        if (typed === null) return;
        if (typed.trim() !== gistMode.id) return showToast('ID did not match. Nothing was deleted.');
        try {
            const r = await ghFetch(`/gists/${gistMode.id}`, { method: 'DELETE' });
            if (r.status !== 204) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error(`GitHub ${r.status}: ${m}`); }
        } catch (e) { return showToast(ghHint(e)); }
        const id = gistMode.id;
        gistObjCache.delete(id); gistList = null;
        exitGistMode();
        const last = localStorage.getItem(lastSpaceKey());
        if (last) selectSpace(last, { silent: true }); else { activeRepoId = null; resetWorkspaceState(); $('headerTitle').innerText = 'No repository'; $('headerTitle').removeAttribute('href'); }
        renderSidebarSpaces();
        showToast('Gist deleted');
    };
    dz.appendChild(del);
    body.appendChild(dz);
}
async function renderGistShare() {
    const body = $('gshareBody');
    if (!gistMode || !body) return;
    body.innerHTML = '<p class="text-xs text-gray-500 text-center mt-10">Loading gist...</p>';
    let g;
    try { g = await loadGistObj(gistMode.id, null, true); } catch (e) { body.innerHTML = `<p class="text-sm text-red-400 text-center mt-10">${esc(ghHint(e))}</p>`; return; }
    if (!gistMode) return;
    body.innerHTML = '';
    const card = (title, desc) => {
        const c = document.createElement('div');
        c.className = 'bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-4';
        c.innerHTML = `<div class="text-sm font-bold text-gray-100">${esc(title)}</div>` + (desc ? `<p class="text-[11px] text-gray-500 mt-0.5">${esc(desc)}</p>` : '');
        return c;
    };
    const pv = card('Preview page', g.public ? 'Public gist: anyone can open it.' : 'Secret gist: anyone with this link can open it.');
    pv.appendChild(linkRow('Gist', g.html_url));
    body.appendChild(pv);
    const names = Object.keys(g.files || {});
    const rw = card('Raw links', 'Always the latest version of each file.');
    names.forEach(n => {
        rw.insertAdjacentHTML('beforeend', `<div class="text-[11px] font-mono text-gray-400 mt-3 truncate">${esc(n)}</div>`);
        rw.appendChild(linkRow('Raw', gistRawUrl(gistMode.owner, gistMode.id, n)));
    });
    body.appendChild(rw);
    const em = card('Embed', 'Paste this into any web page to show the gist.');
    em.appendChild(linkRow('Script', `<script src="https://gist.github.com/${gistMode.owner}/${gistMode.id}.js"></script>`));
    body.appendChild(em);
    const gt = card('Git', 'Clone or push this gist with git.');
    if (g.git_pull_url) gt.appendChild(linkRow('Pull', g.git_pull_url));
    if (g.git_push_url) gt.appendChild(linkRow('Push', g.git_push_url));
    body.appendChild(gt);
}
