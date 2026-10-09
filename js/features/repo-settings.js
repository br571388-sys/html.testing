// ===== Repository Settings (GH + HF) =====
let rsRepo = null, rsData = null, rsBranches = [];
let tcRows = null, tcRunning = false, tcRepo = null;
let hfInfo = null;
async function openRepoSettings(full) {
    if (!isGH()) {
        rsRepo = full; hfInfo = null;
        $('rsTitle').textContent = full;
        $('repoSettingsBody').innerHTML = '<p class="text-xs text-gray-500 text-center mt-10">Loading from Hugging Face...</p>';
        openPageById('repoSettingsPage');
        await loadHFSettings();
        return;
    }
    rsRepo = full; rsData = null; rsBranches = [];
    const body = $('repoSettingsBody');
    $('rsTitle').textContent = full;
    body.innerHTML = '<p class="text-xs text-gray-500 text-center mt-10">Loading from GitHub...</p>';
    openPageById('repoSettingsPage');
    try {
        rsData = await ghJson(`/repos/${full}`);
        try { const br = await ghJson(`/repos/${full}/branches?per_page=100`); rsBranches = br.map(b => b.name); } catch (e) {}
    } catch (e) {
        body.innerHTML = `<p class="text-sm text-red-400 text-center mt-10 px-4 break-words">${esc(ghHint(e))}</p>`;
        return;
    }
    renderRepoSettings();
}
async function rsPatch(payload) {
    const old = rsRepo;
    const j = await ghJson(`/repos/${old}`, { method: 'PATCH', body: JSON.stringify(payload) });
    rsRepo = j.full_name; rsData = j;
    $('rsTitle').textContent = rsRepo;
    syncRepoList(old, j);
    return j;
}
function rsRerender() { const body = $('repoSettingsBody'), st = body.scrollTop; renderRepoSettings(); body.scrollTop = st; }
function rsCard(title, desc, danger) {
    const c = document.createElement('div');
    c.className = 'rounded-xl p-4 mb-4 border ' + (danger ? 'bg-[#1a0f10] border-[#6e2a2a]' : 'bg-[#161b22] border-[#30363d]');
    c.innerHTML = `<div class="text-sm font-bold ${danger ? 'text-red-400' : 'text-gray-100'}">${esc(title)}</div>` + (desc ? `<p class="text-[11px] text-gray-500 mt-0.5">${esc(desc)}</p>` : '');
    return c;
}
function rsToggle(card, label, desc, key) {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-3 mt-3';
    row.innerHTML = `<div class="min-w-0"><div class="text-[13px] font-semibold text-gray-200">${esc(label)}</div>${desc ? `<p class="text-[11px] text-gray-500">${esc(desc)}</p>` : ''}</div><button class="tgl ${rsData[key] ? 'on' : ''}" aria-label="${esc(label)}"></button>`;
    const t = row.querySelector('.tgl');
    t.onclick = async () => {
        t.disabled = true;
        try { await rsPatch({ [key]: !rsData[key] }); t.classList.toggle('on', !!rsData[key]); showToast('Saved'); }
        catch (e) { showToast(ghHint(e)); }
        t.disabled = false;
    };
    card.appendChild(row);
}
function renderRepoSettings() {
    const body = $('repoSettingsBody');
    body.innerHTML = '';
    const d = rsData;
    const fmt = (s) => s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
    if (d.permissions && d.permissions.admin === false) {
        const w = document.createElement('div');
        w.className = 'rounded-xl p-3 mb-4 border border-yellow-700 bg-[#1f1a0d] text-[12px] text-yellow-400';
        w.textContent = 'You do not have admin access to this repository, so most of these settings will be refused by GitHub.';
        body.appendChild(w);
    }
    if (d.archived) {
        const w = document.createElement('div');
        w.className = 'rounded-xl p-3 mb-4 border border-yellow-700 bg-[#1f1a0d] text-[12px] text-yellow-400';
        w.textContent = 'This repository is archived (read-only). Unarchive it on github.com to change settings.';
        body.appendChild(w);
    }
    const ov = rsCard('Overview');
    const stats = document.createElement('div');
    stats.className = 'grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] mt-2';
    [['Visibility', d.private ? 'Private' : 'Public'], ['Default branch', d.default_branch], ['Language', d.language || '-'], ['License', (d.license && d.license.spdx_id) || '-'],
     ['Stars', d.stargazers_count], ['Forks', d.forks_count], ['Size', (d.size >= 1024 ? (d.size / 1024).toFixed(1) + ' MB' : d.size + ' KB')], ['Created', fmt(d.created_at)], ['Last push', fmt(d.pushed_at)]].forEach(([k, v]) => {
        stats.insertAdjacentHTML('beforeend', `<div class="text-gray-500">${esc(k)}</div><div class="text-gray-200 truncate">${esc(String(v))}</div>`);
    });
    ov.appendChild(stats);
    ov.appendChild(linkRow('GitHub', d.html_url));
    ov.appendChild(linkRow('Clone', d.clone_url));
    body.appendChild(ov);
    const gen = rsCard('General');
    gen.insertAdjacentHTML('beforeend', `
        <div class="mt-3">${fieldLabel('Repository name', 'Renaming keeps old links working through redirects.')}<input id="rsName" class="modern-input !mb-0 font-mono" value="${esc(d.name)}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="mt-3">${fieldLabel('Description')}<input id="rsDesc" class="modern-input !mb-0" value="${esc(d.description || '')}" autocomplete="off"></div>
        <div class="mt-3">${fieldLabel('Website')}<input id="rsHome" class="modern-input !mb-0" value="${esc(d.homepage || '')}" placeholder="https://" autocomplete="off" autocapitalize="off"></div>
        <div class="mt-3">${fieldLabel('Topics', 'Comma separated, lowercase letters, numbers and dashes.')}<input id="rsTopics" class="modern-input !mb-0" value="${esc((d.topics || []).join(', '))}" autocomplete="off" autocapitalize="off"></div>`);
    const save = document.createElement('button');
    save.className = 'mini-btn blue w-full mt-4';
    save.innerHTML = ic('check') + '<span>Save changes</span>';
    save.onclick = rsSaveGeneral;
    gen.appendChild(save);
    body.appendChild(gen);
    if (rsBranches.length) {
        const br = rsCard('Default branch', 'The branch GitHub opens by default and uses as the base for pull requests.');
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 mt-3';
        row.innerHTML = `<select id="rsBranch" class="modern-input !mb-0 !py-2 font-mono text-xs flex-1 min-w-0">${rsBranches.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>`;
        const up = document.createElement('button');
        up.className = 'mini-btn blue'; up.textContent = 'Update';
        row.appendChild(up);
        br.appendChild(row);
        body.appendChild(br);
        $('rsBranch').value = d.default_branch;
        up.onclick = async () => {
            const v = $('rsBranch').value;
            if (v === rsData.default_branch) return showToast('Already the default branch.');
            if (!await askConfirm(`Change the default branch to "${v}"?`)) return;
            up.disabled = true;
            try { await rsPatch({ default_branch: v }); showToast('Default branch updated'); rsRerender(); }
            catch (e) { showToast(ghHint(e)); }
            up.disabled = false;
        };
    }
    body.appendChild(branchesCardFor(d));
    body.appendChild(pagesCardFor(d));
    const ft = rsCard('Features');
    rsToggle(ft, 'Issues', 'Track bugs and tasks', 'has_issues');
    rsToggle(ft, 'Projects', 'Project boards', 'has_projects');
    rsToggle(ft, 'Wiki', 'Documentation pages', 'has_wiki');
    rsToggle(ft, 'Discussions', 'Community conversations', 'has_discussions');
    rsToggle(ft, 'Template repository', 'Let others generate new repositories from this one', 'is_template');
    body.appendChild(ft);
    const pr = rsCard('Pull requests', 'GitHub requires at least one merge method to stay enabled.');
    rsToggle(pr, 'Allow merge commits', '', 'allow_merge_commit');
    rsToggle(pr, 'Allow squash merging', '', 'allow_squash_merge');
    rsToggle(pr, 'Allow rebase merging', '', 'allow_rebase_merge');
    rsToggle(pr, 'Always suggest updating pull request branches', '', 'allow_update_branch');
    rsToggle(pr, 'Allow auto-merge', '', 'allow_auto_merge');
    rsToggle(pr, 'Automatically delete head branches', 'After a pull request is merged', 'delete_branch_on_merge');
    body.appendChild(pr);
    const ot = rsCard('Other');
    rsToggle(ot, 'Require sign-off on web commits', '', 'web_commit_signoff_required');
    if (d.private && 'allow_forking' in d) rsToggle(ot, 'Allow forking', 'Let others fork this private repository', 'allow_forking');
    body.appendChild(ot);
    const dz = rsCard('Danger zone', 'These actions are hard or impossible to undo.', true);
    const mkRow = (title, desc, btnLabel, fn, disabled) => {
        const r = document.createElement('div');
        r.className = 'flex items-center justify-between gap-3 mt-4 pt-3 border-t border-[#3d1f1f]';
        r.innerHTML = `<div class="min-w-0"><div class="text-[13px] font-semibold text-gray-200">${esc(title)}</div><p class="text-[11px] text-gray-500">${esc(desc)}</p></div>`;
        const b = document.createElement('button');
        b.className = 'mini-btn danger-btn shrink-0'; b.textContent = btnLabel; b.disabled = !!disabled;
        if (disabled) b.style.opacity = '.5';
        b.onclick = fn;
        r.appendChild(b);
        dz.appendChild(r);
    };
    mkRow(d.private ? 'Make public' : 'Make private', d.private ? 'Anyone on the internet will see this repository.' : 'Only you and people you choose will see it.', d.private ? 'Make public' : 'Make private', async () => {
        const toPrivate = !d.private;
        if (!await askConfirm(toPrivate ? `Make ${rsRepo} private?` : `Make ${rsRepo} PUBLIC? Anyone will be able to see all of its code and history.`)) return;
        try { await rsPatch({ private: toPrivate }); showToast('Visibility updated'); rsRerender(); }
        catch (e) { showToast(ghHint(e)); }
    });
    mkRow('Archive repository', d.archived ? 'Already archived.' : 'Makes it read-only.', d.archived ? 'Archived' : 'Archive', async () => {
        if (!await askConfirm(`Archive ${rsRepo}? It becomes read-only.`)) return;
        try { await rsPatch({ archived: true }); showToast('Repository archived'); rsRerender(); }
        catch (e) { showToast(ghHint(e)); }
    }, d.archived);
    const del = document.createElement('div');
    del.className = 'mt-4 pt-3 border-t border-[#3d1f1f]';
    del.innerHTML = `<div class="flex items-center justify-between gap-3"><div class="min-w-0"><div class="text-[13px] font-semibold text-gray-200">Delete this repository</div><p class="text-[11px] text-gray-500">Permanently removes the repository, its code, issues and history.</p></div></div>`;
    const delBtn = document.createElement('button');
    delBtn.className = 'mini-btn danger-btn shrink-0';
    delBtn.innerHTML = ic('trash') + '<span>Delete</span>';
    del.firstChild.appendChild(delBtn);
    const confirmBox = document.createElement('div');
    confirmBox.className = 'hidden mt-3';
    confirmBox.innerHTML = `<p class="text-[12px] text-red-300 mb-2">Type <span class="font-mono font-bold">${esc(d.full_name)}</span> to confirm.</p><input id="rsDelInput" class="modern-input !mb-2 font-mono text-xs" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(d.full_name)}"><button id="rsDelGo" class="mini-btn danger-btn w-full" disabled style="opacity:.5">I understand, delete this repository</button><p id="rsDelMsg" class="text-[11px] text-red-400 mt-2 break-words"></p>`;
    del.appendChild(confirmBox);
    dz.appendChild(del);
    body.appendChild(dz);
    delBtn.onclick = () => { confirmBox.classList.toggle('hidden'); if (!confirmBox.classList.contains('hidden')) $('rsDelInput').focus(); };
    const inp = confirmBox.querySelector('#rsDelInput'), go = confirmBox.querySelector('#rsDelGo');
    inp.oninput = () => { const ok = inp.value.trim() === d.full_name; go.disabled = !ok; go.style.opacity = ok ? '1' : '.5'; };
    go.onclick = () => rsDeleteNow(d.full_name, go);
}
async function rsSaveGeneral() {
    const d = rsData;
    const name = $('rsName').value.trim(), desc = $('rsDesc').value.trim(), home = $('rsHome').value.trim();
    const topics = $('rsTopics').value.split(/[,\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    if (topics.some(t => !/^[a-z0-9][a-z0-9-]{0,49}$/.test(t))) return showToast('Topics: lowercase letters, numbers and dashes only.');
    if (topics.length > 20) return showToast('GitHub allows at most 20 topics.');
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return showToast('Name can only contain letters, numbers, ".", "-" and "_".');
    const payload = {};
    if (name !== d.name) payload.name = name;
    if (desc !== (d.description || '')) payload.description = desc;
    if (home !== (d.homepage || '')) payload.homepage = home;
    const topicsChanged = topics.join(',') !== (d.topics || []).join(',');
    if (!Object.keys(payload).length && !topicsChanged) return showToast('Nothing to save.');
    if (payload.name && !await askConfirm(`Rename "${d.name}" to "${name}"?`)) return;
    try {
        if (Object.keys(payload).length) await rsPatch(payload);
        if (topicsChanged) {
            const t = await ghJson(`/repos/${rsRepo}/topics`, { method: 'PUT', body: JSON.stringify({ names: topics }) });
            rsData.topics = t.names || topics;
        }
        showToast('Saved');
        rsRerender();
    } catch (e) { showToast(ghHint(e)); }
}
async function rsDeleteNow(full, btn) {
    const msg = $('rsDelMsg');
    msg.textContent = '';
    btn.disabled = true; btn.style.opacity = '.5';
    try {
        const res = await ghFetch(`/repos/${full}`, { method: 'DELETE' });
        if (res.status !== 204) { let m = ''; try { m = (await res.json()).message; } catch (_) {} throw new Error(`GitHub ${res.status}: ${m || 'delete failed'}`); }
    } catch (e) {
        msg.textContent = ghHint(e);
        btn.disabled = false; btn.style.opacity = '1';
        return;
    }
    const wasActive = activeRepoId === full;
    currentSpacesList = currentSpacesList.filter(s => s.id !== full);
    if (starredList) starredList = starredList.filter(s => s.id !== full);
    try { localStorage.removeItem('branch_' + full); if (localStorage.getItem(lastSpaceKey()) === full) localStorage.removeItem(lastSpaceKey()); } catch (e) {}
    closePage('repoSettingsPage');
    if (wasActive) {
        const next = currentSpacesList.find(s => !s.fork) || currentSpacesList[0];
        if (next) selectSpace(next.id, { silent: true });
        else {
            activeRepoId = null; $('targetSpaceInput').value = '';
            resetWorkspaceState();
            $('headerTitle').innerText = 'No repository'; $('headerTitle').removeAttribute('href');
            $('branchBar').classList.add('hidden'); $('branchBar').classList.remove('flex');
        }
    }
    renderSidebarSpaces();
    showToast('Deleted ' + full);
}
// ===== Hugging Face settings =====
async function loadHFSettings() {
    const id = rsRepo;
    try { hfInfo = await hfJson(`/api/spaces/${id}`); }
    catch (e) { $('repoSettingsBody').innerHTML = `<p class="text-sm text-red-400 text-center mt-10 px-4 break-words">${esc(hfHint(e))}</p>`; return; }
    if (rsRepo !== id) return;
    renderHFSettings();
}
function hfSync(oldId, newId, extra) {
    const i = currentSpacesList.findIndex(s => s.id === oldId);
    if (i > -1) currentSpacesList[i] = { ...currentSpacesList[i], id: newId, ...(extra || {}) };
    if (activeRepoId === oldId && oldId !== newId) {
        activeRepoId = newId; $('targetSpaceInput').value = newId;
        try { localStorage.setItem(lastSpaceKey(), newId); } catch (e) {}
        updateHeaderLink();
    }
    renderSidebarSpaces();
}
function fmParse(text) {
    const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    return m ? { lines: m[1].split(/\r?\n/), body: m[2] } : { lines: [], body: String(text) };
}
const fmGet = (lines, key) => { const l = lines.find(x => x.startsWith(key + ':')); return l ? l.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '') : ''; };
function fmSet(lines, key, val) {
    const i = lines.findIndex(x => x.startsWith(key + ':'));
    if (val === '' || val == null) { if (i >= 0) lines.splice(i, 1); }
    else if (i >= 0) lines[i] = `${key}: ${val}`; else lines.push(`${key}: ${val}`);
}
function renderHFSettings() {
    const body = $('repoSettingsBody'); body.innerHTML = '';
    const d = hfInfo, id = rsRepo, rt = d.runtime || {}, stage = rt.stage, [stLabel, stCol] = hfStage(stage);
    const reload = () => { const st = body.scrollTop; loadHFSettings().then(() => { body.scrollTop = st; }); };
    const act = async (path, opts, okMsg) => { try { await hfJson(path, opts); showToast(okMsg); setTimeout(reload, 1200); } catch (e) { showToast(hfHint(e)); } };
    const _tileData = [
        { key: 'runtime',   icon: 'play',     title: 'Run Controls', desc: stLabel },
        { key: 'sdk',       icon: 'code',     title: 'Docker / SDK', desc: d.sdk || 'docker' },
        { key: 'hardware',  icon: 'zap',      title: 'Hardware',     desc: (rt.hardware && (rt.hardware.current || rt.hardware.requested)) || 'cpu-basic' },
        { key: 'general',   icon: 'settings', title: 'General',      desc: 'Rename & visibility' },
        { key: 'variables', icon: 'key',      title: 'Variables',    desc: 'Secrets & env' },
        { key: 'domains',   icon: 'globe',    title: 'Domains',      desc: 'Custom URL' }
    ];
    const _tileGrid = document.createElement('div');
    _tileGrid.className = 'grid grid-cols-2 gap-2.5 mb-4';
    _tileData.forEach(function (t) {
        const tile = document.createElement('button');
        tile.className = 'flex flex-col gap-1.5 p-3.5 rounded-xl border border-[#30363d] bg-[#161b22] text-left active:bg-[#21262d]';
        tile.innerHTML = '<span class="text-blue-400">' + ic(t.icon) + '</span><b class="text-sm text-gray-100">' + esc(t.title) + '</b><small class="text-[11px] text-gray-500">' + esc(t.desc) + '</small>';
        tile.onclick = function () { openHFTile(t.key, id, d, rt, reload, act); };
        _tileGrid.appendChild(tile);
    });
    body.appendChild(_tileGrid);
    const ov = rsCard('Overview');
    const stats = document.createElement('div'); stats.className = 'grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] mt-2';
    [['State', `<span style="color:${stCol}">${esc(stLabel)}</span>`], ['SDK', esc(d.sdk || '-')], ['Visibility', d.private ? 'Private' : 'Public'], ['Hardware', esc((rt.hardware && (rt.hardware.current || rt.hardware.requested)) || '-')], ['Likes', String(d.likes || 0)], ['Updated', d.lastModified ? esc(new Date(d.lastModified).toLocaleDateString()) : '-']].forEach(([k, v]) => stats.insertAdjacentHTML('beforeend', `<div class="text-gray-500">${k}</div><div class="text-gray-200 truncate">${v}</div>`));
    ov.appendChild(stats);
    ov.appendChild(linkRow('App', d.host || hfHost(id)));
    ov.appendChild(linkRow('Space', `https://huggingface.co/spaces/${id}`));
    body.appendChild(ov);
    const run = rsCard('Run controls', 'Pause stops the Space. Restart starts it again.');
    const grid = document.createElement('div'); grid.className = 'grid grid-cols-2 gap-2 mt-3';
    const mk = (label, fn, cls) => { const b = document.createElement('button'); b.className = 'mini-btn ' + (cls || ''); b.textContent = label; b.onclick = fn; grid.appendChild(b); };
    const paused = stage === 'PAUSED' || stage === 'STOPPED';
    mk(paused ? 'Restart / resume' : 'Restart', () => act(`/api/spaces/${id}/restart`, { method: 'POST' }, 'Restart requested'), 'blue');
    if (!paused) mk('Pause', async () => { if (await askConfirm(`Pause ${id}?`)) act(`/api/spaces/${id}/pause`, { method: 'POST' }, 'Space paused'); });
    mk('Factory rebuild', async () => { if (await askConfirm(`Rebuild ${id} from scratch?`)) act(`/api/spaces/${id}/restart?factory=true`, { method: 'POST' }, 'Rebuild requested'); });
    mk('Refresh state', reload);
    run.appendChild(grid); body.appendChild(run);
    const gen = rsCard('General');
    gen.insertAdjacentHTML('beforeend', `<div class="mt-3">${fieldLabel('Space name')}<input id="hfRen" class="modern-input !mb-0 font-mono" value="${esc(hfNameOf(id))}" autocomplete="off"></div>`);
    const sv = document.createElement('button'); sv.className = 'mini-btn blue w-full mt-3'; sv.innerHTML = ic('check') + '<span>Rename space</span>';
    sv.onclick = async () => {
        const nn = $('hfRen').value.trim();
        if (!nn || nn === hfNameOf(id)) return showToast('Nothing to rename.');
        if (!/^[A-Za-z0-9._-]+$/.test(nn)) return showToast('Invalid name.');
        if (!await askConfirm(`Rename "${hfNameOf(id)}" to "${nn}"?`)) return;
        try { await hfJson('/api/repos/move', { method: 'POST', body: JSON.stringify({ fromRepo: id, toRepo: `${hfOwnerOf(id)}/${nn}`, type: 'space' }) }); const nid = `${hfOwnerOf(id)}/${nn}`; hfSync(id, nid); rsRepo = nid; $('rsTitle').textContent = nid; showToast('Renamed'); reload(); } catch (e) { showToast(hfHint(e)); }
    };
    gen.appendChild(sv);
    const vis = document.createElement('div'); vis.className = 'flex items-center justify-between gap-3 mt-4 pt-3 border-t border-[#30363d]';
    vis.innerHTML = `<div class="min-w-0"><div class="text-[13px] font-semibold text-gray-200">${d.private ? 'Private' : 'Public'} space</div><p class="text-[11px] text-gray-500">${d.private ? 'Only you and your org can see it.' : 'Anyone can see it.'}</p></div>`;
    const vb = document.createElement('button'); vb.className = 'mini-btn shrink-0'; vb.textContent = d.private ? 'Make public' : 'Make private';
    vb.onclick = async () => {
        const toPrivate = !d.private;
        if (!await askConfirm(toPrivate ? `Make ${id} private?` : `Make ${id} PUBLIC?`)) return;
        try { await hfJson(`/api/spaces/${id}/settings`, { method: 'PUT', body: JSON.stringify({ private: toPrivate }) }); hfSync(id, id, { private: toPrivate }); showToast('Visibility updated'); reload(); } catch (e) { showToast(hfHint(e)); }
    };
    vis.appendChild(vb); gen.appendChild(vis);
    body.appendChild(gen);
    const dz = rsCard('Danger zone', 'Deleting a space cannot be undone.', true);
    const del = document.createElement('button'); del.className = 'mini-btn danger-btn w-full mt-3'; del.innerHTML = ic('trash') + '<span>Delete this space</span>';
    const box = document.createElement('div'); box.className = 'hidden mt-3';
    box.innerHTML = `<p class="text-[12px] text-red-300 mb-2">Type <span class="font-mono font-bold">${esc(id)}</span> to confirm.</p><input id="hfDelIn" class="modern-input !mb-2 font-mono text-xs" autocomplete="off" placeholder="${esc(id)}"><button id="hfDelGo" class="mini-btn danger-btn w-full" disabled style="opacity:.5">I understand, delete this space</button><p id="hfDelMsg" class="text-[11px] text-red-400 mt-2 break-words"></p>`;
    dz.appendChild(del); dz.appendChild(box); body.appendChild(dz);
    del.onclick = () => { box.classList.toggle('hidden'); if (!box.classList.contains('hidden')) $('hfDelIn').focus(); };
    const inp = box.querySelector('#hfDelIn'), go = box.querySelector('#hfDelGo');
    inp.oninput = () => { const ok = inp.value.trim() === id; go.disabled = !ok; go.style.opacity = ok ? '1' : '.5'; };
    go.onclick = async () => {
        go.disabled = true; go.style.opacity = '.5';
        try { await hfJson('/api/repos/delete', { method: 'DELETE', body: JSON.stringify({ name: hfNameOf(id), organization: hfOwnerOf(id), type: 'space' }) }); }
        catch (e) { $('hfDelMsg').textContent = hfHint(e); go.disabled = false; go.style.opacity = '1'; return; }
        const wasActive = activeRepoId === id;
        currentSpacesList = currentSpacesList.filter(s => s.id !== id);
        try { localStorage.removeItem('branch_' + id); if (localStorage.getItem(lastSpaceKey()) === id) localStorage.removeItem(lastSpaceKey()); } catch (e) {}
        closePage('repoSettingsPage');
        if (wasActive) {
            const next = currentSpacesList[0];
            if (next) selectSpace(next.id, { silent: true });
            else { activeRepoId = null; resetWorkspaceState(); $('headerTitle').innerText = 'No repository'; $('headerTitle').removeAttribute('href'); }
        }
        renderSidebarSpaces(); showToast('Deleted ' + id);
    };
}
function openHFTile(key, id, d, rt, reload, act) {
    const ov = document.createElement('div');
    ov.className = 'sheet-ov open'; ov.style.zIndex = '1250';
    ov.innerHTML = '<div class="sheet" style="max-height:85vh"><div class="sheet-head"><span data-t class="truncate"></span><button type="button" class="text-gray-400 p-1" data-x>' + ic('x') + '</button></div><div class="p-3 overflow-y-auto" data-b style="flex:1"></div></div>';
    document.body.appendChild(ov);
    const close = function () { ov.remove(); };
    ov.querySelector('[data-x]').onclick = close;
    ov.onclick = function (e) { if (e.target === ov) close(); };
    const body = ov.querySelector('[data-b]');
    const title = ov.querySelector('[data-t]');
    const makeCard = function (ttl, desc, danger) {
        const c = document.createElement('div');
        c.className = 'rounded-xl p-4 mb-4 border ' + (danger ? 'bg-[#1a0f10] border-[#6e2a2a]' : 'bg-[#161b22] border-[#30363d]');
        c.innerHTML = '<div class="text-sm font-bold ' + (danger ? 'text-red-400' : 'text-gray-100') + '">' + esc(ttl) + '</div>' + (desc ? '<p class="text-[11px] text-gray-500 mt-0.5">' + esc(desc) + '</p>' : '');
        return c;
    };
    if (key === 'runtime') {
        title.textContent = 'Run Controls';
        const c = makeCard('Run controls');
        const grid = document.createElement('div'); grid.className = 'grid grid-cols-2 gap-2 mt-3';
        const paused = rt.stage === 'PAUSED' || rt.stage === 'STOPPED';
        const mk = function (label, fn, cls) {
            const b = document.createElement('button');
            b.className = 'mini-btn ' + (cls || '');
            b.textContent = label; b.onclick = fn;
            grid.appendChild(b);
        };
        mk(paused ? 'Restart / resume' : 'Restart', function () { act('/api/spaces/' + id + '/restart', { method: 'POST' }, 'Restart requested'); close(); }, 'blue');
        if (!paused) mk('Pause', async function () { if (await askConfirm('Pause ' + id + '?')) { act('/api/spaces/' + id + '/pause', { method: 'POST' }, 'Space paused'); close(); } });
        mk('Factory rebuild', async function () { if (await askConfirm('Rebuild ' + id + '?')) { act('/api/spaces/' + id + '/restart?factory=true', { method: 'POST' }, 'Rebuild requested'); close(); } });
        mk('Refresh state', function () { reload(); close(); });
        c.appendChild(grid); body.appendChild(c);
    } else if (key === 'sdk') {
        title.textContent = 'Docker / SDK';
        const c = makeCard('SDK', 'Stored in the README.md header.');
        c.insertAdjacentHTML('beforeend', '<p class="text-[11px] text-gray-500 mt-3">Loading README.md...</p>');
        body.appendChild(c);
        (async function () {
            let text = '';
            try { const r = await fetch('https://huggingface.co/spaces/' + id + '/resolve/main/README.md', { headers: authHeaders(getToken()) }); text = r.ok ? await r.text() : ''; } catch (e) {}
            while (c.children.length > 2) c.lastChild.remove();
            const fm = fmParse(text);
            const sdkNow = fmGet(fm.lines, 'sdk') || d.sdk || 'docker';
            c.insertAdjacentHTML('beforeend', '<div class="mt-3">' + fieldLabel('Title') + '<input id="hfTileTitle" class="modern-input !mb-0" value="' + esc(fmGet(fm.lines, 'title') || hfNameOf(id)) + '"></div><div class="mt-3">' + fieldLabel('SDK') + '<select id="hfTileSdk" class="modern-input !mb-0 font-mono text-xs">' + ['docker', 'gradio', 'streamlit', 'static'].map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('') + '</select></div><div class="mt-3">' + fieldLabel('App port', 'Docker only') + '<input id="hfTilePort" class="modern-input !mb-0 font-mono" inputmode="numeric" value="' + esc(fmGet(fm.lines, 'app_port') || '7860') + '"></div>');
            document.getElementById('hfTileSdk').value = ['docker', 'gradio', 'streamlit', 'static'].indexOf(sdkNow) > -1 ? sdkNow : 'docker';
            const sb = document.createElement('button');
            sb.className = 'mini-btn blue w-full mt-3';
            sb.innerHTML = ic('check') + '<span>Save README settings</span>';
            sb.onclick = async function () {
                const lines = fm.lines.slice(), sdk = document.getElementById('hfTileSdk').value, port = document.getElementById('hfTilePort').value.trim();
                if (sdk === 'docker' && !/^\d{2,5}$/.test(port)) return showToast('App port must be a number.');
                fmSet(lines, 'title', document.getElementById('hfTileTitle').value.trim());
                fmSet(lines, 'sdk', sdk);
                fmSet(lines, 'app_port', sdk === 'docker' ? port : '');
                const out = '---\n' + lines.join('\n') + '\n---\n' + fm.body;
                sb.disabled = true;
                try { await hfCommitTo(id, 'Update README settings via Mobile Editor', [{ path: 'README.md', content: out }]); showToast('README updated'); close(); setTimeout(reload, 1500); } catch (e) { showToast(hfHint(e)); }
                sb.disabled = false;
            };
            c.appendChild(sb);
        })();
    } else if (key === 'hardware') {
        title.textContent = 'Hardware';
        const flavors = ['cpu-basic', 'cpu-upgrade', 't4-small', 't4-medium', 'a10g-small', 'a10g-large'];
        const cur = (rt.hardware && (rt.hardware.requested || rt.hardware.current)) || 'cpu-basic';
        const c = makeCard('Hardware', 'Paid hardware is billed by Hugging Face.');
        c.insertAdjacentHTML('beforeend', '<div class="mt-3">' + fieldLabel('Hardware') + '<select id="hfTileHw" class="modern-input !mb-0 font-mono text-xs">' + flavors.map(function (f) { return '<option value="' + f + '">' + f + '</option>'; }).join('') + '</select></div><div class="mt-3">' + fieldLabel('Sleep after inactivity') + '<select id="hfTileSleep" class="modern-input !mb-0 text-xs"><option value="-1">Never (paid only)</option><option value="900">15 min</option><option value="3600">1 hour</option><option value="21600">6 hours</option><option value="86400">24 hours</option><option value="172800">48 hours</option></select></div>');
        document.getElementById('hfTileHw').value = flavors.indexOf(cur) > -1 ? cur : 'cpu-basic';
        const sl = String(rt.sleepTime == null ? -1 : rt.sleepTime);
        const sleepSel = document.getElementById('hfTileSleep');
        if (Array.prototype.some.call(sleepSel.options, function (o) { return o.value === sl; })) sleepSel.value = sl;
        const r = document.createElement('div');
        r.className = 'grid grid-cols-2 gap-2 mt-3';
        const b1 = document.createElement('button');
        b1.className = 'mini-btn blue'; b1.textContent = 'Apply hardware';
        b1.onclick = async function () { const f = document.getElementById('hfTileHw').value; if (f !== 'cpu-basic' && !await askConfirm('Switch to ' + f + '? Billed by HF.')) return; act('/api/spaces/' + id + '/hardware', { method: 'POST', body: JSON.stringify({ flavor: f }) }, 'Hardware change requested'); close(); };
        const b2 = document.createElement('button');
        b2.className = 'mini-btn blue'; b2.textContent = 'Apply sleep time';
        b2.onclick = function () { act('/api/spaces/' + id + '/sleeptime', { method: 'POST', body: JSON.stringify({ seconds: Number(document.getElementById('hfTileSleep').value) }) }, 'Sleep time updated'); close(); };
        r.appendChild(b1); r.appendChild(b2); c.appendChild(r);
        body.appendChild(c);
    } else if (key === 'general') {
        title.textContent = 'General';
        const c = makeCard('General', 'Rename and visibility');
        c.insertAdjacentHTML('beforeend', '<div class="mt-3">' + fieldLabel('Space name') + '<input id="hfTileRen" class="modern-input !mb-0 font-mono" value="' + esc(hfNameOf(id)) + '"></div>');
        const sv = document.createElement('button');
        sv.className = 'mini-btn blue w-full mt-3';
        sv.innerHTML = ic('check') + '<span>Rename space</span>';
        sv.onclick = async function () {
            const nn = document.getElementById('hfTileRen').value.trim();
            if (!nn || nn === hfNameOf(id)) return showToast('Nothing to rename.');
            if (!/^[A-Za-z0-9._-]+$/.test(nn)) return showToast('Invalid name.');
            if (!await askConfirm('Rename to "' + nn + '"?')) return;
            try {
                await hfJson('/api/repos/move', { method: 'POST', body: JSON.stringify({ fromRepo: id, toRepo: hfOwnerOf(id) + '/' + nn, type: 'space' }) });
                const nid = hfOwnerOf(id) + '/' + nn;
                hfSync(id, nid);
                rsRepo = nid;
                close(); showToast('Renamed');
            } catch (e) { showToast(hfHint(e)); }
        };
        c.appendChild(sv);
        const vis = document.createElement('div');
        vis.className = 'flex items-center justify-between gap-3 mt-4 pt-3 border-t border-[#30363d]';
        vis.innerHTML = '<div><div class="text-[13px] font-semibold text-gray-200">' + (d.private ? 'Private' : 'Public') + '</div><p class="text-[11px] text-gray-500">' + (d.private ? 'Only you/org' : 'Anyone can see') + '</p></div>';
        const vb = document.createElement('button');
        vb.className = 'mini-btn shrink-0';
        vb.textContent = d.private ? 'Make public' : 'Make private';
        vb.onclick = async function () {
            const toPrivate = !d.private;
            if (!await askConfirm(toPrivate ? 'Make private?' : 'Make PUBLIC?')) return;
            try { await hfJson('/api/spaces/' + id + '/settings', { method: 'PUT', body: JSON.stringify({ private: toPrivate }) }); hfSync(id, id, { private: toPrivate }); close(); showToast('Updated'); } catch (e) { showToast(hfHint(e)); }
        };
        vis.appendChild(vb); c.appendChild(vis);
        body.appendChild(c);
    } else if (key === 'variables') {
        title.textContent = 'Variables & Secrets';
        const c = makeCard('Secrets', 'Manage secrets from the Secrets tab.');
        c.insertAdjacentHTML('beforeend', '<p class="text-[12px] text-gray-400 mt-2">Open the Secrets tab in the bottom navigation.</p>');
        body.appendChild(c);
    } else if (key === 'domains') {
        title.textContent = 'Domains';
        const host = d.host || hfHost(id);
        const c = makeCard('Domain', 'Default Hugging Face Space URL');
        c.appendChild(linkRow('App', host));
        c.appendChild(linkRow('Space', 'https://huggingface.co/spaces/' + id));
        body.appendChild(c);
    }
}
// ===== Branches card (repo settings) =====
async function listAllBranches(repo) {
    let all = [];
    for (let p = 1; p <= 5; p++) { const part = await ghJson(`/repos/${repo}/branches?per_page=100&page=${p}`); all = all.concat(part); if (part.length < 100) break; }
    return all;
}
async function deleteBranchRef(repo, name) {
    const r = await ghFetch(`/repos/${repo}/git/refs/heads/${encPath(name)}`, { method: 'DELETE' });
    if (r.status !== 204) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error(`GitHub ${r.status}: ${m || 'delete failed'}`); }
}
function branchesCardFor(d) {
    const card = rsCard('Branches', 'Clean up extra branches. The default branch can never be deleted here.');
    card.insertAdjacentHTML('beforeend', '<p class="text-[11px] text-gray-500 mt-3">Loading branches...</p>');
    fillBranchesCard(card, d.full_name, d.default_branch);
    return card;
}
async function fillBranchesCard(card, repo, def) {
    const reset = () => { while (card.children.length > 2) card.lastChild.remove(); };
    let branches;
    try { branches = await listAllBranches(repo); }
    catch (e) { if (rsRepo !== repo || !card.isConnected) return; reset(); card.insertAdjacentHTML('beforeend', `<p class="text-[12px] text-red-400 mt-3 break-words">${esc(ghHint(e))}</p>`); return; }
    if (rsRepo !== repo || !card.isConnected) return;
    reset();
    rsBranches = branches.map(b => b.name);
    const defB = branches.find(b => b.name === def);
    const others = branches.filter(b => b.name !== def);
    const mkRow = (b, isDef) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 mt-3 p-2 rounded-lg border ' + (isDef ? 'border-[#9e6a03] bg-[rgba(227,179,65,.08)]' : 'border-[#30363d] bg-[#0d1117]');
        row.innerHTML = `<span class="${isDef ? 'text-yellow-400' : 'text-gray-500'} star-gold">${ic(isDef ? 'star' : 'git-branch', 'ic-sm')}</span><div class="min-w-0 flex-1"><div class="text-[13px] font-mono ${isDef ? 'text-yellow-400' : 'text-gray-100'} truncate">${esc(b.name)}${b.protected ? ' ' + ic('lock', 'ic-sm') : ''}</div><div class="text-[10px] text-gray-500 br-info">${isDef ? 'Default branch' : 'Checking...'}</div></div>`;
        card.appendChild(row);
        return row;
    };
    if (defB) mkRow(defB, true);
    if (!others.length) { card.insertAdjacentHTML('beforeend', '<p class="text-[12px] text-gray-400 mt-3">No other branches.</p>'); return; }
    const info = {}; const rows = {};
    others.forEach(b => {
        const row = mkRow(b, false); rows[b.name] = row;
        row.appendChild(iconBtn('trash', b.protected ? 'Protected branch' : 'Delete branch', async () => {
            if (b.protected) return showToast('This branch is protected.');
            const i = info[b.name] || {};
            const warn = i.ahead > 0 ? `\n\nWarning: it has ${i.ahead} commit(s) that exist on no other branch.` : '';
            if (!await askConfirm(`Delete branch "${b.name}"?${warn}`, { title: 'Delete branch', ok: 'Delete', danger: true })) return;
            try { await deleteBranchRef(repo, b.name); afterBranchDelete(repo, def, [b.name]); showToast(`Deleted ${b.name}`); fillBranchesCard(card, repo, def); }
            catch (e) { showToast(ghHint(e)); }
        }));
    });
    await runConcurrent(others, 6, async (b) => {
        const el = rows[b.name].querySelector('.br-info');
        if (defB && b.commit && defB.commit && b.commit.sha === defB.commit.sha) { info[b.name] = { ahead: 0, behind: 0, same: true }; el.textContent = `Identical to ${def}`; el.className = 'text-[10px] text-green-400'; return; }
        try {
            const c = await ghJson(`/repos/${repo}/compare/${encPath(def)}...${encPath(b.name)}?per_page=1`);
            info[b.name] = { ahead: c.ahead_by, behind: c.behind_by };
            if (c.ahead_by === 0) { el.textContent = `Nothing new, already in ${def}`; el.className = 'text-[10px] text-green-400'; }
            else { el.textContent = `${c.ahead_by} commit(s) not in ${def}`; el.className = 'text-[10px] text-yellow-400'; }
        } catch (e) { info[b.name] = {}; el.textContent = 'Could not compare with ' + def; }
    });
    if (rsRepo !== repo || !card.isConnected) return;
    const deletable = (list) => list.filter(b => !b.protected);
    const safe = deletable(others.filter(b => info[b.name] && info[b.name].ahead === 0));
    const all = deletable(others);
    const bulk = async (list, title, extra) => {
        if (!list.length) return showToast('Nothing to delete.');
        const names = list.slice(0, 12).map(b => '- ' + b.name).join('\n');
        if (!await askConfirm(`${title}\n\n${names}${extra || ''}`, { title: 'Delete branches', ok: `Delete ${list.length}`, danger: true })) return;
        let ok = [], bad = [];
        for (const b of list) { try { await deleteBranchRef(repo, b.name); ok.push(b.name); } catch (e) { bad.push(`${b.name} (${e.message})`); } }
        if (ok.length) afterBranchDelete(repo, def, ok);
        showToast(`Deleted ${ok.length}` + (bad.length ? `, failed ${bad.length}` : ''));
        fillBranchesCard(card, repo, def);
    };
    const bar = document.createElement('div');
    bar.className = 'mt-4 flex flex-col gap-2';
    const b1 = document.createElement('button');
    b1.className = 'mini-btn danger-btn w-full'; b1.innerHTML = ic('trash') + `<span>Delete branches with nothing new (${safe.length})</span>`;
    b1.onclick = () => bulk(safe, `These branches have no commits that are missing from "${def}":`);
    const b2 = document.createElement('button');
    b2.className = 'mini-btn danger-btn w-full'; b2.innerHTML = ic('trash') + `<span>Delete ALL other branches (${all.length})</span>`;
    b2.onclick = () => bulk(all, `Delete every branch except "${def}"?`);
    bar.appendChild(b1); bar.appendChild(b2);
    card.appendChild(bar);
}
function afterBranchDelete(repo, def, names) {
    rsBranches = rsBranches.filter(n => !names.includes(n));
    const rb = $('rsBranch'); if (rb) [...rb.options].forEach(o => { if (names.includes(o.value)) o.remove(); });
    if (activeRepoId !== repo) return;
    branchNames = branchNames.filter(n => !names.includes(n));
    const sel = $('branchSelect');
    [...sel.options].forEach(o => { if (names.includes(o.value)) o.remove(); });
    if (names.includes(activeBranch)) { sel.value = def; if (![...sel.options].some(o => o.value === def)) { const o = document.createElement('option'); o.value = def; o.textContent = def; sel.appendChild(o); sel.value = def; } onBranchChange(); }
    else paintBranchBtn();
    invalidateVersions();
}
// ===== Pages card =====
const PAGES_PERM_HINT = 'Your token needs "Pages: Read and write" and "Administration: Read and write" (fine-grained), or the "repo" scope (classic).';
function pagesErr(status, m) {
    if (status === 401 || status === 403 || status === 404) return `GitHub ${status}: ${m || 'not allowed'}. ${PAGES_PERM_HINT}`;
    if (status === 422) return `GitHub 422: ${m || 'invalid request'}. If this repository is private, GitHub Pages needs a paid plan.`;
    return `GitHub ${status}: ${m || 'request failed'}`;
}
async function pagesState(repo) {
    let r;
    try { r = await ghFetch(`/repos/${repo}/pages`); } catch (e) { return { state: 'error', msg: e.message }; }
    if (r.ok) return { state: 'on', info: await r.json() };
    let msg = ''; try { msg = (await r.json()).message || ''; } catch (_) {}
    if (r.status === 401 || r.status === 403) return { state: 'denied', status: r.status, msg };
    if (r.status === 404) {
        let hp = null;
        try { hp = (await ghJson(`/repos/${repo}`)).has_pages; }
        catch (e) { const k = currentSpacesList.concat(starredList || []).find(s => s.id === repo); hp = k ? k.has_pages : null; }
        return hp === true ? { state: 'denied', status: 404, msg } : { state: 'off' };
    }
    return { state: 'error', msg: `GitHub ${r.status}: ${msg}` };
}
async function enablePages(repo, branch, path) {
    const r = await ghFetch(`/repos/${repo}/pages`, { method: 'POST', body: JSON.stringify({ source: { branch, path } }) });
    if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error(pagesErr(r.status, m)); }
    return r.json().catch(() => ({}));
}
function setHasPages(repo, val) {
    if (rsData && rsData.full_name === repo) rsData.has_pages = val;
    currentSpacesList.concat(starredList || []).forEach(s => { if (s.id === repo) s.has_pages = val; });
}
function pagesCardFor(d) {
    const card = rsCard('GitHub Pages', 'Publish this repository as a website.');
    card.insertAdjacentHTML('beforeend', '<p class="text-[11px] text-gray-500 mt-3">Checking GitHub Pages...</p>');
    fillPagesCard(card, d.full_name);
    return card;
}
function pagesControls(card, branch, path, btnLabel, onGo) {
    const branches = (rsBranches.length ? rsBranches : [rsData.default_branch]).slice();
    if (branch && !branches.includes(branch)) branches.unshift(branch);
    const wrap = document.createElement('div');
    wrap.className = 'mt-3';
    wrap.innerHTML = `${fieldLabel('Branch')}<select class="modern-input !mb-0 !py-2 font-mono text-xs w-full">${branches.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select><div class="mt-3">${fieldLabel('Folder')}<div class="seg"><button type="button" data-p="/">/ (root)</button><button type="button" data-p="/docs">/docs</button></div></div>`;
    const sel = wrap.querySelector('select'); sel.value = branch || rsData.default_branch;
    let cur = path === '/docs' ? '/docs' : '/';
    const seg = wrap.querySelector('.seg');
    const paint = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.p === cur));
    seg.querySelectorAll('button').forEach(b => b.onclick = () => { cur = b.dataset.p; paint(); });
    paint();
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'mini-btn blue w-full mt-3'; go.innerHTML = ic('globe') + '<span>' + esc(btnLabel) + '</span>';
    go.onclick = async () => { go.disabled = true; try { await onGo(sel.value, cur); } finally { go.disabled = false; } };
    wrap.appendChild(go);
    card.appendChild(wrap);
}
async function fillPagesCard(card, repo) {
    const st = await pagesState(repo);
    if (rsRepo !== repo || !card.isConnected) return;
    while (card.children.length > 2) card.lastChild.remove();
    const add = (html) => card.insertAdjacentHTML('beforeend', html);
    const refill = () => { while (card.children.length > 2) card.lastChild.remove(); card.insertAdjacentHTML('beforeend', '<p class="text-[11px] text-gray-500 mt-3">Checking GitHub Pages...</p>'); fillPagesCard(card, repo); };
    if (st.state === 'denied') { add(`<p class="text-[12px] text-yellow-400 mt-3 break-words">Your token cannot access GitHub Pages for this repository. ${esc(PAGES_PERM_HINT)}</p>`); return; }
    if (st.state === 'error') {
        add(`<p class="text-[12px] text-red-400 mt-3 break-words">${esc(st.msg)}</p>`);
        const rt = document.createElement('button'); rt.className = 'mini-btn mt-2'; rt.textContent = 'Retry'; rt.onclick = refill; card.appendChild(rt); return;
    }
    if (st.state === 'off') {
        add('<p class="text-[12px] text-gray-400 mt-3">GitHub Pages is <b class="text-gray-200">off</b> for this repository.</p>');
        if (rsData.private) add('<p class="text-[11px] text-yellow-500 mt-1">This repository is private. GitHub Pages for private repositories needs a paid plan.</p>');
        pagesControls(card, rsData.default_branch, '/', 'Enable GitHub Pages', async (branch, path) => {
            const ok = await askConfirm(`Allow GitHub Pages for ${repo}?\nBranch: ${branch}\nFolder: ${path === '/' ? '/ (root)' : path}`, { title: 'Allow GitHub Pages', ok: 'Allow', danger: false });
            if (!ok) return;
            try { await enablePages(repo, branch, path); setHasPages(repo, true); showToast('GitHub Pages is on'); refill(); }
            catch (e) { showToast(e.message); }
        });
        return;
    }
    const info = st.info, src = info.source || {};
    const wf = info.build_type === 'workflow';
    add(`<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] mt-3"><div class="text-gray-500">Status</div><div class="text-gray-200">${esc(info.status || 'unknown')}</div><div class="text-gray-500">Source</div><div class="text-gray-200 truncate">${wf ? 'GitHub Actions' : esc((src.branch || '-') + ' ' + (src.path || '/'))}</div></div>`);
    card.appendChild(linkRow('Site', pagesBase(info, repo)));
    if (!wf) {
        pagesControls(card, src.branch, src.path, 'Update source', async (branch, path) => {
            try {
                const r = await ghFetch(`/repos/${repo}/pages`, { method: 'PUT', body: JSON.stringify({ source: { branch, path } }) });
                if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error(pagesErr(r.status, m)); }
                showToast('Pages source updated'); refill();
            } catch (e) { showToast(e.message); }
        });
    } else add('<p class="text-[11px] text-gray-500 mt-2">This site is deployed by a GitHub Actions workflow.</p>');
    const off = document.createElement('button');
    off.type = 'button'; off.className = 'mini-btn danger-btn w-full mt-4'; off.textContent = 'Turn off GitHub Pages';
    off.onclick = async () => {
        if (!await askConfirm(`Turn off GitHub Pages for ${repo}?`, { title: 'Turn off GitHub Pages', ok: 'Turn off', danger: true })) return;
        try {
            const r = await ghFetch(`/repos/${repo}/pages`, { method: 'DELETE' });
            if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error(pagesErr(r.status, m)); }
            setHasPages(repo, false); showToast('GitHub Pages is off'); refill();
        } catch (e) { showToast(e.message); }
    };
    card.appendChild(off);
}
function pagesBase(info, repo) {
    if (info && info.html_url) return info.html_url.endsWith('/') ? info.html_url : info.html_url + '/';
    const [owner, name] = repo.split('/');
    return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${name}/`;
}
