// Bootstrap do Front-end Modular NOC Enterprise
document.addEventListener('DOMContentLoaded', () => {
    // 1. Seletores Estritos de Navegação
    const navButtons = document.querySelectorAll('.nav-btn[data-view]');
    const viewPages = document.querySelectorAll('.view-page');
    const sidebar = document.getElementById('appSidebar');
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');

    if (sidebar) {
        // Inicializar estado salvo da sidebar (respeita preferência do usuário ou abre expandida por padrão)
        const savedState = localStorage.getItem('noc_sidebar_collapsed');
        if (savedState === 'true') {
            sidebar.classList.add('collapsed');
            if (btnToggleSidebar) btnToggleSidebar.title = 'Expandir Barra Lateral';
        } else {
            sidebar.classList.remove('collapsed');
            if (btnToggleSidebar) btnToggleSidebar.title = 'Recolher Barra Lateral';
        }

        // Adicionar tooltips automáticos nos botões de navegação para uso quando recolhida
        navButtons.forEach(btn => {
            const label = btn.querySelector('span');
            if (label && !btn.getAttribute('title')) {
                btn.setAttribute('title', label.textContent.trim());
            }
        });

        // Alternar entre expandir e contrair
        function toggleSidebar(forceState) {
            const isCurrentlyCollapsed = sidebar.classList.contains('collapsed');
            const targetState = (forceState !== undefined) ? forceState : !isCurrentlyCollapsed;

            if (targetState) {
                sidebar.classList.add('collapsed');
                localStorage.setItem('noc_sidebar_collapsed', 'true');
                if (btnToggleSidebar) btnToggleSidebar.title = 'Expandir Barra Lateral';
            } else {
                sidebar.classList.remove('collapsed');
                localStorage.setItem('noc_sidebar_collapsed', 'false');
                if (btnToggleSidebar) btnToggleSidebar.title = 'Recolher Barra Lateral';
            }
        }

        // Botão dedicado de alternância
        if (btnToggleSidebar) {
            btnToggleSidebar.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSidebar();
            });
        }

        // Clicar no logo 'CS' expande se estiver contraída
        const brandLeft = sidebar.querySelector('.brand-left');
        if (brandLeft) {
            brandLeft.addEventListener('click', () => {
                if (sidebar.classList.contains('collapsed')) {
                    toggleSidebar(false);
                }
            });
        }
    }

    // 1.1 Controle do Menu Mobile (Gaveta Off-Canvas)
    const btnMobileMenu = document.getElementById('btnMobileMenu');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    function openMobileSidebar() {
        if (sidebar) sidebar.classList.add('mobile-open');
        if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    }

    function closeMobileSidebar() {
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    }

    if (btnMobileMenu) {
        btnMobileMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sidebar && sidebar.classList.contains('mobile-open')) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        });
    }

    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => {
            closeMobileSidebar();
        });
    }

    // Fechar gaveta ao pressionar tecla Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileSidebar();
        }
    });

    function switchView(viewName) {
        // Fechar gaveta no mobile ao alternar visão
        closeMobileSidebar();

        // Atualizar estado ativo dos botões da sidebar
        navButtons.forEach(btn => {
            if (btn.getAttribute('data-view') === viewName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Alternar visibilidade das páginas de visão
        viewPages.forEach(page => {
            if (page.id === `view-${viewName}`) {
                page.classList.add('active');
                page.style.display = 'block';
            } else {
                page.classList.remove('active');
                page.style.display = 'none';
            }
        });

        window.appStore.setActiveView(viewName);

        // Renderização pontual da visão ativa
        const state = window.appStore.getState();
        try {
            if (viewName === 'dashboard' && window.dashboardView) {
                window.dashboardView.render(state);
                requestAnimationFrame(() => {
                    if (window.chartManager) window.chartManager.resizeAll();
                });
            }
            else if (viewName === 'wan' && window.wanView) window.wanView.render(state);
            else if (viewName === 'topology' && window.topologyView) window.topologyView.render(state);
            else if (viewName === 'itam' && window.itamView) window.itamView.render(state);
            else if (viewName === 'printers' && window.printersView) window.printersView.render(state);
            else if (viewName === 'network-assets' && window.networkAssetsView) window.networkAssetsView.render(state);
            else if (viewName === 'aiops' && window.aiopsView) window.aiopsView.render(state);
            else if (viewName === 'reports' && window.reportsView) window.reportsView.render();
            else if (viewName === 'incidents' && window.incidentsView) window.incidentsView.render();
            else if (viewName === 'settings' && window.settingsView) window.settingsView.render();
        } catch (err) {
            console.error(`[View Render Error: ${viewName}]`, err);
        }
    }

    // Registrar evento de clique em TODOS os botões de navegação
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const viewName = btn.getAttribute('data-view');
            if (viewName) switchView(viewName);
        });
    });

    // 2. Relógio Digital do Header
    const digitalClock = document.getElementById('digitalClock');
    function updateClock() {
        if (digitalClock) {
            const now = new Date();
            digitalClock.textContent = now.toLocaleTimeString('pt-BR');
        }
    }
    setInterval(updateClock, 1000);
    updateClock();

    // 3. Atualização de Badges e Reatividade da Store
    window.appStore.subscribe((state) => {
        const { links, computers, recommendations, activeView } = state;

        // Alertas no Header
        const offlineCount = (links || []).filter(l => l.status === 'offline').length;
        const alertBadge = document.getElementById('badgeHeaderAlertCount');
        if (alertBadge) {
            alertBadge.textContent = offlineCount > 0 ? `${offlineCount} P1` : '0 Alertas';
            alertBadge.className = offlineCount > 0 ? 'badge badge-error tabular-nums' : 'badge badge-ok tabular-nums';
        }

        // Re-render da visão atual
        if (activeView === 'dashboard' && window.dashboardView) {
            window.dashboardView.render(state);
            requestAnimationFrame(() => {
                if (window.chartManager) window.chartManager.resizeAll();
            });
        }
        else if (activeView === 'wan' && window.wanView) window.wanView.render(state);
        else if (activeView === 'topology' && window.topologyView) window.topologyView.render(state);
        else if (activeView === 'itam' && window.itamView) window.itamView.render(state);
        else if (activeView === 'printers' && window.printersView) window.printersView.render(state);
        else if (activeView === 'network-assets' && window.networkAssetsView) window.networkAssetsView.render(state);
        else if (activeView === 'aiops' && window.aiopsView) window.aiopsView.render(state);

        // Se o Drawer de Ativo estiver aberto, atualizar a ficha e auditoria em tempo real
        if (window.assetDrawer && typeof window.assetDrawer.onStoreUpdate === 'function') {
            window.assetDrawer.onStoreUpdate(state);
        }
    });

    // 4. Iniciar conexão SSE e monitor de status em tempo real
    const liveIndicator = document.getElementById('liveStatusIndicator');
    if (window.sseClient) {
        window.sseClient.onStatusChange((isOnline) => {
            if (liveIndicator) {
                if (isOnline) {
                    liveIndicator.style.display = 'flex';
                    liveIndicator.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                    liveIndicator.innerHTML = `
                        <span style="width:7px; height:7px; border-radius:50%; background:#10b981; display:inline-block; box-shadow:0 0 6px #10b981;"></span>
                        <span style="color:#10b981; font-weight:600; font-size:11px;">Tempo Real Ativo</span>
                    `;
                } else {
                    liveIndicator.style.display = 'flex';
                    liveIndicator.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                    liveIndicator.innerHTML = `
                        <span style="width:7px; height:7px; border-radius:50%; background:#f59e0b; display:inline-block;"></span>
                        <span style="color:#f59e0b; font-weight:600; font-size:11px;">Polling Ativo</span>
                    `;
                }
            }
        });
        window.sseClient.connect();
    }

    // 4.1 Listeners globais de redimensionamento e visibilidade para sincronizar gráficos
    window.addEventListener('resize', () => {
        if (window.chartManager) window.chartManager.resizeAll();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && window.chartManager) {
            window.chartManager.resizeAll();
        }
    });

    // 5. Carga inicial via API REST
    fetch('/api/status')
        .then(r => r.json())
        .then(data => {
            window.appStore.setTelemetry(data);
            switchView('dashboard');
        })
        .catch(err => console.error('[Initial Fetch Error]', err));

    // 5.1 Seletor de Auto-Refresh (Tempo Real / Intervalos)
    const selectRefresh = document.getElementById('selectAutoRefresh');
    let refreshTimer = null;
    function scheduleRefresh(ms) {
        if (refreshTimer) clearInterval(refreshTimer);
        if (ms > 0) {
            refreshTimer = setInterval(() => {
                fetch('/api/status')
                    .then(r => r.json())
                    .then(data => window.appStore.setTelemetry(data))
                    .catch(() => {});
            }, ms);
        }
    }
    if (selectRefresh) {
        selectRefresh.addEventListener('change', (e) => {
            const val = parseInt(e.target.value) || 0;
            scheduleRefresh(val);
        });
        scheduleRefresh(parseInt(selectRefresh.value) || 10000);
    }

    window.switchView = switchView;

    // 6. Manipulação do Modal de Criação Manual de Unidade
    const btnCloseCreateUnit = document.getElementById('btnCloseCreateUnitModal');
    const btnCancelCreateUnit = document.getElementById('btnCancelCreateUnit');
    const modalCreateUnit = document.getElementById('modalCreateUnit');
    if (btnCloseCreateUnit && modalCreateUnit) {
        btnCloseCreateUnit.addEventListener('click', () => { modalCreateUnit.style.display = 'none'; });
    }
    if (btnCancelCreateUnit && modalCreateUnit) {
        btnCancelCreateUnit.addEventListener('click', () => { modalCreateUnit.style.display = 'none'; });
    }

    window.handleCreateUnit = function() {
        const name = document.getElementById('inputUnitName')?.value;
        const city = document.getElementById('inputUnitCity')?.value;
        const state = document.getElementById('selectUnitState')?.value;
        if (!name || !city) return;
        alert(`Unidade ${name} (${city}/${state}) cadastrada com sucesso.`);
        if (modalCreateUnit) modalCreateUnit.style.display = 'none';
    };
});

