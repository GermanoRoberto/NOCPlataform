class TopologyView {
    render(state) {
        const container = document.getElementById('containerCmdbTopologyView');
        if (!container) return;

        const esc = window.Sanitizer.escape;
        const allLinks = state.links || [];
        const computers = state.computers || [];
        const printers = state.printers || [];

        const siteGroups = {};

        function extractRealCity(link) {
            if (link.city && link.city !== 'NOC' && link.city !== 'Local' && link.city !== 'GATEWAY') return link.city.toUpperCase();
            let name = link.name || '';
            name = name.replace(/^GATEWAY\s*-\s*/i, '').trim();
            const parts = name.split('-');
            return parts[0].trim().toUpperCase();
        }

        allLinks.forEach(l => {
            const cityKey = extractRealCity(l);
            if (!siteGroups[cityKey]) {
                siteGroups[cityKey] = {
                    city: cityKey,
                    links: [],
                    computersCount: 0,
                    printersCount: 0
                };
            }
            siteGroups[cityKey].links.push(l);
        });

        computers.forEach(c => {
            const cityKey = (c.city || 'SPO').toUpperCase();
            if (siteGroups[cityKey]) siteGroups[cityKey].computersCount++;
        });

        printers.forEach(p => {
            const cityKey = (p.city || 'MTZ').toUpperCase();
            if (siteGroups[cityKey]) siteGroups[cityKey].printersCount++;
        });

        const siteKeys = Object.keys(siteGroups);
        if (siteKeys.length === 0) {
            container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-muted);">Carregando topologia CMDB...</div>`;
            return;
        }

        container.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:18px;">
                ${siteKeys.map(k => {
                    const group = siteGroups[k];
                    const hasOffline = group.links.some(l => l.status === 'offline');
                    return `
                        <div class="table-card" style="padding:18px; border-left:4px solid ${hasOffline ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                <div>
                                    <strong style="font-size:15px; color:var(--text-primary);">${esc(group.city)}</strong>
                                    <div style="font-size:11px; color:var(--text-muted);">DrayTek Vigor Gateway Hub</div>
                                </div>
                                <span class="badge ${hasOffline ? 'badge-error' : 'badge-ok'}">
                                    ${hasOffline ? 'ALERTA WAN' : 'NOMINAL'}
                                </span>
                            </div>
                            <div style="font-size:12px; margin-bottom:10px;">
                                <div style="color:var(--text-muted); font-size:11px; margin-bottom:4px; font-weight:700;">CIRCUITOS CONECTADOS:</div>
                                ${group.links.map(l => `
                                    <div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.03);">
                                        <span style="color:${l.status === 'offline' ? 'var(--brand-crimson)' : 'var(--text-primary)'};">${esc(l.name)}</span>
                                        <span class="tabular-nums" style="color:var(--cs-cyan); font-size:11px;">${l.latency !== null ? `${l.latency}ms` : '--'}</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:8px; padding-top:8px; border-top:1px solid var(--glass-border);">
                                <span>Estações: <strong style="color:var(--text-primary);">${group.computersCount}</strong></span>
                                <span>Impressoras: <strong style="color:var(--text-primary);">${group.printersCount}</strong></span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
}
window.topologyView = new TopologyView();
