class ItamView {
    constructor() {
        this.filterMode = 'all';
        this.searchQuery = '';
        this.selectedUnit = '';
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const chips = document.querySelectorAll('#view-itam .filter-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                chips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.filterMode = chip.getAttribute('data-filter-itam') || 'all';
                this.render(window.appStore.getState());
            });
        });

        const searchInput = document.getElementById('inputFilterItam');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.render(window.appStore.getState());
            });
        }

        const selectUnit = document.getElementById('selectItamUnitFilter');
        if (selectUnit) {
            selectUnit.addEventListener('change', (e) => {
                this.selectedUnit = e.target.value.trim();
                this.render(window.appStore.getState());
            });
        }

        const btnList = document.getElementById('btnSubNavAssetsList');
        const btnUnits = document.getElementById('btnSubNavDiscoveryUnits');
        const containerList = document.getElementById('containerItamList');
        const containerUnits = document.getElementById('containerItamUnits');

        if (btnList && btnUnits && containerList && containerUnits) {
            btnList.addEventListener('click', () => {
                btnList.classList.add('active');
                btnUnits.classList.remove('active');
                containerList.style.display = 'block';
                containerUnits.style.display = 'none';
            });
            btnUnits.addEventListener('click', () => {
                btnUnits.classList.add('active');
                btnList.classList.remove('active');
                containerList.style.display = 'none';
                containerUnits.style.display = 'block';
                this.renderUnits(window.appStore.getState());
            });
        }

        // Exportar Inventário em PDF
        const btnExport = document.getElementById('btnExportInventoryPDF');
        if (btnExport) {
            btnExport.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.assetDrawer) {
                    window.assetDrawer.openConsolidatedReport('itam');
                } else {
                    window.print();
                }
            });
        }

        // Modal de Nova Unidade
        const btnCreateUnit = document.getElementById('btnOpenCreateUnitModal');
        if (btnCreateUnit) {
            btnCreateUnit.addEventListener('click', () => {
                const modal = document.getElementById('modalCreateUnit');
                if (modal) modal.style.display = 'flex';
            });
        }

        // Batch Ping em Todas as Unidades
        const btnBatchPing = document.getElementById('btnBatchPingAllUnits');
        if (btnBatchPing) {
            btnBatchPing.addEventListener('click', async () => {
                btnBatchPing.textContent = 'Executando Batch Ping...';
                const gateways = [
                    { unit: 'CPQ - Campinas', ip: '187.32.17.94' },
                    { unit: 'SPO - São Paulo', ip: '187.72.161.206' },
                    { unit: 'RIO - Rio de Janeiro', ip: '200.142.111.121' },
                    { unit: 'BHZ - Belo Horizonte', ip: '200.169.4.54' },
                    { unit: 'JDF - Juiz de Fora', ip: '186.248.190.33' },
                    { unit: 'VIX - Vitória', ip: '189.84.217.193' }
                ];
                const results = [];
                for (const gw of gateways) {
                    try {
                        const res = await fetch('/api/test-link', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ip: gw.ip })
                        });
                        const d = await res.json();
                        results.push(`${gw.unit} (${gw.ip}): ${d.success ? ' ONLINE' : ' FALHA'}`);
                    } catch (e) {
                        results.push(`${gw.unit} (${gw.ip}): ERRO`);
                    }
                }
                btnBatchPing.innerHTML = `<svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> <span>Batch Ping em Todas as Unidades</span>`;
                alert(`[DIAGNÓSTICO EM MASSA - 6 POLOS OPERACIONAIS]\n\n${results.join('\n')}`);
            });
        }
    }

    filterByUnit(unitCity) {
        this.selectedUnit = (unitCity || '').trim();
        const btnList = document.getElementById('btnSubNavAssetsList');
        const btnUnits = document.getElementById('btnSubNavDiscoveryUnits');
        const containerList = document.getElementById('containerItamList');
        const containerUnits = document.getElementById('containerItamUnits');

        if (btnList && btnUnits && containerList && containerUnits) {
            btnList.classList.add('active');
            btnUnits.classList.remove('active');
            containerList.style.display = 'block';
            containerUnits.style.display = 'none';
        }

        this.render(window.appStore.getState());
    }

    clearUnitFilter() {
        this.selectedUnit = '';
        this.render(window.appStore.getState());
    }

    render(state) {
        this.init();
        const tbody = document.getElementById('tbodyItamComputers');
        if (!tbody) return;

        const esc = window.Sanitizer.escape;
        const allComps = state.computers || [];

        // Atualizar contadores no sub-nav
        const btnAssetsSpan = document.querySelector('#btnSubNavAssetsList span');
        if (btnAssetsSpan) {
            btnAssetsSpan.textContent = `Estações (${allComps.length})`;
        }
        const chipAll = document.querySelector('[data-filter-itam="all"]');
        const chipOnline = document.querySelector('[data-filter-itam="online"]');
        if (chipAll) chipAll.textContent = `Todas as Estações (${allComps.length})`;
        if (chipOnline) {
            const onlineCount = allComps.filter(c => c.status === 'online').length;
            chipOnline.textContent = `Online (${onlineCount})`;
        }

        const btnUnitsSpan = document.querySelector('#btnSubNavDiscoveryUnits span');
        const uniqueUnits = Array.from(new Set(allComps.map(c => c.city).filter(Boolean))).sort();
        if (btnUnitsSpan) {
            btnUnitsSpan.textContent = `Discovery / Unidades (${uniqueUnits.length})`;
        }

        // Atualizar seletor de Unidades
        const selectUnit = document.getElementById('selectItamUnitFilter');
        if (selectUnit) {
            const currentSelected = (this.selectedUnit || '').toUpperCase().trim();
            const optionsHtml = ['<option value="">Todas as Unidades</option>']
                .concat(uniqueUnits.map(u => {
                    const isSel = u.toUpperCase().trim() === currentSelected ? 'selected' : '';
                    return `<option value="${esc(u)}" ${isSel}>${esc(u)}</option>`;
                })).join('');
            selectUnit.innerHTML = optionsHtml;
        }

        let comps = allComps;

        // Filtro por Unidade / Filial
        if (this.selectedUnit) {
            const filterNorm = this.selectedUnit.toUpperCase().trim();
            comps = comps.filter(c => (c.city || '').toUpperCase().trim() === filterNorm);
        }

        // Badge de Unidade Ativa
        const badge = document.getElementById('itamUnitActiveBadge');
        if (badge) {
            if (this.selectedUnit) {
                badge.style.display = 'flex';
                badge.innerHTML = `
                    <span style="background:rgba(56,189,248,0.15); border:1px solid var(--cs-cyan); color:var(--cs-cyan); padding:4px 10px; border-radius:6px; font-size:12px; font-weight:700; display:flex; align-items:center; gap:8px;">
                        Filial: ${esc(this.selectedUnit)} (${comps.length} computadores)
                        <span onclick="window.itamView.clearUnitFilter()" style="cursor:pointer; font-weight:900; font-size:13px; color:#f87171; margin-left:4px;" title="Remover filtro de filial">✕</span>
                    </span>
                `;
            } else {
                badge.style.display = 'none';
            }
        }

        // Filtro facetado (Online / Win11 / Servidores)
        if (this.filterMode === 'online') {
            comps = comps.filter(c => c.status === 'online');
        } else if (this.filterMode === 'win11') {
            comps = comps.filter(c => c.os && c.os.includes('11'));
        } else if (this.filterMode === 'servers') {
            comps = comps.filter(c => c.os && (c.os.toLowerCase().includes('server') || c.name.toLowerCase().includes('srv')));
        }

        // Busca textual
        if (this.searchQuery) {
            comps = comps.filter(c =>
                (c.name && c.name.toLowerCase().includes(this.searchQuery)) ||
                (c.ip && c.ip.toLowerCase().includes(this.searchQuery)) ||
                (c.serialNumber && c.serialNumber.toLowerCase().includes(this.searchQuery)) ||
                (c.loggedUser && c.loggedUser.toLowerCase().includes(this.searchQuery)) ||
                (c.os && c.os.toLowerCase().includes(this.searchQuery))
            );
        }

        // Ordenação inteligente: computadores sem unidade/proprietário no topo, seguidos por Filial (A-Z) e Nome
        comps.sort((a, b) => {
            const isMissing = (c) => {
                const noCity = !c.city || c.city.trim() === '' || c.city.toLowerCase() === 'sem unidade';
                const noUser = !c.loggedUser || c.loggedUser.trim() === '' || c.loggedUser.toLowerCase() === 'sem proprietário';
                let score = 0;
                if (noCity) score += 2;
                if (noUser) score += 1;
                return score;
            };

            const scoreA = isMissing(a);
            const scoreB = isMissing(b);

            if (scoreA !== scoreB) {
                return scoreB - scoreA;
            }

            const cityA = (a.city || '').trim().toLowerCase();
            const cityB = (b.city || '').trim().toLowerCase();
            const cityDiff = cityA.localeCompare(cityB);
            if (cityDiff !== 0) {
                return cityDiff;
            }

            return (a.name || '').localeCompare(b.name || '');
        });

        if (comps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhuma estação encontrada${this.selectedUnit ? ` para a unidade ${esc(this.selectedUnit)}` : ''}.</td></tr>`;
            return;
        }

        tbody.innerHTML = comps.map(c => {
            const hwRaw = (c.hardware || '').trim();
            const isHwUnknown = !hwRaw || /^(unknown|n\/d|desconhecido)$/i.test(hwRaw);
            const hwDisplay = isHwUnknown ? (c.manufacturer || 'Hardware') : hwRaw;
            return `
            <tr onclick="window.assetDrawer.open('${esc(c.id)}', 'computer')" style="cursor:pointer;">
                <td style="text-align:center;">
                    <span class="badge ${c.status === 'online' ? 'badge-ok' : 'badge-error'}">
                        ${(c.status || 'offline').toUpperCase()}
                    </span>
                </td>
                <td>
                    <div style="font-weight:700; color:var(--text-primary);">${esc(c.name)}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${esc(hwDisplay)} · ${esc(c.os || 'Windows')}</div>
                </td>
                <td class="tabular-nums" style="font-size:12px; font-weight:600; color:var(--cs-cyan);">${esc(c.serialNumber || 'N/D')}</td>
                <td>
                    <div>${c.city ? esc(c.city) : '<span style="color:var(--text-muted); font-style:italic;">Sem Unidade</span>'}</div>
                    <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono); margin-top:2px;">${esc(c.ip || '--')}</div>
                </td>
                <td>
                    <div style="font-weight:600; color:var(--text-primary);">${c.loggedUser ? esc(c.loggedUser) : '<span style="color:var(--text-muted); font-style:italic;">Sem Proprietário</span>'}</div>
                    <div style="font-size:11px; color:${c.antivirus && c.antivirus !== 'Não detectado' ? 'var(--brand-emerald)' : 'var(--text-muted)'}; margin-top:2px;">${esc(c.antivirus || 'Não detectado')}</div>
                </td>
            </tr>
        `;}).join('');
    }

    renderUnits(state) {
        const grid = document.getElementById('gridOperationalUnits');
        if (!grid) return;
        const esc = window.Sanitizer.escape;

        const comps = state.computers || [];
        const unitsMap = {};
        comps.forEach(c => {
            if (c.city) {
                const cityNorm = c.city.trim().toUpperCase();
                if (!unitsMap[cityNorm]) {
                    unitsMap[cityNorm] = { name: cityNorm, city: cityNorm, hosts: 0, online: 0 };
                }
                unitsMap[cityNorm].hosts++;
                if (c.status === 'online') unitsMap[cityNorm].online++;
            }
        });

        const units = Object.values(unitsMap).sort((a, b) => a.name.localeCompare(b.name));

        if (units.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; background: rgba(15, 23, 42, 0.4); border: 1px dashed var(--glass-border); border-radius: 8px;">
                    <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">Nenhuma unidade com computadores vinculados</div>
                    <div style="font-size: 12px; color: var(--text-muted); max-width: 540px; margin: 0 auto; line-height: 1.5;">
                        As estações sincronizadas via Zabbix Agent v2 não possuem o campo de localização/cidade preenchido no inventário do host. Todas estão categorizadas como <span style="color:var(--text-secondary); font-weight:600;">Sem Unidade</span>.
                    </div>
                </div>
            `;
            return;
        }

        grid.innerHTML = units.map(u => `
            <div class="table-card" 
                 style="padding:18px; cursor:pointer; transition: transform 0.15s ease, border-color 0.15s ease;"
                 onmouseover="this.style.borderColor='var(--cs-cyan)'; this.style.transform='translateY(-2px)'"
                 onmouseout="this.style.borderColor='var(--glass-border)'; this.style.transform='none'"
                 onclick="window.itamView.filterByUnit('${esc(u.city)}')"
                 title="Clique para filtrar as estações de ${esc(u.name)}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <strong style="font-size:15px; color:var(--text-primary);">${esc(u.name)}</strong>
                        <div style="font-size:11px; color:var(--text-muted);">Filial Operacional</div>
                    </div>
                    <span class="badge ${u.online > 0 ? 'badge-ok' : 'badge-warn'}">${u.online}/${u.hosts} Online</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:8px;">
                    <span style="color:var(--text-muted);">Estações Ativas:</span>
                    <strong class="tabular-nums" style="color:var(--cs-cyan);">${u.hosts}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:4px;">
                    <span style="color:var(--text-muted);">Conformidade:</span>
                    <strong style="color:var(--brand-emerald);">${Math.round((u.online / u.hosts) * 100)}%</strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06);">
                    <span style="font-size:11px; color:var(--cs-cyan); font-weight:600;">Ver Estações →</span>
                    <span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${u.hosts} PCs</span>
                </div>
            </div>
        `).join('');
    }
}
window.itamView = new ItamView();
