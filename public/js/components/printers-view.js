class PrintersView {
    constructor() {
        this.filterType = 'all';
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const chips = document.querySelectorAll('#view-printers .filter-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                chips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const filter = chip.getAttribute('data-filter') || 'all';
                this.filterType = filter.toLowerCase();
                this.render(window.appStore.getState());
            });
        });
    }

    render(state) {
        this.init();
        const tbody = document.getElementById('tbodyPrintersTable');
        if (!tbody) return;

        const esc = window.Sanitizer.escape;
        const allPrinters = state.printers || [];

        // Atualizar contadores dinâmicos dos chips
        let countAll = 0;
        let countLaser = 0;
        let countThermal = 0;
        let countSamsung = 0;
        let countBrother = 0;
        let countKyocera = 0;
        let countZebra = 0;

        allPrinters.forEach(p => {
            const profile = (window.resolvePrinterProfile)
                ? window.resolvePrinterProfile(p.name, p.model, p.ip, p.serialNumber || p.sn)
                : { model: p.model || p.name || 'Impressora Corporativa', manufacturer: 'Corporativo', isColor: false, isThermal: false, isScanner: false };

            const mfg = (profile.manufacturer || '').toLowerCase();
            const pName = (p.name || '').toLowerCase();
            const pModel = (p.model || profile.model || '').toLowerCase();

            const isScanner = Boolean(profile.isScanner || p.deviceCategory === 'SCANNER' || pName.includes('scanner'));
            const isThermal = Boolean(!isScanner && (profile.isThermal || p.deviceCategory === 'LABEL_PRINTER' || mfg === 'zebra' || pName.includes('zebra') || pModel.includes('zebra') || pName.includes('etiqueta')));
            const isStandardPrinter = !isScanner && !isThermal;

            const counter = Number(p.pageCount || p.blackCounter || 0);
            const scanCount = Number(p.scanCount || 0);
            const hasCounter = counter > 0 || scanCount > 0;

            countAll++;
            if (isStandardPrinter) countLaser++;
            if (isThermal) countThermal++;
            if (mfg === 'samsung' || pName.includes('samsung') || pModel.includes('samsung')) countSamsung++;
            if (mfg === 'brother' || pName.includes('brother') || pModel.includes('brother')) countBrother++;
            if (mfg === 'kyocera' || pName.includes('kyocera') || pModel.includes('kyocera')) countKyocera++;
            if (mfg === 'zebra' || pName.includes('zebra') || pModel.includes('zebra') || isThermal) countZebra++;
        });

        const elCountAll = document.getElementById('countPrintersAll');
        if (elCountAll) elCountAll.textContent = countAll;
        const elCountLaser = document.getElementById('countPrintersLaser');
        if (elCountLaser) elCountLaser.textContent = countLaser;
        const elCountThermal = document.getElementById('countPrintersThermal');
        if (elCountThermal) elCountThermal.textContent = countThermal;
        const elCountSamsung = document.getElementById('countPrintersSamsung');
        if (elCountSamsung) elCountSamsung.textContent = countSamsung;
        const elCountBrother = document.getElementById('countPrintersBrother');
        if (elCountBrother) elCountBrother.textContent = countBrother;
        const elCountKyocera = document.getElementById('countPrintersKyocera');
        if (elCountKyocera) elCountKyocera.textContent = countKyocera;
        const elCountZebra = document.getElementById('countPrintersZebra');
        if (elCountZebra) elCountZebra.textContent = countZebra;

        // Filtragem enriquecida com resolver de perfis
        let printers = allPrinters.filter(p => {
            const profile = (window.resolvePrinterProfile)
                ? window.resolvePrinterProfile(p.name, p.model, p.ip, p.serialNumber || p.sn)
                : { model: p.model || p.name || 'Impressora Corporativa', manufacturer: 'Corporativo', isColor: false, isThermal: false, isScanner: false };

            const mfg = (profile.manufacturer || '').toLowerCase();
            const pName = (p.name || '').toLowerCase();
            const pModel = (p.model || profile.model || '').toLowerCase();

            const isScanner = Boolean(profile.isScanner || p.deviceCategory === 'SCANNER' || pName.includes('scanner'));
            const isThermal = Boolean(!isScanner && (profile.isThermal || p.deviceCategory === 'LABEL_PRINTER' || mfg === 'zebra' || pName.includes('zebra') || pModel.includes('zebra') || pName.includes('etiqueta')));
            const isStandardPrinter = !isScanner && !isThermal;

            const counter = Number(p.pageCount || p.blackCounter || 0);
            const scanCount = Number(p.scanCount || 0);
            const hasCounter = counter > 0 || scanCount > 0;

            // Na opção padrão "Todos os Dispositivos", exibe a frota corporativa consolidada
            if (this.filterType === 'all') {
                return true;
            }

            // Filtros de Categoria
            if (this.filterType === 'printer') return isStandardPrinter;
            if (this.filterType === 'thermal') return isThermal;
            if (this.filterType === 'scanner') return isScanner;

            // Filtros de Fabricante
            if (this.filterType === 'samsung') return mfg === 'samsung' || pName.includes('samsung') || pModel.includes('samsung');
            if (this.filterType === 'brother') return mfg === 'brother' || pName.includes('brother') || pModel.includes('brother');
            if (this.filterType === 'kyocera') return mfg === 'kyocera' || pName.includes('kyocera') || pModel.includes('kyocera');
            if (this.filterType === 'zebra') return mfg === 'zebra' || pName.includes('zebra') || pModel.includes('zebra') || isThermal;
            if (this.filterType === 'epson') return mfg === 'epson' || pName.includes('epson') || pModel.includes('epson');

            return true;
        });

        // Ordenação: primeiro impressoras com odômetro decrescente, depois as demais
        if (printers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhum dispositivo encontrado no filtro atual.</td></tr>`;
            return;
        }

        // 1. Agrupar os dispositivos filtrados por Unidade (Exclusivamente Sigla Oficial)
        const normalizeToAcronym = (val) => {
            if (!val || typeof val !== 'string') return 'Sem Unidade';
            const clean = val.trim();
            if (!clean || /^(sem unidade|não definida|nao definida|n\/d|unknown)$/i.test(clean)) return 'Sem Unidade';
            const s = clean.toUpperCase();

            // 1. Sigla oficial direta ou contida
            const match = s.match(/\b(MTZ|BHZ|RIO|SPO|CPQ|JDF|PPY|PTR|VGA|VIX|FBR|CNA|BCA|DIV|IPA|UDI|CAB|CGO|ITB|MCE|TRS|VRE|BETIM|BTM)\b/);
            if (match) {
                const code = match[1];
                return (code === 'BETIM' || code === 'BTM') ? 'MTZ' : code;
            }

            // 2. Resolução por nomes por extenso
            if (s.includes('BELO HORIZONTE')) return 'BHZ';
            if (s.includes('MATRIZ') || s.includes('HUB') || s.includes('BETIM')) return 'MTZ';
            if (s.includes('RIO DE JANEIRO')) return 'RIO';
            if (s.includes('SÃO PAULO') || s.includes('SAO PAULO')) return 'SPO';
            if (s.includes('CAMPINAS')) return 'CPQ';
            if (s.includes('JUIZ DE FORA') || s.includes('MATIAS BARBOSA')) return 'JDF';
            if (s.includes('POUSO ALEGRE')) return 'PPY';
            if (s.includes('PETRÓPOLIS') || s.includes('PETROPOLIS')) return 'PTR';
            if (s.includes('VARGINHA')) return 'VGA';
            if (s.includes('VITÓRIA') || s.includes('VITORIA')) return 'VIX';
            if (s.includes('FRIBURGO')) return 'FBR';
            if (s.includes('COLATINA')) return 'CNA';
            if (s.includes('BARBACENA')) return 'BCA';

            return clean.toUpperCase();
        };

        const unitGroups = new Map();
        printers.forEach(p => {
            const rawUnit = p.city || p.unit || 'Sem Unidade';
            const u = normalizeToAcronym(rawUnit);
            if (!unitGroups.has(u)) {
                unitGroups.set(u, []);
            }
            unitGroups.get(u).push(p);
        });

        // 2. Ordenar as Unidades: 'Sem Unidade' em primeiro, depois ordem alfabética das siglas (A-Z)
        const sortedUnits = Array.from(unitGroups.keys()).sort((a, b) => {
            if (a === 'Sem Unidade') return -1;
            if (b === 'Sem Unidade') return 1;
            return a.localeCompare(b);
        });

        let html = '';

        sortedUnits.forEach((unitCode, groupIndex) => {
            const unitPrinters = unitGroups.get(unitCode);
            // Ordenação interna por odômetro decrescente
            unitPrinters.sort((a, b) => {
                const ca = Number(a.pageCount || a.blackCounter || 0);
                const cb = Number(b.pageCount || b.blackCounter || 0);
                return cb - ca;
            });

            const unitDisplayName = unitCode === 'Sem Unidade' ? 'SEM UNIDADE' : `UNIDADE ${unitCode}`;
            const unitTotalPages = unitPrinters.reduce((acc, p) => acc + Number(p.pageCount || p.blackCounter || 0), 0);

            // Espaçador visual entre blocos de unidades
            if (groupIndex > 0) {
                html += `
                    <tr class="unit-group-spacer" style="height:18px; border:none; background:transparent;">
                        <td colspan="7" style="padding:0; height:18px; border:none; background:transparent;"></td>
                    </tr>
                `;
            }

            // Cabeçalho da Unidade: Banner de Seção neutro e sóbrio no tema Bitdefender
            html += `
                <tr class="unit-group-header" style="background:#141820; border-top:1px solid #232936; border-bottom:1px solid #232936; border-left:3px solid #353e50;">
                    <td colspan="7" style="padding:10px 16px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <span style="background:#191d24; border:1px solid #353e50; color:#ffffff; font-weight:800; font-size:12px; padding:3px 10px; border-radius:4px; letter-spacing:0.5px;">
                                    ${esc(unitCode)}
                                </span>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; color:#8391a5;">
                                    ${unitPrinters.length} ${unitPrinters.length === 1 ? 'dispositivo' : 'dispositivos'}
                                </span>
                                ${unitTotalPages > 0 ? `
                                    <span style="background:#191d24; border:1px solid #232936; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700; color:#cbd5e1;">
                                        Total: ${unitTotalPages.toLocaleString('pt-BR')} págs
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    </td>
                </tr>
            `;

            // Linhas dos Dispositivos daquela Unidade
            html += unitPrinters.map(p => {
                const profile = (window.resolvePrinterProfile)
                    ? window.resolvePrinterProfile(p.name, p.model, p.ip, p.serialNumber || p.sn)
                    : { model: p.model || p.name || 'Impressora Corporativa', manufacturer: 'Corporativo', isColor: false, isThermal: false, isScanner: false, webUiLabel: 'Interface Web' };

                const isScanner = Boolean(profile.isScanner || p.deviceCategory === 'SCANNER' || (p.name && p.name.toLowerCase().includes('scanner')));
                const isThermal = Boolean(!isScanner && (profile.isThermal || p.deviceCategory === 'LABEL_PRINTER' || (p.name && p.name.toLowerCase().includes('zebra'))));
                const isColor = Boolean(profile.isColor && !isScanner && !isThermal);
                const model = profile.model;

                const counter = p.pageCount || p.blackCounter || 0;
                const isOffline = p.status === 'offline';
                const serial = p.serialNumber || p.sn || 'Não identificado';
                const hasToner = p.tonerLevel !== null && p.tonerLevel !== undefined;
                const toner = hasToner ? p.tonerLevel : null;
                const ip = (p.ip || '').trim();
                const isNumericIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip);

                // Badge de Categoria (Texto limpo corporativo sem emojis)
                let categoryBadge = `<span class="badge" style="background:#191d24; color:#cbd5e1; border:1px solid #353e50; font-weight:700; font-size:10px; padding:2px 7px;">IMPRESSORA</span>`;
                if (isScanner) {
                    categoryBadge = `<span class="badge" style="background:rgba(168,85,247,0.18); color:#c084fc; border:1px solid rgba(168,85,247,0.35); font-weight:700; font-size:10px; padding:2px 7px;">SCANNER</span>`;
                } else if (isThermal) {
                    categoryBadge = `<span class="badge" style="background:rgba(245,158,11,0.18); color:#f59e0b; border:1px solid rgba(245,158,11,0.35); font-weight:700; font-size:10px; padding:2px 7px;">TÉRMICA</span>`;
                }

                // Coluna de Contador / Odômetro
                let counterHtml = '';
                if (isScanner) {
                    const scanVal = p.scanCount || p.pageCount || 0;
                    counterHtml = scanVal > 0 
                        ? `<div style="display:flex; align-items:baseline; gap:6px;">
                               <span style="font-size:15px; font-weight:900; color:#c084fc;">${scanVal.toLocaleString('pt-BR')}</span>
                               <span style="font-size:10.5px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">digitalizações</span>
                           </div>`
                        : `<span class="badge" style="background:rgba(168,85,247,0.12); color:#c084fc; border:1px solid rgba(168,85,247,0.25); font-weight:700; font-size:10px; padding:2px 8px;">0 DIGITALIZAÇÕES</span>`;
                } else if (isThermal) {
                    counterHtml = `<span class="badge" style="background:rgba(245,158,11,0.12); color:#f59e0b; border:1px solid rgba(245,158,11,0.25); font-weight:700; font-size:10px; padding:2px 8px;">TÉRMICA (N/A)</span>`;
                } else {
                    counterHtml = `
                        <div style="display:flex; align-items:baseline; gap:6px;">
                            <span style="font-size:16px; font-weight:900; color:#ffffff; letter-spacing:0.3px;">${counter.toLocaleString('pt-BR')}</span>
                            <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">págs</span>
                        </div>
                        ${isColor && (p.colorCounter !== undefined || p.blackCounter !== undefined) ? `
                            <div style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">
                                <span style="color:#cbd5e1;">Mono: ${(p.blackCounter ?? Math.round(counter * 0.51271)).toLocaleString('pt-BR')}</span> &bull; 
                                <span style="color:#c084fc;">Cor: ${(p.colorCounter ?? (counter - Math.round(counter * 0.51271))).toLocaleString('pt-BR')}</span>
                            </div>
                        ` : ''}
                    `;
                }

                // Coluna de Toner / Mídia
                let tonerHtml = '';
                if (isScanner) {
                    tonerHtml = `<span style="color:var(--text-muted); font-size:11px; font-weight:600;">Óptico / ADF</span>`;
                } else if (isThermal) {
                    tonerHtml = `<span style="color:var(--text-muted); font-size:11px; font-weight:600;">Bobina / Ribbon</span>`;
                } else if (hasToner) {
                    tonerHtml = `
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="tabular-nums" style="font-size:12px; font-weight:700; color:${toner <= 15 ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};">${toner}%</span>
                            <div class="progress-bar-bg" style="width:70px; height:6px; margin:0;">
                                <div class="progress-bar-fill" style="width:${toner}%; background:${toner <= 15 ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};"></div>
                            </div>
                        </div>
                    `;
                } else {
                    tonerHtml = `<span style="color:var(--text-muted); font-size:12px;">--</span>`;
                }

                // Coluna Acesso Web / Porta
                let portHtml = '';
                if (isNumericIp) {
                    portHtml = `
                        <a href="http://${esc(ip)}" target="_blank" onclick="event.stopPropagation();" class="btn-ui" style="padding:3px 8px; font-size:11px; font-family:var(--font-mono); color:var(--invgate-blue-light); border-color:rgba(2,132,199,0.3); background:rgba(2,132,199,0.1); text-decoration:none; display:inline-flex; align-items:center; gap:5px;" title="Abrir interface web (${esc(profile.webUiLabel || 'Web Admin')})">
                            <span>${esc(ip)}</span>
                            <svg class="lucide-icon icon-xs" viewBox="0 0 24 24" style="width:11px; height:11px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>
                    `;
                } else if (ip) {
                    portHtml = `<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted); font-size:10.5px; border:1px solid rgba(255,255,255,0.1);">${esc(ip)}</span>`;
                } else {
                    portHtml = `<span style="color:var(--text-muted); font-size:12px;">--</span>`;
                }

                return `
                    <tr onclick="window.assetDrawer.open('${esc(p.id)}', 'printer')" style="cursor:pointer;" title="Clique para abrir a Ficha Técnica">
                        <td style="padding:14px 16px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-family:var(--font-mono); font-size:13px; font-weight:800; color:#cbd5e1; letter-spacing:0.5px;">${esc(serial)}</span>
                                <button class="btn-ui" onclick="event.stopPropagation(); navigator.clipboard.writeText('${esc(serial)}'); alert('S/N copiado: ${esc(serial)}');" style="padding:2px 6px; font-size:10px; background:#191d24; border-color:#353e50; color:#8391a5;" title="Copiar Número de Série">Copiar</button>
                            </div>
                        </td>
                        <td style="padding:14px 16px;">
                            ${categoryBadge}
                        </td>
                        <td class="tabular-nums" style="padding:14px 16px;">
                            ${counterHtml}
                        </td>
                        <td style="padding:14px 16px;">
                            <div style="font-weight:700; color:var(--text-primary); font-size:13px; display:flex; align-items:center; gap:6px;">
                                <span>${esc(model)}</span>
                                ${isColor ? '<span class="badge" style="background:rgba(168,85,247,0.18); color:#c084fc; border:1px solid rgba(168,85,247,0.35); font-size:10px; font-weight:800; padding:1px 6px;">COLORIDA</span>' : ''}
                            </div>
                        </td>
                        <td style="padding:14px 16px;">
                            <span class="badge" style="background:#191d24; color:#cbd5e1; border:1px solid #353e50; font-weight:800; font-size:11px; padding:3px 8px;">
                                ${esc(unitCode)}
                            </span>
                        </td>
                        <td style="padding:14px 16px;">
                            ${tonerHtml}
                        </td>
                        <td style="padding:14px 16px;">
                            ${portHtml}
                        </td>
                    </tr>
                `;
            }).join('');
        });

        tbody.innerHTML = html;
    }
}
window.printersView = new PrintersView();
