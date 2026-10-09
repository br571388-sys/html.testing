function treeFileIcon(path) {
    const k = getBinaryKind(path);
    if (k === 'image') return ic('eye', 'text-purple-400');
    if (k === 'audio') return ic('play', 'text-pink-400');
    if (k === 'video') return ic('play', 'text-orange-400');
    if (k === 'pdf') return ic('file-text', 'text-red-400');
    return ic('file', 'text-gray-400');
}
function renderFileTree(container, files, clickCallback, options = {}) {
    const style = getSetting('treeStyle');
    if (style === 'folders') return renderFolderView(container, files, clickCallback, options);
    if (style === 'collapsed') {
        const all = new Set();
        files.forEach(f => { const p = f.path.split('/'); p.pop(); let acc = ''; p.forEach(s => { acc = acc ? acc + '/' + s : s; all.add(acc); }); });
        return renderExpandedTree(container, files, clickCallback, { ...options, collapsed: [...all], onCollapseChange: null });
    }
    return renderExpandedTree(container, files, clickCallback, options);
}
function addFileRowTo(parentEl, paddingLeft, folderPath, onAddFile) {
    const div = document.createElement('div');
    div.className = 'file-item text-blue-400 font-bold';
    div.style.paddingLeft = `${paddingLeft}px`;
    div.innerHTML = `${ic('plus')}<span>Add File${folderPath ? ' here' : ''}</span>`;
    div.onclick = () => { closeModal('fileTreeModal'); onAddFile(folderPath); };
    parentEl.appendChild(div);
    if (!gistMode) {
        const fd = document.createElement('div');
        fd.className = 'file-item text-blue-400 font-bold';
        fd.style.paddingLeft = `${paddingLeft}px`;
        fd.innerHTML = `${ic('folder')}<span>New Folder${folderPath ? ' here' : ''}</span>`;
        fd.onclick = () => { closeModal('fileTreeModal'); promptNewFolder(folderPath); };
        parentEl.appendChild(fd);
    }
}
function renderExpandedTree(container, files, clickCallback, options = {}) {
    container.innerHTML = '';
    const allowAdd = !!options.allowAdd;
    const onAddFile = options.onAddFile;
    const collapsed = new Set(options.collapsed || []);
    if (files.length === 0) {
        if (allowAdd) addFileRowTo(container, 12, '', onAddFile);
        else container.innerHTML = '<div class="text-gray-500 text-sm p-4">No files found.</div>';
        return;
    }
    const root = {};
    files.forEach(f => {
        const parts = f.path.split('/');
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!current[part]) current[part] = (i === parts.length - 1) ? { _isFile: true, path: f.path } : {};
            current = current[part];
        }
    });
    function buildDOM(node, parentEl, depth, folderPath) {
        const keys = Object.keys(node).filter(k => k !== '_isFile' && k !== 'path');
        keys.sort((a, b) => {
            const aIsFile = node[a]._isFile ? 1 : 0;
            const bIsFile = node[b]._isFile ? 1 : 0;
            if (aIsFile !== bIsFile) return aIsFile - bIsFile;
            return a.localeCompare(b);
        });
        keys.forEach(key => {
            const child = node[key];
            const paddingLeft = depth * 16 + 12;
            const childFolderPath = folderPath ? `${folderPath}/${key}` : key;
            if (child._isFile) {
                const div = document.createElement('div');
                div.className = 'file-item';
                div.style.paddingLeft = `${paddingLeft}px`;
                div.innerHTML = `${treeFileIcon(child.path)}<span class="truncate">${esc(key)}</span>${fileActs(allowAdd)}`;
                div.onclick = (e) => { const a = e.target.closest('[data-act]'); closeModal('fileTreeModal'); if (a) { fileAct(a.dataset.act, child.path); return; } clickCallback(child.path); };
                parentEl.appendChild(div);
            } else {
                const isCollapsed = collapsed.has(childFolderPath);
                const folderDiv = document.createElement('div');
                folderDiv.className = 'file-item folder-item';
                applyFolderTone(folderDiv, depth);
                folderDiv.style.paddingLeft = `${paddingLeft}px`;
                folderDiv.innerHTML = `${ic('folder')}<span class="truncate font-bold">${esc(key)}</span><span class="chev ml-auto transition-transform duration-200" style="transform:rotate(${isCollapsed ? -90 : 0}deg)">${ic('chevron-down', 'ic-sm')}</span>${renBtn(allowAdd)}`;
                const contentDiv = document.createElement('div');
                if (isCollapsed) contentDiv.classList.add('hidden');
                folderDiv.onclick = (e) => {
                    if (e.target.closest('[data-ren]')) { closeModal('fileTreeModal'); promptRenameFolder(childFolderPath); return; }
                    if (e.target.closest('[data-del]')) { closeModal('fileTreeModal'); promptDeleteFolder(childFolderPath); return; }
                    const nowHidden = contentDiv.classList.toggle('hidden');
                    folderDiv.querySelector('.chev').style.transform = `rotate(${nowHidden ? -90 : 0}deg)`;
                    if (nowHidden) collapsed.add(childFolderPath); else collapsed.delete(childFolderPath);
                    if (options.onCollapseChange) options.onCollapseChange([...collapsed]);
                };
                parentEl.appendChild(folderDiv);
                parentEl.appendChild(contentDiv);
                buildDOM(child, contentDiv, depth + 1, childFolderPath);
                if (allowAdd) addFileRowTo(contentDiv, depth * 16 + 28, childFolderPath, onAddFile);
            }
        });
    }
    buildDOM(root, container, 0, '');
    if (allowAdd) addFileRowTo(container, 12, '', onAddFile);
}
function renderFolderView(container, files, clickCallback, options = {}) {
    const allowAdd = !!options.allowAdd;
    let cur = options.startPath || '';
    if (cur && !files.some(f => f.path.startsWith(cur + '/'))) cur = '';
    function draw() {
        if (options.onNavigate) options.onNavigate(cur);
        container.innerHTML = '';
        const bar = document.createElement('div');
        bar.className = 'flex flex-wrap items-center gap-1 px-3 py-2 text-xs font-mono bg-[#161b22] border-b border-[#30363d]';
        bar.style.position = 'sticky'; bar.style.top = '0'; bar.style.zIndex = '2';
        const parts = cur ? cur.split('/') : [];
        const addCrumb = (label, path, isLast) => {
            const b = document.createElement('button');
            b.className = isLast ? 'text-gray-200 font-bold' : 'text-blue-400';
            b.innerText = label;
            if (!isLast) b.onclick = () => { cur = path; draw(); };
            bar.appendChild(b);
        };
        addCrumb('root', '', parts.length === 0);
        let acc = '';
        parts.forEach((part, i) => {
            acc = acc ? acc + '/' + part : part;
            const sep = document.createElement('span'); sep.className = 'text-gray-600'; sep.innerHTML = ic('chevron-right', 'ic-sm');
            bar.appendChild(sep);
            addCrumb(part, acc, i === parts.length - 1);
        });
        container.appendChild(bar);
        const prefix = cur ? cur + '/' : '';
        const folders = new Map();
        const here = [];
        files.forEach(f => {
            if (!f.path.startsWith(prefix)) return;
            const rest = f.path.slice(prefix.length);
            const idx = rest.indexOf('/');
            if (idx === -1) here.push({ name: rest, path: f.path });
            else { const n = rest.slice(0, idx); folders.set(n, (folders.get(n) || 0) + 1); }
        });
        if (cur) {
            const up = document.createElement('div');
            up.className = 'file-item folder-item';
            up.innerHTML = `${ic('corner-left-up', 'text-blue-400')}<span class="font-bold text-blue-300">..</span>`;
            up.onclick = () => { cur = dirname(cur); draw(); };
            container.appendChild(up);
        }
        [...folders.keys()].sort((a, b) => a.localeCompare(b)).forEach(name => {
            const row = document.createElement('div');
            row.className = 'file-item folder-item';
            applyFolderTone(row, cur ? cur.split('/').length : 0);
            row.innerHTML = `${ic('folder')}<span class="truncate font-bold">${esc(name)}</span><span class="ml-auto flex items-center gap-1 text-[10px] text-gray-500">${folders.get(name)}${ic('chevron-right', 'ic-sm')}</span>${renBtn(allowAdd)}`;
            row.onclick = (e) => {
                if (e.target.closest('[data-ren]')) { closeModal('fileTreeModal'); promptRenameFolder(prefix + name); return; }
                if (e.target.closest('[data-del]')) { closeModal('fileTreeModal'); promptDeleteFolder(prefix + name); return; }
                cur = prefix + name; draw();
            };
            container.appendChild(row);
        });
        here.sort((a, b) => a.name.localeCompare(b.name)).forEach(f => {
            const row = document.createElement('div');
            row.className = 'file-item';
            row.innerHTML = `${treeFileIcon(f.path)}<span class="truncate">${esc(f.name)}</span>${fileActs(allowAdd)}`;
            row.onclick = (e) => { const a = e.target.closest('[data-act]'); closeModal('fileTreeModal'); if (a) { fileAct(a.dataset.act, f.path); return; } clickCallback(f.path); };
            container.appendChild(row);
        });
        if (allowAdd) addFileRowTo(container, 12, cur, options.onAddFile);
        if (!folders.size && !here.length && !allowAdd) {
            const empty = document.createElement('div');
            empty.className = 'text-gray-500 text-sm p-4'; empty.innerText = 'Empty folder.';
            container.appendChild(empty);
        }
        container.scrollTop = 0;
    }
    draw();
}
function applyFolderTone(el, depth) {
    const l = Math.min(52 + depth * 14, 92);
    el.style.color = `hsl(205 90% ${l}%)`;
    el.style.borderLeftColor = `hsl(205 90% ${l}% / .7)`;
    el.style.background = `hsl(205 90% ${l}% / .07)`;
}
function renBtn(on) {
    return on ? `<span class="row-acts"><button type="button" data-ren class="ren-btn" title="Rename folder">${ic('edit', 'ic-sm')}</button><button type="button" data-del class="ren-btn" title="Delete folder">${ic('trash', 'ic-sm')}</button></span>` : '';
}
const fileActs = (on) => on ? `<span class="row-acts"><button type="button" data-act="rename" class="ren-btn" title="Rename file">${ic('edit', 'ic-sm')}</button><button type="button" data-act="delete" class="ren-btn" title="Delete file">${ic('trash', 'ic-sm')}</button></span>` : '';
function fileAct(act, path) { if (act === 'rename') promptRenameFile(path); else if (act === 'delete') promptDeleteFile(path); }
function cleanFolderPath(s) { return String(s || '').trim().replace(/^\/+|\/+$/g, ''); }
function badFolderPath(p) { return !p || /[\\:*?"<>|]/.test(p) || p.split('/').some(s => !s || s === '.' || s === '..'); }
const baseName = (p) => String(p).split('/').pop();
const dirName = (p) => { const i = String(p).lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
