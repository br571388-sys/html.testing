// ===== Accounts & Sidebar =====
function loadSavedAccounts(autoLoad = true) {
    savedAccounts = JSON.parse(localStorage.getItem(accountsKey()) || '[]');
    const container = $('savedAccountsContainer');
    const list = $('savedAccountsList');
    list.innerHTML = '';
    if (savedAccounts.length > 0) {
        container.classList.remove('hidden');
        const activeToken = getToken();
        savedAccounts.forEach((acc, i) => {
            const chip = document.createElement('div');
            chip.className = 'chip' + ((currentUsername && acc.token === activeToken) ? ' active' : '');
            const nameBtn = document.createElement('button');
            nameBtn.className = 'chip-name';
            nameBtn.innerHTML = ic('user', 'ic-sm') + '<span>' + esc(acc.name) + '</span>';
            nameBtn.onclick = () => { $('apiToken').value = acc.token; loadUserProfile(); };
            const xBtn = document.createElement('button');
            xBtn.className = 'chip-x'; xBtn.title = 'Remove';
            xBtn.innerHTML = ic('x', 'ic-sm');
            xBtn.onclick = (e) => { e.stopPropagation(); removeAccount(i); };
            chip.appendChild(nameBtn); chip.appendChild(xBtn);
            list.appendChild(chip);
        });
        if (autoLoad && !currentUsername) { $('apiToken').value = savedAccounts[0].token; loadUserProfile(); }
    } else container.classList.add('hidden');
}
async function removeAccount(i) {
    const acc = savedAccounts[i];
    if (!acc) return;
    if (!await askConfirm(`Remove saved account "${acc.name}"?`)) return;
    savedAccounts.splice(i, 1);
    localStorage.setItem(accountsKey(), JSON.stringify(savedAccounts));
    if (acc.token === getToken()) { flushDraft(); clearSession(); }
    loadSavedAccounts(false);
    showToast('Account removed');
}
async function loadUserProfile() {
    const token = getToken();
    if (!token) return showToast("Enter " + (isGH() ? "GitHub" : "HF") + " Token first!");
    const myProvider = provider;
    showToast("Validating token...");
    try {
        let name, spaces;
        if (!isGH()) {
            const whoamiRes = await fetch('https://huggingface.co/api/whoami-v2', { headers: authHeaders(token) });
            if (!whoamiRes.ok) throw new Error("Invalid API token");
            name = (await whoamiRes.json()).name;
            const spacesRes = await fetch(`https://huggingface.co/api/spaces?author=${name}&limit=100`, { headers: authHeaders(token) });
            spaces = await spacesRes.json();
        } else {
            const u = await ghJson('/user');
            name = u.login;
            spaces = await ghListRepos();
        }
        if (myProvider !== provider) return;
        currentUsername = name;
        $('accountNameDisplay').innerText = `Logged in: ${currentUsername}`;
        const existIndex = savedAccounts.findIndex(a => a.token === token);
        if (existIndex > -1) savedAccounts[existIndex].name = currentUsername;
        else savedAccounts.unshift({ token: token, name: currentUsername });
        localStorage.setItem(accountsKey(), JSON.stringify(savedAccounts));
        loadSavedAccounts();
        currentSpacesList = spaces;
        renderSidebarSpaces();
        showToast(`Loaded ${currentSpacesList.length} ${isGH() ? 'repos' : 'spaces'}!`);
        restoreAppState();
    } catch (e) { showToast("Login failed: " + e.message); }
}
function restoreAppState() {
    const lastSpace = localStorage.getItem(lastSpaceKey());
    if (lastSpace && !activeRepoId && currentSpacesList.some(s => s.id === lastSpace)) selectSpace(lastSpace, { silent: true });
    const lastTab = localStorage.getItem('hf_last_tab');
    if (lastTab) switchTab(lastTab);
}
function renderSidebarSpaces() {
    const gh = isGH();
    $('sideViews').classList.toggle('hidden', !gh);
    if (!gh) sideView = 'repos';
    document.querySelectorAll('#sideViews button').forEach(b => b.classList.toggle('active', b.dataset.v === sideView));
    const list = $('spacesList');
    list.innerHTML = '';
    const q = ($('spaceFilter').value || '').toLowerCase();
    const msg = (t) => { list.innerHTML = `<p class="text-xs text-gray-500 text-center mt-10">${t}</p>`; };
    if (gh && sideView === 'gists') {
        if (gistList === null) return msg('Loading gists...');
        const items = gistList.filter(g => !q || (g.description || '').toLowerCase().includes(q));
        if (!gistList.length) return msg(esc(gistHelp()));
        if (!items.length) return msg('No gists match.');
        if (gistPartialNote()) list.insertAdjacentHTML('beforeend', `<p class="text-[11px] text-yellow-500">${esc(gistPartialNote())}</p>`);
        items.forEach(g => list.appendChild(gistCard(g)));
        return;
    }
    let src = (gh && sideView === 'repos') ? currentSpacesList.filter(s => !s.fork) : currentSpacesList;
    if (gh && sideView === 'forks') src = src.filter(s => s.fork);
    if (gh && sideView === 'stars') { if (starredList === null) return msg('Loading stars...'); src = starredList; }
    const items = src.filter(sp => sp.id.toLowerCase().includes(q));
    if (!items.length) return msg('Nothing to show.');
    items.forEach(space => {
        const owner = space.id.split('/')[0];
        const label = (gh && owner !== currentUsername) ? space.id : shortName(space.id);
        const btn = document.createElement('button');
        btn.className = "w-full text-left bg-gray-800 hover:bg-gray-700 border p-2 rounded-lg text-[13px] text-gray-200 shrink-0 flex items-center gap-2 " + (space.id === activeRepoId ? 'border-blue-500' : 'border-gray-700');
        const lead = (gh && sideView === 'stars') ? ic('star', 'ic-sm text-yellow-400') : (gh && sideView === 'forks') ? ic('git-fork', 'ic-sm text-blue-400') : ic('folder', 'ic-sm text-blue-400');
        btn.innerHTML = `${lead}<span class="truncate flex-1">${esc(label)}</span>${space.private ? ic('lock', 'ic-sm text-gray-500') : ''}`;
        btn.onclick = () => selectSpace(space.id);
        btn.classList.remove('w-full'); btn.classList.add('flex-1', 'min-w-0');
        const row = document.createElement('div');
        row.className = 'flex items-stretch gap-1.5 shrink-0';
        row.appendChild(btn);
        if (!gh || sideView === 'repos' || sideView === 'forks') {
            const gear = document.createElement('button');
            gear.type = 'button'; gear.className = 'icon-btn !h-auto !w-10'; gear.title = 'Settings';
            gear.innerHTML = ic('settings');
            gear.onclick = (ev) => { ev.stopPropagation(); openRepoSettings(space.id); };
            row.appendChild(gear);
        }
        list.appendChild(row);
    });
}
let sideView = 'repos', starredList = null;
function setSideView(v) {
    sideView = v;
    renderSidebarSpaces();
    if (v === 'stars' && starredList === null) loadStarred();
    if (v === 'gists' && gistList === null) loadGists();
}
async function loadStarred() {
    try {
        let all = [];
        for (let p = 1; p <= 5; p++) {
            const part = await ghJson(`/user/starred?per_page=100&page=${p}`);
            all = all.concat(part);
            if (part.length < 100) break;
        }
        starredList = all.map(r => ({ id: r.full_name, default_branch: r.default_branch, private: r.private, fork: r.fork, has_pages: r.has_pages }));
    } catch (e) { showToast("Couldn't load stars: " + e.message); starredList = []; }
    renderSidebarSpaces();
}
async function loadGists() {
    try { gistList = await fetchGists(); }
    catch (e) { gistDiag.error = e.message; gistList = []; }
    renderSidebarSpaces();
    if (settingsView === 'livegists') renderSettings();
}
