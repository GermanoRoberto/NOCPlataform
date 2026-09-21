class CommandPalette {
    constructor() {
        this.modal = document.getElementById('modalCommandPalette');
        this.input = document.getElementById('inputCommandPalette');
        this.results = document.getElementById('containerCommandResults');
        this.btnOpen = document.getElementById('btnOpenCommandPalette');
        this.init();
    }

    init() {
        if (this.btnOpen) {
            this.btnOpen.addEventListener('click', () => this.open());
        }

        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape' && this.modal && this.modal.style.display === 'flex') {
                this.close();
            }
        });

        if (this.input) {
            this.input.addEventListener('input', (e) => this.search(e.target.value));
        }

        const btnClose = document.getElementById('btnCloseCommandPalette');
        if (btnClose) btnClose.addEventListener('click', () => this.close());
    }

    open() {
        if (!this.modal) return;
        this.modal.style.display = 'flex';
        if (this.input) {
            this.input.value = '';
            this.input.focus();
        }
        this.search('');
    }

    close() {
        if (this.modal) this.modal.style.display = 'none';
    }

    toggle() {
        if (this.modal && this.modal.style.display === 'flex') this.close();
        else this.open();
    }

    search(query) {
        if (!this.results) return;
        const q = query.toLowerCase().trim();
        const state = window.appStore.getState();
        const esc = window.Sanitizer.escape;

        const items = [];
        (state.links || []).forEach(l => {
            if (!q || (l.name && l.name.toLowerCase().includes(q)) || (l.ip && l.ip.toLowerCase().includes(q))) {
                items.push({ id: l.id, type: 'Circuito WAN', name: l.name, sub: `${l.city || 'Filial'} · IP: ${l.ip || '--'}`, raw: l, kind: 'link' });
            }
        });
        (state.computers || []).forEach(c => {
            if (!q || (c.name && c.name.toLowerCase().includes(q)) || (c.serialNumber && c.serialNumber.toLowerCase().includes(q)) || (c.loggedUser && c.loggedUser.toLowerCase().includes(q))) {
                items.push({ id: c.id, type: 'Estação ITAM', name: c.name, sub: `SN: ${c.serialNumber} · User: ${c.loggedUser}`, raw: c, kind: 'computer' });
            }
        });

        if (items.length === 0) {
            this.results.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-muted);">Nenhum ativo encontrado.</div>`;
            return;
        }

        this.results.innerHTML = items.slice(0, 15).map(item => `
            <div class="command-palette-item" onclick="window.commandPalette.select('${esc(item.id)}', '${item.kind}')" style="padding:10px 14px; border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <div>
                    <strong style="color:var(--text-primary); font-size:13px;">${esc(item.name)}</strong>
                    <div style="font-size:11px; color:var(--text-muted);">${esc(item.sub)}</div>
                </div>
                <span class="badge" style="background:rgba(56,189,248,0.12); color:var(--cs-cyan); font-size:10px;">${esc(item.type)}</span>
            </div>
        `).join('');
    }

    select(id, kind) {
        this.close();
        if (window.assetDrawer) window.assetDrawer.open(id, kind);
    }
}
window.commandPalette = new CommandPalette();
