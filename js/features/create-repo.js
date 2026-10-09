// ===== Create Repository / Space =====
function closePage(id) { $(id).classList.remove('open'); }
function openPageById(id) {
    const sb = $('sidebar');
    if (sb && sb.classList.contains('open')) toggleSidebar();
    $(id).classList.add('open');
}
function ghHint(e) {
    const m = String((e && e.message) || e);
    if (/\b(401|403|404)\b/.test(m)) return m + ' (Your token may lack permission: fine-grained tokens need "Administration: Read and write", classic tokens need the "repo" scope, and "delete_repo" to delete.)';
    return m;
}
function syncRepoList(oldId, j) {
    const entry = { id: j.full_name, default_branch: j.default_branch, private: j.private, fork: j.fork, has_pages: j.has_pages };
    const i = currentSpacesList.findIndex(s => s.id === oldId);
    if (i > -1) currentSpacesList[i] = entry; else currentSpacesList.unshift(entry);
    if (activeRepoId === oldId && oldId !== j.full_name) {
        try { localStorage.setItem('branch_' + j.full_name, activeBranch); } catch (e) {}
        activeRepoId = j.full_name;
        $('targetSpaceInput').value = j.full_name;
        try { localStorage.setItem(lastSpaceKey(), j.full_name); } catch (e) {}
        updateHeaderLink();
    }
    renderSidebarSpaces();
}
const GITIGNORES = ['Node', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C', 'Android', 'Swift', 'Unity', 'VisualStudio', 'Ruby', 'PHP', 'Dart', 'Kotlin'];
const LICENSES = [['mit', 'MIT'], ['apache-2.0', 'Apache 2.0'], ['gpl-3.0', 'GNU GPL v3'], ['bsd-3-clause', 'BSD 3-Clause'], ['unlicense', 'The Unlicense']];
let crPrivate = true, crReadme = true;
function openCreateRepo() {
    if (!isGH()) {
        if (!getToken()) return showToast('Load your Hugging Face account first.');
        hfCr = { private: true, sdk: 'docker', starter: true, orgs: [] };
        const t = $('createRepoPage').querySelector('header span.font-bold');
        if (t) t.textContent = 'New space';
        renderHFCreate();
        openPageById('createRepoPage');
        hfJson('/api/whoami-v2').then(w => {
            hfCr.orgs = (w.orgs || []).filter(o => o.roleInOrg !== 'read').map(o => o.name);
            renderHFCreate();
        }).catch(() => {});
        return;
    }
    if (!getToken()) return showToast('Load your GitHub account first.');
    crPrivate = true; crReadme = true;
    const t = $('createRepoPage').querySelector('header span.font-bold');
    if (t) t.textContent = 'New repository';
    renderCreateRepo();
    openPageById('createRepoPage');
}
function fieldLabel(t, hint) {
    return `<label class="text-[12px] font-bold text-gray-300 block mb-1">${esc(t)}</label>` + (hint ? `<p class="text-[11px] text-gray-500 mb-1">${esc(hint)}</p>` : '');
}
function renderCreateRepo() {
    const body = $('createRepoBody');
    body.innerHTML = '';
    const card = document.createElement('div');
    card.innerHTML = `
        <div class="mb-4">${fieldLabel('Repository name', 'Letters, numbers, dot, dash and underscore only.')}<input id="crName" class="modern-input !mb-0 font-mono" placeholder="my-new-repo" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="mb-4">${fieldLabel('Description (optional)')}<input id="crDesc" class="modern-input !mb-0" placeholder="What is this repository for?" autocomplete="off"></div>
        <div class="mb-4">${fieldLabel('Visibility')}<div class="seg" id="crVis"><button data-p="0">${ic('globe')}<span>Public</span></button><button data-p="1">${ic('lock')}<span>Private</span></button></div></div>
        <div class="mb-4 flex items-center justify-between gap-3"><div><div class="text-[13px] font-semibold text-gray-200">Add a README file</div><p class="text-[11px] text-gray-500">Without any first commit the repository is empty.</p></div><button id="crReadmeTgl" class="tgl" aria-label="Add README"></button></div>
        <div class="mb-4">${fieldLabel('.gitignore template')}<select id="crGi" class="modern-input !mb-0"><option value="">None</option>${GITIGNORES.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select></div>
        <div class="mb-5">${fieldLabel('License')}<select id="crLic" class="modern-input !mb-0"><option value="">None</option>${LICENSES.map(l => `<option value="${l[0]}">${esc(l[1])}</option>`).join('')}</select></div>
        <button id="crGo" class="mini-btn blue w-full !py-3 !text-sm">${ic('plus')}<span>Create repository</span></button>
        <p id="crMsg" class="text-[11px] text-red-400 mt-3 break-words"></p>`;
    body.appendChild(card);
    const vis = $('crVis');
    const paintVis = () => vis.querySelectorAll('button').forEach(b => b.classList.toggle('active', (b.dataset.p === '1') === crPrivate));
    vis.querySelectorAll('button').forEach(b => b.onclick = () => { crPrivate = b.dataset.p === '1'; paintVis(); });
    paintVis();
    const tg = $('crReadmeTgl');
    tg.classList.toggle('on', crReadme);
    tg.onclick = () => { crReadme = !crReadme; tg.classList.toggle('on', crReadme); };
    $('crGo').onclick = createRepoNow;
}
async function createRepoNow() {
    const msg = $('crMsg'), btn = $('crGo');
    msg.textContent = '';
    const name = $('crName').value.trim();
    if (!name) { msg.textContent = 'Enter a repository name.'; return; }
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') { msg.textContent = 'Name can only contain letters, numbers, ".", "-" and "_".'; return; }
    const gi = $('crGi').value, lic = $('crLic').value;
    const body = { name, description: $('crDesc').value.trim(), private: crPrivate, auto_init: crReadme || !!gi || !!lic };
    if (gi) body.gitignore_template = gi;
    if (lic) body.license_template = lic;
    btn.disabled = true; btn.style.opacity = '.6';
    try {
        const j = await ghJson('/user/repos', { method: 'POST', body: JSON.stringify(body) });
        closePage('createRepoPage');
        currentSpacesList = currentSpacesList.filter(s => s.id !== j.full_name);
        syncRepoList(j.full_name, j);
        sideView = 'repos'; renderSidebarSpaces();
        selectSpace(j.full_name, { silent: true });
        showToast('Created ' + j.full_name);
    } catch (e) {
        msg.textContent = ghHint(e);
        btn.disabled = false; btn.style.opacity = '1';
    }
}
const HF_STARTERS = {
    docker: [{ path: 'Dockerfile', content: 'FROM python:3.11-slim\nWORKDIR /app\nCOPY . .\nEXPOSE 7860\nCMD ["python", "-m", "http.server", "7860"]\n' }, { path: 'index.html', content: '<!doctype html>\n<title>Hello</title>\n<h1>Hello from my Space</h1>\n' }],
    gradio: [{ path: 'app.py', content: 'import gradio as gr\n\ndef greet(name):\n    return "Hello " + name\n\ngr.Interface(fn=greet, inputs="text", outputs="text").launch()\n' }, { path: 'requirements.txt', content: 'gradio\n' }],
    streamlit: [{ path: 'app.py', content: 'import streamlit as st\n\nst.title("Hello from my Space")\n' }, { path: 'requirements.txt', content: 'streamlit\n' }],
    static: [{ path: 'index.html', content: '<!doctype html>\n<title>Hello</title>\n<h1>Hello from my Space</h1>\n' }]
};
let hfCr = { private: true, sdk: 'docker', starter: true, orgs: [] };
function renderHFCreate() {
    const body = $('createRepoBody'), keepName = $('hfName') ? $('hfName').value : '', keepDesc = $('hfOwner') ? $('hfOwner').value : currentUsername;
    body.innerHTML = '';
    const owners = [currentUsername].concat(hfCr.orgs);
    const sdks = [['docker', 'Docker'], ['gradio', 'Gradio'], ['streamlit', 'Streamlit'], ['static', 'Static']];
    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div class="mb-4">${fieldLabel('Owner')}<select id="hfOwner" class="modern-input !mb-0 font-mono text-xs">${owners.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></div>
        <div class="mb-4">${fieldLabel('Space name', 'Letters, numbers, dot, dash and underscore.')}<input id="hfName" class="modern-input !mb-0 font-mono" placeholder="my-space" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(keepName)}"></div>
        <div class="mb-4">${fieldLabel('Visibility')}<div class="seg" id="hfVis"><button data-p="0">${ic('globe')}<span>Public</span></button><button data-p="1">${ic('lock')}<span>Private</span></button></div></div>
        <div class="mb-4">${fieldLabel('SDK', 'Docker lets you run any app with your own Dockerfile.')}<div class="seg" id="hfSdk">${sdks.map(s => `<button data-s="${s[0]}">${s[1]}</button>`).join('')}</div></div>
        <div class="mb-5 flex items-center justify-between gap-3"><div><div class="text-[13px] font-semibold text-gray-200">Add starter files</div><p class="text-[11px] text-gray-500">A tiny working app so the first build succeeds.</p></div><button id="hfStarter" class="tgl" aria-label="Add starter"></button></div>
        <button id="hfGo" class="mini-btn blue w-full !py-3 !text-sm">${ic('plus')}<span>Create space</span></button>
        <p id="hfMsg" class="text-[11px] text-red-400 mt-3 break-words"></p>`;
    body.appendChild(wrap);
    if (keepDesc && owners.includes(keepDesc)) $('hfOwner').value = keepDesc;
    const paint = () => {
        $('hfVis').querySelectorAll('button').forEach(b => b.classList.toggle('active', (b.dataset.p === '1') === hfCr.private));
        $('hfSdk').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.s === hfCr.sdk));
        $('hfStarter').classList.toggle('on', hfCr.starter);
    };
    $('hfVis').querySelectorAll('button').forEach(b => b.onclick = () => { hfCr.private = b.dataset.p === '1'; paint(); });
    $('hfSdk').querySelectorAll('button').forEach(b => b.onclick = () => { hfCr.sdk = b.dataset.s; paint(); });
    $('hfStarter').onclick = () => { hfCr.starter = !hfCr.starter; paint(); };
    $('hfGo').onclick = createHFSpace;
    paint();
}
async function createHFSpace() {
    const msg = $('hfMsg'), btn = $('hfGo'); msg.textContent = '';
    const name = $('hfName').value.trim(), owner = $('hfOwner').value;
    if (!name) { msg.textContent = 'Enter a space name.'; return; }
    if (!/^[A-Za-z0-9._-]+$/.test(name)) { msg.textContent = 'Name can only contain letters, numbers, ".", "-" and "_".'; return; }
    btn.disabled = true; btn.style.opacity = '.6';
    try {
        await hfJson('/api/repos/create', { method: 'POST', body: JSON.stringify({ type: 'space', name, organization: owner, private: hfCr.private, sdk: hfCr.sdk }) });
        const id = `${owner}/${name}`;
        if (hfCr.starter) {
            try { await hfCommitTo(id, 'Add starter files', HF_STARTERS[hfCr.sdk]); }
            catch (e) { showToast('Space created, but starter files failed: ' + e.message.slice(0, 80)); }
        }
        closePage('createRepoPage');
        currentSpacesList = currentSpacesList.filter(s => s.id !== id);
        currentSpacesList.unshift({ id, private: hfCr.private, sdk: hfCr.sdk });
        renderSidebarSpaces();
        selectSpace(id, { silent: true });
        showToast('Created ' + id);
    } catch (e) { msg.textContent = hfHint(e); btn.disabled = false; btn.style.opacity = '1'; }
}
async function hfCommitTo(id, summary, files) {
    const lines = [JSON.stringify({ key: 'header', value: { summary } })];
    files.forEach(f => lines.push(JSON.stringify({ key: 'file', value: { path: f.path, content: utf8ToBase64(f.content), encoding: 'base64' } })));
    const res = await fetch(`https://huggingface.co/api/spaces/${id}/commit/main`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/x-ndjson' }, body: lines.join('\n') });
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${await res.text()}`);
}
