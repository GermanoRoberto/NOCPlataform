class ItamView {
    constructor() {
        this.filterMode = 'all';
        this.searchQuery = '';
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

        // 4. Exportar Inventário em PDF
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

        // 5. Abrir Modal de Nova Unidade
        const btnCreateUnit = document.getElementById('btnOpenCreateUnitModal');
        if (btnCreateUnit) {
            btnCreateUnit.addEventListener('click', () => {
                const modal = document.getElementById('modalCreateUnit');
                if (modal) modal.style.display = 'flex';
            });
        }

        // 6. Batch Ping em Todas as Unidades
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
                        results.push(`${gw.unit} (${gw.ip}):  ERRO`);
                    }
                }
                btnBatchPing.innerHTML = `<svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> <span>Batch Ping em Todas as Unidades</span>`;
                alert(`[DIAGNÓSTICO EM MASSA - 6 POLOS OPERACIONAIS]\n\n${results.join('\n')}`);
            });
        }
    }

    render(state) {
        this.init();
        const tbody = document.getElementById('tbodyItamComputers');
        if (!tbody) return;

        const esc = window.Sanitizer.escape;
        const allComps = state.computers || [];

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

        // Ordenação inteligente: Computadores sem informações SEMPRE no topo, seguidos por Filial (A-Z) e Nome
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

            // Quem tem maior pontuação de falta de informação fica no TOPO
            if (scoreA !== scoreB) {
                return scoreB - scoreA;
            }

            // Se ambos têm informações (ou mesmo nível de pendência), ordena por Filial (city)
            const cityA = (a.city || '').trim().toLowerCase();
            const cityB = (b.city || '').trim().toLowerCase();
            const cityDiff = cityA.localeCompare(cityB);
            if (cityDiff !== 0) {
                return cityDiff;
            }

            // Desempate alfabético por Nome da máquina
            return (a.name || '').localeCompare(b.name || '');
        });

        if (comps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhuma estação encontrada.</td></tr>`;
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
                if (!unitsMap[c.city]) {
                    unitsMap[c.city] = { name: c.city, city: c.city, hosts: 0, online: 0 };
                }
                unitsMap[c.city].hosts++;
                if (c.status === 'online') unitsMap[c.city].online++;
            }
        });

        const units = Object.values(unitsMap);

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
            <div class="table-card" style="padding:18px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <strong style="font-size:14px; color:var(--text-primary);">${esc(u.name)}</strong>
                        <div style="font-size:11px; color:var(--text-muted);">${esc(u.city)}</div>
                    </div>
                    <span class="badge badge-ok">${u.online}/${u.hosts} Online</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:8px;">
                    <span style="color:var(--text-muted);">Estações Ativas:</span>
                    <strong class="tabular-nums" style="color:var(--cs-cyan);">${u.hosts}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:4px;">
                    <span style="color:var(--text-muted);">Conformidade:</span>
                    <strong style="color:var(--brand-emerald);">${Math.round((u.online / u.hosts) * 100)}%</strong>
                </div>
            </div>
        `).join('');
    }
}
window.itamView = new ItamView();
