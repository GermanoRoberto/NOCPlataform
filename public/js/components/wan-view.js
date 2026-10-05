class WanView {
    constructor() {
        this.displayMode = 'cards'; // 'cards' ou 'table'
        this.typeFilter = 'all';     // 'all', 'link', 'gateway'
        this.statusFilter = 'all';   // 'all', 'online', 'degraded', 'offline'
        this.searchQuery = '';
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        // 1. Toggle de Modo de Visualização: Cards vs Tabela
        const btnCards = document.getElementById('btnWanModeCards');
        const btnTable = document.getElementById('btnWanModeTable');

        if (btnCards && btnTable) {
            btnCards.addEventListener('click', () => {
                this.displayMode = 'cards';
                btnCards.classList.add('active');
                btnCards.style.background = 'rgba(56,189,248,0.2)';
                btnCards.style.color = 'var(--cs-cyan)';
                btnTable.classList.remove('active');
                btnTable.style.background = 'transparent';
                btnTable.style.color = 'var(--text-secondary)';
                this.render(window.appStore.getState());
            });

            btnTable.addEventListener('click', () => {
                this.displayMode = 'table';
                btnTable.classList.add('active');
                btnTable.style.background = 'rgba(56,189,248,0.2)';
                btnTable.style.color = 'var(--cs-cyan)';
                btnCards.classList.remove('active');
                btnCards.style.background = 'transparent';
                btnCards.style.color = 'var(--text-secondary)';
                this.render(window.appStore.getState());
            });
        }

        // 2. Filtros de Tipo (Todos, Somente Links, Somente Gateways)
        const typeChips = document.querySelectorAll('#containerWanTypeChips .filter-chip');
        typeChips.forEach(chip => {
            chip.addEventListener('click', () => {
                typeChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.typeFilter = chip.getAttribute('data-filter-type') || 'all';
                // Se o usuário selecionou apenas Link ou apenas Gateway, alternamos suavemente para Tabela se preferir
                if (this.typeFilter !== 'all' && this.displayMode === 'cards') {
                    this.displayMode = 'table';
                    if (btnTable && btnCards) {
                        btnTable.classList.add('active');
                        btnTable.style.background = 'rgba(56,189,248,0.2)';
                        btnTable.style.color = 'var(--cs-cyan)';
                        btnCards.classList.remove('active');
                        btnCards.style.background = 'transparent';
                        btnCards.style.color = 'var(--text-secondary)';
                    }
                }
                this.render(window.appStore.getState());
            });
        });

        // 3. Filtros de Status (Todos, Online, Oscilando, Offline)
        const statusChips = document.querySelectorAll('#containerWanStatusChips .filter-chip');
        statusChips.forEach(chip => {
            chip.addEventListener('click', () => {
                statusChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.statusFilter = chip.getAttribute('data-filter-wan') || 'all';
                this.render(window.appStore.getState());
            });
        });

        // 4. Busca em Tempo Real
        const searchInput = document.getElementById('inputFilterWan');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.render(window.appStore.getState());
            });
        }
    }

    isGateway(item) {
        const n = (item.name || '').toUpperCase();
        return n.includes('GATEWAY') || n.includes('DRAYTEK');
    }

    getCanonicalBranch(item) {
        const n = (item.name || '').toUpperCase();
        const c = (item.city || '').toUpperCase();

        if (n.includes('SPO') || c.includes('SPO') || c.includes('SÃO PAULO') || c.includes('SAO PAULO')) return 'SPO';
        if (n.includes('RIO') || c.includes('RIO') || c.includes('JANEIRO')) return 'RIO';
        if (n.includes('BHZ') || c.includes('BHZ') || c.includes('HORIZONTE')) return 'BHZ';
        if (n.includes('CPQ') || c.includes('CPQ') || c.includes('CAMPINAS')) return 'CPQ';
        if (n.includes('JDF') || c.includes('JDF') || c.includes('FORA')) return 'JDF';
        if (n.includes('VIX') || c.includes('VIX') || c.includes('VITÓRIA') || c.includes('VITORIA')) return 'VIX';
        if (n.includes('PPY') || c.includes('PPY') || n.includes('POUSO')) return 'PPY';
        if (n.includes('VGA') || c.includes('VGA') || n.includes('VARGINHA')) return 'VGA';
        if (n.includes('PTR') || c.includes('PTR') || n.includes('PETROPOLIS') || n.includes('ALTA REDE')) return 'PTR';
        if (n.includes('FBR') || c.includes('FBR') || n.includes('GIGALINK') || n.includes('FRIBURGO')) return 'FBR';
        if (n.includes('BETIM') || c.includes('BETIM') || n.includes('MTZ') || c.includes('MATRIZ')) return 'MTZ';
        if (n.includes('CNA') || c.includes('CNA') || c.includes('COLATINA')) return 'CNA';
        if (n.includes('BCA') || c.includes('BCA') || c.includes('BARBACENA')) return 'BCA';
        if (n.includes('DIV') || c.includes('DIV') || c.includes('DIVINOPOLIS')) return 'DIV';
        if (n.includes('IPA') || c.includes('IPA') || c.includes('IPATINGA')) return 'IPA';
        if (n.includes('UDI') || c.includes('UDI') || c.includes('UBERLANDIA')) return 'UDI';
        if (n.includes('CAB') || c.includes('CAB') || c.includes('CABO FRIO')) return 'CAB';
        if (n.includes('CGO') || c.includes('CGO') || c.includes('CAMPOS')) return 'CGO';
        if (n.includes('ITB') || c.includes('ITB') || c.includes('ITABORAI')) return 'ITB';
        if (n.includes('MCE') || c.includes('MCE') || c.includes('MACAE')) return 'MCE';
        if (n.includes('TRS') || c.includes('TRS') || c.includes('TRES RIOS')) return 'TRS';
        if (n.includes('VRE') || c.includes('VRE') || c.includes('VOLTA REDONDA')) return 'VRE';
        return item.city || 'OUTRAS';
    }

    render(state) {
        this.init();
        const esc = window.Sanitizer.escape;
        const allItems = (state.links || []).filter(l => {
            const n = (l.name || '').toLowerCase();
            return !n.includes('samsung') && !n.includes('impressora');
        });

        // Atualizar Contadores no Topo
        const countAllEl = document.getElementById('countWanAll');
        const countLinksEl = document.getElementById('countWanLinks');
        const countGatewaysEl = document.getElementById('countWanGateways');
        const subtitleEl = document.getElementById('wanSubtitleStats');

        const totalGateways = allItems.filter(i => this.isGateway(i)).length;
        const totalLinks = allItems.length - totalGateways;

        if (countAllEl) countAllEl.textContent = allItems.length;
        if (countLinksEl) countLinksEl.textContent = totalLinks;
        if (countGatewaysEl) countGatewaysEl.textContent = totalGateways;
        if (subtitleEl) {
            subtitleEl.textContent = totalGateways > 0 
                ? `${totalLinks} Links WAN operacionais e ${totalGateways} Gateways/Roteadores core sincronizados via Zabbix API.`
                : `${totalLinks} Circuitos WAN operacionais sincronizados via Zabbix API (Gateways desabilitados para economia de dados).`;
        }

        const chipGateway = document.querySelector('#containerWanTypeChips button[data-filter-type="gateway"]');
        if (chipGateway) {
            chipGateway.style.display = totalGateways > 0 ? 'inline-flex' : 'none';
        }

        // Filtrar Ativos
        let filtered = allItems;

        // Filtro de Tipo
        if (this.typeFilter === 'link') {
            filtered = filtered.filter(i => !this.isGateway(i));
        } else if (this.typeFilter === 'gateway') {
            filtered = filtered.filter(i => this.isGateway(i));
        }

        // Filtro de Status
        if (this.statusFilter === 'online') {
            filtered = filtered.filter(l => l.status === 'online' && (l.latency || 0) <= 150);
        } else if (this.statusFilter === 'degraded') {
            filtered = filtered.filter(l => l.status === 'online' && (l.latency > 150 || (l.packetLoss && l.packetLoss > 2)));
        } else if (this.statusFilter === 'offline') {
            filtered = filtered.filter(l => l.status === 'offline');
        }

        // Filtro de Busca
        if (this.searchQuery) {
            filtered = filtered.filter(l => 
                (l.name && l.name.toLowerCase().includes(this.searchQuery)) ||
                (l.ip && l.ip.toLowerCase().includes(this.searchQuery)) ||
                (l.city && l.city.toLowerCase().includes(this.searchQuery)) ||
                (l.isp && l.isp.toLowerCase().includes(this.searchQuery))
            );
        }

        const containerCards = document.getElementById('containerWanBranchCards');
        const containerTable = document.getElementById('containerWanTable');

        if (this.displayMode === 'cards') {
            if (containerCards) containerCards.style.display = 'grid';
            if (containerTable) containerTable.style.display = 'none';
            this.renderBranchCards(filtered, allItems);
        } else {
            if (containerCards) containerCards.style.display = 'none';
            if (containerTable) containerTable.style.display = 'block';
            this.renderTable(filtered);
        }
    }

    renderBranchCards(filteredItems, allItems) {
        const container = document.getElementById('containerWanBranchCards');
        if (!container) return;
        const esc = window.Sanitizer.escape;

        if (filteredItems.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align:center; padding:50px 20px; background:var(--invgate-card); border:1px solid var(--invgate-border); border-radius:10px; color:var(--text-muted);">
                    <div style="font-size:32px; margin-bottom:12px;"></div>
                    <strong style="color:var(--text-primary); font-size:15px; display:block; margin-bottom:6px;">Nenhum ativo corresponde aos filtros selecionados</strong>
                    <p style="font-size:12px;">Tente ajustar a busca ou redefinir os filtros de tipo e status.</p>
                </div>
            `;
            return;
        }

        // Agrupar itens por Unidade / Filial
        const branches = {};
        filteredItems.forEach(item => {
            const branchName = this.getCanonicalBranch(item);
            if (!branches[branchName]) {
                branches[branchName] = { gateways: [], links: [] };
            }
            if (this.isGateway(item)) {
                branches[branchName].gateways.push(item);
            } else {
                branches[branchName].links.push(item);
            }
        });

        // Ordem preferencial de filiais (Siglas Oficiais)
        const order = [
            'MTZ',
            'BHZ',
            'SPO',
            'RIO',
            'CPQ',
            'JDF',
            'VIX',
            'PPY',
            'VGA',
            'PTR',
            'FBR',
            'CNA',
            'BCA',
            'DIV',
            'IPA',
            'UDI',
            'CAB',
            'CGO',
            'ITB',
            'MCE',
            'TRS',
            'VRE'
        ];

        const sortedBranchNames = Object.keys(branches).sort((a, b) => {
            const idxA = order.indexOf(a);
            const idxB = order.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        container.innerHTML = sortedBranchNames.map(branchName => {
            const data = branches[branchName];
            const gws = data.gateways;
            const links = data.links;

            // Calcular status consolidado da unidade
            const allBranchItems = [...gws, ...links];
            const offlineCount = allBranchItems.filter(i => i.status === 'offline').length;
            const degradedCount = allBranchItems.filter(i => i.status === 'online' && ((i.latency || 0) > 150 || (i.packetLoss || 0) > 2)).length;
            const onlineCount = allBranchItems.length - offlineCount - degradedCount;

            let summaryBadge = '';
            if (offlineCount > 0) {
                summaryBadge = `<span class="badge badge-error" style="font-size:11px; padding:3px 8px;"> ${offlineCount} Ativo(s) Fora</span>`;
            } else if (degradedCount > 0) {
                summaryBadge = `<span class="badge badge-warning" style="font-size:11px; padding:3px 8px;">️ ${degradedCount} Oscilando</span>`;
            } else {
                summaryBadge = `<span class="badge badge-ok" style="font-size:11px; padding:3px 8px;"> ${links.length} Link(s) Conformes</span>`;
            }

            // Bloco de Gateways
            const gatewaysHtml = gws.length > 0 ? `
                <div style="margin-bottom:14px;">
                    <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                        <span>️ Gateway Core / Roteador (${gws.length})</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${gws.map(gw => {
                            const isOff = gw.status === 'offline';
                            const lat = gw.latency !== null ? `${gw.latency} ms` : '--';
                            return `
                                <div onclick="window.assetDrawer.open('${esc(gw.id)}', 'link')" style="cursor:pointer; background:rgba(255,255,255,0.02); border:1px solid ${isOff ? 'rgba(255,0,85,0.3)' : 'rgba(56,189,248,0.15)'}; border-radius:6px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='rgba(56,189,248,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                                    <div>
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${isOff ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};"></span>
                                            <strong style="color:var(--text-primary); font-size:12px;">${esc(gw.name)}</strong>
                                        </div>
                                        <div style="font-size:11px; color:var(--cs-cyan); margin-top:2px; font-family:var(--font-mono);">${esc(gw.ip || '--')}</div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <span class="tabular-nums" style="font-size:11px; color:var(--text-muted); font-weight:600;">${lat}</span>
                                        ${gw.ip ? `
                                            <a href="https://${esc(gw.ip)}" target="_blank" rel="noopener noreferrer" class="btn-ui" style="padding:2px 6px; font-size:10px;" onclick="event.stopPropagation();" title="Acessar DrayTek Web">
                                                Web ↗
                                            </a>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : '';

            // Bloco de Links Conectados
            const linksHtml = links.length > 0 ? `
                <div>
                    <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                        <span> Circuitos de Internet Conectados (${links.length})</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${links.map(l => {
                            const isOff = l.status === 'offline';
                            const isDegraded = !isOff && ((l.latency || 0) > 150 || (l.packetLoss || 0) > 2);
                            const lat = l.latency !== null ? `${l.latency} ms` : '--';
                            const loss = (l.packetLoss || 0) > 0 ? `${l.packetLoss}% perda` : '0% perda';

                            // Mini Sparkline
                            const sparkPoints = (l.history && l.history.length > 1) ? l.history : [12, 14, 13, 16, 15];
                            const min = Math.min(...sparkPoints);
                            const max = Math.max(...sparkPoints, min + 1);
                            const pts = sparkPoints.map((val, idx) => {
                                const x = (idx / (sparkPoints.length - 1)) * 40;
                                const y = 14 - ((val - min) / (max - min)) * 10;
                                return `${x},${y}`;
                            }).join(' ');

                            return `
                                <div onclick="window.assetDrawer.open('${esc(l.id)}', 'link')" style="cursor:pointer; background:#141820; border:1px solid ${isOff ? 'rgba(234,29,45,0.4)' : '#232936'}; border-radius:6px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; transition:background 0.15s;" onmouseover="this.style.background='#1e232c'" onmouseout="this.style.background='#141820'">
                                    <div style="flex:1; min-width:0; padding-right:10px;">
                                        <div style="display:flex; align-items:center; gap:6px;">
                                            <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${isOff ? 'var(--brand-crimson)' : (isDegraded ? 'var(--brand-amber)' : 'var(--brand-emerald)')};"></span>
                                            <strong style="color:var(--text-primary); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(l.name)}">${esc(l.name)}</strong>
                                        </div>
                                        <div style="display:flex; align-items:center; gap:8px; margin-top:3px;">
                                            <span style="font-size:10px; padding:1px 5px; border-radius:3px; background:rgba(255,255,255,0.06); color:#cbd5e1; font-weight:600;">${esc(l.isp || 'Telecom')}</span>
                                            <span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${esc(l.ip || '--')}</span>
                                        </div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <div style="text-align:right;">
                                            <div class="tabular-nums" style="font-size:11px; font-weight:700; color:${isDegraded ? 'var(--brand-amber)' : (isOff ? 'var(--brand-crimson)' : 'var(--text-primary)')};">${lat}</div>
                                            <div style="font-size:10px; color:${(l.packetLoss || 0) > 2 ? 'var(--brand-crimson)' : 'var(--text-muted)'};">${loss}</div>
                                        </div>
                                        <svg width="40" height="14" style="overflow:visible;">
                                            <polyline fill="none" stroke="${isOff ? '#ea1d2d' : '#38bdf8'}" stroke-width="1.5" points="${pts}" />
                                        </svg>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : '<div style="font-size:11px; color:var(--text-muted); font-style:italic;">Nenhum enlace secundário associado.</div>';

            return `
                <div class="invgate-card" style="border:1px solid #232936; border-radius:8px; padding:16px; background:#191d24; box-shadow:0 2px 10px rgba(0,0,0,0.3); display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <!-- Header do Card da Unidade -->
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; border-bottom:1px solid #232936; padding-bottom:10px;">
                            <div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <h3 style="font-size:14px; font-weight:700; color:#ffffff; margin:0;">${esc(branchName)}</h3>
                                </div>
                                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Topologia de Borda & Roteamento WAN</div>
                            </div>
                            <div>
                                ${summaryBadge}
                            </div>
                        </div>

                        <!-- Conteúdo: Gateways e Links -->
                        ${gatewaysHtml}
                        ${linksHtml}
                    </div>

                    <!-- Rodapé do Card com Ação Rápida -->
                    <div style="margin-top:14px; padding-top:10px; border-top:1px solid #232936; display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-muted);">
                        <span>Total de Circuitos: <strong style="color:#ffffff;">${allBranchItems.length}</strong></span>
                        <button class="btn-ui" style="padding:2px 8px; font-size:10px; background:#222731; border-color:#353e50; color:#cbd5e1;" onclick="window.wanView.filterByBranch('${esc(branchName)}')">
                            Filtrar Unidade
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    filterByBranch(branchName) {
        const searchInput = document.getElementById('inputFilterWan');
        if (searchInput) {
            searchInput.value = branchName.replace(/\(.*?\)/g, '').trim();
            this.searchQuery = searchInput.value.toLowerCase().trim();
            this.render(window.appStore.getState());
        }
    }

    renderTable(links) {
        const tbody = document.getElementById('tbodyLinksTable');
        if (!tbody) return;
        const esc = window.Sanitizer.escape;

        if (links.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhum circuito ou gateway corresponde ao filtro atual.</td></tr>`;
            return;
        }

        tbody.innerHTML = links.map(l => {
            const isGw = this.isGateway(l);
            const isOffline = l.status === 'offline';
            const isDegraded = !isOffline && ((l.latency || 0) > 150 || (l.packetLoss && l.packetLoss > 2));
            
            let badgeHtml = '<span class="badge badge-ok">ONLINE</span>';
            if (isOffline) badgeHtml = '<span class="badge badge-error">OFFLINE</span>';
            else if (isDegraded) badgeHtml = '<span class="badge badge-warning">OSCILANDO</span>';

            const typeBadge = isGw 
                ? '<span class="badge" style="background:rgba(59, 130, 246, 0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); font-size:10px; font-weight:700;">️ GATEWAY</span>'
                : '<span class="badge" style="background:rgba(56, 189, 248, 0.15); color:var(--cs-cyan); border:1px solid rgba(56,189,248,0.3); font-size:10px; font-weight:700;"> LINK WAN</span>';

            const latencyVal = l.latency !== null ? `${l.latency} ms` : '--';
            const lossVal = l.packetLoss !== null ? `${l.packetLoss}%` : '0%';

            const sparkPoints = (l.history && l.history.length > 1) ? l.history : [10, 15, 12, 20, 14];
            const min = Math.min(...sparkPoints);
            const max = Math.max(...sparkPoints, min + 1);
            const pts = sparkPoints.map((val, idx) => {
                const x = (idx / (sparkPoints.length - 1)) * 60;
                const y = 20 - ((val - min) / (max - min)) * 16;
                return `${x},${y}`;
            }).join(' ');

            return `
                <tr onclick="window.assetDrawer.open('${esc(l.id)}', 'link')" style="cursor:pointer; ${isOffline ? 'background:rgba(255,0,85,0.06);' : ''}">
                    <td>${badgeHtml}</td>
                    <td>${typeBadge}</td>
                    <td>
                        <strong style="color:var(--text-primary); font-size:13px;">${esc(l.name)}</strong>
                    </td>
                    <td style="font-size:12px; color:var(--text-secondary);">${esc(l.city || this.getCanonicalBranch(l))}</td>
                    <td class="tabular-nums" style="font-size:12px; color:var(--cs-cyan); font-weight:600;">${esc(l.ip || '--')}</td>
                    <td style="font-size:12px;">${esc(l.isp || 'Telecom')}</td>
                    <td class="tabular-nums" style="font-size:12px; font-weight:700;">${latencyVal}</td>
                    <td>
                        <svg width="60" height="20" style="overflow:visible;">
                            <polyline fill="none" stroke="${isOffline ? '#ff0055' : '#38bdf8'}" stroke-width="1.75" points="${pts}" />
                        </svg>
                    </td>
                    <td class="tabular-nums" style="color:${(l.packetLoss || 0) > 2 ? 'var(--brand-crimson)' : 'inherit'};">${lossVal}</td>
                    <td>
                        ${l.ip ? `
                            <a href="https://${esc(l.ip)}" target="_blank" rel="noopener noreferrer" class="btn-ui" style="padding:3px 8px; font-size:11px;" onclick="event.stopPropagation();">
                                DrayTek Web ↗
                            </a>
                        ` : '<span style="color:var(--text-muted); font-size:11px;">--</span>'}
                    </td>
                    <td>
                        <button class="btn-ui" style="padding:2px 6px; font-size:11px;" onclick="window.assetDrawer.open('${esc(l.id)}', 'link')">Detalhes</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}
window.wanView = new WanView();
