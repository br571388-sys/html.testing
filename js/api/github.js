// ===== GitHub API Layer =====
const GH_API = 'https://api.github.com';
function ghHeaders(t, extra = {}) {
    return { 'Authorization': `Bearer ${t}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...extra };
}
async function ghFetch(path, opts = {}) {
    const headers = { ...ghHeaders(getToken()), ...(opts.headers || {}) };
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(path.startsWith('http') ? path : GH_API + path, { ...opts, headers, cache: 'no-store' });
}
async function ghJson(path, opts) {
    const res = await ghFetch(path, opts);
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = body;
        try { msg = JSON.parse(body).message || body; } catch (_) {}
        throw new Error(`GitHub ${res.status}: ${String(msg).slice(0, 200)}`);
    }
    return res.status === 204 ? null : res.json();
}
async function ghListRepos() {
    let all = [];
    for (let page = 1; page <= 10; page++) {
        const part = await ghJson(`/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner`);
        all = all.concat(part);
        if (part.length < 100) break;
    }
    return all.map(r => ({ id: r.full_name, default_branch: r.default_branch, private: r.private, fork: r.fork, has_pages: r.has_pages }));
}
async function ghResolveCommit(repo, ref) {
    if (/^[0-9a-f]{40}$/i.test(ref)) return ref;
    const j = await ghJson(`/repos/${repo}/git/ref/heads/${encPath(ref)}`);
    return j.object.sha;
}
async function ghCommit({ repo, branch, message, upserts = [], deletes = [], onProgress }) {
    const headSha = await ghResolveCommit(repo, branch);
    const head = await ghJson(`/repos/${repo}/git/commits/${headSha}`);
    const entries = [];
    const total = upserts.filter(u => !u.sha).length;
    let done = 0;
    await runConcurrent(upserts, GH_CONCURRENCY, async (u) => {
        if (u.sha) { entries.push({ path: u.path, mode: u.mode || '100644', type: 'blob', sha: u.sha }); return; }
        const b64 = (typeof u.content === 'string') ? utf8ToBase64(u.content) : await blobToBase64(u.content);
        const blob = await ghJson(`/repos/${repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: b64, encoding: 'base64' }) });
        entries.push({ path: u.path, mode: u.mode || '100644', type: 'blob', sha: blob.sha });
        done++;
        if (onProgress) onProgress(done, total, u.path);
    });
    deletes.forEach(p => entries.push({ path: p, mode: '100644', type: 'blob', sha: null }));
    if (!entries.length) throw new Error('Nothing to commit');
    const tree = await ghJson(`/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: entries }) });
    if (tree.sha === head.tree.sha) return { unchanged: true, sha: headSha };
    const commit = await ghJson(`/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }) });
    await ghJson(`/repos/${repo}/git/refs/heads/${encPath(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    return { unchanged: false, sha: commit.sha };
}
