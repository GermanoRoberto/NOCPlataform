/**
 * NOC Enterprise - Módulo de Compliance de Software & Segurança de Endpoints
 * Auditoria contínua de Shadow IT, Whitelist/Blacklist e detecção de softwares não homologados.
 * Estilo corporativo limpo, tipagem segura, sem emojis.
 */

function cleanComplianceEncoding(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/Seguran[\ufffd\?]+a/gi, 'Segurança')
        .replace(/Opera[\ufffd\?]+o/gi, 'Operação')
        .replace(/Configura[\ufffd\?]+o/gi, 'Configuração')
        .replace(/Instala[\ufffd\?]+o/gi, 'Instalação')
        .replace(/Atualiza[\ufffd\?]+o/gi, 'Atualização')
        .replace(/Prote[\ufffd\?]+o/gi, 'Proteção')
        .replace(/[\ufffd]/g, '')
        .trim();
}

class SoftwareComplianceView {
    constructor() {
        this.data = null;
        this.currentFilter = 'all'; // 'all', 'forbidden', 'allowed', 'review', 'machines'
        this.searchQuery = '';
        this.activeModal = null; // null | { type: 'machines', softwareName } | { type: 'rules' }
    }

    async render(state = null) {
        const container = document.getElementById('view-software-compliance');
        if (!container) return;

        // Se o usuário estiver com um modal aberto conferindo estações, NÃO fechar a tela sozinho
        if (this.activeModal) {
            return;
        }

        // Se ainda não carregou os dados ou for a primeira vez
        if (!this.data) {
            container.innerHTML = `
                <div style="padding:40px; text-align:center; color:var(--text-muted);">
                    <div style="font-size:14px; font-weight:600;">Carregando análise de compliance de software...</div>
                </div>
            `;
            await this.fetchData();
        }

        this.renderLayout(container);
    }

    async fetchData() {
        try {
            const res = await fetch('/api/compliance/software');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.data = await res.json();
            // Se houver softwares pendentes em auditoria, focar automaticamente na aba "Em Auditoria"
            if (this.data && this.data.summary && this.data.summary.reviewTitles > 0 && this.currentFilter === 'all') {
                this.currentFilter = 'review';
            }
        } catch (err) {
            console.error('[Compliance] Erro ao carregar dados:', err);
            const container = document.getElementById('view-software-compliance');
            if (container) {
                container.innerHTML = `
                    <div style="padding:30px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; color:#fca5a5; margin:20px;">
                        <strong>Falha ao carregar compliance:</strong> ${err.message}. Certifique-se de que o backend está ativo.
                        <div style="margin-top:12px;">
                            <button class="btn-ui" onclick="window.softwareComplianceView.refresh()">Tentar Novamente</button>
                        </div>
                    </div>
                `;
            }
        }
    }

    async refresh() {
        const btn = document.getElementById('btnRefreshCompliance');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span>Atualizando...</span>`;
        }
        await this.fetchData();
        const container = document.getElementById('view-software-compliance');
        if (container) this.renderLayout(container);
    }

    renderLayout(container) {
        if (!this.data) return;

        const { summary, softwareCatalog, machineAudits } = this.data;

        // Filtragem
        let filteredCatalog = softwareCatalog.filter(sw => {
            if (this.currentFilter === 'forbidden') return sw.status === 'FORBIDDEN';
            if (this.currentFilter === 'allowed') return sw.status === 'ALLOWED';
            if (this.currentFilter === 'review') return sw.status === 'REVIEW';
            return true;
        });

        if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            filteredCatalog = filteredCatalog.filter(sw => 
                sw.name.toLowerCase().includes(q) || 
                sw.category.toLowerCase().includes(q) ||
                sw.machines.some(m => m.name.toLowerCase().includes(q) || m.loggedUser.toLowerCase().includes(q) || m.city.toLowerCase().includes(q))
            );
        }

        let filteredMachines = machineAudits;
        if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            filteredMachines = filteredMachines.filter(m => 
                m.name.toLowerCase().includes(q) || 
                m.city.toLowerCase().includes(q) || 
                m.loggedUser.toLowerCase().includes(q) ||
                m.ip.toLowerCase().includes(q) ||
                m.forbiddenSoftwares.some(f => f.name.toLowerCase().includes(q))
            );
        }

        const scoreColor = summary.complianceScore >= 90 ? 'var(--invgate-emerald)' : (summary.complianceScore >= 70 ? 'var(--brand-amber)' : 'var(--brand-crimson)');

        container.innerHTML = `
            <div class="view-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; flex-wrap:wrap; gap:16px;">
                <div>
                    <h1 style="font-size:22px; font-weight:800; color:var(--text-primary); margin:0 0 6px 0; letter-spacing:-0.5px;">Compliance de Software & Segurança de Endpoints</h1>
                    <div style="font-size:13px; color:var(--text-muted);">Auditoria contínua de Shadow IT, baseline corporativo e detecção de programas não homologados</div>
                </div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <button class="btn-ui" id="btnManageComplianceRules" onclick="window.softwareComplianceView.openRulesModal()">
                        <svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                        <span>Regras de Compliance</span>
                    </button>
                    <button class="btn-ui" id="btnExportComplianceCsv" onclick="window.softwareComplianceView.exportCsv()">
                        <svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Exportar CSV</span>
                    </button>
                    <button class="btn-ui" id="btnRefreshCompliance" onclick="window.softwareComplianceView.refresh()">
                        <svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                        <span>Atualizar</span>
                    </button>
                </div>
            </div>

            <!-- CARDS DE METRICAS / KPIS -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:14px; margin-bottom:22px;">
                <div style="background:var(--invgate-card); border:1px solid var(--invgate-border); border-radius:10px; padding:18px;">
                    <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-muted); margin-bottom:8px;">Score Geral de Conformidade</div>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span class="tabular-nums" style="font-size:28px; font-weight:900; color:${scoreColor};">${summary.complianceScore}%</span>
                        <span style="font-size:12px; color:var(--text-secondary);">${summary.compliantComputers} de ${summary.totalComputers} estações conformes</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.06); height:6px; border-radius:3px; margin-top:10px; overflow:hidden;">
                        <div style="background:${scoreColor}; height:100%; width:${summary.complianceScore}%;"></div>
                    </div>
                </div>

                <div style="background:var(--invgate-card); border:1px solid ${summary.totalForbiddenDetections > 0 ? 'rgba(239,68,68,0.35)' : 'var(--invgate-border)'}; border-radius:10px; padding:18px;">
                    <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:${summary.totalForbiddenDetections > 0 ? 'var(--brand-crimson)' : 'var(--text-muted)'}; margin-bottom:8px;">Violações / Softwares Proibidos</div>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span class="tabular-nums" style="font-size:28px; font-weight:900; color:${summary.totalForbiddenDetections > 0 ? 'var(--brand-crimson)' : 'var(--invgate-emerald)'};">${summary.totalForbiddenDetections}</span>
                        <span style="font-size:12px; color:var(--text-secondary);">${summary.nonCompliantComputers} máquinas com infração</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">${summary.forbiddenTitles} softwares distintos na Blacklist</div>
                </div>

                <div style="background:var(--invgate-card); border:1px solid var(--invgate-border); border-radius:10px; padding:18px;">
                    <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-muted); margin-bottom:8px;">Softwares Homologados</div>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span class="tabular-nums" style="font-size:28px; font-weight:900; color:var(--invgate-emerald);">${summary.allowedTitles}</span>
                        <span style="font-size:12px; color:var(--text-secondary);">títulos autorizados</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">Baseline oficial de segurança e TI</div>
                </div>

                <div style="background:var(--invgate-card); border:1px solid var(--invgate-border); border-radius:10px; padding:18px;">
                    <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-muted); margin-bottom:8px;">Em Auditoria / Pendentes</div>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span class="tabular-nums" style="font-size:28px; font-weight:900; color:var(--brand-amber);">${summary.reviewTitles}</span>
                        <span style="font-size:12px; color:var(--text-secondary);">softwares não classificados</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">Aguardando classificação da TI</div>
                </div>
            </div>

            <!-- CONTROLES, ABAS E FILTROS -->
            <div style="background:var(--invgate-card); border:1px solid var(--invgate-border); border-radius:10px; padding:14px 18px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn-ui ${this.currentFilter === 'review' ? 'active' : ''}" style="${this.currentFilter === 'review' ? 'background:rgba(245,158,11,0.22); color:#fde68a; border-color:rgba(245,158,11,0.5); font-weight:700;' : ''}" onclick="window.softwareComplianceView.setFilter('review')">
                        Em Auditoria (${summary.reviewTitles})
                    </button>
                    <button class="btn-ui ${this.currentFilter === 'forbidden' ? 'active' : ''}" style="${this.currentFilter === 'forbidden' ? 'background:rgba(239,68,68,0.2); color:#fca5a5; border-color:rgba(239,68,68,0.4); font-weight:700;' : ''}" onclick="window.softwareComplianceView.setFilter('forbidden')">
                        Violações (${summary.forbiddenTitles})
                    </button>
                    <button class="btn-ui ${this.currentFilter === 'allowed' ? 'active' : ''}" style="${this.currentFilter === 'allowed' ? 'background:rgba(16,185,129,0.2); color:#6ee7b7; border-color:rgba(16,185,129,0.4);' : ''}" onclick="window.softwareComplianceView.setFilter('allowed')">
                        Homologados (${summary.allowedTitles})
                    </button>
                    <button class="btn-ui ${this.currentFilter === 'all' ? 'active' : ''}" style="${this.currentFilter === 'all' ? 'background:var(--invgate-blue); color:#fff; border-color:transparent;' : ''}" onclick="window.softwareComplianceView.setFilter('all')">
                        Todos (${softwareCatalog.length})
                    </button>
                    <span style="border-right:1px solid var(--invgate-border); margin:0 4px;"></span>
                    <button class="btn-ui ${this.currentFilter === 'machines' ? 'active' : ''}" style="${this.currentFilter === 'machines' ? 'background:var(--invgate-blue); color:#fff; border-color:transparent;' : ''}" onclick="window.softwareComplianceView.setFilter('machines')">
                        Visão por Estações (${machineAudits.length})
                    </button>
                </div>

                <div style="min-width:260px; max-width:380px; flex:1;">
                    <input type="text" id="inputComplianceSearch" placeholder="Filtrar por software, categoria, máquina..." value="${this.escapeHtml(this.searchQuery)}" oninput="window.softwareComplianceView.onSearch(this.value)" style="width:100%; background:var(--invgate-bg); border:1px solid var(--invgate-border); color:var(--text-primary); padding:7px 12px; border-radius:6px; font-size:12px;">
                </div>
            </div>

            <!-- ÁREA DA TABELA ATIVA -->
            <div style="background:var(--invgate-card); border:1px solid var(--invgate-border); border-radius:10px; overflow:hidden;">
                ${this.currentFilter === 'machines' ? this.renderMachinesTable(filteredMachines) : this.renderSoftwareTable(filteredCatalog)}
            </div>
        `;
    }

    renderSoftwareTable(softwares) {
        if (!softwares || softwares.length === 0) {
            return `
                <div style="padding:40px; text-align:center; color:var(--text-muted);">
                    Nenhum software localizado para o filtro selecionado.
                </div>
            `;
        }

        const rowsHtml = softwares.map(sw => {
            let statusBadge = '';
            if (sw.status === 'FORBIDDEN') {
                statusBadge = `<span class="badge" style="background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.35); font-weight:800; font-size:10px; padding:3px 8px;">PROIBIDO</span>`;
            } else if (sw.status === 'ALLOWED') {
                statusBadge = `<span class="badge" style="background:rgba(16,185,129,0.18); color:#6ee7b7; border:1px solid rgba(16,185,129,0.35); font-weight:700; font-size:10px; padding:3px 8px;">HOMOLOGADO</span>`;
            } else {
                statusBadge = `<span class="badge" style="background:rgba(245,158,11,0.18); color:#fde68a; border:1px solid rgba(245,158,11,0.35); font-weight:700; font-size:10px; padding:3px 8px;">EM AUDITORIA</span>`;
            }

            const machineCount = sw.machines.length;
            const machineBadgeColor = sw.status === 'FORBIDDEN' ? 'color:#fca5a5; font-weight:800;' : 'color:var(--text-primary); font-weight:700;';

            return `
                <tr style="border-bottom:1px solid var(--invgate-border); transition:background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                    <td style="padding:12px 16px;">
                        <div style="font-weight:700; color:var(--text-primary); font-size:13px;">${this.escapeHtml(sw.name)}</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:2px; display:flex; align-items:center; gap:8px;">
                            <span>${this.escapeHtml(sw.category)}</span>
                            ${(sw.versionsList && sw.versionsList.length > 1) ? `
                                <span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-secondary); font-size:10px; padding:1px 6px;">
                                    ${sw.versionsList.length} versões detectadas
                                </span>
                            ` : ''}
                        </div>
                    </td>
                    <td style="padding:12px 16px;">
                        ${statusBadge}
                    </td>
                    <td style="padding:12px 16px;">
                        <span style="font-size:11.5px; color:var(--text-secondary);">${this.escapeHtml(sw.reason || '--')}</span>
                    </td>
                    <td style="padding:12px 16px;">
                        <button class="btn-ui" style="padding:4px 10px; font-size:11px;" onclick="window.softwareComplianceView.openMachinesModal('${this.escapeHtml(sw.name).replace(/'/g, "\\'")}')">
                            <span class="tabular-nums" style="${machineBadgeColor}">${machineCount}</span>
                            <span style="color:var(--text-muted); margin-left:4px;">${machineCount === 1 ? 'estação' : 'estações'}</span>
                            <svg class="lucide-icon icon-sm" style="margin-left:4px;" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"></path></svg>
                        </button>
                    </td>
                    <td style="padding:12px 16px; text-align:right;">
                        <div style="display:inline-flex; gap:6px;">
                            <button class="btn-ui" style="padding:4px 8px; font-size:11px; color:var(--cs-cyan); border-color:rgba(56,189,248,0.3);" title="Consultar inteligência de licenciamento e risco corporativo" onclick="window.softwareComplianceView.openAiAuditModal('${this.escapeHtml(sw.name).replace(/'/g, "\\'")}')">
                                Analisar Licença
                            </button>
                            ${sw.status === 'FORBIDDEN' ? `
                                <button class="btn-ui" style="padding:4px 8px; font-size:11px; background:rgba(239,68,68,0.22); color:#fca5a5; border-color:rgba(239,68,68,0.45); font-weight:700;" title="Desinstalar silenciosamente de TODOS os dispositivos (${machineCount} estações)" onclick="window.softwareComplianceView.confirmMassUninstall('${this.escapeHtml(sw.name).replace(/'/g, "\\'")}', ${machineCount})">
                                    Desinstalar (${machineCount})
                                </button>
                            ` : ''}
                            ${sw.status !== 'ALLOWED' ? `
                                <button class="btn-ui" style="padding:4px 8px; font-size:11px; color:#6ee7b7;" title="Homologar Software" onclick="window.softwareComplianceView.quickClassify('${this.escapeHtml(sw.name).replace(/'/g, "\\'")}', 'ALLOWED')">
                                    Homologar
                                </button>
                            ` : ''}
                            ${sw.status !== 'FORBIDDEN' ? `
                                <button class="btn-ui" style="padding:4px 8px; font-size:11px; color:#fca5a5;" title="Bloquear / Inserir na Blacklist" onclick="window.softwareComplianceView.quickClassify('${this.escapeHtml(sw.name).replace(/'/g, "\\'")}', 'FORBIDDEN')">
                                    Bloquear
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <table class="data-table" style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.02); border-bottom:1px solid var(--invgate-border); text-align:left;">
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Software / Aplicação</th>
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Status de Compliance</th>
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Política / Justificativa</th>
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Estações Afetadas</th>
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted); text-align:right;">Ações Rápidas</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        `;
    }

    renderMachinesTable(machines) {
        if (!machines || machines.length === 0) {
            return `
                <div style="padding:40px; text-align:center; color:var(--text-muted);">
                    Nenhuma estação localizada para a busca.
                </div>
            `;
        }

        const rowsHtml = machines.map(m => {
            const hasForbidden = m.forbiddenCount > 0;
            const statusBadge = hasForbidden 
                ? `<span class="badge" style="background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.35); font-weight:800; font-size:10px; padding:3px 8px;">${m.forbiddenCount} VIOLAÇÃO(ÕES)</span>`
                : `<span class="badge" style="background:rgba(16,185,129,0.18); color:#6ee7b7; border:1px solid rgba(16,185,129,0.35); font-weight:700; font-size:10px; padding:3px 8px;">CONFORME</span>`;

            let forbiddenListHtml = '';
            if (hasForbidden) {
                forbiddenListHtml = m.forbiddenSoftwares.map(f => `
                    <span class="badge" style="background:rgba(239,68,68,0.12); color:#fca5a5; border:1px solid rgba(239,68,68,0.25); font-size:10.5px; padding:2px 6px; margin:2px 3px 2px 0; display:inline-block;">
                        ${this.escapeHtml(f.name)}
                    </span>
                `).join('');
            } else {
                forbiddenListHtml = `<span style="font-size:11px; color:var(--text-muted);">Nenhum software proibido detectado.</span>`;
            }

            return `
                <tr style="border-bottom:1px solid var(--invgate-border); transition:background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                    <td style="padding:12px 16px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="badge-dot" style="background:${m.status === 'online' ? 'var(--invgate-emerald)' : 'var(--text-muted)'};"></span>
                            <strong style="color:var(--text-primary); font-size:13px;">${this.escapeHtml(m.name)}</strong>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">IP: ${this.escapeHtml(m.ip)}</div>
                    </td>
                    <td style="padding:12px 16px;">
                        <span class="badge" style="background:rgba(56,189,248,0.12); color:var(--cs-cyan); border:1px solid rgba(56,189,248,0.25); font-weight:700; font-size:10.5px;">${this.escapeHtml(m.city)}</span>
                    </td>
                    <td style="padding:12px 16px;">
                        <span style="font-size:12px; color:var(--text-secondary); font-weight:600;">${this.escapeHtml(m.loggedUser)}</span>
                    </td>
                    <td style="padding:12px 16px;">
                        ${statusBadge}
                    </td>
                    <td style="padding:12px 16px; max-width:320px;">
                        ${forbiddenListHtml}
                    </td>
                    <td style="padding:12px 16px; text-align:right;">
                        <button class="btn-ui" style="padding:4px 10px; font-size:11px;" onclick="window.softwareComplianceView.openAssetDrawer('${m.id}')">
                            Ficha do Ativo
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <table class="data-table" style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.02); border-bottom:1px solid var(--invgate-border); text-align:left;">
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Estação de Trabalho</th>
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Unidade / Filial</th>
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Usuário Logado</th>
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Conformidade</th>
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Softwares em Violação</th>
                        <th style="padding:12px 16px; font-size:11px; text-transform:uppercase; color:var(--text-muted); text-align:right;">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        `;
    }

    setFilter(filter) {
        this.currentFilter = filter;
        const container = document.getElementById('view-software-compliance');
        if (container) this.renderLayout(container);
    }

    onSearch(query) {
        this.searchQuery = query;
        const container = document.getElementById('view-software-compliance');
        if (container) this.renderLayout(container);
    }

    openMachinesModal(softwareName) {
        if (!this.data) return;
        const sw = this.data.softwareCatalog.find(s => s.name.toLowerCase() === softwareName.toLowerCase());
        if (!sw) return;

        const modalContainer = document.getElementById('complianceModalContainer');
        if (!modalContainer) return;

        this.activeModal = { type: 'machines', softwareName };

        const statusBadge = sw.status === 'FORBIDDEN'
            ? `<span class="badge" style="background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); font-weight:800; font-size:11px; padding:3px 9px;">PROIBIDO / BLACKLIST</span>`
            : (sw.status === 'ALLOWED' 
                ? `<span class="badge" style="background:rgba(16,185,129,0.2); color:#6ee7b7; border:1px solid rgba(16,185,129,0.4); font-weight:700; font-size:11px; padding:3px 9px;">HOMOLOGADO</span>`
                : `<span class="badge" style="background:rgba(245,158,11,0.2); color:#fde68a; border:1px solid rgba(245,158,11,0.4); font-weight:700; font-size:11px; padding:3px 9px;">EM AUDITORIA</span>`);

        const machinesListHtml = sw.machines.map(m => `
            <tr style="border-bottom:1px solid var(--invgate-border);">
                <td style="padding:10px 14px;">
                    <strong style="color:var(--text-primary); font-size:13px;">${this.escapeHtml(m.name)}</strong>
                </td>
                <td style="padding:10px 14px;">
                    <span class="badge" style="background:rgba(56,189,248,0.12); color:var(--cs-cyan); font-size:10.5px;">${this.escapeHtml(m.city)}</span>
                </td>
                <td style="padding:10px 14px; font-size:12px; color:var(--text-secondary);">
                    ${this.escapeHtml(m.loggedUser)}
                </td>
                <td style="padding:10px 14px; font-family:monospace; font-size:11.5px; color:var(--text-muted);">
                    ${this.escapeHtml(m.ip)}
                </td>
                <td style="padding:10px 14px; font-size:11.5px; color:var(--text-secondary);">
                    ${this.escapeHtml(m.version)}
                </td>
                <td style="padding:10px 14px; text-align:right;">
                    <div style="display:inline-flex; gap:6px;">
                        <button class="btn-ui" style="padding:3px 8px; font-size:11px;" onclick="window.softwareComplianceView.openAssetDrawer('${m.id}')">Ver Estação</button>
                        ${sw.status === 'FORBIDDEN' ? `
                            <button class="btn-ui" style="padding:3px 8px; font-size:11px; background:rgba(239,68,68,0.18); color:#fca5a5; border-color:rgba(239,68,68,0.35); font-weight:700;" title="Desinstalar Silenciosamente sem intervenção do usuário" onclick="window.softwareComplianceView.confirmRemoteUninstall('${m.id}', '${this.escapeHtml(m.name).replace(/'/g, "\\'")}', '${this.escapeHtml(sw.name).replace(/'/g, "\\'")}')">
                                Desinstalar
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');

        modalContainer.innerHTML = `
            <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(1,7,16,0.88); backdrop-filter:blur(10px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;">
                <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid var(--cs-cyan) !important; border-radius:16px !important; max-width:850px; width:100%; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 25px 60px rgba(0,0,0,0.95) !important;">
                    <div style="padding:18px 22px; border-bottom:1px solid var(--invgate-border); display:flex; justify-content:space-between; align-items:center; background:#090e13; border-top-left-radius:16px; border-top-right-radius:16px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <h3 style="margin:0; font-size:17px; font-weight:800; color:var(--text-primary);">${this.escapeHtml(sw.name)}</h3>
                                ${statusBadge}
                            </div>
                            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${this.escapeHtml(sw.category)} &bull; ${this.escapeHtml(sw.reason || 'Sem justificativa')}</div>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            ${sw.status === 'FORBIDDEN' ? `
                                <button class="btn-ui" onclick="window.softwareComplianceView.confirmMassUninstall('${this.escapeHtml(sw.name).replace(/'/g, "\\'")}', ${sw.machines.length})" style="padding:6px 14px; font-weight:800; background:rgba(239,68,68,0.22); color:#fca5a5; border-color:rgba(239,68,68,0.45);" title="Desinstalar este software silenciosamente de todas as ${sw.machines.length} estações">
                                    Desinstalar de Todos (${sw.machines.length})
                                </button>
                            ` : ''}
                            <button class="btn-ui" onclick="window.softwareComplianceView.openAiAuditModal('${this.escapeHtml(sw.name).replace(/'/g, "\\'")}')" style="padding:6px 12px; font-weight:700; color:var(--cs-cyan); border-color:rgba(56,189,248,0.3);">
                                Consultar IA SAM
                            </button>
                            <button class="btn-ui" onclick="window.softwareComplianceView.closeModal()" style="padding:6px 12px; font-weight:700;">Fechar</button>
                        </div>
                    </div>

                    <div style="padding:18px 22px; overflow-y:auto; flex:1;">
                        ${(sw.versionsList && sw.versionsList.length > 0) ? `
                            <div style="margin-bottom:16px; padding:14px 16px; background:#0e131a; border:1px solid var(--invgate-border); border-radius:10px;">
                                <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:10px; display:flex; justify-content:space-between;">
                                    <span>Dispersão de Versões Instaladas (SAM & Licenciamento):</span>
                                    <span>${sw.versionsList.length} ${sw.versionsList.length === 1 ? 'versão detectada' : 'versões detectadas'}</span>
                                </div>
                                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                    ${sw.versionsList.map(v => `
                                        <div style="background:#090e13; border:1px solid var(--invgate-border); padding:5px 12px; border-radius:6px; font-size:11.5px; display:inline-flex; align-items:center; gap:8px;">
                                            <span style="color:var(--text-primary); font-weight:600;">v${this.escapeHtml(v.version)}</span>
                                            <span class="badge" style="background:rgba(56,189,248,0.18); color:var(--cs-cyan); font-weight:800; font-size:10.5px; padding:2px 7px;">${v.count} ${v.count === 1 ? 'estação' : 'estações'}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <div style="font-size:12px; font-weight:700; color:var(--text-secondary); margin-bottom:10px; text-transform:uppercase;">
                            Estações onde este software foi detectado (${sw.machines.length}):
                        </div>
                        <table class="data-table" style="width:100%; border-collapse:collapse; border-radius:8px; overflow:hidden;">
                            <thead>
                                <tr style="background:#0e131a; border-bottom:1px solid var(--invgate-border); text-align:left;">
                                    <th style="padding:10px 14px; font-size:11px; text-transform:uppercase; color:var(--cs-cyan);">Estação</th>
                                    <th style="padding:10px 14px; font-size:11px; text-transform:uppercase; color:var(--cs-cyan);">Filial</th>
                                    <th style="padding:10px 14px; font-size:11px; text-transform:uppercase; color:var(--cs-cyan);">Usuário Logado</th>
                                    <th style="padding:10px 14px; font-size:11px; text-transform:uppercase; color:var(--cs-cyan);">IP</th>
                                    <th style="padding:10px 14px; font-size:11px; text-transform:uppercase; color:var(--cs-cyan);">Versão</th>
                                    <th style="padding:10px 14px; font-size:11px; text-transform:uppercase; color:var(--cs-cyan); text-align:right;">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${machinesListHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    async quickClassify(softwareName, status, reason = '') {
        if (!reason && !confirm(`Deseja definir o software "${softwareName}" como ${status === 'FORBIDDEN' ? 'PROIBIDO (Blacklist)' : 'HOMOLOGADO (Whitelist)'}?`)) {
            return;
        }
        try {
            const res = await fetch('/api/compliance/classify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ softwareName, status, reason })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await this.refresh();
        } catch (err) {
            alert(`Erro ao classificar software: ${err.message}`);
        }
    }

    openAssetDrawer(assetId) {
        // Fechar modal se aberto
        const modalContainer = document.getElementById('complianceModalContainer');
        if (modalContainer) modalContainer.innerHTML = '';

        if (window.assetDrawer && typeof window.assetDrawer.open === 'function') {
            window.assetDrawer.open(assetId, 'computer');
        } else {
            console.warn('[Compliance] assetDrawer não disponível');
        }
    }

    async openRulesModal() {
        const modalContainer = document.getElementById('complianceModalContainer');
        if (!modalContainer) return;

        this.activeModal = { type: 'rules' };

        try {
            const res = await fetch('/api/compliance/rules');
            const data = await res.json();
            const rules = data.rules || [];

            const rulesListHtml = rules.map(r => `
                <tr style="border-bottom:1px solid var(--invgate-border);">
                    <td style="padding:10px 12px;">
                        <strong style="color:var(--text-primary); font-size:12.5px;">${this.escapeHtml(r.name)}</strong>
                        <div style="font-size:10.5px; color:var(--text-muted); font-family:monospace; margin-top:2px;">${this.escapeHtml(r.pattern)}</div>
                    </td>
                    <td style="padding:10px 12px;">
                        <span class="badge" style="background:${r.status === 'FORBIDDEN' ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)'}; color:${r.status === 'FORBIDDEN' ? '#fca5a5' : '#6ee7b7'}; font-weight:800; font-size:10px;">${r.status}</span>
                    </td>
                    <td style="padding:10px 12px; font-size:11px; color:var(--text-secondary); max-width:240px;">
                        ${this.escapeHtml(r.reason || '--')}
                    </td>
                    <td style="padding:10px 12px; text-align:right;">
                        <button class="btn-ui" style="padding:3px 8px; font-size:10.5px; color:#fca5a5;" onclick="window.softwareComplianceView.deleteRule('${r.id}')">Excluir</button>
                    </td>
                </tr>
            `).join('');

            modalContainer.innerHTML = `
                <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(1,7,16,0.88); backdrop-filter:blur(10px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;">
                    <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid var(--cs-cyan) !important; border-radius:16px !important; max-width:900px; width:100%; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 25px 60px rgba(0,0,0,0.95) !important;">
                        <div style="padding:16px 20px; border-bottom:1px solid var(--invgate-border); display:flex; justify-content:space-between; align-items:center; background:#090e13; border-top-left-radius:16px; border-top-right-radius:16px;">
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:var(--text-primary);">Regras de Compliance (Whitelist / Blacklist)</h3>
                            <button class="btn-ui" onclick="window.softwareComplianceView.closeModal()" style="padding:6px 12px; font-weight:700;">Fechar</button>
                        </div>

                        <div style="padding:16px 20px; overflow-y:auto; flex:1;">
                            <div style="background:#0e131a; border:1px solid var(--invgate-border); border-radius:10px; padding:16px; margin-bottom:16px;">
                                <strong style="font-size:12.5px; color:var(--text-primary); display:block; margin-bottom:8px;">Adicionar Nova Regra</strong>
                                <div style="display:grid; grid-template-columns:1fr 1fr 120px 1fr auto; gap:8px; align-items:center;">
                                    <input type="text" id="newRuleName" placeholder="Nome da Regra (ex: Torrent)" style="background:var(--invgate-card); border:1px solid var(--invgate-border); color:#fff; padding:6px 10px; border-radius:5px; font-size:11.5px;">
                                    <input type="text" id="newRulePattern" placeholder="Padrão / Regex (ex: torrent|utorrent)" style="background:var(--invgate-card); border:1px solid var(--invgate-border); color:#fff; padding:6px 10px; border-radius:5px; font-size:11.5px;">
                                    <select id="newRuleStatus" style="background:var(--invgate-card); border:1px solid var(--invgate-border); color:#fff; padding:6px; border-radius:5px; font-size:11.5px;">
                                        <option value="FORBIDDEN">PROIBIDO</option>
                                        <option value="ALLOWED">HOMOLOGADO</option>
                                    </select>
                                    <input type="text" id="newRuleReason" placeholder="Justificativa / Motivo" style="background:var(--invgate-card); border:1px solid var(--invgate-border); color:#fff; padding:6px 10px; border-radius:5px; font-size:11.5px;">
                                    <button class="btn-ui" style="background:var(--invgate-blue); color:#fff; border-color:transparent; padding:6px 12px; font-size:11.5px;" onclick="window.softwareComplianceView.saveNewRule()">Salvar</button>
                                </div>
                            </div>

                            <table class="data-table" style="width:100%; border-collapse:collapse;">
                                <thead>
                                    <tr style="background:rgba(255,255,255,0.02); border-bottom:1px solid var(--invgate-border); text-align:left;">
                                        <th style="padding:10px 12px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Nome & Padrão</th>
                                        <th style="padding:10px 12px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Status</th>
                                        <th style="padding:10px 12px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Justificativa</th>
                                        <th style="padding:10px 12px; font-size:11px; text-transform:uppercase; color:var(--text-muted); text-align:right;">Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rulesListHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            alert(`Erro ao abrir regras: ${e.message}`);
        }
    }

    async saveNewRule() {
        const name = document.getElementById('newRuleName')?.value?.trim();
        const pattern = document.getElementById('newRulePattern')?.value?.trim();
        const status = document.getElementById('newRuleStatus')?.value;
        const reason = document.getElementById('newRuleReason')?.value?.trim();

        if (!name || !pattern) {
            alert('Preencha ao menos o nome e o padrão de detecção da regra.');
            return;
        }

        try {
            const res = await fetch('/api/compliance/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, pattern, status, reason, category: 'Personalizada' })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await this.openRulesModal();
            await this.refresh();
        } catch (e) {
            alert(`Erro ao salvar regra: ${e.message}`);
        }
    }

    async deleteRule(id) {
        if (!confirm('Deseja excluir esta regra de compliance?')) return;
        try {
            const res = await fetch(`/api/compliance/rules/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await this.openRulesModal();
            await this.refresh();
        } catch (e) {
            alert(`Erro ao excluir regra: ${e.message}`);
        }
    }

    async openAiAuditModal(softwareName) {
        if (!softwareName) return;
        const modalContainer = document.getElementById('complianceModalContainer');
        if (!modalContainer) return;

        this.activeModal = { type: 'ai-audit', softwareName };

        modalContainer.innerHTML = `
            <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(1,7,16,0.88); backdrop-filter:blur(10px); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;">
                <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid var(--cs-cyan) !important; border-radius:16px !important; max-width:680px; width:100%; box-shadow:0 25px 60px rgba(0,0,0,0.95) !important; overflow:hidden;">
                    <div style="padding:18px 22px; border-bottom:1px solid var(--invgate-border); display:flex; justify-content:space-between; align-items:center; background:#090e13; border-top-left-radius:16px; border-top-right-radius:16px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <svg class="lucide-icon icon-md" style="color:var(--cs-cyan);" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:var(--text-primary);">Auditoria de Licenciamento & Riscos</h3>
                        </div>
                        <button class="btn-ui" onclick="window.softwareComplianceView.closeModal()" style="padding:5px 10px;">Fechar</button>
                    </div>

                    <div id="aiAuditContent" style="padding:22px; min-height:220px; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                        <div class="spinner" style="width:36px; height:36px; border:3px solid rgba(56,189,248,0.2); border-top-color:var(--cs-cyan); border-radius:50%; animation:spin 0.8s linear infinite; margin-bottom:14px;"></div>
                        <div style="font-size:14px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">Consultando inteligência de licenciamento...</div>
                        <div style="font-size:12px; color:var(--text-muted); text-align:center; max-width:440px;">
                            Verificando modelo de licença (gratuito, comercial ou pirataria) e riscos corporativos para "${this.escapeHtml(softwareName)}".
                        </div>
                    </div>
                </div>
            </div>
        `;

        try {
            const res = await fetch('/api/compliance/ai-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ softwareName })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const intel = data.intel;

            const contentEl = document.getElementById('aiAuditContent');
            if (!contentEl) return;

            // Determinar cores e badges por risco
            let riskBadge = '';
            let verdictBorder = 'var(--invgate-border)';
            if (intel.riskLevel === 'CRITICO' || intel.isPirateOrCrack) {
                riskBadge = `<span class="badge" style="background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); font-weight:800; font-size:11px; padding:3px 10px;">RISCO CRÍTICO / PIRATARIA</span>`;
                verdictBorder = 'rgba(239,68,68,0.5)';
            } else if (intel.isGame) {
                riskBadge = `<span class="badge" style="background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); font-weight:800; font-size:11px; padding:3px 10px;">JOGO / ENTRETENIMENTO</span>`;
                verdictBorder = 'rgba(239,68,68,0.4)';
            } else if (intel.isStrictlyCommercial) {
                riskBadge = `<span class="badge" style="background:rgba(245,158,11,0.2); color:#fde68a; border:1px solid rgba(245,158,11,0.4); font-weight:700; font-size:11px; padding:3px 10px;">ESTRITAMENTE COMERCIAL (EXIGE COMPRA)</span>`;
                verdictBorder = 'rgba(245,158,11,0.4)';
            } else if (intel.isFreemiumTolerated) {
                riskBadge = `<span class="badge" style="background:rgba(16,185,129,0.2); color:#6ee7b7; border:1px solid rgba(16,185,129,0.4); font-weight:700; font-size:11px; padding:3px 10px;">GRATUITO / AUTORIZADO</span>`;
                verdictBorder = 'rgba(16,185,129,0.4)';
            } else {
                riskBadge = `<span class="badge" style="background:rgba(56,189,248,0.2); color:var(--cs-cyan); border:1px solid rgba(56,189,248,0.4); font-weight:700; font-size:11px; padding:3px 10px;">${this.escapeHtml(intel.classification)}</span>`;
            }

            contentEl.style.alignItems = 'stretch';
            contentEl.innerHTML = `
                <div style="background:rgba(255,255,255,0.02); border:1px solid ${verdictBorder}; border-radius:10px; padding:18px; margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                        <div>
                            <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Software Analisado</div>
                            <div style="font-size:17px; font-weight:800; color:var(--text-primary); margin-top:2px;">${this.escapeHtml(intel.softwareName)}</div>
                            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">Família: <strong>${this.escapeHtml(intel.familyName)}</strong> &bull; Categoria: <strong>${this.escapeHtml(intel.category)}</strong></div>
                        </div>
                        <div>
                            ${riskBadge}
                        </div>
                    </div>

                    <div style="border-top:1px solid var(--invgate-border); padding-top:12px; margin-top:12px;">
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700; margin-bottom:6px;">Parecer Técnico & Modelo de Licença:</div>
                        <div style="font-size:13px; line-height:1.55; color:var(--text-primary); background:rgba(0,0,0,0.25); padding:12px 14px; border-radius:8px; border-left:3px solid var(--cs-cyan);">
                            ${this.escapeHtml(intel.summary)}
                        </div>
                    </div>

                    <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-muted);">
                        <span>Fonte da Análise: <strong>${intel.source === 'HEURISTIC_RULE' ? 'Base de Licenças Corporativas' : (intel.source === 'OLLAMA_AI' ? 'Inteligência Artificial Local' : 'Análise Geral')}</strong></span>
                        <span>Recomendação: <strong style="color:var(--text-primary);">${this.escapeHtml(intel.recommendation)}</strong></span>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
                    <button class="btn-ui" onclick="window.softwareComplianceView.closeModal()" style="padding:8px 16px; font-weight:600;">
                        Cancelar
                    </button>
                    <button class="btn-ui" style="padding:8px 16px; font-weight:700; background:rgba(239,68,68,0.18); color:#fca5a5; border-color:rgba(239,68,68,0.4);" onclick="window.softwareComplianceView.submitAiClassification('${this.escapeHtml(intel.softwareName).replace(/'/g, "\\'")}', 'FORBIDDEN', '${this.escapeHtml(intel.summary).replace(/'/g, "\\'")}')">
                        Bloquear Software
                    </button>
                    <button class="btn-ui" style="padding:8px 16px; font-weight:700; background:rgba(16,185,129,0.18); color:#6ee7b7; border-color:rgba(16,185,129,0.4);" onclick="window.softwareComplianceView.submitAiClassification('${this.escapeHtml(intel.softwareName).replace(/'/g, "\\'")}', 'ALLOWED', '${this.escapeHtml(intel.summary).replace(/'/g, "\\'")}')">
                        Homologar Software
                    </button>
                </div>
            `;
        } catch (err) {
            const contentEl = document.getElementById('aiAuditContent');
            if (contentEl) {
                contentEl.innerHTML = `
                    <div style="text-align:center; padding:20px;">
                        <div style="color:var(--brand-crimson); font-weight:800; font-size:15px; margin-bottom:8px;">Falha na Análise de IA</div>
                        <div style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">${this.escapeHtml(err.message)}</div>
                        <button class="btn-ui" onclick="window.softwareComplianceView.closeModal()">Fechar</button>
                    </div>
                `;
            }
        }
    }

    async submitAiClassification(softwareName, status, reason) {
        try {
            await this.quickClassify(softwareName, status, reason);
            this.closeModal();
        } catch (err) {
            alert(`Falha ao registrar classificação: ${err.message}`);
        }
    }

    confirmRemoteUninstall(hostId, hostName, softwareName) {
        const modalContainer = document.getElementById('complianceModalContainer');
        if (!modalContainer) return;

        const prevModal = this.activeModal;

        modalContainer.innerHTML = `
            <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(1,7,16,0.88); backdrop-filter:blur(10px); z-index:10001; display:flex; align-items:center; justify-content:center; padding:20px;">
                <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid rgba(239,68,68,0.5) !important; border-radius:16px !important; max-width:540px; width:100%; box-shadow:0 25px 60px rgba(0,0,0,0.95) !important; overflow:hidden;">
                    <div style="padding:18px 22px; border-bottom:1px solid var(--invgate-border); display:flex; justify-content:space-between; align-items:center; background:#090e13; border-top-left-radius:16px; border-top-right-radius:16px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <svg class="lucide-icon icon-md" style="color:var(--brand-crimson);" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:var(--text-primary);">Confirmar Desinstalação Remota Silenciosa</h3>
                        </div>
                        <button class="btn-ui" onclick="window.softwareComplianceView.openMachinesModal('${this.escapeHtml(softwareName).replace(/'/g, "\\'")}')" style="padding:4px 8px;">✕</button>
                    </div>

                    <div style="padding:22px;">
                        <div style="font-size:13.5px; color:var(--text-primary); line-height:1.5; margin-bottom:16px;">
                            Você está prestes a disparar o comando de desinstalação silenciosa sem qualquer intervenção ou interrupção na tela do usuário.
                        </div>

                        <div style="background:#0e131a; border:1px solid var(--invgate-border); border-radius:10px; padding:14px 16px; margin-bottom:18px; font-size:12.5px;">
                            <div style="margin-bottom:6px;"><span style="color:var(--text-muted); font-weight:700;">SOFTWARE:</span> <strong style="color:var(--text-primary);">${this.escapeHtml(softwareName)}</strong></div>
                            <div style="margin-bottom:6px;"><span style="color:var(--text-muted); font-weight:700;">ESTAÇÃO ALVO:</span> <strong style="color:var(--cs-cyan);">${this.escapeHtml(hostName)} (ID: ${hostId})</strong></div>
                            <div><span style="color:var(--text-muted); font-weight:700;">MODO DE EXECUÇÃO:</span> <span class="badge" style="background:rgba(16,185,129,0.18); color:#6ee7b7; font-size:10px;">SILENCIOSO / SYSTEM / SEM PROMPT</span></div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:10px;">
                            <button class="btn-ui" onclick="window.softwareComplianceView.openMachinesModal('${this.escapeHtml(softwareName).replace(/'/g, "\\'")}')" style="padding:8px 16px; font-weight:600;">
                                Cancelar
                            </button>
                            <button class="btn-ui" style="padding:8px 18px; font-weight:800; background:rgba(239,68,68,0.25); color:#fca5a5; border-color:rgba(239,68,68,0.5);" onclick="window.softwareComplianceView.executeRemoteUninstall('${hostId}', '${this.escapeHtml(hostName).replace(/'/g, "\\'")}', '${this.escapeHtml(softwareName).replace(/'/g, "\\'")}')">
                                Executar Desinstalação
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async executeRemoteUninstall(hostId, hostName, softwareName) {
        const modalContainer = document.getElementById('complianceModalContainer');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(1,7,16,0.88); backdrop-filter:blur(10px); z-index:10002; display:flex; align-items:center; justify-content:center; padding:20px;">
                <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid var(--cs-cyan) !important; border-radius:16px !important; max-width:540px; width:100%; box-shadow:0 25px 60px rgba(0,0,0,0.95) !important; overflow:hidden; text-align:center; padding:32px 24px;">
                    <div class="spinner" style="width:42px; height:42px; border:3px solid rgba(239,68,68,0.2); border-top-color:var(--brand-crimson); border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 16px auto;"></div>
                    <h3 style="margin:0 0 6px 0; font-size:17px; font-weight:800; color:var(--text-primary);">Desinstalando ${this.escapeHtml(softwareName)}...</h3>
                    <div style="font-size:12.5px; color:var(--text-secondary); max-width:420px; margin:0 auto 6px auto;">
                        Disparando agente Zabbix em segundo plano como SYSTEM na estação <strong>${this.escapeHtml(hostName)}</strong>.
                    </div>
                    <div style="font-size:11px; color:var(--text-muted);">Aguarde a confirmação de execução do sistema operacional...</div>
                </div>
            </div>
        `;

        try {
            const res = await fetch('/api/compliance/uninstall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostId, softwareName })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            const data = await res.json();

            modalContainer.innerHTML = `
                <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(1,7,16,0.88); backdrop-filter:blur(10px); z-index:10002; display:flex; align-items:center; justify-content:center; padding:20px;">
                    <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid rgba(16,185,129,0.5) !important; border-radius:16px !important; max-width:560px; width:100%; box-shadow:0 25px 60px rgba(0,0,0,0.95) !important; overflow:hidden;">
                        <div style="padding:18px 22px; border-bottom:1px solid var(--invgate-border); background:#090e13; border-top-left-radius:16px; border-top-right-radius:16px; display:flex; align-items:center; gap:10px;">
                            <svg class="lucide-icon icon-md" style="color:var(--invgate-emerald);" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:var(--text-primary);">Desinstalação Concluída com Sucesso</h3>
                        </div>

                        <div style="padding:22px;">
                            <div style="font-size:13.5px; color:var(--text-primary); line-height:1.5; margin-bottom:14px;">
                                O comando de desinstalação silenciosa foi processado com êxito pelo agente Zabbix na estação <strong>${this.escapeHtml(hostName)}</strong>.
                            </div>

                            <div style="background:#0e131a; border:1px solid var(--invgate-border); border-radius:8px; padding:12px 14px; font-family:monospace; font-size:11.5px; color:#6ee7b7; margin-bottom:18px; word-break:break-all;">
                                ${this.escapeHtml(data.output || 'DESINSTALACAO_EXECUTADA')}
                            </div>

                            <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:18px;">
                                O software foi desinstalado silenciosamente. Na próxima coleta de telemetria da estação ele não constará mais no inventário de programas.
                            </div>

                            <div style="display:flex; justify-content:flex-end;">
                                <button class="btn-ui" style="padding:8px 20px; font-weight:700; background:rgba(16,185,129,0.2); color:#6ee7b7; border-color:rgba(16,185,129,0.4);" onclick="window.softwareComplianceView.closeModal(); window.softwareComplianceView.refresh();">
                                    Concluir e Atualizar Painel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } catch (err) {
            modalContainer.innerHTML = `
                <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(1,7,16,0.88); backdrop-filter:blur(10px); z-index:10002; display:flex; align-items:center; justify-content:center; padding:20px;">
                    <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid rgba(239,68,68,0.5) !important; border-radius:16px !important; max-width:540px; width:100%; box-shadow:0 25px 60px rgba(0,0,0,0.95) !important; overflow:hidden;">
                        <div style="padding:18px 22px; border-bottom:1px solid var(--invgate-border); background:#090e13; border-top-left-radius:16px; border-top-right-radius:16px; display:flex; align-items:center; gap:10px;">
                            <svg class="lucide-icon icon-md" style="color:var(--brand-crimson);" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:var(--text-primary);">Falha na Desinstalação Remota</h3>
                        </div>

                        <div style="padding:22px;">
                            <div style="font-size:13px; color:var(--text-primary); margin-bottom:12px;">
                                Ocorreu um erro ao tentar executar a desinstalação na estação <strong>${this.escapeHtml(hostName)}</strong>:
                            </div>

                            <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:12px 14px; font-family:monospace; font-size:11.5px; color:#fca5a5; margin-bottom:18px;">
                                ${this.escapeHtml(err.message)}
                            </div>

                            <div style="display:flex; justify-content:flex-end;">
                                <button class="btn-ui" style="padding:8px 16px; font-weight:700;" onclick="window.softwareComplianceView.openMachinesModal('${this.escapeHtml(softwareName).replace(/'/g, "\\'")}')">
                                    Voltar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    async confirmMassUninstall(softwareName, totalMachines) {
        const modalContainer = document.getElementById('complianceModalContainer');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(1,7,16,0.88); backdrop-filter:blur(10px); z-index:10001; display:flex; align-items:center; justify-content:center; padding:20px;">
                <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid rgba(239,68,68,0.5) !important; border-radius:16px !important; max-width:580px; width:100%; box-shadow:0 25px 60px rgba(0,0,0,0.95) !important; overflow:hidden;">
                    <div style="padding:18px 22px; border-bottom:1px solid var(--invgate-border); display:flex; justify-content:space-between; align-items:center; background:#090e13; border-top-left-radius:16px; border-top-right-radius:16px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <svg class="lucide-icon icon-md" style="color:var(--brand-crimson);" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:var(--text-primary);">Desinstalar de TODOS os Dispositivos</h3>
                        </div>
                        <button class="btn-ui" onclick="window.softwareComplianceView.openMachinesModal('${this.escapeHtml(softwareName).replace(/'/g, "\\'")}')" style="padding:4px 8px;">✕</button>
                    </div>

                    <div style="padding:22px;">
                        <div style="font-size:13.5px; color:var(--text-primary); line-height:1.5; margin-bottom:16px;">
                            Você está prestes a disparar o comando de desinstalação silenciosa simultaneamente em <strong>todas as estações detectadas</strong> com este software.
                        </div>

                        <div style="background:#0e131a; border:1px solid var(--invgate-border); border-radius:10px; padding:14px 16px; margin-bottom:18px; font-size:12.5px;">
                            <div style="margin-bottom:6px;"><span style="color:var(--text-muted); font-weight:700;">SOFTWARE:</span> <strong style="color:var(--text-primary);">${this.escapeHtml(softwareName)}</strong></div>
                            <div style="margin-bottom:6px;"><span style="color:var(--text-muted); font-weight:700;">TOTAL DE ESTAÇÕES AFETADAS:</span> <strong style="color:var(--brand-crimson); font-size:13.5px;">${totalMachines} computadores</strong></div>
                            <div><span style="color:var(--text-muted); font-weight:700;">MODO DE EXECUÇÃO:</span> <span class="badge" style="background:rgba(16,185,129,0.18); color:#6ee7b7; font-size:10px;">SILENCIOSO / SYSTEM / EM MASSA</span></div>
                        </div>

                        <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:18px; line-height:1.4;">
                            A ordem será distribuída para o agente Zabbix de cada computador executar a remoção do pacote e limpeza do registro em segundo plano.
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:10px;">
                            <button class="btn-ui" onclick="window.softwareComplianceView.openMachinesModal('${this.escapeHtml(softwareName).replace(/'/g, "\\'")}')" style="padding:8px 16px; font-weight:600;">
                                Cancelar
                            </button>
                            <button class="btn-ui" style="padding:8px 18px; font-weight:800; background:rgba(239,68,68,0.25); color:#fca5a5; border-color:rgba(239,68,68,0.5);" onclick="window.softwareComplianceView.executeMassUninstall('${this.escapeHtml(softwareName).replace(/'/g, "\\'")}', ${totalMachines})">
                                Desinstalar de Todas as ${totalMachines} Estações
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async executeMassUninstall(softwareName, totalMachines) {
        const modalContainer = document.getElementById('complianceModalContainer');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(1,7,16,0.88); backdrop-filter:blur(10px); z-index:10002; display:flex; align-items:center; justify-content:center; padding:20px;">
                <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid var(--cs-cyan) !important; border-radius:16px !important; max-width:580px; width:100%; box-shadow:0 25px 60px rgba(0,0,0,0.95) !important; overflow:hidden; text-align:center; padding:32px 24px;">
                    <div class="spinner" style="width:42px; height:42px; border:3px solid rgba(239,68,68,0.2); border-top-color:var(--brand-crimson); border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 16px auto;"></div>
                    <h3 style="margin:0 0 6px 0; font-size:17px; font-weight:800; color:var(--text-primary);">Desinstalando ${this.escapeHtml(softwareName)} em Massa...</h3>
                    <div id="massUninstallProgressText" style="font-size:12.5px; color:var(--text-secondary); max-width:440px; margin:0 auto 8px auto;">
                        Disparando agentes Zabbix em segundo plano como SYSTEM em <strong>${totalMachines} computadores</strong>.
                    </div>
                    <div style="font-size:11px; color:var(--text-muted);">Processando requisições na rede corporativa. Aguarde...</div>
                </div>
            </div>
        `;

        try {
            const cleanTarget = (softwareName || '').toLowerCase().trim();
            const catalogItem = ((this.data && this.data.softwareCatalog) || []).find(s => 
                (s.name || '').toLowerCase() === cleanTarget || 
                (s.fullNameSample || '').toLowerCase() === cleanTarget
            );
            const machines = (catalogItem && catalogItem.machines && catalogItem.machines.length > 0) 
                ? catalogItem.machines 
                : [];

            if (machines.length === 0) {
                throw new Error(`Nenhuma estação encontrada no inventário com o software "${softwareName}".`);
            }

            const results = [];
            const progressEl = document.getElementById('massUninstallProgressText');

            for (let i = 0; i < machines.length; i++) {
                const m = machines[i];
                if (progressEl) {
                    progressEl.innerHTML = `Processando estação <strong>${this.escapeHtml(m.name)}</strong> (${i + 1} de ${machines.length})...`;
                }

                try {
                    const res = await fetch('/api/compliance/uninstall', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            hostId: String(m.id),
                            softwareName
                        })
                    });

                    const resData = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        results.push({
                            hostId: m.id,
                            hostName: m.name,
                            success: false,
                            error: resData.error || `HTTP ${res.status}`
                        });
                    } else {
                        results.push({
                            hostId: m.id,
                            hostName: m.name,
                            success: true,
                            output: resData.output || 'Comando executado.'
                        });
                    }
                } catch (fetchErr) {
                    results.push({
                        hostId: m.id,
                        hostName: m.name,
                        success: false,
                        error: fetchErr.message
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;
            const failedCount = results.length - successCount;
            const data = { successCount, failedCount, results };

            const listHtml = results.map(r => `
                <tr style="border-bottom:1px solid var(--invgate-border);">
                    <td style="padding:8px 12px; font-weight:700; color:var(--text-primary); font-size:12px;">${this.escapeHtml(r.hostName)}</td>
                    <td style="padding:8px 12px; font-family:monospace; font-size:11px; color:var(--text-muted);">${r.hostId}</td>
                    <td style="padding:8px 12px; text-align:right;">
                        ${r.success 
                            ? `<span class="badge" style="background:rgba(16,185,129,0.18); color:#6ee7b7; font-size:10px; font-weight:700;">CONCLUÍDO</span>` 
                            : `<span class="badge" style="background:rgba(245,158,11,0.18); color:#fbbf24; font-size:10px; font-weight:700;" title="Estação offline ou ocupada. Enfileirado no NOC para auto-expurgo assim que conectar.">ENFILEIRADO (AUTO-EXPURGO)</span>`}
                    </td>
                </tr>
            `).join('');

            modalContainer.innerHTML = `
                <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(5,8,12,0.85); backdrop-filter:blur(8px); z-index:10002; display:flex; align-items:center; justify-content:center; padding:20px;">
                    <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid ${data.failedCount > 0 ? 'rgba(245,158,11,0.5)' : '#353e50'} !important; border-radius:12px !important; max-width:620px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,0.8) !important; overflow:hidden;">
                        <div style="padding:18px 22px; border-bottom:1px solid #232936; background:#090e13; border-top-left-radius:12px; border-top-right-radius:12px; display:flex; align-items:center; gap:10px;">
                            <svg class="lucide-icon icon-md" style="color:${data.failedCount > 0 ? 'var(--brand-amber)' : 'var(--invgate-emerald)'};" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:#ffffff;">Desinstalação em Massa Concluída</h3>
                        </div>

                        <div style="padding:22px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; background:#0e131a; border:1px solid #232936; border-radius:8px; padding:12px 16px;">
                                <div>
                                    <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Software</div>
                                    <strong style="color:var(--text-primary); font-size:13.5px;">${this.escapeHtml(softwareName)}</strong>
                                </div>
                                <div style="display:flex; gap:14px;">
                                    <div style="text-align:right;">
                                        <div style="font-size:11px; color:var(--text-muted);">Sucessos</div>
                                        <strong style="color:#6ee7b7; font-size:14px;">${data.successCount}</strong>
                                    </div>
                                    <div style="text-align:right;">
                                        <div style="font-size:11px; color:var(--text-muted);">Falhas</div>
                                        <strong style="color:${data.failedCount > 0 ? '#fca5a5' : 'var(--text-muted)'}; font-size:14px;">${data.failedCount}</strong>
                                    </div>
                                </div>
                            </div>

                            <div style="max-height:240px; overflow-y:auto; border:1px solid #232936; border-radius:8px; background:#0e131a; margin-bottom:18px;">
                                <table style="width:100%; border-collapse:collapse; text-align:left;">
                                    <thead>
                                        <tr style="border-bottom:1px solid #232936; background:#141820;">
                                            <th style="padding:8px 12px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">Estação</th>
                                            <th style="padding:8px 12px; font-size:11px; text-transform:uppercase; color:var(--text-muted);">ID Host</th>
                                            <th style="padding:8px 12px; font-size:11px; text-transform:uppercase; color:var(--text-muted); text-align:right;">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${listHtml}
                                    </tbody>
                                </table>
                            </div>

                            <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:18px;">
                                O comando de desinstalação silenciosa foi despachado para os endpoints. Conforme cada agente ativo enviar a telemetria, eles sairão do catálogo de conformidade.
                            </div>

                            <div style="display:flex; justify-content:flex-end;">
                                <button class="btn-ui" style="padding:8px 20px; font-weight:700; background:rgba(16,185,129,0.2); color:#6ee7b7; border-color:rgba(16,185,129,0.4);" onclick="window.softwareComplianceView.closeModal(); window.softwareComplianceView.refresh();">
                                    Concluir e Atualizar Painel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } catch (err) {
            modalContainer.innerHTML = `
                <div class="modal-overlay-custom" style="position:fixed; inset:0; background:rgba(5,8,12,0.85); backdrop-filter:blur(8px); z-index:10002; display:flex; align-items:center; justify-content:center; padding:20px;">
                    <div class="modal-card-custom" style="background:#191d24 !important; border:1px solid rgba(239,68,68,0.5) !important; border-radius:12px !important; max-width:540px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,0.8) !important; overflow:hidden;">
                        <div style="padding:18px 22px; border-bottom:1px solid #232936; background:#090e13; border-top-left-radius:12px; border-top-right-radius:12px; display:flex; align-items:center; gap:10px;">
                            <svg class="lucide-icon icon-md" style="color:var(--brand-crimson);" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:#ffffff;">Falha na Desinstalação em Massa</h3>
                        </div>

                        <div style="padding:22px;">
                            <div style="font-size:13px; color:var(--text-primary); margin-bottom:12px;">
                                Ocorreu um erro ao tentar executar a desinstalação em massa para <strong>${this.escapeHtml(softwareName)}</strong>:
                            </div>

                            <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:12px 14px; font-family:monospace; font-size:11.5px; color:#fca5a5; margin-bottom:18px;">
                                ${this.escapeHtml(err.message)}
                            </div>

                            <div style="display:flex; justify-content:flex-end;">
                                <button class="btn-ui" style="padding:8px 16px; font-weight:700;" onclick="window.softwareComplianceView.openMachinesModal('${this.escapeHtml(softwareName).replace(/'/g, "\\'")}')">
                                    Voltar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    exportCsv() {
        if (!this.data || !this.data.softwareCatalog) return;
        const rows = [
            ['Software', 'Status', 'Categoria', 'Politica', 'Quantidade_Estacoes', 'Estacoes_Instaladas']
        ];

        this.data.softwareCatalog.forEach(sw => {
            const machineNames = sw.machines.map(m => `${m.name} (${m.city})`).join('; ');
            rows.push([
                `"${(sw.name || '').replace(/"/g, '""')}"`,
                `"${sw.status}"`,
                `"${(sw.category || '').replace(/"/g, '""')}"`,
                `"${(sw.reason || '').replace(/"/g, '""')}"`,
                sw.machines.length,
                `"${machineNames.replace(/"/g, '""')}"`
            ]);
        });

        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `compliance_softwares_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    closeModal() {
        this.activeModal = null;
        const modalContainer = document.getElementById('complianceModalContainer');
        if (modalContainer) modalContainer.innerHTML = '';
    }

    escapeHtml(str) {
        if (!str) return '';
        const cleaned = cleanComplianceEncoding(String(str));
        return cleaned
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

window.softwareComplianceView = new SoftwareComplianceView();
