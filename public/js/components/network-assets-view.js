class NetworkAssetsView {
    render(state) {
        const tbody = document.getElementById('tbodyDraytekTable');
        if (!tbody) return;

        const esc = window.Sanitizer.escape;
        const assets = (state.links || []).filter(l => {
            const name = (l.name || '').toLowerCase();
            return name.includes('gateway') || name.includes('draytek') || name.includes('cisco') || name.includes('switch') || l.isV8Protected;
        });

        if (assets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhum ativo de rede encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = assets.map(a => `
            <tr onclick="window.assetDrawer.open('${esc(a.id)}', 'link')" style="cursor:pointer;">
                <td>
                    <span class="badge ${a.status === 'offline' ? 'badge-error' : 'badge-ok'}">
                        ${(a.status || 'online').toUpperCase()}
                    </span>
                </td>
                <td>
                    <div style="font-weight:700; color:var(--text-primary);">${esc(a.name)}</div>
                    <div style="font-size:10px; color:#60a5fa; font-weight:700;">REGRA V8 — INFRAESTRUTURA IMUTÁVEL</div>
                </td>
                <td class="tabular-nums" style="font-size:12px; color:var(--cs-cyan);">${esc(a.ip || '--')}</td>
                <td style="font-size:12px;">DrayTek Vigor / Cisco Switch</td>
                <td>
                    ${a.ip ? `
                        <a href="https://${esc(a.ip)}" target="_blank" rel="noopener noreferrer" class="btn-ui" style="padding:3px 8px; font-size:11px;" onclick="event.stopPropagation();">
                            Abrir Web GUI ↗
                        </a>
                    ` : '<span style="color:var(--text-muted); font-size:11px;">Sem IP Web</span>'}
                </td>
            </tr>
        `).join('');
    }
}
window.networkAssetsView = new NetworkAssetsView();
