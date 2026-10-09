// ===== Branch picker =====
let branchNames = [];
function defaultBranchOf(repo) {
    const s = currentSpacesList.concat(starredList || []).find(x => x.id === repo);
    return s && s.default_branch;
}
function paintBranchBtn() {
    const n = $('branchBtnName'); if (!n) return;
    const isDef = !!activeBranch && activeBranch === defaultBranchOf(activeRepoId);
    n.textContent = activeBranch || '';
    $('branchBtn').classList.toggle('gold', isDef);
    $('branchBtnStar').innerHTML = isDef ? ic('star', 'ic-sm') : '';
}
function validBranch(n) {
    return /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(n) && !n.includes('..') && !n.includes('//') && !/[\/.]$/.test(n) && !n.endsWith('.lock');
}
function openBranchSheet() {
    if (!isGH() || !activeRepoId) return;
    let ov = $('branchSheet');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'branchSheet'; ov.className = 'sheet-ov';
        ov.innerHTML = '<div class="sheet"><div class="sheet-head"><span>Branches</span><button type="button" id="bsClose" class="icon-btn !w-8 !h-8" aria-label="Close"></button></div><div id="bsList" class="sheet-list"></div><div id="bsFoot" class="sheet-foot"></div></div>';
        document.body.appendChild(ov);
        $('bsClose').innerHTML = ic('x');
        $('bsClose').onclick = closeBranchSheet;
        ov.addEventListener('click', (e) => { if (e.target === ov) closeBranchSheet(); });
    }
    renderBranchSheet(false);
    ov.classList.add('open');
}
function closeBranchSheet() { const o = $('branchSheet'); if (o) o.classList.remove('open'); }
function renderBranchSheet(showForm) {
    const def = defaultBranchOf(activeRepoId);
    const names = (branchNames.length ? branchNames : [activeBranch]).slice().sort((a, b) => (a === def ? -1 : b === def ? 1 : a.localeCompare(b)));
    const list = $('bsList'); list.innerHTML = '';
    names.forEach(n => {
        const isDef = n === def, isAct = n === activeBranch;
        const row = document.createElement('div');
        row.className = 'bs-row' + (isDef ? ' gold' : '') + (isAct ? ' act' : '');
        const main = document.createElement('button');
        main.type = 'button'; main.className = 'bs-main';
        main.innerHTML = `${isDef ? ic('star', 'ic-sm bs-star') : ic('git-branch', 'ic-sm')}<span class="truncate">${esc(n)}</span>${isDef ? '<span class="bs-tag">default</span>' : ''}${isAct ? ic('check', 'ic-sm bs-check') : ''}`;
        main.onclick = () => { closeBranchSheet(); $('branchSelect').value = n; onBranchChange(); };
        const ren = document.createElement('button');
        ren.type = 'button'; ren.className = 'icon-btn !h-auto !w-10'; ren.title = 'Rename branch';
        ren.innerHTML = ic('edit');
        ren.onclick = () => renameBranch(n);
        row.appendChild(main); row.appendChild(ren);
        list.appendChild(row);
    });
    const foot = $('bsFoot');
    if (!showForm) {
        foot.innerHTML = `<button type="button" class="mini-btn blue w-full !py-2.5" id="bsNew">${ic('plus')}<span>New branch</span></button>`;
        $('bsNew').onclick = () => renderBranchSheet(true);
        return;
    }
    foot.innerHTML = `<div class="text-[12px] font-bold text-gray-300 mb-1">New branch name</div><input id="bsName" class="modern-input !mb-2 font-mono text-xs" placeholder="feature/my-change" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="text-[12px] font-bold text-gray-300 mb-1">Create from</div><select id="bsFrom" class="modern-input !mb-2 font-mono text-xs">${names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select><div class="flex gap-2"><button type="button" id="bsCreate" class="mini-btn blue flex-1 !py-2.5">Create branch</button><button type="button" id="bsCancel" class="mini-btn flex-1 !py-2.5">Cancel</button></div><p id="bsMsg" class="text-[11px] text-red-400 mt-2 break-words"></p>`;
    $('bsFrom').value = activeBranch;
    $('bsCancel').onclick = () => renderBranchSheet(false);
    $('bsCreate').onclick = createBranchNow;
    $('bsName').focus();
}
async function createBranchNow() {
    const name = $('bsName').value.trim(), from = $('bsFrom').value, msg = $('bsMsg'), btn = $('bsCreate');
    msg.textContent = '';
    if (!validBranch(name)) { msg.textContent = 'Invalid name.'; return; }
    if (branchNames.includes(name)) { msg.textContent = 'A branch with this name already exists.'; return; }
    btn.disabled = true; btn.style.opacity = '.6';
    try {
        const sha = await ghResolveCommit(activeRepoId, from);
        await ghJson(`/repos/${activeRepoId}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${name}`, sha }) });
    } catch (e) { msg.textContent = ghHint(e); btn.disabled = false; btn.style.opacity = '1'; return; }
    closeBranchSheet();
    branchNames.push(name);
    const o = document.createElement('option'); o.value = name; o.textContent = name;
    $('branchSelect').appendChild(o);
    $('branchSelect').value = name;
    onBranchChange();
    loadBranches();
    showToast(`Created branch ${name}`);
}
async function renameBranch(old) {
    const nn = await askPrompt(`Rename branch "${old}" to:`, old);
    if (nn === null) return;
    const name = nn.trim();
    if (!name || name === old) return;
    if (!validBranch(name)) return showToast('Invalid branch name.');
    if (branchNames.includes(name)) return showToast('That branch name already exists.');
    const isDef = old === defaultBranchOf(activeRepoId);
    if (isDef && !await askConfirm(`"${old}" is the default branch. Renaming it also renames the default branch of the repository. Continue?`)) return;
    try {
        await ghJson(`/repos/${activeRepoId}/branches/${encodeURIComponent(old)}/rename`, { method: 'POST', body: JSON.stringify({ new_name: name }) });
    } catch (e) { return showToast(ghHint(e)); }
    if (isDef) currentSpacesList.concat(starredList || []).forEach(s => { if (s.id === activeRepoId) s.default_branch = name; });
    try { if (localStorage.getItem('branch_' + activeRepoId) === old) localStorage.setItem('branch_' + activeRepoId, name); } catch (e) {}
    branchNames = branchNames.map(n => n === old ? name : n);
    if (activeBranch === old) { activeBranch = name; updateHeaderLink(); }
    closeBranchSheet();
    loadBranches();
    invalidateVersions();
    showToast(`Renamed ${old} to ${name}`);
}
// Per-branch versions
const ownShaCache = new Map();
async function branchOnlyShas(repo, def, branch) {
    const key = `${repo}|${def}|${branch}`, c = ownShaCache.get(key);
    if (c && Date.now() - c.t < 20000) return c.set;
    const set = new Set();
    for (let p = 1; p <= 3; p++) {
        const r = await ghFetch(`/repos/${repo}/compare/${encPath(def)}...${encPath(branch)}?per_page=100&page=${p}`);
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`GitHub ${r.status}`);
        const j = await r.json();
        (j.commits || []).forEach(x => set.add(x.sha));
        if ((j.commits || []).length < 100 || set.size >= (j.ahead_by || 0)) break;
    }
    ownShaCache.set(key, { t: Date.now(), set });
    return set;
}
