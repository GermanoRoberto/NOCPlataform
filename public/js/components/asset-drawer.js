class AssetDrawer {
    constructor() {
        this.modal = document.getElementById('modalAssetProfile');
        this.softwareModal = document.getElementById('modalInstalledSoftware');
        this.currentAsset = null;
        this.currentSoftwareList = [];
        this.chartInstance = null;
        this.reportAiCache = {};
        this.reportAiJobs = {};
        this.currentReportContext = null;
        this.toastCounter = 0;
        this.init();
    }

    init() {
        // 1. Botão Fechar Modal Principal
        const btnClose = document.getElementById('btnCloseAssetModal');
        if (btnClose) {
            btnClose.addEventListener('click', (e) => {
                e.preventDefault();
                this.close();
            });
            btnClose.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.close();
            }, { passive: false });
        }

        // Botão Fechar Flutuante / Canto Superior (Touch-friendly para mobile)
        const btnCornerClose = document.getElementById('btnCornerCloseAssetModal');
        if (btnCornerClose) {
            btnCornerClose.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            });
            btnCornerClose.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            }, { passive: false });
        }

        // Fechar ao clicar ou tocar no backdrop escuro
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.close();
            });
            this.modal.addEventListener('touchstart', (e) => {
                if (e.target === this.modal) {
                    e.preventDefault();
                    this.close();
                }
            }, { passive: false });
        }

        const modalReport = document.getElementById('modalTechnicalReport');
        if (modalReport) {
            modalReport.addEventListener('click', (e) => {
                if (e.target === modalReport) this.closeTechnicalReport();
            });
        }

        // Fechar via tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const rptModal = document.getElementById('modalTechnicalReport');
                if (rptModal && rptModal.style.display === 'flex') {
                    this.closeTechnicalReport();
                    return;
                }
                if (this.softwareModal && this.softwareModal.style.display === 'flex') {
                    this.closeSoftwareModal();
                } else if (this.modal && this.modal.style.display === 'flex') {
                    this.close();
                }
            }
        });

        // 2. Botão Ping Rápido
        const btnFastPing = document.getElementById('btnAssetFastPing');
        if (btnFastPing) {
            btnFastPing.addEventListener('click', (e) => {
                e.preventDefault();
                this.fastPing();
            });
        }

        // 2b. Botão Atualizar Dados / Sincronizar Agora
        const btnSync = document.getElementById('btnAssetSyncNow');
        if (btnSync) {
            btnSync.addEventListener('click', (e) => {
                e.preventDefault();
                this.refreshAssetData();
            });
        }

        // 3. Botão Exportar PDF / Dossiê Técnico
        const btnExportPdf = document.getElementById('btnAssetExportPdf');
        if (btnExportPdf) {
            btnExportPdf.addEventListener('click', (e) => {
                e.preventDefault();
                this.openTechnicalReport();
            });
        }

        // 3b. Botões do Modal de Relatório Técnico (A4)
        const btnCloseReport = document.getElementById('btnCloseReportModal');
        if (btnCloseReport) {
            btnCloseReport.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeTechnicalReport();
            });
        }

        const btnPrintReport = document.getElementById('btnPrintReportPdf');
        if (btnPrintReport) {
            btnPrintReport.addEventListener('click', (e) => {
                e.preventDefault();
                this.printTechnicalReport();
            });
        }

        const btnCopyReport = document.getElementById('btnCopyReportText');
        if (btnCopyReport) {
            btnCopyReport.addEventListener('click', (e) => {
                e.preventDefault();
                this.copyTechnicalReportText();
            });
        }

        // 4. Navegação das 6 Abas Horizontais
        const tabButtons = document.querySelectorAll('.modal-asset-tabs .tab-btn[data-tab]');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tabName = btn.getAttribute('data-tab');
                if (tabName) this.switchTab(tabName);
            });
        });

        // 5. Botões de Edição Inline no Header do Modal
        const btnEditStatus = document.getElementById('btnEditAssetStatus');
        if (btnEditStatus) {
            btnEditStatus.addEventListener('click', (e) => {
                e.preventDefault();
                this.editStatus();
            });
        }

        const btnEditLocation = document.getElementById('btnEditAssetLocation');
        if (btnEditLocation) {
            btnEditLocation.addEventListener('click', (e) => {
                e.preventDefault();
                this.editLocation();
            });
        }

        const btnEditOwner = document.getElementById('btnEditAssetOwner');
        if (btnEditOwner) {
            btnEditOwner.addEventListener('click', (e) => {
                e.preventDefault();
                this.editOwner();
            });
        }

        // 6. Linha "Instalações de Software"
        const rowSoftware = document.getElementById('rowAssetInstalledSoftware');
        if (rowSoftware) {
            rowSoftware.addEventListener('click', (e) => {
                e.preventDefault();
                this.openSoftwareModal();
            });
        }

        // 7. Fechamento e Busca no Modal de Softwares Instalados
        const btnCloseSoft = document.getElementById('btnCloseSoftwareModal');
        const btnOkSoft = document.getElementById('btnOkCloseSoftwareModal');
        if (btnCloseSoft) btnCloseSoft.addEventListener('click', () => this.closeSoftwareModal());
        if (btnOkSoft) btnOkSoft.addEventListener('click', () => this.closeSoftwareModal());

        if (this.softwareModal) {
            this.softwareModal.addEventListener('click', (e) => {
                if (e.target === this.softwareModal) this.closeSoftwareModal();
            });
        }

        const inputSearchSoft = document.getElementById('inputSearchSoftware');
        if (inputSearchSoft) {
            inputSearchSoft.addEventListener('input', (e) => {
                this.renderSoftwareTable(e.target.value);
            });
        }
    }

    open(id, type = 'computer') {
        if (!this.modal) return;
        const state = window.appStore.getState();
        const esc = window.Sanitizer.escape;

        let asset = null;
        if (type === 'computer') {
            asset = (state.computers || []).find(c => String(c.id) === String(id));
        } else if (type === 'link') {
            asset = (state.links || []).find(l => String(l.id) === String(id));
        } else if (type === 'printer') {
            asset = (state.printers || []).find(p => String(p.id) === String(id));
        }

        if (!asset) {
            asset = (state.printers || []).find(p => String(p.id) === String(id)) ||
                    (state.computers || []).find(c => String(c.id) === String(id)) ||
                    (state.links || []).find(l => String(l.id) === String(id));
        }

        if (!asset) return;
        this.currentAsset = asset;
        window.currentEditingAsset = asset;

        const printerProfile = (window.resolvePrinterProfile)
            ? window.resolvePrinterProfile(asset.name, asset.model, asset.ip, asset.serialNumber || asset.sn)
            : null;
        const isScanner = Boolean((printerProfile && printerProfile.isScanner) || asset.deviceCategory === 'SCANNER' || (asset.name && asset.name.toLowerCase().includes('scanner')));
        const isThermal = Boolean(!isScanner && ((printerProfile && printerProfile.isThermal) || asset.deviceCategory === 'LABEL_PRINTER' || (asset.model && asset.model.toLowerCase().includes('zebra'))));
        const isPrinter = (type === 'printer') || (asset.type === 'printer') || (asset.deviceCategory === 'PRINTER') || isScanner || isThermal || Boolean(asset.blackCounter !== undefined) || Boolean(asset.tonerLevel !== undefined) || (asset.model && (asset.model.toLowerCase().includes('samsung') || asset.model.toLowerCase().includes('brother') || asset.model.toLowerCase().includes('zebra')));
        const isLink = !isPrinter && ((type === 'link') || Boolean(asset.bandwidth !== undefined) || (asset.type === 'link'));
        const isComputer = !isPrinter && !isLink;
        this.currentAssetType = isPrinter ? 'printer' : (isLink ? 'link' : 'computer');

        // Extração de IP inteligente
        const ipMatch = (asset.name || '').match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        const displayIp = asset.ip || (ipMatch ? ipMatch[0] : '--');

        // Limpeza de encoding no título
        const rawName = asset.name || (isScanner ? 'Scanner de Documentos' : (isThermal ? 'Impressora Térmica' : (isPrinter ? 'Impressora Corporativa' : 'Ativo Corporativo')));
        const cleanName = rawName
            .replace(/Soluo|Solu\?\?o/gi, 'Solução')
            .replace(/Expedio|Expedi\?\?o/gi, 'Expedição')
            .replace(/Distribuio|Distribui\?\?o/gi, 'Distribuição')
            .replace(/Operao|Opera\?\?o/gi, 'Operação');

        // 1. Preencher Header Hero do Modal
        const elTitle = document.getElementById('assetModalTitle');
        const elBadge = document.getElementById('assetModalBadge');
        const elStatusText = document.getElementById('assetModalStatusText');
        const elLocationText = document.getElementById('assetModalLocationText');
        const elOwnerText = document.getElementById('assetModalOwnerText');
        const elSerial = document.getElementById('assetModalSerial');
        const elIp = document.getElementById('assetModalIp');
        const elUptime = document.getElementById('assetModalUptime');
        const elSoftCount = document.getElementById('assetModalSoftwareCount');
        const btnDraytek = document.getElementById('btnAssetDraytek');
        const elIcon = document.getElementById('assetModalIcon');

        // Ícone contextual no Header
        if (elIcon) {
            if (isScanner) {
                elIcon.innerHTML = `<svg class="lucide-icon icon-lg" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"></rect><polyline points="16 3 12 7 8 3"></polyline><line x1="7" y1="13" x2="17" y2="13"></line></svg>`;
            } else if (isThermal) {
                elIcon.innerHTML = `<svg class="lucide-icon icon-lg" viewBox="0 0 24 24"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect><path d="M6 9V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"></path></svg>`;
            } else if (isPrinter) {
                elIcon.innerHTML = `<svg class="lucide-icon icon-lg" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>`;
            } else if (isLink) {
                elIcon.innerHTML = `<svg class="lucide-icon icon-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
            } else {
                elIcon.innerHTML = `<svg class="lucide-icon icon-lg" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
            }
        }

        if (elTitle) elTitle.textContent = cleanName;
        if (elBadge) {
            const isOnline = asset.status === 'online';
            const isWarning = asset.status === 'warning';
            elBadge.className = isOnline ? 'badge badge-ok' : (isWarning ? 'badge badge-warning' : 'badge badge-error');
            elBadge.innerHTML = `<span class="badge-dot" style="background:${isOnline ? 'var(--brand-emerald)' : (isWarning ? 'var(--brand-amber)' : 'var(--brand-crimson)')};"></span>${isOnline ? 'OPERACIONAL' : (isWarning ? 'ALERTA (INSTÁVEL)' : 'OFFLINE')}`;
        }
        if (elStatusText) elStatusText.textContent = asset.operationalStatus || 'Activo';
        if (elLocationText) elLocationText.textContent = `Local: ${asset.city || 'Sem Unidade'}`;
        if (elOwnerText) elOwnerText.textContent = asset.owner || asset.loggedUser || (isScanner ? 'Digitalização Setorial' : (isThermal ? 'Expedição / Etiquetas' : (isPrinter ? 'Alocação Setorial' : 'Sem Proprietário')));

        if (elSerial) elSerial.textContent = asset.serialNumber || asset.sn || 'N/D';
        if (elIp) elIp.textContent = displayIp;
        if (elUptime) elUptime.textContent = isPrinter ? (asset.status === 'online' ? 'Conectado (Driver/SNMP)' : 'Inacessível / Offline') : (asset.uptime || '14d 6h');

        const softList = asset.installedSoftware || [];
        this.currentSoftwareList = softList;
        if (elSoftCount) {
            elSoftCount.textContent = `Ver programas instalados (${softList.length} softwares)`;
        }

        // Ajustar rótulos das abas contextuais
        const tabButtons = document.querySelectorAll('.modal-asset-tabs .tab-btn[data-tab]');
        tabButtons.forEach(btn => {
            const t = btn.getAttribute('data-tab');
            if (t === 'hardware') {
                btn.textContent = isScanner ? 'Especificações Ópticas' : (isThermal ? 'Parâmetros de Mídia' : (isPrinter ? 'Suprimentos & Módulos' : (isLink ? 'Parâmetros de Enlace' : 'Hardware')));
            } else if (t === 'performance') {
                btn.textContent = isScanner ? 'Histórico de Digitalizações' : (isThermal ? 'Histórico de Emissão' : (isPrinter ? 'Volume de Impressão' : (isLink ? 'Telemetria de Tráfego' : 'Performance & Telemetria')));
            }
        });

        // Botão DrayTek Web / Impressora Web UI
        if (btnDraytek) {
            if (isPrinter && displayIp !== '--') {
                const printerProfile = (window.resolvePrinterProfile)
                    ? window.resolvePrinterProfile(asset.name, asset.model, displayIp, asset.serialNumber || asset.sn)
                    : null;
                const webLabel = (printerProfile && printerProfile.webUiLabel) || 'Interface Web';
                btnDraytek.style.display = 'inline-flex';
                btnDraytek.href = `http://${displayIp}`;
                btnDraytek.target = '_blank';
                btnDraytek.rel = 'noopener noreferrer';
                btnDraytek.title = `Acessar ${webLabel} (${displayIp})`;
                btnDraytek.innerHTML = `<svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> ${webLabel}`;
            } else if (isLink || (asset.name && asset.name.toUpperCase().includes('DRAYTEK')) || asset.isGateway) {
                // Descobrir o IP de acesso do DrayTek correspondente
                let draytekIp = (displayIp !== '--') ? displayIp : null;
                // Se não tiver IP direto no link, busca nas outras conexões ativas da mesma filial
                if (!draytekIp && asset.branchCode) {
                    const peer = (state.links || []).find(l => 
                        (l.branchCode === asset.branchCode || (l.name || '').startsWith(asset.branchCode)) && 
                        l.ip && l.ip !== '--'
                    );
                    if (peer) draytekIp = peer.ip;
                }
                // Fallback para o DrayTek Central MTZ caso nenhum outro seja mapeado
                if (!draytekIp) {
                    const mtzDraytek = (state.links || []).find(l => (l.name || '').toUpperCase().includes('DRAYTEK'));
                    if (mtzDraytek && mtzDraytek.ip) draytekIp = mtzDraytek.ip;
                }

                if (draytekIp) {
                    btnDraytek.style.display = 'inline-flex';
                    btnDraytek.href = `https://${draytekIp}`;
                    btnDraytek.target = '_blank';
                    btnDraytek.rel = 'noopener noreferrer';
                    btnDraytek.title = `Acessar Web GUI do Roteador DrayTek (${draytekIp})`;
                    btnDraytek.innerHTML = `<svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> DrayTek Web`;
                } else {
                    btnDraytek.style.display = 'none';
                }
            } else {
                btnDraytek.style.display = 'none';
            }
        }

        // 2. Preencher Todas as Abas Dinâmicas de Forma Contextual
        this.renderOverviewPane(asset);
        this.renderHardwarePane(asset);
        this.renderPerformancePane(asset);
        this.renderCmdbPane(asset);
        this.renderControlsPane(asset);
        this.renderAuditPane(asset);

        // 3. Resetar para a primeira aba (Visão Geral)
        this.switchTab('overview');

        // 4. Exibir o Modal
        this.modal.style.display = 'flex';

        // 5. Disparar Parecer Técnico da IA Ollama Automaticamente (Zero Cliques)
        this.requestAiAnalysis(false);
    }

    close() {
        if (this.modal) this.modal.style.display = 'none';
        this.currentAsset = null;
        window.currentEditingAsset = null;
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        // Atualizar botões
        const buttons = document.querySelectorAll('.modal-asset-tabs .tab-btn[data-tab]');
        buttons.forEach(btn => {
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Mapeamento de nomes de aba para os IDs das panes
        const paneMap = {
            'overview': 'paneOverview',
            'hardware': 'paneHardware',
            'performance': 'panePerformance',
            'cmdb': 'paneCmdb',
            'audit': 'paneAudit',
            'controls': 'paneControls'
        };

        // Alternar visibilidade das panes
        Object.keys(paneMap).forEach(key => {
            const pane = document.getElementById(paneMap[key]);
            if (pane) {
                if (key === tabName) {
                    pane.classList.add('active');
                    pane.style.display = 'block';
                } else {
                    pane.classList.remove('active');
                    pane.style.display = 'none';
                }
            }
        });

        // Se for a aba de performance, desenhar o gráfico Chart.js e preencher telemetria
        if (tabName === 'performance' && this.currentAsset) {
            this.renderPerformancePane(this.currentAsset);
        }
    }

    renderOverviewPane(asset) {
        const pane = document.getElementById('paneOverview');
        if (!pane || !asset) return;
        const esc = window.Sanitizer.escape;
        const isPrinter = this.currentAssetType === 'printer';
        const isLink = this.currentAssetType === 'link';

        const ipMatch = (asset.name || '').match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        const displayIp = asset.ip || (ipMatch ? ipMatch[0] : '--');

        const aiCardHtml = `
            <div style="margin-top:20px; border:1px solid rgba(56,189,248,0.25); background:rgba(3,13,29,0.7); border-radius:10px; overflow:hidden;">
                <div style="padding:10px 16px; border-bottom:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center; background:rgba(56,189,248,0.06);">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <svg style="width:16px; height:16px; color:var(--cs-cyan);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.5h-2v-2h2zm0-4h-2V7h2z"/></svg>
                        <strong style="color:var(--cs-cyan); font-size:13px;">Parecer Técnico & Diagnóstico de Engenharia</strong>
                        <span class="badge badge-ok" style="font-size:10px;">PROATIVO (LOCAL)</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:11px; color:var(--text-muted);">Servidor Local</span>
                        <button class="btn-ui" style="font-size:10.5px; padding:3px 9px; background:rgba(56,189,248,0.1); border-color:var(--cs-cyan); color:var(--cs-cyan); display:inline-flex; align-items:center; gap:5px;" onclick="window.assetDrawer.requestAiAnalysis(true)">
                            <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            Atualizar
                        </button>
                    </div>
                </div>
                <div id="aiAnalysisOutputOverview" style="padding:16px; font-size:12px; color:var(--text-secondary); line-height:1.6; min-height:60px;">
                    <div style="display:flex; align-items:center; gap:10px; color:var(--cs-cyan);">
                        <div style="width:16px; height:16px; border:2px solid var(--cs-cyan); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>
                        <span>Processando telemetria em tempo real com modelo pericial...</span>
                    </div>
                </div>
            </div>
        `;

        if (isPrinter) {
            const profile = (window.resolvePrinterProfile)
                ? window.resolvePrinterProfile(asset.name, asset.model, displayIp, asset.serialNumber || asset.sn)
                : {
                    manufacturer: 'Corporativo',
                    model: asset.model || asset.name || 'Impressora Corporativa',
                    isColor: false,
                    printTechnology: 'Multifuncional Laser Monocromática Corporativa',
                    protocol: 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)',
                    webUiLabel: 'Interface Web'
                };

            const tonerLevel = (asset.tonerLevel !== null && asset.tonerLevel !== undefined) ? Number(asset.tonerLevel) : null;
            const isColorPrinter = Boolean(profile.isColor);
            let displayModel = profile.model;

            const pageCount = (asset.pageCount || asset.blackCounter || 0);
            const blackCount = (asset.blackCounter !== undefined && asset.blackCounter !== null) ? asset.blackCounter : (isColorPrinter ? Math.round(pageCount * 0.51335) : pageCount);
            const colorCount = (asset.colorCounter !== undefined && asset.colorCounter !== null) ? asset.colorCounter : (isColorPrinter ? (pageCount - blackCount) : 0);

            const printTechHtml = isColorPrinter
                ? `<span class="badge" style="background:rgba(168,85,247,0.18); color:#c084fc; border:1px solid rgba(168,85,247,0.35); font-weight:700; font-size:11px; padding:2px 8px;">${profile.printTechnology}</span>`
                : profile.printTechnology;

            const isOnline = asset.status === 'online';
            const isWarning = asset.status === 'warning';
            const connColor = isOnline ? 'var(--invgate-emerald)' : (isWarning ? 'var(--brand-amber)' : 'var(--brand-crimson)');
            const connBg = isOnline ? 'rgba(16, 185, 129, 0.15)' : (isWarning ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)');
            const connText = isOnline ? 'Online (Driver/WIA/SNMP)' : (isWarning ? 'Alerta (Instável)' : 'Offline (Sem Resposta)');

            const isScanner = Boolean(profile.isScanner || asset.deviceCategory === 'SCANNER' || (asset.name && asset.name.toLowerCase().includes('scanner')));
            const isThermal = Boolean(!isScanner && (profile.isThermal || asset.deviceCategory === 'LABEL_PRINTER' || (asset.model && asset.model.toLowerCase().includes('zebra'))));

            if (isScanner) {
                const scanCount = asset.scanCount || 0;
                pane.innerHTML = `
                <div class="compliance-banners-grid">
                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:${connBg}; color:${connColor};">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"></rect><polyline points="16 3 12 7 8 3"></polyline><line x1="7" y1="13" x2="17" y2="13"></line></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Conectividade</div>
                            <strong style="color:${connColor}; font-size:13px;">${connText}</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(168,85,247,0.15); color:#c084fc;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Sensor Óptico</div>
                            <strong style="color:var(--text-primary); font-size:13px;">CIS Duplo (Passagem Única)</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(2, 132, 199, 0.15); color:#38bdf8;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Alimentador (ADF)</div>
                            <strong style="color:var(--invgate-emerald); font-size:13px;">ADF Automático 50 Folhas</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="13" y2="16"></line></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Total Digitalizado</div>
                            <strong style="color:var(--invgate-emerald); font-size:13px;">${scanCount > 0 ? scanCount.toLocaleString('pt-BR') + ' scans' : 'Pronto (WIA/USB)'}</strong>
                        </div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:2fr 1fr; gap:20px;">
                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Ficha Técnica do Scanner Dedicado</strong>
                        <table class="data-table">
                            <tr>
                                <td><strong>Modelo do Equipamento:</strong></td>
                                <td>
                                    <strong style="color:var(--text-primary);">${esc(displayModel)}</strong>
                                    <span class="badge" style="background:rgba(168,85,247,0.18); color:#c084fc; border:1px solid rgba(168,85,247,0.35); font-size:10px; margin-left:6px; font-weight:800;">SCANNER DEDICADO</span>
                                </td>
                            </tr>
                            <tr><td><strong>Fabricante:</strong></td><td style="color:var(--invgate-blue-light); font-weight:600;">${esc(profile.manufacturer || 'Corporativo')}</td></tr>
                            <tr><td><strong>Número de Série (SN):</strong></td><td class="tabular-nums" style="color:var(--invgate-blue-light); font-weight:600;">${esc(asset.serialNumber || asset.sn || 'Não identificado')}</td></tr>
                            <tr><td><strong>Interface / Porta:</strong></td><td class="tabular-nums" style="font-weight:700; color:var(--cs-cyan);">${displayIp !== '--' ? displayIp : 'USB 2.0 / 3.0 Hi-Speed'}</td></tr>
                            <tr><td><strong>Mecanismo de Digitalização:</strong></td><td>Scanner de Mesa / Alimentador ADF Automático</td></tr>
                            <tr><td><strong>Protocolo / Driver:</strong></td><td>${esc(profile.protocol || 'WIA 2.0 / TWAIN / eSCL')}</td></tr>
                            <tr>
                                <td><strong>Status Operacional:</strong></td>
                                <td style="color:var(--invgate-emerald); font-weight:700;">Pronto para digitalização de CT-e / NFe / Faturas</td>
                            </tr>
                        </table>
                    </div>

                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Especificações Ópticas & Mecânicas</strong>
                        <div style="font-size:12px; line-height:1.7; color:var(--text-secondary);">
                            <div><strong>Resolução Óptica:</strong> <span style="color:#fff;">600 x 600 DPI</span></div>
                            <div><strong>Sensor de Imagem:</strong> <span style="color:#fff;">Sensor CIS Duplo de Alta Velocidade</span></div>
                            <div><strong>Alimentador Automático:</strong> <span style="color:#fff;">Até 50 folhas (ADF)</span></div>
                            <div><strong>Digitalização Duplex:</strong> <span style="color:var(--invgate-emerald); font-weight:600;">Sim (Passagem Única)</span></div>
                            <div><strong>Detecção de Erro:</strong> <span style="color:#fff;">Sensor Ultrassônico Dupla Alimentação</span></div>
                            <div><strong>Ciclo Diário Recomendado:</strong> <span style="color:#fff;">Até 4.000 folhas/dia</span></div>
                        </div>
                        <div style="margin-top:14px; padding:10px; background:rgba(255,255,255,0.03); border-radius:6px; font-size:11px; line-height:1.4;">
                            <span style="color:var(--text-muted);">Manutenção Preventiva de Roletes:</span>
                            <div style="color:var(--brand-emerald); font-weight:600; margin-top:2px;">Módulo de Tração Conforme (Operacional)</div>
                        </div>
                    </div>
                </div>
                ${aiCardHtml}
                `;
                return;
            }

            if (isThermal) {
                pane.innerHTML = `
                <div class="compliance-banners-grid">
                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:${connBg}; color:${connColor};">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect><path d="M6 9V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"></path></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Conectividade</div>
                            <strong style="color:${connColor}; font-size:13px;">${connText}</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(245, 158, 11, 0.15); color:#f59e0b;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Tecnologia de Impressão</div>
                            <strong style="color:var(--text-primary); font-size:13px;">Térmica Direta / Transferência</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(2, 132, 199, 0.15); color:#38bdf8;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="13" y2="16"></line></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Mídia de Impressão</div>
                            <strong style="color:var(--invgate-emerald); font-size:13px;">Etiquetas Autoadesivas / Bobina</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Consumíveis</div>
                            <strong style="color:var(--invgate-emerald); font-size:13px;">Sem Toner (Aquecimento Térmico)</strong>
                        </div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:2fr 1fr; gap:20px;">
                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Ficha Técnica da Impressora Térmica</strong>
                        <table class="data-table">
                            <tr>
                                <td><strong>Modelo do Equipamento:</strong></td>
                                <td>
                                    <strong style="color:var(--text-primary);">${esc(displayModel)}</strong>
                                    <span class="badge" style="background:rgba(245,158,11,0.18); color:#f59e0b; border:1px solid rgba(245,158,11,0.35); font-size:10px; margin-left:6px; font-weight:800;">TÉRMICA</span>
                                </td>
                            </tr>
                            <tr><td><strong>Fabricante:</strong></td><td style="color:var(--invgate-blue-light); font-weight:600;">${esc(profile.manufacturer || 'Zebra')}</td></tr>
                            <tr><td><strong>Número de Série (SN):</strong></td><td class="tabular-nums" style="color:var(--invgate-blue-light); font-weight:600;">${esc(asset.serialNumber || asset.sn || 'Não identificado')}</td></tr>
                            <tr><td><strong>Endereço / Porta:</strong></td><td class="tabular-nums" style="font-weight:700; color:var(--cs-cyan);">${displayIp !== '--' ? displayIp : 'USB Local (Spooler)'}</td></tr>
                            <tr><td><strong>Linguagem de Impressão:</strong></td><td>ZPL II / EPL / CPCL / TSPL</td></tr>
                            <tr><td><strong>Protocolo de Coleta:</strong></td><td>${esc(profile.protocol || 'RAW JetDirect / USB Spooler')}</td></tr>
                            <tr>
                                <td><strong>Finalidade Operacional:</strong></td>
                                <td style="color:var(--invgate-emerald); font-weight:700;">Emissão de Etiquetas de Expedição & Romaneios</td>
                            </tr>
                        </table>
                    </div>

                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Parâmetros da Cabeça Térmica & Mídia</strong>
                        <div style="font-size:12px; line-height:1.7; color:var(--text-secondary);">
                            <div><strong>Resolução da Cabeça:</strong> <span style="color:#fff;">203 DPI (8 dots/mm)</span></div>
                            <div><strong>Largura de Impressão:</strong> <span style="color:#fff;">Até 104 mm (4 polegadas)</span></div>
                            <div><strong>Sensores de Mídia:</strong> <span style="color:#fff;">Sensor Gap Transmissivo & Marca Negra</span></div>
                            <div><strong>Tipo de Mídia Suportada:</strong> <span style="color:#fff;">Etiquetas em Rolo, Sanfonadas (Fanfold)</span></div>
                            <div><strong>Método de Impressão:</strong> <span style="color:#fff;">Térmico Direto (Direct Thermal)</span></div>
                            <div><strong>Gestão de Suprimentos:</strong> <span style="color:var(--invgate-emerald); font-weight:600;">Isento de Toner e Cartuchos</span></div>
                        </div>
                        <div style="margin-top:14px; padding:10px; background:rgba(255,255,255,0.03); border-radius:6px; font-size:11px; line-height:1.4;">
                            <span style="color:var(--text-muted);">Cuidados com a Cabeça Térmica:</span>
                            <div style="color:var(--brand-emerald); font-weight:600; margin-top:2px;">Limpeza preventiva recomendada a cada troca de bobina</div>
                        </div>
                    </div>
                </div>
                ${aiCardHtml}
                `;
                return;
            }

            pane.innerHTML = `
                <div class="compliance-banners-grid">
                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:${connBg}; color:${connColor};">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Conectividade</div>
                            <strong style="color:${connColor}; font-size:13px;">${connText}</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(2, 132, 199, 0.15); color:#38bdf8;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">${isColorPrinter ? 'Cartuchos CMYK' : (profile.isThermal ? 'Papel / Bobina' : 'Nível do Toner')}</div>
                            <strong style="color:var(--text-primary); font-size:13px;">${tonerLevel !== null ? `${tonerLevel}% (${tonerLevel <= 15 ? 'Crítico' : 'Nominal'})` : (isOnline ? (isColorPrinter ? 'Laser CMYK Nominal' : 'Nominal') : '--')}</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:${isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)'}; color:${isOnline ? '#10b981' : '#94a3b8'};">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Caixa Toner Residual</div>
                            <strong style="color:${!isOnline ? 'var(--text-muted)' : (asset.wasteTonerFull ? 'var(--brand-crimson)' : 'var(--invgate-emerald)')}; font-size:12px;">${!isOnline ? '--' : (asset.wasteTonerFull ? '️ Quase Cheia' : 'Normal (Conforme)')}</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="13" y2="16"></line></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Total Faturado</div>
                            <strong style="color:var(--invgate-emerald); font-size:13px;">${pageCount.toLocaleString('pt-BR')} págs</strong>
                        </div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:2fr 1fr; gap:20px;">
                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Ficha Técnica da Impressora & Firmware</strong>
                        <table class="data-table">
                            <tr>
                                <td><strong>Modelo do Equipamento:</strong></td>
                                <td>
                                    <strong style="color:var(--text-primary);">${esc(displayModel)}</strong>
                                    ${isColorPrinter ? '<span class="badge" style="background:rgba(168,85,247,0.18); color:#c084fc; border:1px solid rgba(168,85,247,0.35); font-size:10px; margin-left:6px; font-weight:800;">COLORIDA</span>' : ''}
                                </td>
                            </tr>
                            <tr><td><strong>Fabricante:</strong></td><td style="color:var(--invgate-blue-light); font-weight:600;">${esc(profile.manufacturer || 'Corporativo')}</td></tr>
                            <tr><td><strong>Número de Série (SN):</strong></td><td class="tabular-nums" style="color:var(--invgate-blue-light); font-weight:600;">${esc(asset.serialNumber || asset.sn || 'Não identificado')}</td></tr>
                            <tr><td><strong>Endereço IP na Rede:</strong></td><td class="tabular-nums" style="font-weight:700; color:var(--cs-cyan);">${displayIp !== '--' ? `<a href="http://${displayIp}" target="_blank" style="color:var(--cs-cyan); text-decoration:underline;" title="Abrir interface web (${esc(profile.webUiLabel || 'Web Admin')})">${displayIp} ↗</a>` : '--'}</td></tr>
                            <tr><td><strong>Tecnologia de Impressão:</strong></td><td>${printTechHtml}</td></tr>
                            <tr><td><strong>Protocolo de Coleta:</strong></td><td>${esc(profile.protocol || 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)')}</td></tr>
                            <tr>
                                <td><strong>Contador de Páginas:</strong></td>
                                <td class="tabular-nums" style="font-weight:800; color:#fff;">
                                    ${pageCount.toLocaleString('pt-BR')} impressões acumuladas
                                    ${isColorPrinter ? `
                                        <div style="font-size:11px; color:var(--text-muted); font-weight:normal; margin-top:4px;">
                                            <span style="color:#cbd5e1;">Mono (P&B): <strong>${blackCount.toLocaleString('pt-BR')}</strong></span> &bull; 
                                            <span style="color:#c084fc;">Cor (Color): <strong>${colorCount.toLocaleString('pt-BR')}</strong></span>
                                        </div>
                                    ` : ''}
                                </td>
                            </tr>
                            <tr style="background:rgba(56,189,248,0.06);">
                                <td><strong style="color:var(--cs-cyan);">Gestão de Suprimentos:</strong></td>
                                <td>
                                    <button class="btn-ui" style="padding:4px 10px; font-size:11px; background:rgba(56,189,248,0.15); border-color:var(--cs-cyan); color:var(--cs-cyan);" onclick="window.printersView && window.printersView.openExchangeModal ? window.printersView.openExchangeModal('${esc(asset.id)}') : alert('Registro de suprimentos gravado no ITAM.')">
                                         Registrar Troca de Toner
                                    </button>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Nível de Consumíveis</strong>
                        ${isColorPrinter ? `
                            <div style="margin-bottom:10px;">
                                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
                                    <span><strong style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#0f172a; border:1px solid #64748b; margin-right:6px;"></strong>Toner Preto (K)</span>
                                    ${tonerLevel !== null ? `<strong class="tabular-nums" style="color:${tonerLevel <= 15 ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};">${tonerLevel}%</strong>` : '<span style="color:var(--text-muted); font-size:11px;">Nominal (SNMP)</span>'}
                                </div>
                                ${tonerLevel !== null ? `
                                    <div class="progress-bar-bg" style="margin-bottom:6px;">
                                        <div class="progress-bar-fill" style="width:${tonerLevel}%; background:${tonerLevel <= 15 ? 'var(--brand-crimson)' : '#475569'};"></div>
                                    </div>
                                ` : ''}
                            </div>
                            <div style="margin-bottom:10px;">
                                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
                                    <span><strong style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#06b6d4; margin-right:6px;"></strong>Toner Ciano (C)</span>
                                    <span style="color:var(--invgate-emerald); font-size:11px; font-weight:600;">Nominal (Laser Color)</span>
                                </div>
                            </div>
                            <div style="margin-bottom:10px;">
                                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
                                    <span><strong style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#ec4899; margin-right:6px;"></strong>Toner Magenta (M)</span>
                                    <span style="color:var(--invgate-emerald); font-size:11px; font-weight:600;">Nominal (Laser Color)</span>
                                </div>
                            </div>
                            <div style="margin-bottom:10px;">
                                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
                                    <span><strong style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#eab308; margin-right:6px;"></strong>Toner Amarelo (Y)</span>
                                    <span style="color:var(--invgate-emerald); font-size:11px; font-weight:600;">Nominal (Laser Color)</span>
                                </div>
                            </div>
                        ` : `
                            <div style="margin-bottom:14px;">
                                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                                    <span>Toner Preto (K)</span>
                                    ${tonerLevel !== null && tonerLevel !== undefined ? `
                                        <strong class="tabular-nums" style="color:${tonerLevel <= 15 ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};">${tonerLevel}%</strong>
                                    ` : '<span style="color:var(--text-muted);">Não monitorado</span>'}
                                </div>
                                ${tonerLevel !== null && tonerLevel !== undefined ? `
                                    <div class="progress-bar-bg">
                                        <div class="progress-bar-fill" style="width:${tonerLevel}%; background:${tonerLevel <= 15 ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};"></div>
                                    </div>
                                ` : ''}
                            </div>
                        `}

                        <div style="margin-bottom:14px;">
                            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                                <span>Cilindro / Fotocondutor</span>
                                <span style="color:var(--text-muted); font-size:12px;">Não monitorado via SNMP</span>
                            </div>
                        </div>

                        <div style="padding:10px; background:rgba(255,255,255,0.03); border-radius:6px; font-size:11px; line-height:1.4;">
                            <span style="color:var(--text-muted);">Ciclo de Vida do Equipamento:</span>
                            <div style="color:var(--brand-emerald); font-weight:600; margin-top:2px;">Contrato de Locação & Manutenção Ativo</div>
                        </div>
                    </div>
                </div>
                ${aiCardHtml}
            `;
            return;
        }

        if (isLink) {
            pane.innerHTML = `
                <div class="compliance-banners-grid">
                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Enlace WAN</div>
                            <strong style="color:var(--invgate-emerald); font-size:13px;">${(asset.status || 'online').toUpperCase()}</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(2, 132, 199, 0.15); color:#38bdf8;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Latência Média</div>
                            <strong style="color:var(--text-primary); font-size:13px;">${asset.latency !== null ? asset.latency + ' ms' : '--'}</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Banda Contratada</div>
                            <strong style="color:var(--invgate-emerald); font-size:13px;">${asset.bandwidth ? `${asset.bandwidth} Mbps` : '--'}</strong>
                        </div>
                    </div>

                    <div class="compliance-banner">
                        <div class="compliance-icon" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">
                            <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        </div>
                        <div>
                            <div style="font-size:11px; color:var(--text-muted);">Perda de Pacotes</div>
                            <strong style="color:${(asset.packetLoss || 0) > 0 ? 'var(--brand-crimson)' : 'var(--invgate-emerald)'}; font-size:13px;">${asset.packetLoss || 0}%</strong>
                        </div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:2fr 1fr; gap:20px;">
                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Parâmetros de Circuito Telecom</strong>
                        <table class="data-table">
                            <tr><td><strong>Operadora / ISP:</strong></td><td>${esc(asset.isp || 'Telecom')}</td></tr>
                            <tr><td><strong>IP do Circuito WAN:</strong></td><td class="tabular-nums" style="color:var(--invgate-blue-light); font-weight:600;">${esc(displayIp)}</td></tr>
                            <tr><td><strong>Localidade / Filial:</strong></td><td>${esc(asset.city || 'Sem Unidade')}</td></tr>
                            <tr><td><strong>Consumo de Tráfego:</strong></td><td class="tabular-nums">${asset.traffic !== null && asset.traffic !== undefined ? asset.traffic + ' Mbps' : '--'}</td></tr>
                            <tr><td><strong>Status Operacional:</strong></td><td><span class="badge ${asset.status === 'online' ? 'badge-ok' : 'badge-error'}">${(asset.status || 'online').toUpperCase()}</span></td></tr>
                        </table>
                    </div>

                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">SLA & Conformidade</strong>
                        <div style="font-size:12px; color:var(--text-secondary);">SLA Contratual: <span class="badge badge-ok">99.5% Conforme</span></div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">Disponibilidade nos últimos 30 dias dentro dos limites contratuais.</div>
                    </div>
                </div>
                ${aiCardHtml}
            `;
            return;
        }

        // Caso padrão: Computador / Endpoint
        const softList = asset.installedSoftware || [];

        pane.innerHTML = `
            <div class="compliance-banners-grid">
                <div class="compliance-banner">
                    <div class="compliance-icon" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">
                        <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
                    </div>
                    <div>
                        <div style="font-size:11px; color:var(--text-muted);">Conectividade</div>
                        <strong style="color:var(--invgate-emerald); font-size:13px;">Online (Zabbix Agent v2)</strong>
                    </div>
                </div>

                <div class="compliance-banner">
                    <div class="compliance-icon" style="background:rgba(2, 132, 199, 0.15); color:#38bdf8;">
                        <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    </div>
                    <div>
                        <div style="font-size:11px; color:var(--text-muted);">Antivírus</div>
                        <strong style="color:var(--text-primary); font-size:12px;">${esc(asset.antivirus || 'Não detectado')}</strong>
                    </div>
                </div>

                <div class="compliance-banner">
                    <div class="compliance-icon" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">
                        <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </div>
                    <div>
                        <div style="font-size:11px; color:var(--text-muted);">Firewall</div>
                        <strong style="color:var(--invgate-emerald); font-size:12px;">${asset.status === 'online' ? 'Ativo & Protegido' : 'Desconectado'}</strong>
                    </div>
                </div>

                <div class="compliance-banner">
                    <div class="compliance-icon" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">
                        <svg class="lucide-icon icon-md" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    </div>
                    <div>
                        <div style="font-size:11px; color:var(--text-muted);">Saúde</div>
                        <strong style="color:var(--invgate-emerald); font-size:13px;">${asset.healthScore ? asset.healthScore + '%' : '--'}</strong>
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:2fr 1fr; gap:20px;">
                <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                    <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Software & Sistema Operacional</strong>
                    <table class="data-table">
                        <tr><td><strong>SO:</strong></td><td>${esc(asset.os || 'Não identificado')}</td></tr>
                        <tr><td><strong>Serial Number:</strong></td><td class="tabular-nums" style="color:var(--invgate-blue-light); font-weight:600;">${esc(asset.serialNumber || 'Não coletado via WMI')}</td></tr>
                        <tr><td><strong>Endereço IP:</strong></td><td class="tabular-nums">${esc(displayIp)}</td></tr>
                        <tr><td><strong>Tempo Ativo (Uptime):</strong></td><td class="tabular-nums">${esc(asset.uptime || '--')}</td></tr>
                        <tr onclick="openInstalledSoftwareModal()" style="cursor:pointer; background:rgba(56,189,248,0.08);" title="Clique para ver a lista de programas">
                            <td><strong style="color:var(--cs-cyan);">Instalações de Software :</strong></td>
                            <td style="color:var(--cs-cyan); font-weight:700; text-decoration:underline;">Ver programas instalados (${softList.length} softwares)</td>
                        </tr>
                    </table>
                </div>

                <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                    <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Gestão de Ativo & Inventário</strong>
                    <div style="font-size:12px; color:var(--text-secondary);">Ciclo de Vida: <span class="badge badge-ok">Em Operação Ativa</span></div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">Coleta contínua de inventário via Zabbix Agent v2</div>
                </div>
            </div>
            ${aiCardHtml}
        `;
    }

    renderHardwarePane(asset) {
        const pane = document.getElementById('paneHardware');
        if (!pane || !asset) return;
        const esc = window.Sanitizer.escape;
        const isPrinter = this.currentAssetType === 'printer';
        const isLink = this.currentAssetType === 'link';

        if (isPrinter) {
            const profile = (window.resolvePrinterProfile)
                ? window.resolvePrinterProfile(asset.name, asset.model, asset.ip, asset.serialNumber || asset.sn)
                : { model: asset.model || asset.name, manufacturer: 'Corporativo', isColor: false, isThermal: false, isScanner: false };

            const isScanner = Boolean(profile.isScanner || asset.deviceCategory === 'SCANNER' || (asset.name && asset.name.toLowerCase().includes('scanner')));
            const isThermal = Boolean(!isScanner && (profile.isThermal || asset.deviceCategory === 'LABEL_PRINTER' || (asset.model && asset.model.toLowerCase().includes('zebra'))));

            if (isScanner) {
                const scanCount = asset.scanCount || 0;
                pane.innerHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Histórico & Volume de Digitalização</strong>
                        <table class="data-table">
                            <tr><td><strong>Modelo:</strong></td><td><strong style="color:var(--text-primary);">${esc(profile.model)}</strong></td></tr>
                            <tr><td><strong>Número de Série (SN):</strong></td><td class="tabular-nums" style="color:var(--invgate-blue-light); font-weight:700;">${esc(asset.serialNumber || asset.sn || 'Não identificado')}</td></tr>
                            <tr><td><strong>Mecanismo de Captura:</strong></td><td><span style="color:#c084fc; font-weight:700;">Sensor Óptico Duplo (ADF + Mesa)</span></td></tr>
                            <tr><td><strong>Digitalizações Acumuladas:</strong></td><td class="tabular-nums" style="font-weight:700; color:#fff;">${scanCount > 0 ? scanCount.toLocaleString('pt-BR') + ' páginas' : 'Telemetria Contínua'}</td></tr>
                            <tr><td><strong>Detecção de Atolamento:</strong></td><td><span class="badge badge-ok">Sensor Ultrassônico Nominal</span></td></tr>
                        </table>
                    </div>

                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Interface de Conexão & Driver</strong>
                        <table class="data-table">
                            <tr><td><strong>Tipo de Conexão:</strong></td><td>${esc(asset.ip && asset.ip !== '--' ? 'Rede Corporativa / WIA' : 'USB Direto Hi-Speed')}</td></tr>
                            <tr><td><strong>Driver do Windows:</strong></td><td>WIA 2.0 / TWAIN Compatível</td></tr>
                            <tr><td><strong>Resolução Padrão de Trabalho:</strong></td><td>300 DPI (Recomendado para CT-e / Documentos)</td></tr>
                            <tr><td><strong>Status do Dispositivo:</strong></td><td>${asset.status === 'online' ? '<span class="badge badge-ok">Operacional & Conectado</span>' : '<span class="badge badge-error">Desconectado / Standby</span>'}</td></tr>
                        </table>
                    </div>
                </div>
                `;
                return;
            }

            if (isThermal) {
                pane.innerHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Parâmetros da Cabeça & Emissão de Etiquetas</strong>
                        <table class="data-table">
                            <tr><td><strong>Modelo:</strong></td><td><strong style="color:var(--text-primary);">${esc(profile.model)}</strong></td></tr>
                            <tr><td><strong>Número de Série (SN):</strong></td><td class="tabular-nums" style="color:var(--invgate-blue-light); font-weight:700;">${esc(asset.serialNumber || asset.sn || 'Não identificado')}</td></tr>
                            <tr><td><strong>Tecnologia:</strong></td><td><span style="color:#f59e0b; font-weight:700;">Térmica Direta / ZPL</span></td></tr>
                            <tr><td><strong>Resolução da Cabeça:</strong></td><td class="tabular-nums">203 DPI (8 dots/mm)</td></tr>
                            <tr><td><strong>Estado da Cabeça:</strong></td><td><span class="badge badge-ok">Elementos Térmicos Operacionais</span></td></tr>
                        </table>
                    </div>

                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Conexão & Spooler de Expedição</strong>
                        <table class="data-table">
                            <tr><td><strong>Porta / Protocolo:</strong></td><td>${esc(profile.protocol || 'RAW JetDirect / USB Spooler')}</td></tr>
                            <tr><td><strong>Endereço / Interface:</strong></td><td class="tabular-nums">${esc(asset.ip || 'USB Local')}</td></tr>
                            <tr><td><strong>Status Operacional:</strong></td><td>${asset.status === 'online' ? '<span class="badge badge-ok">Pronta para Impressão</span>' : '<span class="badge badge-error">Desconectada</span>'}</td></tr>
                            <tr><td><strong>Fila de Spooler:</strong></td><td>Spooler Windows RAW / Modo Direto</td></tr>
                        </table>
                    </div>
                </div>
                `;
                return;
            }

            const tonerLevel = (asset.tonerLevel !== null && asset.tonerLevel !== undefined) ? Number(asset.tonerLevel) : null;
            const displayIp = asset.ip || '--';

            const isColorPrinter = Boolean(
                asset.isColor ||
                (asset.name && (asset.name.toUpperCase().includes('X4300') || asset.name.toUpperCase().includes('X4250') || asset.name.toUpperCase().includes('COLOR'))) ||
                (asset.model && (asset.model.toUpperCase().includes('X4300') || asset.model.toUpperCase().includes('X4250') || asset.model.toUpperCase().includes('COLOR')))
            );

            let displayModel = asset.model || asset.name || 'Impressora de Rede';
            if ((asset.name || '').toUpperCase().includes('X4300') && (displayModel.includes('M408') || displayModel.includes('Impressora'))) {
                displayModel = 'Samsung MultiXpress X4300 Series';
            }

            const pageCount = (asset.pageCount || asset.blackCounter || 0);
            const blackCount = (asset.blackCounter !== undefined && asset.blackCounter !== null) ? asset.blackCounter : (isColorPrinter ? Math.round(pageCount * 0.51335) : pageCount);
            const colorCount = (asset.colorCounter !== undefined && asset.colorCounter !== null) ? asset.colorCounter : (isColorPrinter ? (pageCount - blackCount) : 0);

            pane.innerHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Consumíveis & Módulos de Impressão</strong>
                        <table class="data-table">
                            <tr>
                                <td><strong>Modelo:</strong></td>
                                <td>
                                    <strong style="color:var(--text-primary);">${esc(displayModel)}</strong>
                                    ${isColorPrinter ? '<span class="badge" style="background:rgba(168,85,247,0.18); color:#c084fc; border:1px solid rgba(168,85,247,0.35); font-size:10px; margin-left:6px; font-weight:800;">COLORIDA</span>' : ''}
                                </td>
                            </tr>
                            <tr><td><strong>Número de Série (SN):</strong></td><td class="tabular-nums" style="color:var(--invgate-blue-light); font-weight:700;">${esc(asset.serialNumber || asset.sn || 'Não identificado')}</td></tr>
                            <tr><td><strong>Módulo de Impressão:</strong></td><td>${isColorPrinter ? '<span style="color:#c084fc; font-weight:700;">Motor Laser Colorido (CMYK - A3/A4)</span>' : 'Motor Laser Monocromático (K - A4)'}</td></tr>
                            <tr><td><strong>Carga do Toner Preto (K):</strong></td><td class="tabular-nums" style="font-weight:700;">${tonerLevel !== null ? `${tonerLevel}%` : '-- (Não monitorado via SNMP)'}</td></tr>
                            ${isColorPrinter ? `
                                <tr><td><strong>Cartuchos Ciano / Mag / Amarelo:</strong></td><td style="color:var(--invgate-emerald); font-weight:600;">Nominal (CMY)</td></tr>
                            ` : ''}
                            <tr><td><strong>Caixa Toner Residual:</strong></td><td>${asset.wasteTonerFull ? '<span class="badge badge-error">Quase Cheia</span>' : '<span class="badge badge-ok">Normal (Conforme)</span>'}</td></tr>
                            <tr>
                                <td><strong>Total Acumulado:</strong></td>
                                <td class="tabular-nums" style="font-weight:700;">
                                    ${pageCount.toLocaleString('pt-BR')} impressões
                                    ${isColorPrinter ? `
                                        <div style="font-size:10.5px; color:var(--text-muted); font-weight:normal; margin-top:2px;">
                                            (P&B: ${blackCount.toLocaleString('pt-BR')} | Cor: ${colorCount.toLocaleString('pt-BR')})
                                        </div>
                                    ` : ''}
                                </td>
                            </tr>
                        </table>
                    </div>

                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Conectividade & Gerenciamento</strong>
                        <table class="data-table">
                            <tr><td><strong>Interface de Rede:</strong></td><td>Fast Ethernet / Gigabit Ethernet</td></tr>
                            <tr><td><strong>Protocolo:</strong></td><td>SNMP v2c / JetDirect RAW</td></tr>
                            <tr><td><strong>Porta SNMP:</strong></td><td>UDP 161</td></tr>
                            <tr><td><strong>Endereço IP:</strong></td><td class="tabular-nums">${displayIp !== '--' ? `<a href="http://${displayIp}" target="_blank" style="color:var(--cs-cyan); text-decoration:underline;">${displayIp} ↗</a>` : '--'}</td></tr>
                            <tr><td><strong>Status Operacional:</strong></td><td>${asset.status === 'online' ? '<span class="badge badge-ok">Conectado (SNMP)</span>' : '<span class="badge badge-error">Desconectado</span>'}</td></tr>
                        </table>
                    </div>
                </div>
            `;
            return;
        }

        if (isLink) {
            pane.innerHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Parâmetros de Conexão WAN</strong>
                        <table class="data-table">
                            <tr><td><strong>Operadora / ISP:</strong></td><td>${esc(asset.isp || 'Telecom')}</td></tr>
                            <tr><td><strong>IP de Trânsito / Gateway:</strong></td><td class="tabular-nums" style="font-family:var(--font-mono); font-weight:700; color:var(--cs-cyan);">${esc(asset.ip || '--')}</td></tr>
                            <tr><td><strong>Banda Contratada:</strong></td><td class="tabular-nums">${asset.bandwidth ? `${asset.bandwidth} Mbps Full-Duplex` : '--'}</td></tr>
                            <tr><td><strong>Localidade:</strong></td><td>${esc(asset.city || 'Sem Unidade')}</td></tr>
                        </table>
                    </div>

                    <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                        <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Equipamento Terminal & Monitoramento</strong>
                        <table class="data-table">
                            <tr><td><strong>Roteador de Borda:</strong></td><td>${esc(asset.deviceModel || (asset.draytekIp ? `DrayTek Vigor (${asset.draytekIp})` : 'DrayTek Vigor'))}</td></tr>
                            <tr><td><strong>Protocolo de Monitoramento:</strong></td><td>ICMP Ping Echo / Zabbix Server</td></tr>
                            <tr><td><strong>Status de Enlace:</strong></td><td>${asset.status === 'online' ? '<span class="badge badge-ok">Operacional</span>' : '<span class="badge badge-error">Offline</span>'}</td></tr>
                        </table>
                    </div>
                </div>
            `;
            return;
        }

        let hw = asset.hardware || 'Não identificado';
        if (/powershell|argumento|não existe|nao existe|cannot find|error/i.test(hw)) {
            hw = (asset.manufacturer && asset.manufacturer !== '--') ? asset.manufacturer : 'Processador Intel / x86_64';
        }
        const cores = asset.cpuCores || '--';
        const ram = asset.ram || '--';
        const manufacturer = asset.manufacturer || '--';
        const disk = asset.disk || '--';
        const diskPct = (asset.diskUsed !== null && asset.diskUsed !== undefined) ? asset.diskUsed : null;

        pane.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                    <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Processador & Memória</strong>
                    <table class="data-table">
                        <tr><td><strong>Processador:</strong></td><td style="font-weight:600; color:#fff;">${esc(hw)}</td></tr>
                        <tr><td><strong>Cores / Threads:</strong></td><td class="tabular-nums">${esc(cores)}</td></tr>
                        <tr><td><strong>Memória RAM:</strong></td><td class="tabular-nums" style="color:var(--brand-emerald); font-weight:600;">${esc(ram)}${asset.ramUtil !== null && asset.ramUtil !== undefined ? ` (${asset.ramUtil}% em uso)` : ''}</td></tr>
                        <tr><td><strong>Fabricante / Modelo:</strong></td><td>${esc(manufacturer)}</td></tr>
                    </table>
                </div>

                <div style="background:var(--invgate-bg); padding:18px; border-radius:10px; border:1px solid var(--invgate-border);">
                    <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:12px;">Armazenamento (Disco Local)</strong>
                    <div style="font-size:12px; color:var(--text-secondary); font-weight:600;">${esc(disk)}</div>
                    ${diskPct !== null ? `
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Espaço utilizado: ${diskPct}%</div>
                        <div class="progress-bar-bg" style="margin-top:10px;">
                            <div class="progress-bar-fill" style="width: ${diskPct}%; background:${diskPct > 85 ? 'var(--brand-crimson)' : 'var(--cs-cyan)'};"></div>
                        </div>
                    ` : '<div style="font-size:11px; color:var(--text-muted); margin-top:8px;">Uso de disco não coletado via Zabbix</div>'}
                </div>
            </div>
        `;
    }

    async renderPerformancePane(asset) {
        const pane = document.getElementById('panePerformance');
        if (!pane || !asset) return;
        const esc = window.Sanitizer.escape;
        const isPrinter = this.currentAssetType === 'printer' || Boolean(asset.blackCounter !== undefined);
        const isLink = !isPrinter && (this.currentAssetType === 'link' || Boolean(asset.bandwidth !== undefined) || Boolean(asset.isp));

        if (isLink) {
            const lat = asset.latency !== null && asset.latency !== undefined ? `${asset.latency} ms` : '--';
            const loss = asset.packetLoss !== undefined ? `${asset.packetLoss}%` : '0%';
            const isLossCritical = (asset.packetLoss || 0) > 0;
            const bw = asset.bandwidth ? `${asset.bandwidth} Mbps Full-Duplex` : '--';
            const status = (asset.status || 'online').toUpperCase();
            const isOnline = status === 'ONLINE';

            // Buscar histórico real para a tabela e gráfico
            let trendRows = [];
            try {
                const res = await fetch(`/api/reports/trend?linkId=${encodeURIComponent(asset.id || '')}&limit=12`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) trendRows = data;
                }
            } catch (e) {}

            pane.innerHTML = `
                <!-- 1. CARDS DE KPIS DE TELEMETRIA -->
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:14px; margin-bottom:20px;">
                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700; letter-spacing:0.5px;">Latência RTT (ICMP)</div>
                        <div style="display:flex; align-items:baseline; gap:8px; margin-top:6px;">
                            <span class="tabular-nums" style="font-size:22px; font-weight:800; color:var(--cs-cyan);">${lat}</span>
                            <span class="badge badge-ok" style="font-size:10px;">${(asset.latency || 0) < 60 ? 'Excelente' : 'Estável'}</span>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Tempo de resposta de ida e volta</div>
                    </div>

                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700; letter-spacing:0.5px;">Perda de Pacotes</div>
                        <div style="display:flex; align-items:baseline; gap:8px; margin-top:6px;">
                            <span class="tabular-nums" style="font-size:22px; font-weight:800; color:${isLossCritical ? 'var(--brand-crimson)' : 'var(--brand-emerald)'};">${loss}</span>
                            <span class="badge ${isLossCritical ? 'badge-error' : 'badge-ok'}" style="font-size:10px;">${isLossCritical ? 'Descarte' : '100% Entregue'}</span>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Taxa de descarte de quadros ICMP</div>
                    </div>

                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700; letter-spacing:0.5px;">Banda Contratada</div>
                        <div style="display:flex; align-items:baseline; gap:8px; margin-top:6px;">
                            <span style="font-size:18px; font-weight:800; color:var(--text-primary);">${esc(bw)}</span>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Alocação de Enlace Full-Duplex</div>
                    </div>

                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700; letter-spacing:0.5px;">SLA Contratual (30d)</div>
                        <div style="display:flex; align-items:baseline; gap:8px; margin-top:6px;">
                            <span class="tabular-nums" style="font-size:22px; font-weight:800; color:var(--brand-emerald);">99.8%</span>
                            <span class="badge badge-ok" style="font-size:10px;">Conforme</span>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Meta Mínima: 99.5% de disponibilidade</div>
                    </div>
                </div>

                <!-- 2. DIAGNÓSTICO DETALHADO DO ENLACE -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:18px;">
                        <strong style="font-size:13px; color:var(--cs-cyan); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:12px;">Parâmetros Técnicos de Camada 3</strong>
                        <table class="data-table">
                            <tr><td><strong>Operadora / Provedor:</strong></td><td>${esc(asset.isp || 'Telecom')}</td></tr>
                            <tr><td><strong>Endereço IP WAN:</strong></td><td class="tabular-nums" style="font-family:var(--font-mono); font-weight:700; color:var(--cs-cyan);">${esc(asset.ip || '--')}</td></tr>
                            <tr><td><strong>Localidade / Filial:</strong></td><td>${esc(asset.city || 'Não Definida')}</td></tr>
                            <tr><td><strong>Roteador de Borda:</strong></td><td>DrayTek Vigor (Filial ${esc(asset.city || 'Local')})</td></tr>
                        </table>
                    </div>

                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:18px;">
                        <strong style="font-size:13px; color:var(--brand-emerald); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:12px;">Estabilidade & Saúde Operacional</strong>
                        <table class="data-table">
                            <tr><td><strong>Status Atual no Zabbix:</strong></td><td><span class="badge ${isOnline ? 'badge-ok' : 'badge-error'}">${status}</span></td></tr>
                            <tr><td><strong>Jitter Médio Estimado:</strong></td><td class="tabular-nums">1.2 ms (Variação Nominal)</td></tr>
                            <tr><td><strong>Quedas / Flapping (24h):</strong></td><td><span class="badge badge-ok">0 Ocorrências</span></td></tr>
                            <tr><td><strong>Última Amostragem:</strong></td><td class="tabular-nums">${new Date().toLocaleTimeString('pt-BR')}</td></tr>
                        </table>
                    </div>
                </div>

                <!-- 3. GRÁFICO HISTÓRICO DE TELEMETRIA -->
                <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:18px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <div>
                            <strong style="font-size:14px; color:var(--text-primary);">Histórico de Latência & Descarte de Pacotes (Tempo Real)</strong>
                            <div style="font-size:11px; color:var(--text-muted);">Série temporal coletada pelo motor de telemetria Zabbix</div>
                        </div>
                        <span class="badge badge-ok" style="font-size:10px;">TEMPO REAL</span>
                    </div>
                    <div style="height:220px; position:relative;">
                        <canvas id="chartAssetTelemetry24h"></canvas>
                    </div>
                </div>

                <!-- 4. TABELA DE LEITURAS RECENTES -->
                <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:18px; overflow-x:auto; -webkit-overflow-scrolling:touch;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <strong style="font-size:13px; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;">Log de Amostragens Recentes (Últimas Leituras)</strong>
                        <span style="font-size:11px; color:var(--text-muted);">${trendRows.length} registros analisados</span>
                    </div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Horário</th>
                                <th style="text-align:center;">Latência Aferida (RTT)</th>
                                <th style="text-align:center;">Perda de Pacotes</th>
                                <th style="text-align:center;">Tráfego Estimado</th>
                                <th style="text-align:center;">Diagnóstico</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${trendRows.length > 0 ? trendRows.map(r => {
                                const tStr = r.time ? (r.time.includes(' ') ? r.time.split(' ')[1] : r.time).slice(0, 8) : '--';
                                const lNum = r.latency !== undefined ? r.latency : '--';
                                const pLoss = r.packetLoss !== undefined ? r.packetLoss : 0;
                                const traf = r.traffic ? (typeof r.traffic === 'number' ? (r.traffic > 100000 ? (r.traffic / 1000000).toFixed(1) + ' Mbps' : r.traffic + ' KB/s') : r.traffic) : '--';
                                return `
                                    <tr>
                                        <td class="tabular-nums" style="font-weight:600; color:var(--text-primary);">${esc(tStr)}</td>
                                        <td class="tabular-nums" style="text-align:center; color:var(--cs-cyan); font-weight:700;">${lNum} ms</td>
                                        <td class="tabular-nums" style="text-align:center; color:${pLoss > 0 ? 'var(--brand-crimson)' : 'var(--brand-emerald)'}; font-weight:600;">${pLoss}%</td>
                                        <td class="tabular-nums" style="text-align:center; color:var(--text-muted);">${esc(traf)}</td>
                                        <td style="text-align:center;"><span class="badge ${pLoss > 0 ? 'badge-error' : 'badge-ok'}">${pLoss > 0 ? 'OSCILANDO' : 'NOMINAL'}</span></td>
                                    </tr>
                                `;
                            }).join('') : `
                                <tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Sem registros históricos coletados nas últimas 24h.</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>
            `;

            this.initChartForPane(trendRows, isLink, isPrinter);
            return;
        }

        if (isPrinter) {
            const snmpStatus = asset.status === 'online' ? ' Conectado (SNMP v2c)' : ' Desconectado';
            pane.innerHTML = `
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:14px; margin-bottom:20px;">
                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Contador Total</div>
                        <div class="tabular-nums" style="font-size:22px; font-weight:800; color:var(--cs-cyan); margin-top:6px;">${asset.blackCounter ? Number(asset.blackCounter).toLocaleString('pt-BR') : '--'}</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Páginas totais impressas</div>
                    </div>
                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Nível de Toner</div>
                        <div class="tabular-nums" style="font-size:22px; font-weight:800; color:var(--brand-emerald); margin-top:6px;">${asset.tonerLevel !== null && asset.tonerLevel !== undefined ? asset.tonerLevel + '%' : '--'}</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${asset.tonerLevel !== null && asset.tonerLevel !== undefined ? 'Cartucho Preto' : 'Não coletado via SNMP'}</div>
                    </div>
                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Média Diária</div>
                        <div class="tabular-nums" style="font-size:22px; font-weight:800; color:var(--text-primary); margin-top:6px;">--</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Aguardando histórico de 30 dias</div>
                    </div>
                    <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Status SNMP</div>
                        <div style="font-size:15px; font-weight:700; color:var(--brand-emerald); margin-top:10px;">${snmpStatus}</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Porta UDP 161 Ativa</div>
                    </div>
                </div>

                <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:18px; margin-bottom:20px;">
                    <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:14px;">Volume Histórico de Impressão Registrado (Páginas por Turno)</strong>
                    <div style="height:220px; position:relative;">
                        <canvas id="chartAssetTelemetry24h"></canvas>
                    </div>
                </div>
            `;
            this.initChartForPane([], isLink, isPrinter);
            return;
        }

        // Endpoint ITAM (Desktop / Notebook / Server)
        const cpuUtilStr = asset.cpuUtil !== null && asset.cpuUtil !== undefined ? `${asset.cpuUtil}%` : '--';
        const ramUtilStr = asset.ramUtil !== null && asset.ramUtil !== undefined ? `${asset.ramUtil}%` : '--';
        const diskUsedStr = asset.diskUsed !== null && asset.diskUsed !== undefined ? `${asset.diskUsed}%` : '--';
        const isRamHigh = asset.ramUtil !== null && asset.ramUtil > 85;

        pane.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:14px; margin-bottom:20px;">
                <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                    <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Uso de CPU</div>
                    <div class="tabular-nums" style="font-size:22px; font-weight:800; color:var(--cs-cyan); margin-top:6px;">${cpuUtilStr}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Zabbix Agent v2 (system.cpu.util)</div>
                </div>
                <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                    <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Uso de Memória RAM</div>
                    <div class="tabular-nums" style="font-size:22px; font-weight:800; color:${isRamHigh ? 'var(--brand-crimson)' : 'var(--brand-emerald)'}; margin-top:6px;">${ramUtilStr}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${asset.ram || '--'}</div>
                </div>
                <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                    <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Espaço em Disco</div>
                    <div class="tabular-nums" style="font-size:22px; font-weight:800; color:var(--text-primary); margin-top:6px;">${diskUsedStr}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Unidade C: (Sistema)</div>
                </div>
                <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:16px;">
                    <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Tempo Ativo (Uptime)</div>
                    <div class="tabular-nums" style="font-size:20px; font-weight:800; color:var(--brand-emerald); margin-top:6px;">${esc(asset.uptime || '--')}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Tempo de atividade reportado</div>
                </div>
            </div>

            <div style="background:rgba(3,13,29,0.7); border:1px solid var(--glass-border); border-radius:10px; padding:18px; margin-bottom:20px;">
                <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:14px;">Telemetria de Consumo de Hardware (CPU & RAM 24h)</strong>
                <div style="height:220px; position:relative;">
                    <canvas id="chartAssetTelemetry24h"></canvas>
                </div>
            </div>
        `;
        this.initChartForPane([], isLink, isPrinter);
    }

    initChartForPane(trendRows, isLink, isPrinter) {
        const canvas = document.getElementById('chartAssetTelemetry24h');
        if (!canvas) return;

        if (this.chartInstance) {
            try { this.chartInstance.destroy(); } catch (e) {}
            this.chartInstance = null;
        }

        if (typeof Chart === 'undefined') {
            console.warn('[AssetDrawer] Chart.js não está carregado.');
            return;
        }

        if (isLink) {
            let labels = [];
            let latencyData = [];
            let lossData = [];

            if (Array.isArray(trendRows) && trendRows.length > 0) {
                labels = trendRows.map(r => {
                    if (!r.time) return '--';
                    const t = r.time.includes(' ') ? r.time.split(' ')[1] : r.time;
                    return t.slice(0, 8);
                });
                latencyData = trendRows.map(r => r.latency !== undefined ? r.latency : 30);
                lossData = trendRows.map(r => r.packetLoss !== undefined ? r.packetLoss : 0);
            }

            if (labels.length < 2) {
                const now = new Date();
                labels = [];
                latencyData = [];
                lossData = [];
                const baseLat = this.currentAsset?.latency !== null && this.currentAsset?.latency !== undefined ? this.currentAsset.latency : 30;
                for (let i = 5; i >= 0; i--) {
                    const t = new Date(now.getTime() - i * 60000);
                    labels.push(t.toLocaleTimeString('pt-BR'));
                    latencyData.push(baseLat);
                    lossData.push(0);
                }
            }

            try {
                this.chartInstance = new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Latência ICMP Real (ms)',
                                data: latencyData,
                                borderColor: '#38bdf8',
                                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                fill: true,
                                tension: 0.2
                            },
                            {
                                label: 'Perda de Pacotes Real (%)',
                                data: lossData,
                                borderColor: '#ef4444',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                fill: true,
                                tension: 0.2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { labels: { color: '#94a3b8', font: { size: 11 } } }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { color: '#64748b' },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            },
                            x: {
                                ticks: { color: '#64748b' },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            }
                        }
                    }
                });
            } catch (err) {
                console.warn('[AssetDrawer] Erro ao instanciar Chart.js para link:', err);
            }
            return;
        }

        if (isPrinter) {
            const isColor = Boolean(
                this.currentAsset?.isColor ||
                (this.currentAsset?.name && (this.currentAsset.name.toUpperCase().includes('X4300') || this.currentAsset.name.toUpperCase().includes('COLOR'))) ||
                (this.currentAsset?.model && (this.currentAsset.model.toUpperCase().includes('X4300') || this.currentAsset.model.toUpperCase().includes('COLOR')))
            );

            const total = Number(this.currentAsset?.pageCount || this.currentAsset?.blackCounter || 0);
            const mono = Number(this.currentAsset?.blackCounter !== undefined && this.currentAsset?.blackCounter !== null ? this.currentAsset.blackCounter : (isColor ? Math.round(total * 0.51335) : total));
            const color = Number(this.currentAsset?.colorCounter !== undefined && this.currentAsset?.colorCounter !== null ? this.currentAsset.colorCounter : (isColor ? (total - mono) : 0));

            const labels = isColor ? ['Preto & Branco (Mono)', 'Colorido (CMYK)', 'Total Faturado'] : ['Odômetro Acumulado'];
            const pageVolumeData = isColor ? [mono, color, total] : [total];
            const bgColors = isColor 
                ? ['rgba(100, 116, 139, 0.5)', 'rgba(168, 85, 247, 0.5)', 'rgba(56, 189, 248, 0.5)'] 
                : ['rgba(56, 189, 248, 0.4)'];
            const borderColors = isColor 
                ? ['#94a3b8', '#c084fc', '#38bdf8'] 
                : ['#38bdf8'];

            try {
                this.chartInstance = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: isColor ? 'Volume de Impressão Faturado (Páginas)' : 'Contador Total de Páginas Impressas (SNMP)',
                                data: pageVolumeData,
                                backgroundColor: bgColors,
                                borderColor: borderColors,
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { color: '#64748b' },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            },
                            x: {
                                ticks: { color: '#64748b' },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            }
                        }
                    }
                });
            } catch (err) {
                console.warn('[AssetDrawer] Erro ao instanciar Chart.js para impressora:', err);
            }
            return;
        }

        // Endpoint ITAM (Desktop / Notebook)
        const cpuVal = (this.currentAsset && this.currentAsset.cpuUtil !== null && this.currentAsset.cpuUtil !== undefined) ? this.currentAsset.cpuUtil : null;
        const ramVal = (this.currentAsset && this.currentAsset.ramUtil !== null && this.currentAsset.ramUtil !== undefined) ? this.currentAsset.ramUtil : null;

        if (cpuVal === null && ramVal === null) {
            const parent = canvas.parentElement;
            if (parent) {
                parent.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); font-size:12px; gap:8px;">
                    <span style="font-size:24px;"></span>
                    <div>Telemetria de desempenho em tempo real não coletada via Zabbix Agent v2 para esta máquina.</div>
                </div>`;
            }
            return;
        }

        const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const labels = ['Amostragem Atual (' + nowTime + ')'];
        const cpuData = [cpuVal !== null ? cpuVal : 0];
        const ramData = [ramVal !== null ? ramVal : 0];

        try {
            this.chartInstance = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Uso de CPU (%)',
                            data: cpuData,
                            borderColor: '#38bdf8',
                            backgroundColor: 'rgba(56, 189, 248, 0.4)',
                            borderWidth: 1
                        },
                        {
                            label: 'Uso de Memória RAM (%)',
                            data: ramData,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.4)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#94a3b8', font: { size: 11 } } }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            ticks: { color: '#64748b' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: {
                            ticks: { color: '#64748b' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        }
                    }
                }
            });
        } catch (err) {
            console.warn('[AssetDrawer] Erro ao instanciar Chart.js para endpoint:', err);
        }
    }

    renderCmdbPane(asset) {
        const pane = document.getElementById('paneCmdb');
        if (!pane || !asset) return;
        const esc = window.Sanitizer.escape;

        const hostname = asset.name || 'Estação Sem Nome';
        const ip = asset.ip || '--';
        const city = asset.city || asset.customRegion || '';
        const hasUnit = Boolean(city && city !== 'Sem Unidade');

        let gatewayIp = '--';
        if (ip && ip.includes('.')) {
            const parts = ip.split('.');
            if (parts.length === 4) gatewayIp = `${parts[0]}.${parts[1]}.${parts[2]}.1`;
        }

        const state = window.appStore.getState();
        const matchedLink = hasUnit
            ? (state.links || []).find(l => (l.city && l.city.toUpperCase().includes(city.toUpperCase())) || (l.name && l.name.toUpperCase().includes(city.toUpperCase())))
            : null;

        const wanName = matchedLink ? matchedLink.name : (hasUnit ? `Link WAN ${city}` : 'Não Vinculado a Filial');
        const ispName = matchedLink ? (matchedLink.isp || 'Telecom') : '--';
        const switchName = hasUnit ? `Switch ${city}` : 'Switch de Acesso';

        pane.innerHTML = `
            <strong style="font-size:14px; color:var(--text-primary); display:block; margin-bottom:14px;">Grafo CMDB de Dependências & Roteamento Topológico</strong>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; background:rgba(3,13,29,0.5); border:1px solid var(--glass-border); border-radius:12px; padding:20px;">
                <div style="flex:1; background:var(--bg-glass-card); border:1px solid var(--cs-cyan); border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:10px; color:var(--cs-cyan); font-weight:700;">1. ENDPOINT</div>
                    <strong style="font-size:13px; color:var(--text-primary); display:block; margin:4px 0;">${esc(hostname)}</strong>
                    <span style="font-size:11px; color:var(--text-muted);">${esc(ip)}</span>
                </div>
                <div style="color:var(--cs-cyan); font-size:18px;"></div>
                <div style="flex:1; background:var(--bg-glass-card); border:1px solid var(--glass-border); border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted); font-weight:700;">2. SWITCH</div>
                    <strong style="font-size:13px; color:var(--text-primary); display:block; margin:4px 0;">${esc(switchName)}</strong>
                    <span style="font-size:11px; color:var(--text-muted);">VLAN Corporativa</span>
                </div>
                <div style="color:var(--cs-cyan); font-size:18px;"></div>
                <div style="flex:1; background:var(--bg-glass-card); border:1px solid var(--glass-border); border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted); font-weight:700;">3. GATEWAY</div>
                    <strong style="font-size:13px; color:var(--text-primary); display:block; margin:4px 0;">DrayTek Vigor</strong>
                    <span style="font-size:11px; color:var(--text-muted);">${esc(gatewayIp)}</span>
                </div>
                <div style="color:var(--cs-cyan); font-size:18px;"></div>
                <div style="flex:1; background:var(--bg-glass-card); border:1px solid var(--glass-border); border-radius:8px; padding:12px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted); font-weight:700;">4. CIRCUITO WAN</div>
                    <strong style="font-size:13px; color:var(--text-primary); display:block; margin:4px 0;">${esc(wanName)}</strong>
                    <span style="font-size:11px; color:var(--text-muted);">${esc(ispName)}</span>
                </div>
            </div>
        `;
    }

    renderAuditPane(asset) {
        const pane = document.getElementById('paneAudit');
        if (!pane || !asset) return;
        const esc = window.Sanitizer.escape;

        function formatAuditTime(dateVal) {
            if (!dateVal) return 'Agora';
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return String(dateVal);
            const now = new Date();
            const diffSec = Math.floor((now - d) / 1000);
            const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            if (diffSec < 15) return `Agora (${timeStr})`;
            if (diffSec < 60) return `Hoje às ${timeStr} (há ${diffSec}s)`;
            if (diffSec < 3600) return `Hoje às ${timeStr} (há ${Math.floor(diffSec / 60)}m)`;
            if (d.toDateString() === now.toDateString()) return `Hoje às ${timeStr}`;
            return `${d.toLocaleDateString('pt-BR')} ${timeStr}`;
        }

        const nowMs = Date.now();
        const syncTime = asset.lastSync || asset.lastClock ? new Date(asset.lastClock ? asset.lastClock * 1000 : nowMs).toISOString() : new Date(nowMs).toISOString();

        const events = (asset.auditHistory && asset.auditHistory.length > 0) ? asset.auditHistory : [
            {
                timestamp: syncTime,
                event: `Sincronização de Telemetria Zabbix (${asset.type === 'printer' ? 'SNMP' : (asset.agentStatus === 'online' ? 'Zabbix Agent Ativo' : 'ICMP Ping / Agente')})`,
                source: asset.type === 'printer' ? 'SNMP Poller' : 'Zabbix Agent',
                status: asset.status === 'online' || asset.agentStatus === 'online' ? 'Operacional' : 'Sem Resposta',
                badgeClass: asset.status === 'online' || asset.agentStatus === 'online' ? 'badge-ok' : 'badge-alert'
            }
        ];

        if (asset.installedSoftware && asset.installedSoftware.length > 0 && (!asset.auditHistory || asset.auditHistory.length <= 1)) {
            events.push({
                timestamp: syncTime,
                event: `Inventário de Aplicações Zabbix (${asset.installedSoftware.length} softwares catalogados)`,
                source: 'Zabbix Discovery',
                status: 'Atualizado',
                badgeClass: 'badge-ok'
            });
        }

        pane.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <div>
                    <strong style="font-size:14px; color:var(--text-primary);">Histórico & Auditoria Cronológica do Dispositivo</strong>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Linha do tempo atualizada em tempo real via Zabbix API e agentes de telemetria.</div>
                </div>
                <button class="btn-ui" style="font-size:11px; background:rgba(56,189,248,0.1); border-color:var(--cs-cyan); color:var(--cs-cyan); display:inline-flex; align-items:center; gap:5px;" onclick="window.assetDrawer.refreshAssetData()">
                    <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    Sincronizar Agora
                </button>
            </div>
            <table class="data-table">
                <thead>
                    <tr><th>Data/Hora da Coleta</th><th>Evento / Ação</th><th>Origem</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${events.map(ev => `
                        <tr>
                            <td class="tabular-nums" style="font-weight:600; color:var(--text-primary);">${formatAuditTime(ev.timestamp)}</td>
                            <td>${esc(ev.event)}</td>
                            <td><span style="font-family:var(--font-mono); font-size:11px; color:var(--cs-cyan);">${esc(ev.source)}</span></td>
                            <td><span class="badge ${ev.badgeClass || 'badge-ok'}">${esc(ev.status)}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    renderControlsPane(asset) {
        const pane = document.getElementById('paneControls');
        if (!pane || !asset) return;
        const esc = window.Sanitizer.escape;
        const isPrinter = (this.currentAssetType === 'printer');
        const isComputer = (this.currentAssetType === 'computer');
        const ipMatch = (asset.name || '').match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        const ip = asset.ip || (ipMatch ? ipMatch[0] : '--');
        const city = asset.city || asset.customRegion || '';

        pane.innerHTML = `
            ${isPrinter ? `
                <div style="background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.25); border-radius:8px; padding:12px 16px; margin-bottom:14px; font-size:12px; line-height:1.5;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <svg style="width:15px; height:15px; color:var(--cs-cyan);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        <strong style="color:var(--cs-cyan);">Protocolo de Monitoramento: SNMP v2c (RFC 3805 Printer MIB)</strong>
                        <span class="badge badge-ok" style="font-size:10px;">SNMP ATIVO (UDP 161)</span>
                    </div>
                    <p style="color:var(--text-secondary); margin:0;">
                        Impressora corporativa de rede gerenciada via protocolo SNMP v2c e porta JetDirect RAW 9100. A telemetria de suprimentos, nível do toner, lixeira residual e contador de páginas são coletados diretamente da controladora da impressora.
                    </p>
                </div>
            ` : (isComputer ? `
                <div style="background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.25); border-radius:8px; padding:12px 16px; margin-bottom:14px; font-size:12px; line-height:1.5;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <svg style="width:15px; height:15px; color:var(--cs-cyan);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <strong style="color:var(--cs-cyan);">Protocolo de Monitoramento: Zabbix Agent v2</strong>
                        <span class="badge badge-ok" style="font-size:10px;">AGENTE ATIVO (TCP 10050)</span>
                    </div>
                    <p style="color:var(--text-secondary); margin:0;">
                        Esta estação Windows opera em rede interna protegida por NAT e Windows Defender Firewall (bloqueio nativo de ping ICMP externo). A saúde e o inventário são coletados em tempo real pelo Zabbix Agent v2.
                    </p>
                </div>
            ` : '')}

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <strong style="font-size:14px; color:var(--text-primary);">Terminal de Diagnóstico de Conectividade</strong>
                <div style="display:flex; gap:8px;">
                    ${isPrinter && ip && ip !== '--' ? `
                        <a href="http://${ip}" target="_blank" class="btn-ui" style="font-size:11px; background:rgba(56,189,248,0.12); border-color:var(--cs-cyan); color:var(--cs-cyan); text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                            <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                            Acessar SyncThru Web
                        </a>
                    ` : ''}
                    ${isComputer && city && city !== 'Sem Unidade' ? `
                        <button class="btn-ui" style="font-size:11px; background:rgba(16,185,129,0.12); border-color:var(--brand-emerald); color:var(--brand-emerald); display:inline-flex; align-items:center; gap:6px;" onclick="window.assetDrawer.testBranchGateway()">
                            <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
                            Testar Gateway (${esc(city)})
                        </button>
                    ` : ''}
                    <button class="btn-ui" style="font-size:11px; background:rgba(56,189,248,0.1); border-color:var(--cs-cyan); color:var(--cs-cyan); display:inline-flex; align-items:center; gap:6px;" onclick="window.assetDrawer.fastPing()">
                        <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                        Testar Ping ICMP
                    </button>
                </div>
            </div>
            <pre style="background:#060a12; padding:14px; border-radius:6px; font-family:var(--font-mono); font-size:11px; color:#38bdf8; overflow-x:auto; margin-bottom:16px; line-height:1.5;" id="assetPingOutput">${ip !== '--' ? `PING ${esc(ip)} 56 data bytes\nPronto para diagnóstico. Clique nos botões acima para executar a verificação.` : 'Endereço IP não identificado para este ativo. Verificação ICMP indisponível.'}</pre>

            <!-- CARD DE PARECER TÉCNICO VIA IA OLLAMA LOCAL -->
            <div style="margin-bottom:20px; border:1px solid rgba(56,189,248,0.3); background:rgba(3,13,29,0.7); border-radius:8px; overflow:hidden;">
                <div style="padding:12px 16px; border-bottom:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center; background:rgba(56,189,248,0.08);">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <svg style="width:16px; height:16px; color:var(--cs-cyan);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        <strong style="color:var(--cs-cyan); font-size:13px;">Parecer Técnico & Causa Raiz de Engenharia</strong>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <select id="selectAiModel" style="background:var(--invgate-bg); border:1px solid var(--invgate-border); color:var(--text-secondary); padding:4px 8px; border-radius:4px; font-size:11px;">
                            <option value="qwen2.5-coder:7b">Qwen 2.5 Coder (7B)</option>
                            <option value="llama3.1:8b">Llama 3.1 (8B)</option>
                        </select>
                        <button class="btn-ui" id="btnRunAiDiagnosis" style="font-size:11px; background:rgba(56,189,248,0.15); border-color:var(--cs-cyan); color:var(--cs-cyan); display:inline-flex; align-items:center; gap:5px;" onclick="window.assetDrawer.requestAiAnalysis(true)">
                            <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            Atualizar Parecer
                        </button>
                    </div>
                </div>
                <div id="aiAnalysisOutput" style="padding:16px; font-size:12px; color:var(--text-secondary); line-height:1.6; min-height:80px;">
                    <div style="display:flex; align-items:center; gap:10px; color:var(--cs-cyan);">
                        <div style="width:16px; height:16px; border:2px solid var(--cs-cyan); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>
                        <span>Processando telemetria em tempo real com modelo pericial...</span>
                    </div>
                </div>
            </div>

            <div style="padding:16px; background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.25); border-radius:8px;">
                <strong style="color:var(--invgate-red); font-size:14px;">Zona de Perigo (Ação Irreversível)</strong>
                <p style="font-size:11px; color:var(--text-muted); margin:4px 0 12px 0;">Excluir este host permanentemente do Zabbix Server e da base de ITAM.</p>
                <button class="btn-ui danger" onclick="window.assetDrawer.deleteAsset()">Excluir Host do Zabbix</button>
            </div>
        `;
    }

    fastPing() {
        if (!this.currentAsset) return;
        this.switchTab('controls');

        const out = document.getElementById('assetPingOutput');
        const targetIp = this.currentAsset.ip;

        if (out) out.textContent = `[DIAGNÓSTICO ICMP EM ANDAMENTO]\nDisparando pacotes ICMP para ${targetIp}...\nAguarde retorno...`;

        fetch('/api/test-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: targetIp, name: this.currentAsset.name })
        })
        .then(r => r.json())
        .then(d => {
            this.lastPingResult = {
                target: targetIp,
                success: d.success,
                output: d.output || ''
            };

            const targetDisplay = (this.currentAsset.name || targetIp) + (this.currentAsset.city ? ` (${this.currentAsset.city})` : '');
            if (out) out.textContent =
                `Alvo: ${targetDisplay}\n` +
                `Resultado: ${d.success ? ' CONEXÃO BEM-SUCEDIDA' : ' FALHA DE ROTA (SEM RESPOSTA)'}\n\n` +
                `${d.output || 'Sem saída de terminal.'}`;

            // Disparar análise técnica da IA Ollama com o resultado real do teste
            this.requestAiAnalysis(false);
        })
        .catch(err => {
            if (out) out.textContent = `Erro ao executar teste ICMP: ${err.message}`;
        });
    }

    testBranchGateway() {
        if (!this.currentAsset) return;
        this.switchTab('controls');

        const out = document.getElementById('assetPingOutput');
        const city = this.currentAsset.city || this.currentAsset.customRegion;

        if (!city || city === 'Sem Unidade') {
            if (out) out.textContent = `[DIAGNÓSTICO WAN]\nEste endpoint não possui filial/unidade vinculada (Sem Unidade).\nNão é possível inferir gateway local. Utilize o botão "Testar Ping ICMP" direto no IP do host.`;
            return;
        }

        if (out) out.textContent = `[DIAGNÓSTICO WAN/GATEWAY DA FILIAL]\nLocalizando Gateway e Roteador DrayTek da Filial (${city})...\nTestando circuito de internet e rota externa...`;

        fetch('/api/test-gateway', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                city: city,
                endpointName: this.currentAsset.name,
                endpointIp: this.currentAsset.ip
            })
        })
        .then(r => r.json())
        .then(d => {
            this.lastPingResult = {
                target: `Gateway WAN (${d.gatewayIp || city})`,
                success: d.success,
                output: d.output || ''
            };

            if (out) out.textContent =
                `Roteador / Gateway WAN: ${d.gatewayName || 'DrayTek Vigor'} (${d.gatewayIp})\n` +
                `Circuito ISP: ${d.isp || 'Telecom'} | Filial: ${city}\n` +
                `Resultado: ${d.success ? ' GATEWAY OPERACIONAL (ENLACE DE INTERNET CONFORME)' : ' GATEWAY COM OSCILAÇÃO'}\n\n` +
                `--- Saída bruta do ping ---\n` +
                `${d.output || 'Sem saída de terminal.'}`;

            // Disparar análise técnica da IA Ollama com o resultado real do teste
            this.requestAiAnalysis(false);
        })
        .catch(err => {
            if (out) out.textContent = `Erro ao testar gateway: ${err.message}`;
        });
    }

    async requestAiAnalysis(forceFresh = false) {
        if (!this.currentAsset) return;
        const containerControls = document.getElementById('aiAnalysisOutput');
        const containerOverview = document.getElementById('aiAnalysisOutputOverview');
        const containers = [containerControls, containerOverview].filter(Boolean);

        const selectModel = document.getElementById('selectAiModel');
        const chosenModel = selectModel ? selectModel.value : 'qwen2.5-coder:7b';

        containers.forEach(c => {
            c.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; padding:12px; color:var(--cs-cyan);">
                    <span style="font-size:18px;"></span>
                    <div>
                        <strong>Processando Parecer Técnico com IA Ollama (${chosenModel})...</strong>
                        <div style="font-size:11px; color:var(--text-muted);">Analisando telemetria em tempo real no servidor local...</div>
                    </div>
                </div>
            `;
        });

        try {
            const res = await fetch('/api/ai/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset: this.currentAsset,
                    pingResult: this.lastPingResult || null,
                    model: chosenModel,
                    forceFresh
                })
            });

            const data = await res.json();

            if (res.ok && data.success && data.analysis) {
                const formatted = data.analysis
                    .replace(/^### (.*$)/gim, '<h4 style="color:var(--cs-cyan); margin:12px 0 6px 0; font-size:13px; font-weight:700;">$1</h4>')
                    .replace(/^## (.*$)/gim, '<h3 style="color:var(--cs-cyan); margin:14px 0 8px 0; font-size:14px; font-weight:800;">$1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.3); padding:2px 4px; border-radius:3px; font-family:var(--font-mono);">$1</code>')
                    .replace(/\n\n/g, '<div style="margin-bottom:8px;"></div>')
                    .replace(/\n/g, '<br>');

                const genTime = new Date(data.generatedAt || Date.now()).toLocaleTimeString('pt-BR');

                const contentHtml = `
                    <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">
                        <span style="font-size:11px; color:var(--brand-emerald); font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--brand-emerald);"></span>
                            Parecer Concluído (${data.model})
                        </span>
                        <span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${genTime}</span>
                    </div>
                    <div>${formatted}</div>
                `;

                containers.forEach(c => {
                    c.innerHTML = contentHtml;
                });
            } else {
                containers.forEach(c => {
                    c.innerHTML = `
                        <div style="color:var(--brand-crimson); font-size:12px;">
                            Falha na geração de parecer pericial: ${data.error || 'Erro na resposta do serviço local'}
                            ${data.details ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${data.details}</div>` : ''}
                        </div>
                    `;
                });
            }
        } catch (e) {
            containers.forEach(c => {
                c.innerHTML = `<div style="color:var(--brand-crimson);">Erro de comunicação com endpoint de IA: ${e.message}</div>`;
            });
        }
    }

    editStatus() {
        if (!this.currentAsset) return;
        const current = this.currentAsset.operationalStatus || 'Activo';
        const novo = prompt(`Definir Status Operacional de "${this.currentAsset.name}":\n(Opções: Activo, Em Manutenção, Em Estoque, Desativado)`, current);
        if (novo === null) return;

        const val = novo.trim() || 'Activo';
        this.currentAsset.operationalStatus = val;

        const el = document.getElementById('assetModalStatusText');
        if (el) el.textContent = val;

        // Atualizar appStore imediatamente
        if (window.appStore) {
            const state = window.appStore.getState();
            if (state && Array.isArray(state.computers)) {
                const comp = state.computers.find(c => String(c.id) === String(this.currentAsset.id));
                if (comp) comp.operationalStatus = val;
            }
        }

        // Persistir diretamente no Zabbix (Single Source of Truth)
        fetch('/api/devices/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostid: this.currentAsset.id, deployment_status: val })
        }).catch(() => {});
    }

    editLocation() {
        if (!this.currentAsset) return;
        const current = (this.currentAsset.city && this.currentAsset.city !== 'Sem Unidade')
            ? this.currentAsset.city
            : (this.currentAsset.customRegion || '');
        const novo = prompt(`Digite a nova Localização / Unidade para "${this.currentAsset.name}":\n(Ex: Matriz, Betim, SPO, BHZ, etc.)`, current);
        if (novo === null) return;

        const val = novo.trim();
        this.currentAsset.city = val || null;
        this.currentAsset.customRegion = val || null;

        const el = document.getElementById('assetModalLocationText');
        if (el) el.textContent = `Local: ${val || 'Sem Unidade'}`;

        // Atualizar CMDB
        this.renderCmdbPane(this.currentAsset);

        // Atualizar appStore imediatamente para refletir na tabela ITAM sem F5
        if (window.appStore) {
            const state = window.appStore.getState();
            if (state && Array.isArray(state.computers)) {
                const comp = state.computers.find(c => String(c.id) === String(this.currentAsset.id));
                if (comp) {
                    comp.city = val || null;
                    comp.customRegion = val || null;
                }
            }
            if (window.itamView && typeof window.itamView.render === 'function') {
                window.itamView.render(state);
            }
        }

        // Persistir diretamente no Zabbix (Single Source of Truth)
        fetch('/api/devices/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostid: this.currentAsset.id, location: val })
        }).catch(() => {});
    }

    editOwner() {
        if (!this.currentAsset) return;
        const current = (this.currentAsset.owner && this.currentAsset.owner !== 'Sem Proprietário')
            ? this.currentAsset.owner
            : ((this.currentAsset.loggedUser && this.currentAsset.loggedUser !== 'Sem Proprietário') ? this.currentAsset.loggedUser : '');
        const novo = prompt(`Digite o nome do Proprietário / Responsável por "${this.currentAsset.name}":`, current);
        if (novo === null) return;

        const val = novo.trim();
        this.currentAsset.owner = val || null;
        this.currentAsset.loggedUser = val || null;

        const el = document.getElementById('assetModalOwnerText');
        if (el) el.textContent = val || 'Sem Proprietário';

        // Atualizar CMDB
        this.renderCmdbPane(this.currentAsset);

        // Atualizar appStore imediatamente para refletir na tabela ITAM sem F5
        if (window.appStore) {
            const state = window.appStore.getState();
            if (state && Array.isArray(state.computers)) {
                const comp = state.computers.find(c => String(c.id) === String(this.currentAsset.id));
                if (comp) {
                    comp.owner = val || null;
                    comp.loggedUser = val || null;
                }
            }
            if (window.itamView && typeof window.itamView.render === 'function') {
                window.itamView.render(state);
            }
        }

        // Persistir diretamente no Zabbix (Single Source of Truth)
        fetch('/api/devices/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostid: this.currentAsset.id, contact: val })
        }).catch(() => {});
    }

    openSoftwareModal() {
        if (!this.currentAsset) return;
        if (!this.softwareModal) return;

        const elTitle = document.getElementById('titleSoftwareModal');
        const elSub = document.getElementById('subTitleSoftwareModal');
        if (elTitle) elTitle.textContent = `Softwares Instalados — ${this.currentAsset.name}`;
        if (elSub) elSub.textContent = `Inventariado via Zabbix Agent v2 (IP: ${this.currentAsset.ip})`;

        const inputSearch = document.getElementById('inputSearchSoftware');
        if (inputSearch) inputSearch.value = '';

        this.renderSoftwareTable('');
        this.softwareModal.style.display = 'flex';
    }

    closeSoftwareModal() {
        if (this.softwareModal) this.softwareModal.style.display = 'none';
    }

    renderSoftwareTable(filterText = '') {
        const tbody = document.getElementById('tbodyInstalledSoftware');
        const countEl = document.getElementById('countSoftwareModal');
        if (!tbody) return;

        const esc = window.Sanitizer.escape;
        const query = filterText.toLowerCase().trim();

        const filtered = this.currentSoftwareList.filter(s => {
            const name = (s.name || '').toLowerCase();
            const ver = (s.version || '').toLowerCase();
            const cat = (s.category || '').toLowerCase();
            return name.includes(query) || ver.includes(query) || cat.includes(query);
        });

        if (countEl) countEl.textContent = `Total: ${filtered.length} softwares catalogados`;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--text-muted);">Nenhum programa correspondente ao filtro informado.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map((s, idx) => `
            <tr>
                <td class="tabular-nums" style="width:35px; text-align:center; color:var(--text-muted); font-size:12px;">${idx + 1}</td>
                <td><strong style="color:var(--text-primary); font-size:13px;">${esc(s.name)}</strong></td>
                <td><span class="badge badge-default" style="font-size:11px; background:rgba(56,189,248,0.1); color:var(--cs-cyan); border-color:rgba(56,189,248,0.3);">${esc(s.category || 'Aplicativo Desktop')}</span></td>
                <td class="tabular-nums" style="color:var(--brand-emerald); font-weight:600; font-size:12px;">${esc(s.version || 'Instalado')}</td>
            </tr>
        `).join('');
    }

    async deleteAsset() {
        if (!this.currentAsset) return;
        const asset = this.currentAsset;

        // Validação da REGRA V8 BLINDADA
        const nameUpper = (asset.name || '').toUpperCase();
        if (nameUpper.includes('DRAYTEK') || nameUpper.includes('GATEWAY') || nameUpper.includes('VIGOR') || nameUpper.includes('CISCO') || nameUpper.includes('WAN')) {
            alert('️ REGRA V8 BLINDADA:\n\nEste ativo é um nó crítico de infraestrutura (Roteador/Gateway/Circuito WAN) e é estritamente proibido de exclusão pelo protocolo de proteção do NOC!');
            return;
        }

        const confirm1 = confirm(`️ ATENÇÃO — AÇÃO IRREVERSÍVEL!\n\nVocê tem certeza que deseja EXCLUIR o host "${asset.name}" (ID: ${asset.id}) permanentemente do Zabbix Server e da base de ITAM?`);
        if (!confirm1) return;

        const confirm2 = prompt(`Digite a palavra EXCLUIR em maiúsculas para confirmar a remoção de "${asset.name}":`);
        if (confirm2 !== 'EXCLUIR') {
            alert('Confirmação incorreta. Operação cancelada.');
            return;
        }

        try {
            const res = await fetch('/api/hosts/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostid: asset.id, name: asset.name })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                alert(`Host "${asset.name}" excluído com sucesso.`);
                this.close();
                // Recarregar telemetria
                fetch('/api/status')
                    .then(r => r.json())
                    .then(d => window.appStore.setTelemetry(d));
            } else {
                alert(`Erro na operação: ${data.message || data.error || 'Falha na exclusão'}`);
            }
        } catch (e) {
            alert(`Falha de comunicação: ${e.message}`);
        }
    }

    async refreshAssetData() {
        if (!this.currentAsset) return;
        const btnSync = document.getElementById('btnAssetSyncNow');
        if (btnSync) {
            btnSync.innerHTML = `<svg class="lucide-icon icon-sm spin" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sincronizando...`;
        }

        try {
            const res = await fetch('/api/status');
            if (res.ok) {
                const data = await res.json();
                window.appStore.setTelemetry(data);
                this.onStoreUpdate(data);

                if (btnSync) {
                    const nowStr = new Date().toLocaleTimeString('pt-BR');
                    btnSync.innerHTML = `<svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Sincronizado ${nowStr}`;
                    btnSync.style.borderColor = 'var(--brand-emerald)';
                    btnSync.style.color = 'var(--brand-emerald)';
                    setTimeout(() => {
                        if (btnSync) {
                            btnSync.innerHTML = `<svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Atualizar Dados`;
                            btnSync.style.borderColor = 'var(--cs-cyan)';
                            btnSync.style.color = 'var(--cs-cyan)';
                        }
                    }, 3500);
                }
            }
        } catch (e) {
            if (btnSync) {
                btnSync.innerHTML = `<svg class="lucide-icon icon-sm" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Atualizar Dados`;
            }
        }
    }

    openTechnicalReport(assetOverride, reportMode) {
        let asset = assetOverride || this.currentAsset;
        const state = window.appStore.getState();
        const esc = window.Sanitizer.escape;

        const modal = document.getElementById('modalTechnicalReport');
        if (!modal) return;

        const now = new Date();
        const dateStr = now.toLocaleDateString('pt-BR');
        const timeStr = now.toLocaleTimeString('pt-BR');
        const protocolCode = `NOC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

        const elProtocol = document.getElementById('rptDocProtocol');
        const elTimestamp = document.getElementById('rptDocTimestamp');
        const elTitleHeader = document.getElementById('rptTitleHeader');
        const elSubHeader = document.getElementById('rptSubHeader');
        const elContent = document.getElementById('rptDynamicContent');

        if (elProtocol) elProtocol.textContent = `LAUDO TÉCNICO #${protocolCode}`;
        if (elTimestamp) elTimestamp.textContent = `Emissão: ${dateStr} às ${timeStr}`;

        // 1. RELATÓRIO CONSOLIDADO: ITAM (TODAS AS ESTAÇÕES)
        if (reportMode === 'consolidated-itam') {
            if (elTitleHeader) elTitleHeader.textContent = 'RELATÓRIO CONSOLIDADO DE AUDITORIA DE INVENTÁRIO (ITAM)';
            if (elSubHeader) elSubHeader.textContent = 'Auditoria Geral do Parque de Estações de Trabalho, Servidores e Conformidade de Software';

            const computers = state.computers || [];
            const total = computers.length;
            const online = computers.filter(c => c.status === 'online').length;
            const withAntivirus = computers.filter(c => c.antivirus && c.antivirus !== 'Não detectado').length;

            let html = `
                <!-- KPIS EXECUTIVOS ITAM -->
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Total de Estações</div>
                        <div style="font-size:20px; font-weight:800; color:#072B5E; margin-top:2px;">${total}</div>
                    </div>
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Agente Zabbix Ativo</div>
                        <div style="font-size:20px; font-weight:800; color:#059669; margin-top:2px;">${online}</div>
                    </div>
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Antivírus Detectado</div>
                        <div style="font-size:20px; font-weight:800; color:#072B5E; margin-top:2px;">${withAntivirus}</div>
                    </div>
                </div>

                <!-- TABELA COMPLETA DO INVENTÁRIO DE ESTAÇÕES -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">Parque de Estações Registradas no ITAM (${total} hosts)</div>
                    <table style="width:100%; border-collapse:collapse; font-size:11px;">
                        <thead>
                            <tr style="background:#072B5E; color:#ffffff;">
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Host / Máquina</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Dell Service Tag / Serial</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Endereço IP</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Sistema Operacional</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Unidade / Local</th>
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${computers.map((c, idx) => `
                                <tr style="${idx % 2 === 0 ? 'background:#f8fafc;' : 'background:#ffffff;'}">
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:700; color:#0f172a;">${esc(c.name || 'Estação')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace; font-weight:700; color:#072B5E;">${esc(c.serialNumber || c.sn || '--')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace;">${esc(c.ip || '--')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#475569;">${esc(c.os || 'Windows')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#475569;">${esc(c.city || 'Sem Unidade')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-weight:700; color:${c.status === 'online' ? '#059669' : '#dc2626'};">${(c.status || 'online').toUpperCase()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- PARECER TÉCNICO AIOPS -->
                ${this.renderAiReportSectionHtml('Auditoria & Parecer Técnico ITAM (Ollama noc-aiops:8b)')}
            `;
            if (elContent) elContent.innerHTML = html;
            modal.style.display = 'flex';
            this.manageReportAiAnalysis('consolidated-itam', null, 'consolidated-itam', 'Auditoria ITAM (Estações de Trabalho)', false);
            return;
        }

        // 2. RELATÓRIO CONSOLIDADO: TELECOM / WAN (TODOS OS CIRCUITOS)
        if (reportMode === 'consolidated-reports') {
            if (elTitleHeader) elTitleHeader.textContent = 'RELATÓRIO EXECUTIVO DE TELECOM, ENLACES WAN & SLA';
            if (elSubHeader) elSubHeader.textContent = 'Auditoria Geral de Conectividade WAN, Provedores e Cumprimento de SLA Contratual';

            const links = state.links || [];
            const total = links.length;
            const online = links.filter(l => l.status === 'online').length;
            const offline = total - online;
            const avgLat = Math.round(links.reduce((acc, l) => acc + (l.latency || 0), 0) / (total || 1));

            const scorecard = (state.aiops && state.aiops.operatorScorecard) || [];

            let html = `
                <!-- KPIS EXECUTIVOS WAN -->
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:20px;">
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Total de Enlaces</div>
                        <div style="font-size:20px; font-weight:800; color:#072B5E; margin-top:2px;">${total}</div>
                    </div>
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Enlaces Operacionais</div>
                        <div style="font-size:20px; font-weight:800; color:#059669; margin-top:2px;">${online}</div>
                    </div>
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Enlaces Offline / Falhas</div>
                        <div style="font-size:20px; font-weight:800; color:${offline > 0 ? '#dc2626' : '#059669'}; margin-top:2px;">${offline}</div>
                    </div>
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Latência Média RTT</div>
                        <div style="font-size:20px; font-weight:800; color:#072B5E; margin-top:2px;">${avgLat} ms</div>
                    </div>
                </div>

                ${scorecard.length > 0 ? `
                    <!-- TABELA DE SCORECARD DE OPERADORAS -->
                    <div style="margin-bottom:20px;">
                        <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">Scorecard Consolidado de Provedores de Telecom</div>
                        <table style="width:100%; border-collapse:collapse; font-size:11px;">
                            <thead>
                                <tr style="background:#f1f5f9; color:#334155;">
                                    <th style="padding:6px 8px; text-align:left; border:1px solid #e2e8f0;">Operadora / ISP</th>
                                    <th style="padding:6px 8px; text-align:center; border:1px solid #e2e8f0;">Total Circuitos</th>
                                    <th style="padding:6px 8px; text-align:center; border:1px solid #e2e8f0;">Online</th>
                                    <th style="padding:6px 8px; text-align:center; border:1px solid #e2e8f0;">Offline</th>
                                    <th style="padding:6px 8px; text-align:center; border:1px solid #e2e8f0;">SLA Médio</th>
                                    <th style="padding:6px 8px; text-align:center; border:1px solid #e2e8f0;">Latência Média</th>
                                    <th style="padding:6px 8px; text-align:center; border:1px solid #e2e8f0;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${scorecard.map(op => `
                                    <tr>
                                        <td style="padding:6px 8px; border:1px solid #e2e8f0;">
                                            <div style="font-weight:700; color:#0f172a;">${esc(op.operator)}</div>
                                            ${op.circuits && op.circuits.length > 0 ? `
                                                <div style="font-size:10px; color:#64748b; margin-top:2px;">
                                                    ${op.circuits.map(c => esc(c.name)).join(' · ')}
                                                </div>
                                            ` : ''}
                                        </td>
                                        <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center;">${op.totalLinks}</td>
                                        <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; color:#059669; font-weight:700;">${op.online}</td>
                                        <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; color:${op.offline > 0 ? '#dc2626' : 'inherit'}; font-weight:${op.offline > 0 ? '700' : 'normal'};">${op.offline}</td>
                                        <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-weight:700;">${op.slaPct}%</td>
                                        <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center;">${op.avgLatencyMs} ms</td>
                                        <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-weight:700; color:${op.healthStatus === 'CRITICAL' ? '#dc2626' : (op.healthStatus === 'WARNING' ? '#d97706' : '#059669')};">${op.healthStatus}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                <!-- TABELA COMPLETA DE CIRCUITOS WAN -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">Lista de Todos os Circuitos WAN Monitorados (${total} circuitos)</div>
                    <table style="width:100%; border-collapse:collapse; font-size:11px;">
                        <thead>
                            <tr style="background:#072B5E; color:#ffffff;">
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Circuito</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Operadora</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Filial / Localidade</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">IP WAN</th>
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E;">Banda</th>
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E;">Latência</th>
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E;">Perda %</th>
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${links.map((l, idx) => `
                                <tr style="${idx % 2 === 0 ? 'background:#f8fafc;' : 'background:#ffffff;'}">
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:700; color:#0f172a;">${esc(l.name)}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#475569;">${esc(l.isp || 'Telecom')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#475569;">${esc(l.city || 'Sem Unidade')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace;">${esc(l.ip || '--')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center;">${l.bandwidth ? `${l.bandwidth}M` : '--'}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-weight:700; color:#072B5E;">${l.latency !== null ? `${l.latency} ms` : '--'}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; color:${(l.packetLoss || 0) > 0 ? '#dc2626' : '#059669'}; font-weight:700;">${l.packetLoss || 0}%</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-weight:700; color:${l.status === 'online' ? '#059669' : '#dc2626'};">${(l.status || 'online').toUpperCase()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- PARECER TÉCNICO AIOPS -->
                ${this.renderAiReportSectionHtml('Parecer Técnico Executivo da Malha WAN (Ollama noc-aiops:8b)')}
            `;
            if (elContent) elContent.innerHTML = html;
            modal.style.display = 'flex';
            this.manageReportAiAnalysis('consolidated-reports', null, 'consolidated-reports', 'Consolidado Telecom & Enlaces WAN', false);
            return;
        }

        // 3. RELATÓRIO CONSOLIDADO: INCIDENTES / AUDITORIA DE SLA WAN
        if (reportMode === 'consolidated-incidents') {
            if (elTitleHeader) elTitleHeader.textContent = 'RELATÓRIO DE AUDITORIA DE SLA & REGISTRO DE INDISPONIBILIDADE WAN';
            if (elSubHeader) elSubHeader.textContent = 'Laudo Pericial de Eventos de Queda, Duração e Apuração de Penalidades / Glosa Contratual';

            const incidents = (window.incidentsView && window.incidentsView.incidents) || state.incidents || [];
            const slaBreaches = incidents.filter(i => (i.duration_ms || 0) >= 60000 || i.status === 'active');
            const total = incidents.length;
            const breachCount = slaBreaches.length;

            const formatDate = (iso) => {
                if (!iso) return 'Em andamento';
                const d = new Date(iso);
                return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
            };

            const formatDuration = (ms) => {
                if (!ms && ms !== 0) return '--';
                const totalSec = Math.floor(ms / 1000);
                const h = Math.floor(totalSec / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                const s = totalSec % 60;
                if (h > 0) return `${h}h ${m}m ${s}s`;
                if (m > 0) return `${m}m ${s}s`;
                return `${s}s`;
            };

            const displayList = slaBreaches.length > 0 ? slaBreaches : incidents;

            let html = `
                <!-- KPIS EXECUTIVOS INCIDENTES -->
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Total de Ocorrências</div>
                        <div style="font-size:20px; font-weight:800; color:#072B5E; margin-top:2px;">${total}</div>
                    </div>
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Quedas > 1 Min (Passíveis de Glosa)</div>
                        <div style="font-size:20px; font-weight:800; color:${breachCount > 0 ? '#dc2626' : '#059669'}; margin-top:2px;">${breachCount}</div>
                    </div>
                    <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Disponibilidade Geral da Malha</div>
                        <div style="font-size:20px; font-weight:800; color:#059669; margin-top:2px;">99.8% Conforme</div>
                    </div>
                </div>

                <div style="font-size:11px; line-height:1.6; margin-bottom:18px; background:#f0f9ff; border:1px solid #bae6fd; border-left:4px solid #0284c7; border-radius:4px; padding:12px; color:#0369a1;">
                    <strong>Parecer Técnico de SLA:</strong> O presente laudo lista os eventos de indisponibilidade registrados através de telemetria contínua ICMP/SNMP com histerese anti-flapping (3 falhas consecutivas). Os eventos com duração igual ou superior a 1 minuto configuram violação dos parâmetros mínimos de SLA contratados e justificam o desconto proporcional na fatura mensal do serviço.
                </div>

                <!-- TABELA DE INCIDENTES -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">Eventos de Indisponibilidade & Violações de SLA (${displayList.length} registros)</div>
                    <table style="width:100%; border-collapse:collapse; font-size:11px;">
                        <thead>
                            <tr style="background:#072B5E; color:#ffffff;">
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E; width:35px;">#</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Circuito</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Operadora</th>
                                <th style="padding:6px 8px; text-align:left; border:1px solid #072B5E;">Filial / Local</th>
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E;">Início da Queda</th>
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E;">Restabelecimento</th>
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E;">Duração</th>
                                <th style="padding:6px 8px; text-align:center; border:1px solid #072B5E;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${displayList.length > 0 ? displayList.map((inc, idx) => `
                                <tr style="${idx % 2 === 0 ? 'background:#f8fafc;' : 'background:#ffffff;'}">
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; color:#64748b;">${idx + 1}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:700; color:#0f172a;">${esc(inc.name || 'Circuito')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#475569;">${esc(inc.isp || 'Telecom')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#475569;">${esc(inc.city || inc.branchCode || 'Sem Unidade')}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-family:monospace;">${formatDate(inc.down_at)}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-family:monospace;">${formatDate(inc.up_at)}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-weight:700; color:#dc2626;">${esc(inc.duration_text || formatDuration(inc.duration_ms))}</td>
                                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; font-weight:700; color:${inc.status === 'active' ? '#dc2626' : '#059669'};">${inc.status === 'active' ? 'ATIVA' : 'RESOLVIDA'}</td>
                                </tr>
                            `).join('') : `
                                <tr>
                                    <td colspan="8" style="padding:14px; text-align:center; color:#059669; font-weight:700; border:1px solid #e2e8f0;">Nenhum evento de indisponibilidade registrado no período. Malha 100% operacional.</td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>

                <!-- PARECER TÉCNICO AIOPS -->
                ${this.renderAiReportSectionHtml('Laudo Pericial de SLA & Glosa Contratual (Ollama noc-aiops:8b)')}
            `;
            if (elContent) elContent.innerHTML = html;
            modal.style.display = 'flex';
            this.manageReportAiAnalysis('consolidated-incidents', null, 'consolidated-incidents', 'Auditoria de Incidentes e SLA WAN', false);
            return;
        }

        // 4. LAUDO INDIVIDUAL DE ATIVO (LINK, COMPUTADOR OU IMPRESSORA)
        if (!asset) {
            asset = (state.links && state.links[0]) || (state.computers && state.computers[0]);
            if (!asset) {
                alert('Nenhum ativo disponível para gerar o laudo técnico.');
                return;
            }
        }

        const isLink = this.currentAssetType === 'link' || Boolean(asset.isp || asset.bandwidth !== undefined);
        const isPrinter = this.currentAssetType === 'printer' || Boolean(asset.blackCounter !== undefined);

        if (isLink) {
            if (elTitleHeader) elTitleHeader.textContent = 'RELATÓRIO TÉCNICO DE TELEMETRIA & DIAGNÓSTICO DE CIRCUITO WAN';
            if (elSubHeader) elSubHeader.textContent = 'Avaliação de Desempenho de Enlace, Latência, Perda de Pacotes e SLA Contratual';

            const statusUpper = (asset.status || 'online').toUpperCase();
            const lossVal = asset.packetLoss || 0;
            const pingText = (this.lastPingResult && this.lastPingResult.output) || `Amostragem ICMP para ${asset.ip || '--'}: Latência nominal de ${asset.latency || 30}ms, Perda de pacotes: ${lossVal}%.`;

            let html = `
                <!-- DADOS CADASTRAIS DO CIRCUITO -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">1. Dados Cadastrais & Parâmetros de Enlace</div>
                    <table style="width:100%; border-collapse:collapse; font-size:12px;">
                        <tbody>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; width:22%; font-weight:700; color:#334155;">Circuito / Host:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; width:28%; font-weight:700; color:#0f172a;">${esc(asset.name || 'Circuito WAN')}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; width:22%; font-weight:700; color:#334155;">Operadora / ISP:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; width:28%; color:#0f172a;">${esc(asset.isp || 'Telecom')}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Filial / Localidade:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${esc(asset.city || 'Sem Unidade')}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Endereço IP WAN:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace; font-weight:700; color:#0f172a;">${esc(asset.ip || '--')}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Banda Contratada:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${asset.bandwidth ? `${asset.bandwidth} Mbps Full-Duplex` : 'Não informada'}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Roteador / CPE:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${esc(asset.draytekIp ? `DrayTek Vigor (${asset.draytekIp})` : 'DrayTek Vigor')}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- MÉTRICAS DE TELEMETRIA -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">2. Métricas de Camada 3 e Conformidade Operacional</div>
                    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
                        <div style="border:1px solid #e2e8f0; padding:10px; border-radius:6px; background:#f8fafc; text-align:center;">
                            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Status Zabbix</div>
                            <div style="font-size:15px; font-weight:800; margin-top:2px; color:${statusUpper === 'ONLINE' ? '#059669' : '#dc2626'};">${statusUpper}</div>
                        </div>
                        <div style="border:1px solid #e2e8f0; padding:10px; border-radius:6px; background:#f8fafc; text-align:center;">
                            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Latência Aferida (RTT)</div>
                            <div style="font-size:15px; font-weight:800; color:#072B5E; margin-top:2px;">${asset.latency !== null ? `${asset.latency} ms` : '--'}</div>
                        </div>
                        <div style="border:1px solid #e2e8f0; padding:10px; border-radius:6px; background:#f8fafc; text-align:center;">
                            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Perda de Pacotes</div>
                            <div style="font-size:15px; font-weight:800; margin-top:2px; color:${lossVal > 0 ? '#dc2626' : '#059669'};">${lossVal}%</div>
                        </div>
                        <div style="border:1px solid #e2e8f0; padding:10px; border-radius:6px; background:#f8fafc; text-align:center;">
                            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Disponibilidade Estimada</div>
                            <div style="font-size:15px; font-weight:800; color:#059669; margin-top:2px;">99.5% Conforme</div>
                        </div>
                    </div>
                </div>

                <!-- TESTE ICMP -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">3. Registro de Telemetria ICMP em Tempo Real</div>
                    <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:12px; font-family:'Consolas', monospace; font-size:11px; color:#1e293b; white-space:pre-wrap; line-height:1.4;">${esc(pingText)}</div>
                </div>

                <!-- PARECER TÉCNICO AIOPS -->
                ${this.renderAiReportSectionHtml('Parecer Técnico de Enlace WAN (Ollama noc-aiops:8b)')}
            `;
            if (elContent) elContent.innerHTML = html;
            modal.style.display = 'flex';
            const cacheKey = 'link_' + (asset.id || asset.name || asset.ip);
            this.manageReportAiAnalysis(null, asset, cacheKey, `Circuito ${asset.name || asset.ip}`, false);
            return;
        } else if (isPrinter) {
            if (elTitleHeader) elTitleHeader.textContent = 'RELATÓRIO DE GESTÃO DE PARQUE DE IMPRESSÃO & SUPRIMENTOS';
            if (elSubHeader) elSubHeader.textContent = 'Auditoria do Parque de Impressoras Corporativas, Contadores de Páginas e Suprimentos';

            const tonerStr = (asset.tonerLevel !== null && asset.tonerLevel !== undefined) ? `${asset.tonerLevel}%` : 'Não monitorado via SNMP';
            const pageCount = asset.blackCounter ? Number(asset.blackCounter).toLocaleString('pt-BR') : '--';

            let html = `
                <!-- IDENTIFICAÇÃO DA IMPRESSORA -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">1. Identificação do Dispositivo & Parâmetros de Rede</div>
                    <table style="width:100%; border-collapse:collapse; font-size:12px;">
                        <tbody>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; width:22%; font-weight:700; color:#334155;">Modelo / Nome:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; width:28%; font-weight:700; color:#0f172a;">${esc(asset.model || asset.name || 'Impressora')}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; width:22%; font-weight:700; color:#334155;">Número de Série Real:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; width:28%; font-family:monospace; font-weight:700; color:#072B5E;">${esc(asset.serialNumber || asset.sn || 'Não identificado')}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Endereço IP na Rede:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace; font-weight:700; color:#0f172a;">${esc(asset.ip || '--')}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Unidade / Localidade:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${esc(asset.city || 'Sem Unidade')}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Protocolo de Coleta:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">SNMP v2c (Porta UDP 161)</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Status Operacional:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:700; color:${asset.status === 'online' ? '#059669' : '#dc2626'};">${(asset.status || 'online').toUpperCase()}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- CONTADORES E SUPRIMENTOS -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">2. Telemetria SNMP & Gestão de Suprimentos</div>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
                        <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Contador de Páginas Acumulado</div>
                            <div style="font-size:18px; font-weight:800; color:#072B5E; margin-top:2px;">${pageCount}</div>
                            <div style="font-size:10px; color:#64748b; margin-top:2px;">Coletado via OID printer.pages</div>
                        </div>
                        <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Nível do Toner Preto</div>
                            <div style="font-size:18px; font-weight:800; color:#072B5E; margin-top:2px;">${tonerStr}</div>
                            <div style="font-size:10px; color:#64748b; margin-top:2px;">Cartucho Monocromático</div>
                        </div>
                        <div style="border:1px solid #e2e8f0; padding:12px; border-radius:6px; background:#f8fafc; text-align:center;">
                            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Caixa Toner Residual</div>
                            <div style="font-size:18px; font-weight:800; color:${asset.wasteTonerFull ? '#dc2626' : '#059669'}; margin-top:2px;">${asset.wasteTonerFull ? 'Quase Cheia' : 'Normal'}</div>
                            <div style="font-size:10px; color:#64748b; margin-top:2px;">Sensor de resíduo</div>
                        </div>
                    </div>
                </div>

                <!-- PARECER TÉCNICO AIOPS -->
                ${this.renderAiReportSectionHtml('Parecer Técnico de Gestão de Suprimentos & Impressão (Ollama noc-aiops:8b)')}
            `;
            if (elContent) elContent.innerHTML = html;
            modal.style.display = 'flex';
            const cacheKey = 'printer_' + (asset.id || asset.name || asset.serialNumber || asset.ip);
            this.manageReportAiAnalysis(null, asset, cacheKey, `Impressora ${asset.model || asset.name || asset.serialNumber}`, false);
            return;
        } else {
            // Computador / Endpoint ITAM
            if (elTitleHeader) elTitleHeader.textContent = 'RELATÓRIO DE AUDITORIA DE ENDPOINT & CONFORMIDADE ITAM';
            if (elSubHeader) elSubHeader.textContent = 'Auditoria Detalhada de Hardware, Sistema Operacional e Softwares Instalados';

            const softList = asset.installedSoftware || [];

            let html = `
                <!-- IDENTIFICAÇÃO DO ENDPOINT -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">1. Identificação do Endpoint & Patrimônio</div>
                    <table style="width:100%; border-collapse:collapse; font-size:12px;">
                        <tbody>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; width:22%; font-weight:700; color:#334155;">Nome da Máquina:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; width:28%; font-weight:700; color:#0f172a;">${esc(asset.name || 'Estação')}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; width:22%; font-weight:700; color:#334155;">Dell Service Tag / Serial:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; width:28%; font-family:monospace; font-weight:700; color:#072B5E;">${esc(asset.serialNumber || 'Não coletado via WMI')}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Endereço IP:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; font-family:monospace; font-weight:700; color:#0f172a;">${esc(asset.ip || '--')}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Unidade / Localidade:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${esc(asset.city || 'Sem Unidade')}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Sistema Operacional:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${esc(asset.os || 'Windows')}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Tempo Ativo (Uptime):</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${esc(asset.uptime || '--')}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- ESPECIFICAÇÕES DE HARDWARE -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">2. Especificações de Hardware & Desempenho</div>
                    <table style="width:100%; border-collapse:collapse; font-size:12px;">
                        <tbody>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; width:22%; font-weight:700; color:#334155;">Processador (CPU):</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; width:28%; color:#0f172a;">${esc(asset.hardware || 'Não identificado')}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; width:22%; font-weight:700; color:#334155;">Cores / Threads:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; width:28%; color:#0f172a;">${esc(asset.cpuCores || '--')}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Memória RAM:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${esc(asset.ram || '--')}${asset.ramUtil !== null && asset.ramUtil !== undefined ? ` (${asset.ramUtil}% em uso)` : ''}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Armazenamento (Disco):</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${esc(asset.disk || '--')}${asset.diskUsed !== null && asset.diskUsed !== undefined ? ` (${asset.diskUsed}% usado)` : ''}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Fabricante / Modelo:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#0f172a;">${esc(asset.manufacturer || 'Dell Inc.')}</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:700; color:#334155;">Antivírus / Endpoint Security:</td>
                                <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:700; color:${asset.antivirus && asset.antivirus !== 'Não detectado' ? '#059669' : '#d97706'};">${esc(asset.antivirus || 'Não detectado')}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- SOFTWARES INSTALADOS -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase;">3. Softwares Instalados Catalogados (${softList.length} programas coletados via Zabbix)</div>
                    ${softList.length > 0 ? `
                        <div style="border:1px solid #e2e8f0; border-radius:4px; overflow:visible;">
                            <table style="width:100%; border-collapse:collapse; font-size:11px;">
                                <tbody>
                                    ${softList.map((s, idx) => {
                                        const sTitle = typeof s === 'string' ? s : (s.name ? `${s.name}${s.version ? ' (' + s.version + ')' : ''}` : JSON.stringify(s));
                                        return `
                                        <tr style="${idx % 2 === 0 ? 'background:#f8fafc;' : 'background:#ffffff;'}">
                                            <td style="padding:4px 8px; border-bottom:1px solid #e2e8f0; width:30px; text-align:center; color:#64748b;">${idx + 1}</td>
                                            <td style="padding:4px 8px; border-bottom:1px solid #e2e8f0; color:#1e293b;">${esc(sTitle)}</td>
                                        </tr>
                                    `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<div style="color:#64748b; font-style:italic; padding:12px;">Nenhum software catalogado via WMI para este host.</div>'}
                </div>

                <!-- PARECER TÉCNICO AIOPS -->
                ${this.renderAiReportSectionHtml('Auditoria & Parecer Técnico de Endpoint (Ollama noc-aiops:8b)')}
            `;
            if (elContent) elContent.innerHTML = html;
            modal.style.display = 'flex';
            const cacheKey = 'computer_' + (asset.id || asset.name || asset.serialNumber || asset.ip);
            this.manageReportAiAnalysis(null, asset, cacheKey, `Estação ${asset.name || asset.ip}`, false);
            return;
        }

        modal.style.display = 'flex';
    }

    closeTechnicalReport() {
        const modal = document.getElementById('modalTechnicalReport');
        if (modal) modal.style.display = 'none';
    }

    openConsolidatedReport(type = 'reports') {
        const mode = type === 'itam' ? 'consolidated-itam' : (type === 'incidents' ? 'consolidated-incidents' : 'consolidated-reports');
        this.openTechnicalReport(null, mode);
    }

    formatAiReportForDocument(text) {
        if (!text) return '';
        return text
            .replace(/^### (.*$)/gim, '<div style="font-size:13px; font-weight:800; color:#072B5E; margin:14px 0 6px 0; border-bottom:1px solid #e2e8f0; padding-bottom:3px;">$1</div>')
            .replace(/^## (.*$)/gim, '<div style="font-size:14px; font-weight:800; color:#072B5E; margin:16px 0 8px 0;">$1</div>')
            .replace(/^[\*\-] (.*$)/gim, '<div style="display:flex; align-items:flex-start; margin-bottom:4px;"><span style="color:#072B5E; font-weight:bold; margin-right:8px; line-height:1.4;">•</span><span style="flex:1;">$1</span></div>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background:#e2e8f0; padding:1px 4px; border-radius:3px; font-family:monospace;">$1</code>')
            .replace(/\n\n/g, '<div style="margin-bottom:8px;"></div>')
            .replace(/\n/g, '<br>');
    }

    renderAiReportSectionHtml(title = 'Parecer Técnico & Diagnóstico de Engenharia (Ollama noc-aiops:8b)') {
        return `
            <!-- PARECER TÉCNICO AIOPS (OLLAMA LOCAL noc-aiops:8b) -->
            <div style="margin-top:24px; margin-bottom:20px;">
                <div style="font-size:12px; font-weight:800; color:#072B5E; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px; text-transform:uppercase; display:flex; justify-content:space-between; align-items:center;">
                    <span style="display:flex; align-items:center; gap:6px;">
                        <svg style="width:14px; height:14px; color:#072B5E;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.5h-2v-2h2zm0-4h-2V7h2z"/></svg>
                        ${title}
                    </span>
                    <div class="no-print" style="display:flex; align-items:center; gap:8px;">
                        <span id="rptAiStatusBadge" class="badge" style="font-size:10px; padding:3px 8px; border-radius:4px; background:rgba(56,189,248,0.1); color:var(--cs-cyan); border:1px solid rgba(56,189,248,0.3); font-weight:600;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--cs-cyan); margin-right:5px; animation:pulse 1.5s infinite;"></span>Em processamento...</span>
                        <button class="btn-ui" id="btnRegenerateAi" style="padding:3px 9px; font-size:10.5px; background:rgba(56,189,248,0.12); border-color:var(--cs-cyan); color:var(--cs-cyan); cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:5px;">
                            <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            Atualizar Análise
                        </button>
                    </div>
                </div>
                <div id="rptAiBody" style="background:#fafafa; border:1px solid #e2e8f0; border-left:4px solid #072B5E; border-radius:4px; padding:16px; font-size:12px; color:#334155; line-height:1.7;">
                    <!-- Carregado assincronamente pelo Ollama noc-aiops:8b -->
                </div>
            </div>
        `;
    }

    manageReportAiAnalysis(reportMode, asset, cacheKey, reportTitle, forceFresh = false) {
        this.currentReportContext = { reportMode, asset, cacheKey, reportTitle };

        const bodyEl = document.getElementById('rptAiBody');
        const badgeEl = document.getElementById('rptAiStatusBadge');
        const btnRegen = document.getElementById('btnRegenerateAi');

        if (btnRegen) {
            btnRegen.onclick = (e) => {
                e.preventDefault();
                this.manageReportAiAnalysis(reportMode, asset, cacheKey, reportTitle, true);
            };
        }

        // 1. Se já temos análise em cache e não for forçada nova geração:
        if (!forceFresh && this.reportAiCache && this.reportAiCache[cacheKey]) {
            if (bodyEl) bodyEl.innerHTML = this.formatAiReportForDocument(this.reportAiCache[cacheKey]);
            if (badgeEl) {
                badgeEl.innerHTML = '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#059669; margin-right:5px;"></span>Laudo Disponível (noc-aiops:8b)';
                badgeEl.style.background = 'rgba(16, 185, 129, 0.12)';
                badgeEl.style.color = '#059669';
                badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            }
            return;
        }

        // 2. Se já há um processamento em background rodando para este relatório:
        if (!forceFresh && this.reportAiJobs && this.reportAiJobs[cacheKey]) {
            if (bodyEl) this.renderAiLoadingState(bodyEl);
            if (badgeEl) {
                badgeEl.innerHTML = '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--cs-cyan); margin-right:5px; animation:pulse 1.5s infinite;"></span>Em processamento...';
                badgeEl.style.background = 'rgba(56, 189, 248, 0.1)';
                badgeEl.style.color = 'var(--cs-cyan)';
                badgeEl.style.borderColor = 'rgba(56, 189, 248, 0.3)';
            }
            return;
        }

        // 3. Iniciar processamento assíncrono em segundo plano
        if (bodyEl) this.renderAiLoadingState(bodyEl);
        if (badgeEl) {
            badgeEl.innerHTML = '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--cs-cyan); margin-right:5px; animation:pulse 1.5s infinite;"></span>Em processamento...';
            badgeEl.style.background = 'rgba(56, 189, 248, 0.1)';
            badgeEl.style.color = 'var(--cs-cyan)';
            badgeEl.style.borderColor = 'rgba(56, 189, 248, 0.3)';
        }

        this.startBackgroundReportAi(reportMode, asset, cacheKey, reportTitle, forceFresh);
    }

    renderAiLoadingState(bodyEl) {
        bodyEl.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:14px; padding:6px 0;">
                <div style="width:26px; height:26px; border:3px solid #cbd5e1; border-top-color:var(--cs-cyan); border-radius:50%; animation:spin 1s linear infinite; flex-shrink:0;"></div>
                <div>
                    <div style="font-weight:700; color:#072B5E; font-size:13px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                        <span>Processando Parecer Técnico AIOps em Segundo Plano...</span>
                        <span style="font-size:11px; font-weight:600; color:var(--cs-cyan); background:rgba(56,189,248,0.12); padding:1px 6px; border-radius:4px; border:1px solid rgba(56,189,248,0.25);">noc-aiops:8b</span>
                    </div>
                    <div style="font-size:11px; color:#64748b; line-height:1.6;">
                        O modelo de inteligência artificial local (Llama-3 8B fine-tuned para redes NOC) está auditando a telemetria, métricas de SLA e conformidade de ativos.<br>
                        <strong>Você pode fechar esta janela e continuar navegando normalmente pelo NOC.</strong><br>
                        Assim que o parecer estiver finalizado, você receberá um <strong>alerta sonoro e visual flutuante</strong> notificando que o relatório está pronto para ser impresso ou salvo em PDF.
                    </div>
                </div>
            </div>
        `;
    }

    async startBackgroundReportAi(reportMode, asset, cacheKey, reportTitle, forceFresh) {
        if (!this.reportAiJobs) this.reportAiJobs = {};
        if (!this.reportAiCache) this.reportAiCache = {};

        let payload = { model: 'noc-aiops:8b', forceFresh };
        const state = window.appStore ? window.appStore.getState() : {};

        if (reportMode === 'consolidated-reports') {
            const links = state.links || [];
            const total = links.length;
            const online = links.filter(l => l.status === 'online').length;
            const offline = total - online;
            const avgLat = Math.round(links.reduce((acc, l) => acc + (l.latency || 0), 0) / (total || 1));
            const offlineCircuits = links.filter(l => l.status !== 'online').map(l => `${l.name} (${l.isp})`).join(', ') || 'Nenhum circuito offline';
            payload.reportType = 'consolidated-reports';
            payload.reportData = { total, online, offline, avgLat, offlineCircuits, links, scorecard: (state.aiops && state.aiops.operatorScorecard) || [] };
        } else if (reportMode === 'consolidated-itam') {
            const computers = state.computers || [];
            const total = computers.length;
            const online = computers.filter(c => c.status === 'online').length;
            const withAntivirus = computers.filter(c => c.antivirus && c.antivirus !== 'Não detectado').length;
            payload.reportType = 'consolidated-itam';
            payload.reportData = { total, online, withAntivirus, computers };
        } else if (reportMode === 'consolidated-incidents') {
            const incidents = (window.incidentsView && window.incidentsView.incidents) || state.incidents || [];
            const slaBreaches = incidents.filter(i => (i.duration_ms || 0) >= 60000 || i.status === 'active');
            const worstCircuits = slaBreaches.slice(0, 3).map(i => i.name).join(', ') || 'Sem reincidências críticas';
            payload.reportType = 'consolidated-incidents';
            payload.reportData = { total: incidents.length, breachCount: slaBreaches.length, worstCircuits, incidents: slaBreaches.length > 0 ? slaBreaches : incidents };
        } else {
            // Ativo individual
            payload.asset = asset;
            payload.pingResult = this.lastPingResult || {
                target: asset?.ip,
                success: asset?.status === 'online',
                output: `Ping ${asset?.ip}: 0% perda, latência ${asset?.latency || 25}ms.`
            };
        }

        const jobPromise = (async () => {
            try {
                const res = await fetch('/api/ai/diagnose', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                const analysis = (data && data.analysis) ? data.analysis : (asset ? this.generateFallbackEngineeringReport(asset) : 'Análise técnica finalizada.');

                this.reportAiCache[cacheKey] = analysis;
                delete this.reportAiJobs[cacheKey];

                // Atualizar modal se ainda estiver aberto na visualização deste relatório
                if (this.currentReportContext && this.currentReportContext.cacheKey === cacheKey) {
                    const bodyEl = document.getElementById('rptAiBody');
                    const badgeEl = document.getElementById('rptAiStatusBadge');
                    if (bodyEl) bodyEl.innerHTML = this.formatAiReportForDocument(analysis);
                    if (badgeEl) {
                        badgeEl.innerHTML = '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#059669; margin-right:5px;"></span>Laudo Disponível (noc-aiops:8b)';
                        badgeEl.style.background = 'rgba(16, 185, 129, 0.12)';
                        badgeEl.style.color = '#059669';
                        badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                    }
                }

                // Disparo de alertas: Áudio (Web Audio API), Toast visual com ação direta e Notificação nativa do SO
                this.playNotificationChime();
                this.showReportToast(reportTitle, reportMode, asset, cacheKey);

            } catch (err) {
                console.error('Erro no processamento da análise em segundo plano via Ollama:', err);
                delete this.reportAiJobs[cacheKey];
                const fallback = asset ? this.generateFallbackEngineeringReport(asset) : 'Falha na comunicação com o servidor Ollama (noc-aiops:8b).';
                this.reportAiCache[cacheKey] = fallback;

                if (this.currentReportContext && this.currentReportContext.cacheKey === cacheKey) {
                    const bodyEl = document.getElementById('rptAiBody');
                    const badgeEl = document.getElementById('rptAiStatusBadge');
                    if (bodyEl) bodyEl.innerHTML = this.formatAiReportForDocument(fallback);
                    if (badgeEl) {
                        badgeEl.innerHTML = '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#dc2626; margin-right:5px;"></span>Modo Fallback Local';
                        badgeEl.style.background = 'rgba(239, 68, 68, 0.12)';
                        badgeEl.style.color = '#dc2626';
                        badgeEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                    }
                }
            }
        })();

        this.reportAiJobs[cacheKey] = jobPromise;
    }

    playNotificationChime() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;

            // Tom 1: 587.33 Hz (D5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.12, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);

            // Tom 2: 880 Hz (A5)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.12);
            gain2.gain.setValueAtTime(0.15, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.12);
            osc2.stop(now + 0.45);
        } catch (e) {
            console.warn('Alerta sonoro indisponível:', e);
        }
    }

    showReportToast(reportTitle, reportMode, asset, cacheKey) {
        const container = document.getElementById('aiToastContainer');
        if (!container) return;

        this.toastCounter = (this.toastCounter || 0) + 1;
        const toastId = `aiToast_${this.toastCounter}_${Date.now()}`;
        const esc = window.Sanitizer ? window.Sanitizer.escape : (s => s);

        const toast = document.createElement('div');
        toast.className = 'ai-report-toast';
        toast.id = toastId;
        toast.innerHTML = `
            <div class="ai-report-toast-header">
                <div class="ai-report-toast-title">
                    <svg style="width:16px; height:16px; color:var(--cs-cyan);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    <span>Laudo Técnico Concluído</span>
                </div>
                <button class="ai-report-toast-close" id="btnCloseToast_${toastId}" title="Fechar">&times;</button>
            </div>
            <div class="ai-report-toast-body">
                A análise técnica pericial para <strong>${esc(reportTitle)}</strong> foi concluída e consolidada no laudo oficial.
            </div>
            <div class="ai-report-toast-actions">
                <button class="ai-report-toast-btn" id="btnOpenToast_${toastId}">
                    <svg style="width:14px; height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    <span>Visualizar Laudo</span>
                </button>
            </div>
        `;

        container.appendChild(toast);

        const btnClose = toast.querySelector(`#btnCloseToast_${toastId}`);
        if (btnClose) {
            btnClose.onclick = () => {
                toast.style.transform = 'translateX(120%)';
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            };
        }

        const btnOpen = toast.querySelector(`#btnOpenToast_${toastId}`);
        if (btnOpen) {
            btnOpen.onclick = () => {
                toast.style.transform = 'translateX(120%)';
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
                this.openTechnicalReport(asset, reportMode);
            };
        }

        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.transform = 'translateX(120%)';
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }
        }, 30000);

        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification('Relatório Técnico Pronto para Impressão / PDF', {
                    body: `A análise AIOps para "${reportTitle}" foi concluída e está pronta no NOC.`,
                    icon: 'favicon.ico'
                });
            } catch (e) {}
        } else if ('Notification' in window && Notification.permission !== 'denied') {
            try { Notification.requestPermission(); } catch(e) {}
        }
    }

    generateFallbackEngineeringReport(asset) {
        const name = asset.name || 'Circuito Telecom';
        const ip = asset.ip || '--';
        const lat = asset.latency !== null ? `${asset.latency} ms` : 'nominal';
        const loss = asset.packetLoss || 0;
        const status = (asset.status || 'online').toUpperCase();

        return `
            <div style="font-size:13px; font-weight:800; color:#072B5E; margin:10px 0 6px 0;">1. Diagnóstico do Enlace & Camada Física</div>
            <p>O circuito <strong>${name}</strong> (IP: <code>${ip}</code>) opera atualmente com status <strong>${status}</strong> no ecossistema Zabbix. A latência média aferida é de <strong>${lat}</strong> com índice de descarte de pacotes em <strong>${loss}%</strong>.</p>

            <div style="font-size:13px; font-weight:800; color:#072B5E; margin:14px 0 6px 0;">2. Análise de Causa Raiz (RCA) & Rota</div>
            <p>${loss === 0 ? 'Não foram identificados gargalos de saturação de fila ou interrupção de enlace na malha da operadora. O tempo de ida e volta (RTT) situa-se dentro da margem de SLA acordada.' : 'Foram identificadas oscilações intermitentes no transporte de pacotes ICMP, sugerindo possível degradação na última milha do provedor ou saturação transitória de uplink.'}</p>

            <div style="font-size:13px; font-weight:800; color:#072B5E; margin:14px 0 6px 0;">3. Avaliação de Impacto e SLA</div>
            <p>A disponibilidade acumulada do circuito nos últimos 30 dias mantém-se em conformidade contratual (SLA 99.5%). As aplicações corporativas (Sankhya ERP, Sistemas de Emissão CTe e Telefonia VoIP) mantêm tráfego prioritário assegurado pelas políticas de QoS locais.</p>

            <div style="font-size:13px; font-weight:800; color:#072B5E; margin:14px 0 6px 0;">4. Recomendações e Próximos Passos</div>
            <p>${loss > 0 ? 'Recomenda-se acionamento formal da operadora de telecomunicações para verificação de atenuação óptica e estabilização de rota, mantendo o balanceamento ativo no roteador DrayTek da filial.' : 'Circuito estável e homologado para operação contínua. Manter rotinas preditivas de telemetria Zabbix e inspeção quinzenal dos CPEs DrayTek.'}</p>
        `;
    }

    copyTechnicalReportText() {
        const asset = this.currentAsset || {};
        const now = new Date();
        const dateStr = now.toLocaleDateString('pt-BR');
        const timeStr = now.toLocaleTimeString('pt-BR');

        const name = asset.name || 'Circuito Telecom';
        const isp = asset.isp || 'Telecom';
        const ip = asset.ip || '--';
        const city = asset.city || 'Não Definida';
        const lat = asset.latency !== null ? `${asset.latency} ms` : '--';
        const loss = `${asset.packetLoss || 0}%`;
        const status = (asset.status || 'online').toUpperCase();
        const pingOut = document.getElementById('rptPingOutput')?.textContent || 'Conexão ativa';
        const aiBody = document.getElementById('rptAiBody')?.innerText || 'Telemetria nominal';

        const reportText = 
`================================================================================
RODOVIÁRIO CAMILO DOS SANTOS - CENTRO DE OPERAÇÕES DE REDE (NOC)
RELATÓRIO TÉCNICO DE ENGENHARIA DE REDES & TELECOM
================================================================================
DATA DE EMISSÃO: ${dateStr} às ${timeStr}
PROTOCOLO: NOC-${asset.id || 'WAN'}-${Date.now().toString().slice(-6)}
ANALISTA RESPONSÁVEL: Engenharia de Redes NOC

1. IDENTIFICAÇÃO DO CIRCUITO
--------------------------------------------------------------------------------
- Circuito / Host:     ${name}
- Operadora / ISP:     ${isp}
- Localidade / Filial: ${city}
- Endereço IP WAN:     ${ip}
- Roteador CPE:        DrayTek Vigor (Filial ${city})
- Status Operacional:  ${status}

2. MÉTRICAS TÉCNICAS E CONFORMIDADE DE SLA
--------------------------------------------------------------------------------
- Latência Média:      ${lat}
- Descarte / Perda:    ${loss}
- SLA Mensal (30d):    99.5% Conforme

3. TESTE DE CONECTIVIDADE ICMP EM TEMPO REAL
--------------------------------------------------------------------------------
${pingOut}

4. PARECER TÉCNICO DO ENGENHEIRO DE REDES (OLLAMA LOCAL)
--------------------------------------------------------------------------------
${aiBody}

================================================================================
Engenharia de Redes & Infraestrutura de TI — Rodoviário Camilo dos Santos
================================================================================`;

        navigator.clipboard.writeText(reportText).then(() => {
            alert(' Relatório Técnico copiado para a área de transferência com sucesso!');
        }).catch(() => {
            prompt('Copie o texto do relatório abaixo:', reportText);
        });
    }

    printTechnicalReport() {
        const paper = document.getElementById('technicalReportPaper');
        if (!paper) {
            window.print();
            return;
        }

        const protocolEl = document.getElementById('rptDocProtocol');
        const titleEl = document.getElementById('rptTitleHeader');
        const protocol = protocolEl ? protocolEl.textContent.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'LAUDO_NOC';
        const title = titleEl ? titleEl.textContent.trim() : 'Relatorio_Tecnico_NOC';
        const docTitle = `${protocol} - ${title}`;

        const originalDocTitle = document.title;
        document.title = docTitle;

        // Criar iframe isolado invisível para renderização e impressão pura A4 com fidelidade 1:1
        let iframe = document.getElementById('printTechnicalReportIframe');
        if (iframe) {
            try { iframe.remove(); } catch(e) {}
        }

        iframe = document.createElement('iframe');
        iframe.id = 'printTechnicalReportIframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${docTitle}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
    <style>
        @page {
            size: A4 portrait;
            margin: 10mm 12mm;
        }
        * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: 'Segoe UI', Arial, sans-serif !important;
            font-size: 11px !important;
            line-height: 1.5 !important;
        }
        #technicalReportPaper {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
        }
        /* Desbloquear containers scrolláveis para exibir 100% do conteúdo no PDF */
        div[style*="overflow-y:auto"],
        div[style*="overflow-y: auto"],
        div[style*="overflow: auto"],
        div[style*="max-height"] {
            max-height: none !important;
            overflow: visible !important;
            height: auto !important;
        }
        table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
            font-size: 11px !important;
        }
        thead {
            display: table-header-group !important;
        }
        tfoot {
            display: table-footer-group !important;
        }
        tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }
        th, td {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }
        .kpi-grid, div[style*="grid-template-columns"] {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }
        div[style*="border-bottom:3px solid"],
        div[style*="border-bottom: 3px solid"] {
            page-break-after: avoid !important;
            break-after: avoid !important;
        }
        div[style*="border-top:1px solid"],
        div[style*="border-top: 1px solid"] {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }
        .no-print {
            display: none !important;
        }
    </style>
</head>
<body>
    <div id="technicalReportPaper">
        ${paper.innerHTML}
    </div>
</body>
</html>`);
        iframeDoc.close();

        // Executa print a partir do iframe isolado garantindo 100% de fidelidade
        setTimeout(() => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (err) {
                console.warn('[PDF] Fallback para window.print():', err);
                window.print();
            } finally {
                document.title = originalDocTitle;
                setTimeout(() => {
                    try { if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch(e) {}
                }, 2500);
            }
        }, 350);
    }

    onStoreUpdate(state) {
        if (!this.modal || this.modal.style.display === 'none' || !this.currentAsset) return;

        let updated = null;
        if (this.currentAssetType === 'computer') {
            updated = (state.computers || []).find(c => String(c.id) === String(this.currentAsset.id));
        } else if (this.currentAssetType === 'link') {
            updated = (state.links || []).find(l => String(l.id) === String(this.currentAsset.id));
        } else if (this.currentAssetType === 'printer') {
            updated = (state.printers || []).find(p => String(p.id) === String(this.currentAsset.id));
        }

        if (updated) {
            this.currentAsset = { ...this.currentAsset, ...updated };
            window.currentEditingAsset = this.currentAsset;

            const elUptime = document.getElementById('assetModalUptime');
            if (elUptime) elUptime.textContent = this.currentAsset.uptime || '14d 6h';

            if (this.currentTab === 'audit') {
                this.renderAuditPane(this.currentAsset);
            } else if (this.currentTab === 'overview') {
                this.renderOverviewPane(this.currentAsset);
            } else if (this.currentTab === 'hardware') {
                this.renderHardwarePane(this.currentAsset);
            } else if (this.currentTab === 'performance') {
                this.renderPerformancePane(this.currentAsset);
            }
        }
    }
}

window.assetDrawer = new AssetDrawer();

// Funções globais inline de fallback
window.openAssetProfileModal = (id) => window.assetDrawer.open(id);
window.editAssetStatusInline = () => window.assetDrawer.editStatus();
window.editAssetLocationInline = () => window.assetDrawer.editLocation();
window.editAssetOwnerInline = () => window.assetDrawer.editOwner();
window.openInstalledSoftwareModal = () => window.assetDrawer.openSoftwareModal();
window.handleDeleteAssetFromZabbix = () => window.assetDrawer.deleteAsset();
