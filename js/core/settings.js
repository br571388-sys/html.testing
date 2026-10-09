// ===== SETTINGS =====
const SETTINGS_KEY = 'app_settings';
const SETTINGS_SCHEMA = [
    { id: 'editor', title: 'Editor / Code space', icon: 'code', items: [
        { key: 'treeStyle', label: 'File tree style', type: 'choice', default: 'expanded',
          desc: 'Expanded: every folder open. Collapsed: folders closed until you tap them. Folders: one folder at a time.',
          options: [
              { value: 'expanded', label: 'Expanded', icon: 'layers' },
              { value: 'collapsed', label: 'Collapsed', icon: 'chevron-right' },
              { value: 'folders', label: 'Folders', icon: 'folder' }
          ] }
    ] }
];
let settings = {};
function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) {}
    settings = {};
    SETTINGS_SCHEMA.forEach(sec => sec.items.forEach(it => { settings[it.key] = (it.key in saved) ? saved[it.key] : it.default; }));
}
function getSetting(key) { return settings[key]; }
let settingsView = 'home';
function setSetting(key, value) {
    settings[key] = value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
    renderSettings();
}
function openSettings() {
    if (document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
    settingsView = 'home';
    renderSettings();
    document.getElementById('settingsPage').classList.add('open');
}
function closeSettings() { document.getElementById('settingsPage').classList.remove('open'); }
function settingsGo(v) { settingsView = v; if (v === 'livepages') lpRepo = null; if (v === 'livegists') gistList = null; renderSettings(); }
function settingsBack() {
    if (settingsView === 'home') return closeSettings();
    settingsView = (settingsView === 'livepages' || settingsView === 'livegists') ? 'resources' : 'home';
    renderSettings();
}
function settingsNavRow(icon, title, desc, view) {
    const b = document.createElement('button');
    b.className = 'w-full flex items-center gap-3 text-left bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-3 active:bg-[#21262d]';
    b.innerHTML = `<span class="text-blue-400">${ic(icon)}</span><span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-gray-100">${esc(title)}</span><span class="block text-[11px] text-gray-500">${esc(desc)}</span></span><span class="text-gray-500">${ic('chevron-right')}</span>`;
    b.onclick = () => settingsGo(view);
    return b;
}
function renderSettingItem(it, body) {
    const wrap = document.createElement('div');
    wrap.className = 'mb-5';
    const val = settings[it.key];
    if (it.type === 'toggle') {
        wrap.innerHTML = `<div class="flex items-center justify-between gap-3"><div><div class="text-sm font-semibold text-gray-200">${esc(it.label)}</div><p class="text-[11px] text-gray-500">${esc(it.desc || '')}</p></div><button class="tgl ${val ? 'on' : ''}" aria-label="${esc(it.label)}"></button></div>`;
        wrap.querySelector('.tgl').onclick = () => setSetting(it.key, !val);
    } else {
        wrap.innerHTML = `<div class="text-sm font-semibold text-gray-200">${esc(it.label)}</div><p class="text-[11px] text-gray-500 mb-2">${esc(it.desc || '')}</p><div class="seg"></div>`;
        const seg = wrap.querySelector('.seg');
        it.options.forEach(o => {
            const b = document.createElement('button');
            b.className = (val === o.value) ? 'active' : '';
            b.innerHTML = (o.icon ? ic(o.icon) : '') + '<span>' + esc(o.label) + '</span>';
            b.onclick = () => setSetting(it.key, o.value);
            seg.appendChild(b);
        });
    }
    body.appendChild(wrap);
}
function renderSettings() {
    const body = document.getElementById('settingsBody');
    if (!body) return;
    body.innerHTML = '';
    const titles = { home: 'Settings', editor: 'Code space', resources: 'My Resources', livepages: 'Live pages', livegists: 'Live gists' };
    document.getElementById('settingsTitle').innerText = titles[settingsView] || 'Settings';
    if (settingsView === 'home') {
        body.appendChild(settingsNavRow('code', 'Code space', 'Editor settings: file tree style', 'editor'));
        body.appendChild(settingsNavRow('layers', 'My Resources', 'Live pages, live gists', 'resources'));
        const foot = document.createElement('p');
        foot.className = 'text-[10px] text-gray-600 mt-4';
        foot.innerText = 'Settings are saved on this device.';
        body.appendChild(foot);
    } else if (settingsView === 'editor') {
        SETTINGS_SCHEMA.filter(s => s.id === 'editor').forEach(sec => sec.items.forEach(it => renderSettingItem(it, body)));
    } else if (settingsView === 'resources') {
        body.appendChild(settingsNavRow('globe', 'Live pages', 'Live GitHub Pages links, by repository', 'livepages'));
        body.appendChild(settingsNavRow('file-text', 'Live gists', 'All your gists with preview and raw links', 'livegists'));
    } else if (settingsView === 'livepages') {
        renderLivePages(body);
    } else if (settingsView === 'livegists') {
        renderLiveGists(body);
    }
}
loadSettings();
