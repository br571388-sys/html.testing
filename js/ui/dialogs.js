const dlgQueue = []; let dlgBusy = false;
function dlgEnsure() {
    let ov = document.getElementById('dlgOv');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'dlgOv'; ov.className = 'dlg-ov';
    ov.innerHTML = '<div class="dlg" role="dialog" aria-modal="true"><div class="dlg-title" id="dlgTitle"></div><div class="dlg-msg" id="dlgMsg"></div><input id="dlgInput" class="modern-input !mb-0 !mt-3 hidden font-mono text-sm" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><div class="dlg-btns"><button type="button" class="dlg-btn" id="dlgCancel"></button><button type="button" class="dlg-btn ok" id="dlgOk"></button></div></div>';
    document.body.appendChild(ov);
    return ov;
}
function dlgNext() {
    const item = dlgQueue.shift();
    if (!item) { dlgBusy = false; return; }
    dlgBusy = true;
    const c = item.cfg, ov = dlgEnsure();
    const input = document.getElementById('dlgInput'), ok = document.getElementById('dlgOk'), cancel = document.getElementById('dlgCancel');
    document.getElementById('dlgTitle').textContent = c.title;
    document.getElementById('dlgMsg').textContent = c.message;
    input.classList.toggle('hidden', !c.input);
    input.value = c.value || ''; input.placeholder = c.placeholder || '';
    ok.textContent = c.ok; cancel.textContent = c.cancel;
    ok.className = 'dlg-btn ' + (c.danger ? 'danger' : 'ok');
    const finish = (accepted) => {
        ov.classList.remove('open');
        document.removeEventListener('keydown', onKey, true);
        ov.onclick = ok.onclick = cancel.onclick = null;
        item.res(c.input ? (accepted ? input.value : null) : accepted);
        setTimeout(dlgNext, 0);
    };
    const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter' && c.input && e.target === input) { e.preventDefault(); finish(true); }
    };
    document.addEventListener('keydown', onKey, true);
    ok.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    ov.onclick = (e) => { if (e.target === ov) finish(false); };
    ov.classList.add('open');
    setTimeout(() => { if (c.input) { input.focus(); input.select(); } else if (c.danger) cancel.focus(); else ok.focus(); }, 30);
}
function dlgShow(cfg) { return new Promise(res => { dlgQueue.push({ cfg, res }); if (!dlgBusy) dlgNext(); }); }
function askConfirm(message, opts = {}) {
    const m = String(message);
    const danger = opts.danger != null ? opts.danger : /\b(delete|remove|wipe|overwrite|archive)\b|PUBLIC/i.test(m);
    return dlgShow({ message: m, title: opts.title || 'Please confirm', ok: opts.ok || (danger ? 'Yes, continue' : 'OK'), cancel: opts.cancel || 'Cancel', danger, input: false });
}
function askPrompt(message, def = '', opts = {}) {
    const m = String(message);
    const title = opts.title || (/Rename branch/i.test(m) ? 'Rename branch' : /Rename/i.test(m) ? 'Rename folder' : /folder/i.test(m) ? 'New folder' : /file/i.test(m) ? 'New file' : 'Enter a value');
    return dlgShow({ message: m, title, ok: opts.ok || (/Rename/i.test(m) ? 'Rename' : 'Create'), cancel: 'Cancel', danger: false, input: true, value: def, placeholder: opts.placeholder || '' });
}
function askForm(cfg) {
    return new Promise((resolve) => {
        const ov = document.createElement('div');
        ov.className = 'dlg-ov open';
        const box = document.createElement('div');
        box.className = 'dlg';
        box.innerHTML = `<div class="dlg-title">${esc(cfg.title)}</div>` + (cfg.message ? `<div class="dlg-msg">${esc(cfg.message)}</div>` : '') + '<div class="frm-fields"></div><div class="dlg-btns"><button type="button" class="dlg-btn" data-r="c">Cancel</button><button type="button" class="dlg-btn ok" data-r="o"></button></div>';
        box.querySelector('[data-r="o"]').textContent = cfg.ok || 'OK';
        const fields = box.querySelector('.frm-fields');
        const getters = {};
        cfg.fields.forEach((f, i) => {
            const w = document.createElement('div');
            w.className = 'mt-3';
            const id = 'frmf' + i;
            w.innerHTML = `<label class="text-[12px] font-bold text-gray-300 block mb-1" for="${id}">${esc(f.label || f.key)}${f.required ? ' <span class="text-red-400">*</span>' : ''}</label>` + (f.description ? `<p class="text-[11px] text-gray-500 mb-1">${esc(f.description)}</p>` : '');
            if (f.type === 'boolean') {
                let on = String(f.default) === 'true';
                const t = document.createElement('button'); t.type = 'button'; t.className = 'tgl' + (on ? ' on' : '');
                t.onclick = () => { on = !on; t.classList.toggle('on', on); };
                w.appendChild(t); getters[f.key] = () => String(on);
            } else if (f.type === 'choice') {
                const s = document.createElement('select'); s.id = id; s.className = 'modern-input !mb-0 font-mono text-xs';
                (f.options || []).forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = o; s.appendChild(op); });
                if (f.default != null && (f.options || []).includes(String(f.default))) s.value = String(f.default);
                w.appendChild(s); getters[f.key] = () => s.value;
            } else {
                const inp = document.createElement('input'); inp.id = id; inp.className = 'modern-input !mb-0 font-mono text-xs';
                inp.type = f.type === 'number' ? 'number' : 'text'; inp.value = f.default != null ? String(f.default) : '';
                inp.autocomplete = 'off'; inp.autocapitalize = 'off'; inp.spellcheck = false;
                w.appendChild(inp); getters[f.key] = () => inp.value;
            }
            fields.appendChild(w);
        });
        const msg = document.createElement('p'); msg.className = 'text-[11px] text-red-400 mt-3'; fields.appendChild(msg);
        const done = (v) => { ov.remove(); resolve(v); };
        box.querySelector('[data-r="c"]').onclick = () => done(null);
        box.querySelector('[data-r="o"]').onclick = () => {
            const out = {};
            for (const f of cfg.fields) {
                const v = getters[f.key]();
                if (f.required && !String(v).trim()) { msg.textContent = `"${f.label || f.key}" is required.`; return; }
                out[f.key] = v;
            }
            done(out);
        };
        ov.onclick = (e) => { if (e.target === ov) done(null); };
        ov.appendChild(box);
        document.body.appendChild(ov);
    });
}
