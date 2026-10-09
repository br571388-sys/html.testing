// ===== Secrets Manager =====
let currentSecretKeys = [];
let _sodiumPromise = null;
function loadSodium() {
    if (!_sodiumPromise) {
        _sodiumPromise = import('https://esm.sh/libsodium-wrappers@0.7.13').then(async (m) => {
            const s = m.default || m;
            await s.ready;
            return s;
        });
    }
    return _sodiumPromise;
}
async function ghSealSecret(value, publicKeyB64) {
    const sodium = await loadSodium();
    const key = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
    const sealed = sodium.crypto_box_seal(sodium.from_string(value), key);
    return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}
async function loadSecrets() {
    if (!activeRepoId) return;
    const token = getToken();
    const list = $('secretsList');
    list.innerHTML = '<div class="text-center text-gray-500 text-sm py-4">Fetching secrets...</div>';
    if (!token) { list.innerHTML = '<div class="text-center text-red-400 text-sm py-4">No token set.</div>'; return; }
    try {
        let secrets;
        if (isGH()) {
            const j = await ghJson(`/repos/${activeRepoId}/actions/secrets?per_page=100`);
            secrets = (j.secrets || []).map(s => ({ key: s.name }));
        } else {
            const res = await fetch(apiUrl(`/api/spaces/${activeRepoId}/secrets`), { headers: authHeaders(token) });
            if (!res.ok) {
                const bodyText = await res.text().catch(() => '');
                throw new Error(`Failed to load secrets (HTTP ${res.status}). ${bodyText ? bodyText.slice(0, 150) : ''}`);
            }
            secrets = await res.json();
            if (!Array.isArray(secrets)) secrets = Object.keys(secrets || {}).map(k => ({ key: k }));
        }
        currentSecretKeys = secrets.map(s => s.key);
        list.innerHTML = '';
        secrets.forEach((sec, idx) => {
            const div = document.createElement('div');
            div.className = "flex gap-2 items-center px-1";
            div.innerHTML = `
                <input type="text" value="${esc(sec.key)}" readonly class="modern-input !mb-0 flex-1 !p-2 bg-[#161b22] border-[#30363d] text-gray-400 font-mono text-[11px] truncate" title="${esc(sec.key)}">
                <div class="flex-1">
                    <span id="sec_display_${idx}" class="modern-input !mb-0 w-full !p-2 bg-[#0d1117] border-[#30363d] font-mono text-[11px] text-gray-500 tracking-widest select-none flex items-center h-[34px]">••••••••</span>
                    <input type="password" id="sec_val_${idx}" placeholder="New value" class="modern-input !mb-0 w-full !p-2 bg-[#0d1117] border-[#30363d] font-mono text-[11px] hidden">
                </div>
                <div class="flex gap-1 w-16 shrink-0 justify-center">
                    <button onclick="toggleSecretEdit(${idx})" id="sec_edit_btn_${idx}" class="bg-[#0e639c] hover:bg-[#1177bb] border border-[#1177bb] text-white rounded p-1.5" title="Edit">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button onclick="deleteSingleSecret(${idx})" class="bg-[#da3633] hover:bg-[#ff7b72] border border-[#ff7b72] text-white rounded p-1.5" title="Delete">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
        if (secrets.length === 0) list.innerHTML = '<div class="text-center text-gray-500 text-xs py-4">No secrets found. Add some below!</div>';
    } catch (e) {
        if (e instanceof TypeError) {
            list.innerHTML = `<div class="text-red-400 text-center py-4 text-sm">Network/CORS error. ${isGH() ? 'Check your token.' : 'Check the proxy URL above.'}</div>`;
        } else {
            list.innerHTML = `<div class="text-red-400 text-center py-4 text-sm">${esc(e.message)}</div>`;
        }
    }
}
function toggleSecretEdit(idx) {
    const display = $(`sec_display_${idx}`);
    const input = $(`sec_val_${idx}`);
    const btn = $(`sec_edit_btn_${idx}`);
    const isEditing = !input.classList.contains('hidden');
    if (!isEditing) {
        display.classList.add('hidden');
        input.classList.remove('hidden');
        input.value = '';
        input.focus();
        btn.title = "Save";
        btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
        btn.setAttribute('onclick', `updateSingleSecret(${idx})`);
    }
}
async function saveSecret(key, value) {
    const token = getToken();
    if (isGH()) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`"${key}" is not a valid secret name`);
        const pk = await ghJson(`/repos/${activeRepoId}/actions/secrets/public-key`);
        const encrypted_value = await ghSealSecret(value, pk.key);
        await ghJson(`/repos/${activeRepoId}/actions/secrets/${encodeURIComponent(key)}`, {
            method: 'PUT', body: JSON.stringify({ encrypted_value, key_id: pk.key_id })
        });
        return;
    }
    const res = await fetch(apiUrl(`/api/spaces/${activeRepoId}/secrets`), {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, description: "" })
    });
    if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        throw new Error(`Failed to save ${key} (HTTP ${res.status})${bodyText ? ': ' + bodyText.slice(0, 150) : ''}`);
    }
}
async function afterSecretChange(msg) {
    if (isGH()) return;
    if (await askConfirm(msg)) restartSpace();
}
async function updateSingleSecret(idx) {
    const key = currentSecretKeys[idx];
    const input = $(`sec_val_${idx}`);
    const val = input.value;
    if (!val) return showToast("Empty value");
    showToast(`Saving ${key}...`);
    try {
        await saveSecret(key, val);
        showToast(`Secret '${key}' updated!`);
        input.value = '';
        input.classList.add('hidden');
        $(`sec_display_${idx}`).classList.remove('hidden');
        const btn = $(`sec_edit_btn_${idx}`);
        btn.title = "Edit";
        btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
        btn.setAttribute('onclick', `toggleSecretEdit(${idx})`);
        afterSecretChange("Secret updated! Restart the space to apply?");
    } catch (e) { showToast("Error updating: " + e.message); }
}
async function deleteSingleSecret(idx) {
    const key = currentSecretKeys[idx];
    if (!await askConfirm(`Delete secret '${key}'?`)) return;
    const token = getToken();
    showToast(`Deleting ${key}...`);
    try {
        let res;
        if (isGH()) {
            res = await ghFetch(`/repos/${activeRepoId}/actions/secrets/${encodeURIComponent(key)}`, { method: 'DELETE' });
        } else {
            res = await fetch(apiUrl(`/api/spaces/${activeRepoId}/secrets`), {
                method: 'DELETE',
                headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
                body: JSON.stringify({ key })
            });
        }
        if (res.ok) { showToast("Secret deleted!"); loadSecrets(); }
        else { throw new Error(`HTTP ${res.status}`); }
    } catch (e) { showToast("Delete failed: " + e.message); }
}
async function addNewSecret() {
    if (!activeRepoId) return showToast("Select a space/repo first!");
    const nameInput = $('newSecretName');
    const valInput = $('newSecretValue');
    const key = nameInput.value.trim();
    const val = valInput.value;
    if (!key) return showToast("Enter a secret name!");
    if (!val) return showToast("Enter a value!");
    showToast(`Adding ${key}...`);
    try {
        await saveSecret(key, val);
        showToast(`Secret '${key}' added!`);
        nameInput.value = '';
        valInput.value = '';
        loadSecrets();
        afterSecretChange("Secret added! Restart the space?");
    } catch (e) { showToast("Error adding: " + e.message); }
}
async function saveBulkSecrets() {
    if (!activeRepoId) return showToast("Select a space/repo first!");
    const text = $('bulkSecretsBox').value;
    if (!text.trim()) return showToast("Box is empty!");
    const lines = text.split('\n');
    let successCount = 0;
    let lastError = "";
    showGlobalProgress("Saving secrets...", `0/${lines.length}`);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const idx = line.indexOf('=');
        if (idx > -1) {
            const key = line.substring(0, idx).trim();
            const val = line.substring(idx + 1).trim();
            if (key && val) {
                try { await saveSecret(key, val); successCount++; }
                catch (e) { lastError = e.message; }
            }
        }
        updateProgressBar(Math.round(((i + 1) / lines.length) * 100));
    }
    hideGlobalProgress();
    if (successCount > 0) {
        $('bulkSecretsBox').value = '';
        showToast(`Saved ${successCount} secrets!`);
        loadSecrets();
        afterSecretChange("Bulk secrets saved! Restart?");
    } else {
        showToast(lastError ? `No secrets saved: ${lastError}` : "No valid format (Secret=value).");
    }
}
