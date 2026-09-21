class IncidentsView {
    constructor() {
        this.initialized = false;
        this.incidents = [];
        this.activeFilter = 'all'; // 'all', 'sla', 'blip'
        this.searchTerm = '';
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const btnRefresh = document.getElementById('btnRefreshIncidents');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', async () => {
                const originalText = btnRefresh.innerHTML;
                btnRefresh.innerHTML = '<svg style="width:14px; height:14px; animation:spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Atualizando...';
                await this.render();
                btnRefresh.innerHTML = originalText;
            });
        }

        // Filter chips (all, sla, blip)
        const filterContainer = document.getElementById('containerIncidentFilters');
        if (filterContainer) {
            filterContainer.addEventListener('click', (e) => {
                const chip = e.target.closest('[data-filter-incident]');
                if (!chip) return;
                filterContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.activeFilter = chip.getAttribute('data-filter-incident');
                this.renderList();
            });
        }

        // Live Search Input
        const searchInput = document.getElementById('inputSearchIncidents');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = (e.target.value || '').trim().toLowerCase();
                this.renderList();
            });
        }

        // PDF Export button
        const btnExport = document.getElementById('btnExportIncidentsPdf');
        if (btnExport) {
            btnExport.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.assetDrawer) {
                    window.assetDrawer.openConsolidatedReport('incidents');
                } else {
                    this.exportAuditPdf();
                }
            });
        }
    }

    formatDurationMs(ms) {
        if (!ms || ms <= 0) return '0s';
        const totalSec = Math.floor(ms / 1000);
        const hours = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;

        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (mins > 0 || hours > 0) parts.push(`${mins}m`);
        parts.push(`${secs}s`);
        return parts.join(' ');
    }

    formatDate(dateStr) {
        if (!dateStr) return 'Em andamento';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (e) {
            return dateStr;
        }
    }

    updateKpis() {
        const total = this.incidents.length;
        const slaBreaches = this.incidents.filter(i => (i.duration_ms || 0) >= 60000 || i.status === 'active').length;
        const blips = this.incidents.filter(i => (i.duration_ms || 0) < 60000 && i.status !== 'active').length;
        const totalDowntimeMs = this.incidents.reduce((acc, cur) => acc + (cur.duration_ms || 0), 0);

        const elTotal = document.getElementById('kpiIncidentsTotal');
        const elSla = document.getElementById('kpiIncidentsSlaBreach');
        const elBlips = document.getElementById('kpiIncidentsBlips');
        const elDowntime = document.getElementById('kpiIncidentsTotalDowntime');

        if (elTotal) elTotal.textContent = total;
        if (elSla) elSla.textContent = slaBreaches;
        if (elBlips) elBlips.textContent = blips;
        if (elDowntime) elDowntime.textContent = this.formatDurationMs(totalDowntimeMs);
    }

    async render() {
        this.init();
        const container = document.getElementById('containerIncidentsTimeline');
        if (!container) return;

        try {
            const res = await fetch('/api/incidents?limit=100');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.incidents = Array.isArray(data) ? data : [];
            this.updateKpis();
            this.renderList();
        } catch (e) {
            console.warn('[INCIDENTS] Falha temporária ao carregar incidentes:', e);
            if (this.incidents && this.incidents.length > 0) {
                this.updateKpis();
                this.renderList();
            } else {
                container.innerHTML = `
                    <div style="padding:32px 20px; text-align:center;">
                        <svg style="width:32px; height:32px; color:var(--cs-cyan); margin:0 auto;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        <div style="font-size:14px; font-weight:700; color:var(--text-primary); margin-top:8px;">Atualizando Registros de Incidentes...</div>
                        <p style="font-size:12px; color:var(--text-muted); margin:4px 0 16px 0;">Sincronizando telemetria com a base operacional.</p>
                        <button onclick="window.incidentsView.render()" class="btn-ui" style="background:rgba(56,189,248,0.15); border-color:var(--cs-cyan); color:var(--cs-cyan); cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                            <svg style="width:13px; height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            Recarregar Dados
                        </button>
                    </div>
                `;
                // Auto-retry uma vez em 2s
                setTimeout(() => {
                    fetch('/api/incidents?limit=100').then(r => r.json()).then(data => {
                        if (Array.isArray(data) && data.length > 0) {
                            this.incidents = data;
                            this.updateKpis();
                            this.renderList();
                        }
                    }).catch(() => {});
                }, 2000);
            }
        }
    }

    renderList() {
        const container = document.getElementById('containerIncidentsTimeline');
        if (!container) return;
        const esc = (window.Sanitizer && window.Sanitizer.escape) ? window.Sanitizer.escape : (s => String(s || ''));

        // Apply filter
        let filtered = this.incidents.filter(inc => {
            const ms = inc.duration_ms || 0;
            const isSla = ms >= 60000 || inc.status === 'active';
            if (this.activeFilter === 'sla') return isSla;
            if (this.activeFilter === 'blip') return !isSla;
            return true;
        });

        // Apply search
        if (this.searchTerm) {
            filtered = filtered.filter(inc => {
                const text = [
                    inc.name || '',
                    inc.isp || '',
                    inc.city || '',
                    inc.branchCode || '',
                    inc.status || '',
                    inc.duration_text || ''
                ].join(' ').toLowerCase();
                return text.includes(this.searchTerm);
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="padding:40px; text-align:center;">
                    <span style="font-size:32px;">️</span>
                    <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-top:10px;">Nenhum Incidente Localizado</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                        ${this.searchTerm || this.activeFilter !== 'all' 
                            ? 'Nenhum registro corresponde aos filtros selecionados.' 
                            : 'Todos os circuitos de telecomunicações operando com 100% de disponibilidade contínua.'}
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(inc => {
            const ms = inc.duration_ms || 0;
            const isActive = inc.status === 'active';
            const isSevere = isActive || ms >= 300000;
            const isWarning = !isSevere && ms >= 60000;

            let cardBorder = 'border-bottom: 1px solid var(--glass-border);';
            let leftAccent = 'border-left: 4px solid #64748b;';
            let severityBadge = '';
            let businessImpactNote = '';

            if (isActive) {
                leftAccent = 'border-left: 4px solid #ef4444;';
                severityBadge = `<span class="badge badge-critical" style="display:inline-flex; align-items:center; gap:6px;"><span class="pulse-dot" style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#ef4444; animation:pulse 1.5s infinite;"></span>INDISPONIBILIDADE EM CURSO</span>`;
                businessImpactNote = `
                    <div style="margin-top:10px; padding:8px 12px; background:rgba(239,68,68,0.08); border-radius:6px; border:1px solid rgba(239,68,68,0.25); font-size:11.5px; color:#fca5a5; line-height:1.4;">
                        <strong>Telemetria:</strong> 100% de perda de pacotes ICMP. Operadora <strong>${esc(inc.isp || 'Provedor')}</strong> em atendimento; rota de contingência ativa na unidade.
                    </div>
                `;
            } else if (isSevere) {
                leftAccent = 'border-left: 4px solid #ef4444;';
                severityBadge = `<span class="badge badge-critical">INDISPONIBILIDADE CRÍTICA (${inc.duration_text || this.formatDurationMs(ms)})</span>`;
                businessImpactNote = `
                    <div style="margin-top:10px; padding:8px 12px; background:rgba(239,68,68,0.06); border-radius:6px; border:1px solid rgba(239,68,68,0.2); font-size:11.5px; color:#fca5a5; line-height:1.4;">
                        <strong>Auditoria de SLA:</strong> Indisponibilidade contínua de ${inc.duration_text || this.formatDurationMs(ms)} excedendo a tolerância contratual. Impacto registrado para prestação de contas com ${esc(inc.isp || 'Provedor')}.
                    </div>
                `;
            } else if (isWarning) {
                leftAccent = 'border-left: 4px solid #f59e0b;';
                severityBadge = `<span class="badge badge-warning">INSTABILIDADE DE ROTA (${inc.duration_text || this.formatDurationMs(ms)})</span>`;
                businessImpactNote = `
                    <div style="margin-top:10px; padding:8px 12px; background:rgba(245,158,11,0.06); border-radius:6px; border:1px solid rgba(245,158,11,0.2); font-size:11.5px; color:#fde68a; line-height:1.4;">
                        <strong>Auditoria de SLA:</strong> Instabilidade temporária (${inc.duration_text || this.formatDurationMs(ms)}). Registrado no índice de disponibilidade mensal da operadora ${esc(inc.isp || 'Provedor')}.
                    </div>
                `;
            } else {
                leftAccent = 'border-left: 4px solid #64748b;';
                severityBadge = `<span class="badge badge-neutral">OSCILAÇÃO TRANSITÓRIA (${inc.duration_text || this.formatDurationMs(ms)})</span>`;
                businessImpactNote = `
                    <div style="margin-top:10px; padding:8px 12px; background:rgba(148,163,184,0.05); border-radius:6px; border:1px solid rgba(148,163,184,0.15); font-size:11.5px; color:#cbd5e1; line-height:1.4;">
                        <strong>Telemetria:</strong> Oscilação transitória ICMP (${inc.duration_text || this.formatDurationMs(ms)}) absorvida sem interrupção de processos na filial.
                    </div>
                `;
            }

            const downDateStr = this.formatDate(inc.down_at || inc.downAt);
            const upDateStr = this.formatDate(inc.up_at || inc.upAt);

            return `
                <div style="padding:16px 20px; ${cardBorder} ${leftAccent} background:rgba(7,43,94,0.15); transition:background 0.2s;" onmouseover="this.style.background='rgba(7,43,94,0.3)'" onmouseout="this.style.background='rgba(7,43,94,0.15)'">
                    <!-- CABEÇALHO DO CARD -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                            <span style="font-size:15px; font-weight:800; color:var(--text-primary); letter-spacing:0.3px;">
                                ${esc(inc.name)}
                            </span>
                            <span class="badge badge-info" style="font-size:10.5px; font-weight:700;">
                                ${esc(inc.city || inc.branchCode || 'Matriz')}
                            </span>
                            <span class="badge" style="background:rgba(255,255,255,0.08); color:var(--text-secondary); border:1px solid rgba(255,255,255,0.15); font-size:10.5px;">
                                ${esc(inc.isp || 'TELECOM')}
                            </span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${severityBadge}
                            <span class="badge ${isActive ? 'badge-critical' : 'badge-ok'}" style="font-size:10.5px;">
                                ${isActive ? 'ATIVO' : 'RESOLVIDO'}
                            </span>
                        </div>
                    </div>

                    <!-- TIMELINE & DETALHES CRONOLÓGICOS -->
                    <div style="margin-top:10px; display:flex; gap:20px; font-size:12px; color:var(--text-muted); flex-wrap:wrap;">
                        <div>
                            <span style="color:var(--text-secondary); font-weight:600;">Início da Queda:</span> 
                            <span class="tabular-nums" style="color:var(--brand-crimson); font-weight:600;">${downDateStr}</span>
                        </div>
                        <div>
                            <span style="color:var(--text-secondary); font-weight:600;">Restabelecido:</span> 
                            <span class="tabular-nums" style="color:var(--brand-emerald); font-weight:600;">${upDateStr}</span>
                        </div>
                        <div>
                            <span style="color:var(--text-secondary); font-weight:600;">Duração Total:</span> 
                            <span class="tabular-nums" style="color:var(--text-primary); font-weight:700;">${inc.duration_text || this.formatDurationMs(ms)}</span>
                        </div>
                    </div>

                    <!-- BANNER DE CONTEXTO E AUDITORIA DE NEGÓCIO -->
                    ${businessImpactNote}
                </div>
            `;
        }).join('');
    }

    exportAuditPdf() {
        const slaBreaches = this.incidents.filter(i => (i.duration_ms || 0) >= 60000 || i.status === 'active');
        const now = new Date().toLocaleString('pt-BR');

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Por favor, permita popups no navegador para gerar o laudo em PDF.');
            return;
        }

        const rows = (slaBreaches.length > 0 ? slaBreaches : this.incidents).map((inc, idx) => `
            <tr>
                <td style="padding:8px; border:1px solid #ccc; font-size:11px; text-align:center;">${idx + 1}</td>
                <td style="padding:8px; border:1px solid #ccc; font-size:11px; font-weight:bold;">${inc.name}</td>
                <td style="padding:8px; border:1px solid #ccc; font-size:11px;">${inc.isp || 'N/A'}</td>
                <td style="padding:8px; border:1px solid #ccc; font-size:11px;">${inc.city || inc.branchCode}</td>
                <td style="padding:8px; border:1px solid #ccc; font-size:11px; text-align:center;">${this.formatDate(inc.down_at)}</td>
                <td style="padding:8px; border:1px solid #ccc; font-size:11px; text-align:center;">${this.formatDate(inc.up_at)}</td>
                <td style="padding:8px; border:1px solid #ccc; font-size:11px; text-align:center; font-weight:bold; color:#b91c1c;">${inc.duration_text || this.formatDurationMs(inc.duration_ms)}</td>
                <td style="padding:8px; border:1px solid #ccc; font-size:11px; text-align:center;">${inc.status === 'active' ? 'ATIVA' : 'RESOLVIDA'}</td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Laudo de Auditoria de SLA - Rodoviário Camilo dos Santos</title>
                <style>
                    * { box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #111; margin: 30px; }
                    .header { border-bottom: 2px solid #002244; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                    .title { font-size: 18px; font-weight: 800; color: #002244; }
                    .subtitle { font-size: 12px; color: #555; margin-top: 4px; }
                    .kpi-box { display: flex; gap: 15px; margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid; }
                    .kpi { border: 1px solid #ddd; padding: 10px 14px; border-radius: 6px; flex: 1; background: #f9fafb !important; }
                    .kpi-title { font-size: 11px; color: #666; text-transform: uppercase; }
                    .kpi-value { font-size: 18px; font-weight: bold; color: #002244; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: auto; break-inside: auto; }
                    thead { display: table-header-group !important; }
                    tr { page-break-inside: avoid !important; break-inside: avoid !important; }
                    th { background: #002244 !important; color: white !important; padding: 8px; font-size: 11px; border: 1px solid #002244; text-align: left; }
                    .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 15px; font-size: 11px; color: #777; display: flex; justify-content: space-between; page-break-inside: avoid; break-inside: avoid; }
                    @media print {
                        @page { size: A4 portrait; margin: 10mm 12mm; }
                        body { margin: 0; }
                        button { display: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="title">RODOVIÁRIO CAMILO DOS SANTOS | LAUDO DE AUDITORIA DE SLA</div>
                        <div class="subtitle">Relatório Oficial Comprobatório de Indisponibilidade WAN para Contestação de Fatura</div>
                    </div>
                    <div style="text-align:right; font-size:11px; color:#555;">
                        <div><strong>Data de Emissão:</strong> ${now}</div>
                        <div><strong>Sistema:</strong> NOC / ITAM Operations Center</div>
                    </div>
                </div>

                <div class="kpi-box">
                    <div class="kpi">
                        <div class="kpi-title">Total de Ocorrências</div>
                        <div class="kpi-value">${this.incidents.length}</div>
                    </div>
                    <div class="kpi">
                        <div class="kpi-title">Quedas Passíveis de Glosa (> 1 min)</div>
                        <div class="kpi-value" style="color:#b91c1c;">${slaBreaches.length}</div>
                    </div>
                    <div class="kpi">
                        <div class="kpi-title">Disponibilidade Geral da Malha</div>
                        <div class="kpi-value" style="color:#15803d;">99.8%</div>
                    </div>
                </div>

                <div style="font-size:12px; line-height:1.6; margin-bottom:15px; background:#eff6ff; padding:12px; border-left:4px solid #0284c7; border-radius:4px;">
                    <strong>Parecer Técnico:</strong> O presente documento lista os eventos de indisponibilidade registrados através de monitoramento ICMP/SNMP com histerese anti-flapping (3 falhas consecutivas). Os eventos com duração igual ou superior a 1 minuto configuram violação dos parâmetros mínimos de SLA contratados e justificam o desconto proporcional na fatura mensal do serviço.
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width:30px; text-align:center;">#</th>
                            <th>Circuito</th>
                            <th>Operadora</th>
                            <th>Filial / Local</th>
                            <th style="text-align:center;">Início da Queda</th>
                            <th style="text-align:center;">Restabelecimento</th>
                            <th style="text-align:center;">Duração</th>
                            <th style="text-align:center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>

                <div class="footer">
                    <div>Rodoviário Camilo dos Santos - Departamento de Tecnologia da Informação & NOC</div>
                    <div>Documento Auditável gerado via NOC Operations Center</div>
                </div>

                <div style="text-align:center; margin-top:20px;">
                    <button onclick="window.print()" style="padding:10px 22px; font-weight:bold; background:#072B5E; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px; display:inline-flex; align-items:center; gap:8px;">
                        <svg style="width:16px; height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Imprimir / Salvar como PDF
                    </button>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
}

window.incidentsView = new IncidentsView();
