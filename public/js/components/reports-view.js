class ReportsView {
    constructor() {
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const btnExport = document.getElementById('btnExportReportsPdf');
        if (btnExport) {
            btnExport.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.assetDrawer) {
                    window.assetDrawer.openConsolidatedReport('reports');
                } else {
                    window.print();
                }
            });
        }
    }

    async render() {
        this.init();
        const state = window.appStore.getState();
        const esc = window.Sanitizer.escape;

        // 1. Renderizar tabela de Scorecard de Telecom
        const scorecardTbody = document.getElementById('tbodyTelecomScorecard');
        if (scorecardTbody && state.aiops && state.aiops.operatorScorecard) {
            scorecardTbody.innerHTML = state.aiops.operatorScorecard.map(op => `
                <tr>
                    <td>
                        <strong style="color:var(--text-primary); font-size:13px;">${esc(op.operator)}</strong>
                        ${op.circuits && op.circuits.length > 0 ? `
                            <div style="font-size:11px; color:var(--text-muted); margin-top:4px; display:flex; flex-wrap:wrap; gap:6px;">
                                                ${op.circuits.map(c => `<span style="background:rgba(56,189,248,0.08); color:var(--cs-cyan); padding:2px 6px; border-radius:4px; border:1px solid rgba(56,189,248,0.2); font-family:var(--font-mono); font-size:10px;">${esc(c.name || c)}</span>`).join('')}
                                            </div>
                                        ` : ''}
                    </td>
                    <td class="tabular-nums" style="text-align:center; font-weight:700;">${op.totalLinks}</td>
                    <td class="tabular-nums" style="text-align:center; color:var(--brand-emerald); font-weight:700;">${op.online}</td>
                    <td class="tabular-nums" style="text-align:center; color:${op.offline > 0 ? 'var(--brand-crimson)' : 'inherit'}; font-weight:${op.offline > 0 ? '700' : 'normal'};">${op.offline}</td>
                    <td class="tabular-nums" style="text-align:center; font-weight:700;">${op.slaPct}%</td>
                    <td class="tabular-nums" style="text-align:center;">${op.avgLatencyMs} ms</td>
                    <td style="text-align:center;">
                        <span class="badge ${op.healthStatus === 'CRITICAL' ? 'badge-error' : (op.healthStatus === 'WARNING' ? 'badge-warning' : 'badge-ok')}">
                            ${esc(op.healthStatus)}
                        </span>
                    </td>
                </tr>
            `).join('');
        }

        // 2. Resumo de uptime
        try {
            const res = await fetch('/api/reports/summary?linkId=all&range=24h');
            if (!res.ok) return;
            const data = await res.json();
            const elUptime = document.getElementById('reportValUptime');
            const elLatency = document.getElementById('reportValLatency');
            if (elUptime) elUptime.textContent = `${data.uptime}%`;
            if (elLatency) elLatency.textContent = `${data.avgLatency} ms`;
        } catch (e) {}
    }
}
window.reportsView = new ReportsView();
