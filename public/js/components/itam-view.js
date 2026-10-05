class ItamView {
    constructor() {
        this.filterMode = 'all';
        this.selectedUnit = null; // Filtro de unidade selecionada (ex: 'SPO', 'BHZ' ou '__NONE__')
        this.searchQuery = '';
        this.activeSubTab = 'units'; // 'units' ou 'assets'
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
                this.renderList(window.appStore.getState());
            });
        });

        const searchInput = document.getElementById('inputFilterItam');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.renderList(window.appStore.getState());
            });
        }

        const btnList = document.getElementById('btnSubNavAssetsList');
        const btnUnits = document.getElementById('btnSubNavDiscoveryUnits');

        if (btnList && btnUnits) {
            btnList.addEventListener('click', () => {
                this.showAssetsTab();
            });
            btnUnits.addEventListener('click', () => {
                this.showUnitsTab();
            });
        }

        const btnBack = document.getElementById('btnBackToUnits');
        if (btnBack) {
            btnBack.addEventListener('click', () => {
                this.showUnitsTab();
            });
        }

        const badgeFilter = document.getElementById('badgeActiveUnitFilter');
        if (badgeFilter) {
            badgeFilter.addEventListener('click', () => {
                this.clearUnitFilter();
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

        // Abrir Modal de Nova Unidade
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
                    { unit: 'CPQ', ip: '187.32.17.94' },
                    { unit: 'SPO', ip: '187.72.161.206' },
                    { unit: 'RIO', ip: '200.142.111.121' },
                    { unit: 'BHZ', ip: '200.169.4.54' },
                    { unit: 'JDF', ip: '186.248.190.33' },
                    { unit: 'VIX', ip: '189.84.217.193' }
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
                        results.push(`${gw.unit} (${gw.ip}):  ERRO`);
                    }
                }
                btnBatchPing.innerHTML = `<svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> <span>Batch Ping em Todas as Unidades</span>`;
                alert(`[DIAGNÓSTICO EM MASSA - 6 POLOS OPERACIONAIS]\n\n${results.join('\n')}`);
            });
        }
    }

    showUnitsTab() {
        this.activeSubTab = 'units';
        const btnList = document.getElementById('btnSubNavAssetsList');
        const btnUnits = document.getElementById('btnSubNavDiscoveryUnits');
        const containerList = document.getElementById('containerItamList');
        const containerUnits = document.getElementById('containerItamUnits');

        if (btnUnits) btnUnits.classList.add('active');
        if (btnList) btnList.classList.remove('active');
        if (containerUnits) containerUnits.style.display = 'block';
        if (containerList) containerList.style.display = 'none';

        this.renderUnits(window.appStore.getState());
    }

    showAssetsTab(unitFilter = null) {
        this.activeSubTab = 'assets';
        if (unitFilter !== null) {
            this.selectedUnit = unitFilter;
        }

        const btnList = document.getElementById('btnSubNavAssetsList');
        const btnUnits = document.getElementById('btnSubNavDiscoveryUnits');
        const containerList = document.getElementById('containerItamList');
        const containerUnits = document.getElementById('containerItamUnits');

        if (btnList) btnList.classList.add('active');
        if (btnUnits) btnUnits.classList.remove('active');
        if (containerList) containerList.style.display = 'block';
        if (containerUnits) containerUnits.style.display = 'none';

        this.updateFilterBanner();
        this.renderList(window.appStore.getState());
    }

    filterByUnit(unitCode) {
        this.selectedUnit = unitCode;
        this.showAssetsTab(unitCode);
    }

    clearUnitFilter() {
        this.selectedUnit = null;
        this.updateFilterBanner();
        this.renderList(window.appStore.getState());
    }

    updateFilterBanner() {
        const badge = document.getElementById('badgeActiveUnitFilter');
        const text = document.getElementById('textActiveUnitFilter');
        if (!badge || !text) return;

        if (this.selectedUnit) {
            badge.style.display = 'inline-flex';
            if (this.selectedUnit === '__NONE__') {
                text.textContent = 'Sem Atribuição de Unidade';
            } else {
                text.textContent = `Unidade ${this.selectedUnit}`;
            }
        } else {
            badge.style.display = 'none';
        }
    }

    getDeduplicatedComputers(rawComps) {
        const snMap = new Map();
        const noSnList = [];
        (rawComps || []).forEach(comp => {
            const sn = (comp.serialNumber || '').trim().toUpperCase();
            const isInvalidSn = !sn || 
                                ['N/D', 'DESCONHECIDO', 'UNKNOWN', 'DEFAULT STRING', 'SYSTEM SERIAL NUMBER', 'NONE', 'PENDENTE', 'TO BE FILLED BY O.E.M.'].some(inv => sn.includes(inv)) ||
                                sn.includes('PENDENTE') || 
                                sn.includes('SINCRONIZANDO');
            if (isInvalidSn) {
                noSnList.push(comp);
                return;
            }
            if (!snMap.has(sn)) {
                snMap.set(sn, { ...comp });
            } else {
                const existing = snMap.get(sn);
                const isCurOnline = comp.status === 'online';
                const isExtOnline = existing.status === 'online';
                const curClock = comp.lastClock || 0;
                const extClock = existing.lastClock || 0;

                let primary = existing;
                let secondary = comp;

                if (!isExtOnline && isCurOnline) {
                    primary = { ...comp };
                    secondary = existing;
                } else if (isExtOnline === isCurOnline && curClock > extClock) {
                    primary = { ...comp };
                    secondary = existing;
                }

                const hasValidCity = (c) => c && c.city && c.city.trim() !== '' && c.city.toLowerCase() !== 'sem unidade';
                const hasValidUser = (c) => c && (c.owner || c.loggedUser) && (c.owner || c.loggedUser).trim() !== '' && !(c.owner || c.loggedUser).toLowerCase().includes('sem proprietário');

                if (!hasValidCity(primary) && hasValidCity(secondary)) {
                    primary.city = secondary.city;
                    primary.customRegion = secondary.city;
                }
                if (!hasValidUser(primary) && hasValidUser(secondary)) {
                    primary.owner = secondary.owner || secondary.loggedUser;
                    primary.loggedUser = secondary.owner || secondary.loggedUser;
                }
                snMap.set(sn, primary);
            }
        });
        return [...Array.from(snMap.values()), ...noSnList];
    }

    render(state) {
        this.init();
        if (this.activeSubTab === 'units') {
            this.renderUnits(state);
        } else {
            this.renderList(state);
        }
    }

    renderList(state) {
        const tbody = document.getElementById('tbodyItamComputers');
        if (!tbody) return;

        const esc = window.Sanitizer.escape;
        const allComps = this.getDeduplicatedComputers(state.computers || []);

        const btnAssetsSpan = document.querySelector('#btnSubNavAssetsList span');
        if (btnAssetsSpan) {
            btnAssetsSpan.textContent = `Assets / Estações (${allComps.length})`;
        }
        const chipAll = document.querySelector('[data-filter-itam="all"]');
        const chipOnline = document.querySelector('[data-filter-itam="online"]');
        if (chipAll) chipAll.textContent = `Todas as Estações (${allComps.length})`;
        if (chipOnline) {
            const onlineCount = allComps.filter(c => c.status === 'online').length;
            chipOnline.textContent = `Online (${onlineCount})`;
        }

        const btnUnitsSpan = document.querySelector('#btnSubNavDiscoveryUnits span');
        if (btnUnitsSpan) {
            const uniqueUnits = new Set(allComps.map(c => c.city).filter(Boolean));
            btnUnitsSpan.textContent = `Discovery / Unidades (${uniqueUnits.size})`;
        }

        let comps = allComps;

        // Filtro por Unidade selecionada via Card
        if (this.selectedUnit) {
            if (this.selectedUnit === '__NONE__') {
                comps = comps.filter(c => !c.city || c.city.trim() === '' || c.city.toLowerCase() === 'sem unidade');
            } else {
                comps = comps.filter(c => (c.city || '').trim().toUpperCase() === this.selectedUnit.toUpperCase());
            }
        }

        if (this.filterMode === 'online') {
            comps = comps.filter(c => c.status === 'online');
        } else if (this.filterMode === 'win11') {
            comps = comps.filter(c => c.os && c.os.includes('11'));
        } else if (this.filterMode === 'servers') {
            comps = comps.filter(c => c.os && (c.os.toLowerCase().includes('server') || c.name.toLowerCase().includes('srv')));
        }

        if (this.searchQuery) {
            comps = comps.filter(c =>
                (c.name && c.name.toLowerCase().includes(this.searchQuery)) ||
                (c.ip && c.ip.toLowerCase().includes(this.searchQuery)) ||
                (c.serialNumber && c.serialNumber.toLowerCase().includes(this.searchQuery)) ||
                (c.loggedUser && c.loggedUser.toLowerCase().includes(this.searchQuery)) ||
                (c.os && c.os.toLowerCase().includes(this.searchQuery))
            );
        }

        // Ordenação
        comps.sort((a, b) => {
            const hasNoCity = (c) => !c.city || c.city.trim() === '' || c.city.toLowerCase() === 'sem unidade';
            const aNoCity = hasNoCity(a);
            const bNoCity = hasNoCity(b);

            if (aNoCity && !bNoCity) return -1;
            if (!aNoCity && bNoCity) return 1;

            if (!aNoCity && !bNoCity) {
                const cityA = (a.city || '').trim().toUpperCase();
                const cityB = (b.city || '').trim().toUpperCase();
                const cityDiff = cityA.localeCompare(cityB);
                if (cityDiff !== 0) return cityDiff;
            }

            return (a.name || '').localeCompare(b.name || '');
        });

        if (comps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhuma estação encontrada${this.selectedUnit ? ' para esta unidade' : ''}.</td></tr>`;
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

        const allComps = this.getDeduplicatedComputers(state.computers || []);
        const unitsMap = {};
        let unassignedHosts = 0;
        let unassignedOnline = 0;

        allComps.forEach(c => {
            const hasNoCity = !c.city || c.city.trim() === '' || c.city.toLowerCase() === 'sem unidade';
            if (hasNoCity) {
                unassignedHosts++;
                if (c.status === 'online') unassignedOnline++;
            } else {
                const unitKey = c.city.trim().toUpperCase();
                if (!unitsMap[unitKey]) {
                    unitsMap[unitKey] = { name: unitKey, hosts: 0, online: 0 };
                }
                unitsMap[unitKey].hosts++;
                if (c.status === 'online') unitsMap[unitKey].online++;
            }
        });

        const units = Object.values(unitsMap).sort((a, b) => a.name.localeCompare(b.name));

        if (units.length === 0 && unassignedHosts === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; background: #141820; border: 1px dashed var(--glass-border); border-radius: 8px;">
                    <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">Nenhuma estação inventariada no momento</div>
                </div>
            `;
            return;
        }

        let html = '';

        // Card especial: SEM ATRIBUIÇÃO DE UNIDADE (se houver máquinas não atribuídas)
        if (unassignedHosts > 0) {
            const unassignedPct = Math.round((unassignedOnline / unassignedHosts) * 100);
            html += `
                <div class="table-card unit-card-clickable" onclick="window.itamView.filterByUnit('__NONE__')" style="padding:18px; cursor:pointer; border:1px solid #353e50; border-left:4px solid #f59e0b; background:#191d24; transition:all 0.2s ease;" onmouseover="this.style.borderColor='#f59e0b'; this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='#353e50'; this.style.transform='translateY(0)';" title="Clique para filtrar as estações sem atribuição de unidade">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <strong style="font-size:16px; color:#f59e0b; font-weight:800; letter-spacing:0.5px;">SEM ATRIBUIÇÃO</strong>
                                <span class="badge" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); font-size:10px; font-weight:700; padding:1px 6px;">PENDENTE</span>
                            </div>
                            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Estações aguardando definição de Polo</div>
                        </div>
                        <span class="badge badge-warning" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3);">${unassignedOnline}/${unassignedHosts} Online</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:8px;">
                        <span style="color:var(--text-muted);">Estações Pendentes:</span>
                        <strong class="tabular-nums" style="color:#f59e0b; font-weight:800;">${unassignedHosts}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:4px;">
                        <span style="color:var(--text-muted);">Conformidade:</span>
                        <strong style="color:var(--brand-emerald);">${unassignedPct}%</strong>
                    </div>
                </div>
            `;
        }

        // Cards das Unidades Cadastradas (apenas a sigla da unidade, sem a palavra UNIDADE na frente)
        html += units.map(u => {
            const confPct = Math.round((u.online / u.hosts) * 100);
            return `
                <div class="table-card unit-card-clickable" onclick="window.itamView.filterByUnit('${esc(u.name)}')" style="padding:18px; cursor:pointer; border:1px solid #232936; background:#191d24; transition:all 0.2s ease;" onmouseover="this.style.borderColor='#353e50'; this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='#232936'; this.style.transform='translateY(0)';" title="Clique para filtrar as estações de ${esc(u.name)}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                        <div>
                            <strong style="font-size:17px; color:#ffffff; font-weight:900; letter-spacing:0.8px;">${esc(u.name)}</strong>
                            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Polo Operacional Oficial</div>
                        </div>
                        <span class="badge badge-ok">${u.online}/${u.hosts} Online</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:8px;">
                        <span style="color:var(--text-muted);">Estações Ativas:</span>
                        <strong class="tabular-nums" style="color:#ffffff; font-weight:700;">${u.hosts}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:4px;">
                        <span style="color:var(--text-muted);">Conformidade:</span>
                        <strong style="color:var(--brand-emerald);">${confPct}%</strong>
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = html;
    }
}
window.itamView = new ItamView();
