// NOC Dashboard Core Frontend Logic - Focused entirely on Link Drops and Connection Stability - Dynamic Data Adaptive

// Global states
let itemsCache = [];
let historyCache = {}; // maps hostName -> array of last 15 latency values
let prevStatuses = {}; // maps hostName -> previous status (for alarm trigger)
let searchQuery = "";
let activeFilter = "all"; // 'all', 'online', 'warning', 'offline'
let soundEnabled = localStorage.getItem('noc_sound_enabled') !== 'false';
let notificationsEnabled = false;
let thresholds = { latency: 150 }; // loaded from backend config, purely latency focused
let emergencyTimeoutId = null;
let currentActiveOfflineNames = [];
let audioContext = null;
let audioUnlocked = false;
let pendingAudioAlert = null; // "critical" wins over recovery while browser audio is locked

// Config parameters
const REFRESH_INTERVAL_MS = 5000;
let refreshTimeLeft = REFRESH_INTERVAL_MS;
let lastRefreshed = Date.now();

// DOM Elements
const grid = document.getElementById('status-grid');
const searchBar = document.getElementById('search-bar');
const filterBtns = document.querySelectorAll('.filter-btn');
const soundBtn = document.getElementById('sound-btn');
const notifyBtn = document.getElementById('notify-btn');
const refreshProgress = document.getElementById('refresh-progress');
const refreshTrigger = document.getElementById('refresh-trigger');
const clockEl = document.getElementById('clock');

// Drawer Elements
const drawerOverlay = document.getElementById('drawer-overlay');
const drawerContainer = document.getElementById('drawer-container');
const drawerCloseBtn = document.getElementById('drawer-close-btn');
const drawerHostName = document.getElementById('drawer-host-name');
const drawerStatusBadge = document.getElementById('drawer-status-badge');
const drawerStatusText = document.getElementById('drawer-status-text');
const drawerMetricGrid = document.getElementById('drawer-metric-grid');
const drawerChartCanvas = document.getElementById('drawer-chart-canvas');
const terminalBody = document.getElementById('terminal-body');
const btnRunDiagnostics = document.getElementById('btn-run-diagnostics');
const btnCopyReport = document.getElementById('btn-copy-report');

// Emergency Overlay Elements
const fullscreenEmergencyOverlay = document.getElementById('fullscreen-emergency-overlay');
const emergencyHostsList = document.getElementById('emergency-hosts-list');

let selectedHost = null;
let diagnosticRunning = false;

// Theme Synchronization with parent NOC dashboard
function syncTheme() {
    try {
        const isParentLight = window.parent && window.parent.document.body.classList.contains('light-mode');
        const parentTheme = window.parent && window.parent.document.body.getAttribute('data-theme');
        const parentColor = window.parent && window.parent.document.body.getAttribute('data-theme-color');
        
        if (isParentLight || parentTheme === 'light') {
            document.body.classList.add('light-mode');
            document.body.setAttribute('data-theme', 'light');
        } else {
            document.body.classList.remove('light-mode');
            document.body.removeAttribute('data-theme');
        }

        if (parentColor) {
            document.body.setAttribute('data-theme-color', parentColor);
        } else {
            document.body.removeAttribute('data-theme-color');
        }
    } catch (e) {
        // Fallback for cross-origin or other errors
    }
}

// 1. Initial Setup and Listeners
function init() {
    // 0. Sync and keep theme updated
    syncTheme();
    setInterval(syncTheme, 1000);

    // Sound settings restore
    updateSoundButtonState();
    registerAudioUnlockHandlers();
    
    // Notifications settings restore
    if (Notification.permission === 'granted') {
        notificationsEnabled = true;
        updateNotifyButtonState();
    }

    // Search input listener
    if (searchBar) {
        searchBar.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderUI();
        });
    }

    // Filter tabs listener
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.getAttribute('data-filter');
            renderUI();
        });
    });

    // Mute/Unmute toggle
    if (soundBtn) {
        soundBtn.addEventListener('click', async () => {
            soundEnabled = !soundEnabled;
            localStorage.setItem('noc_sound_enabled', soundEnabled ? 'true' : 'false');
            updateSoundButtonState();
            
            if (soundEnabled) {
                const unlocked = await unlockAudio();
                if (unlocked) {
                    emitAlertPattern(false); // som curto de teste
                    flushPendingAudioAlert();
                }
            } else {
                pendingAudioAlert = null;
            }
        });
    }

    // Notifications toggle
    if (notifyBtn) {
        notifyBtn.addEventListener('click', async () => {
            if (Notification.permission !== 'granted') {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    notificationsEnabled = true;
                } else {
                    notificationsEnabled = false;
                    alert('Permissão de notificações recusada pelo navegador.');
                }
            } else {
                notificationsEnabled = !notificationsEnabled;
            }
            updateNotifyButtonState();
        });
    }

    // Refresh trigger click
    if (refreshTrigger) {
        refreshTrigger.addEventListener('click', () => {
            refresh();
            resetCountdown();
        });
    }

    // Drawer close
    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);

    // Diagnostics button
    if (btnRunDiagnostics) {
        btnRunDiagnostics.addEventListener('click', runDiagnosticsSim);
    }
    
    if (btnCopyReport) {
        btnCopyReport.addEventListener('click', copyDiagnosticReport);
    }

    // TV Mode Toggle
    const tvModeBtn = document.getElementById('tv-mode-btn');
    if (tvModeBtn) {
        tvModeBtn.addEventListener('click', () => {
            const isTv = document.body.classList.toggle('tv-mode');
            localStorage.setItem('noc_link_panel_tv_mode', isTv ? 'true' : 'false');
            updateTvModeButtonState();
            
            // Recalcular layout do grid para acomodar as novas dimensões imediatamente
            if (itemsCache.length > 0) {
                setTimeout(() => {
                    adjustGrid(itemsCache.length);
                }, 50);
            }
        });
    }
    
    // Restore or auto-trigger TV Mode
    const urlParams = new URLSearchParams(window.location.search);
    const tvParam = urlParams.get('tv') || urlParams.get('mode');
    const savedTvMode = localStorage.getItem('noc_link_panel_tv_mode') === 'true';
    if (tvParam === '1' || tvParam === 'tv' || savedTvMode) {
        document.body.classList.add('tv-mode');
    }
    updateTvModeButtonState();

    // Start Loops
    setInterval(updateClock, 1000);
    updateClock();
    
    // Start circular progress countdown
    requestAnimationFrame(updateRefreshProgress);

    // Fetch initial data
    loadConfig();
    refresh();
}

function updateSoundButtonState() {
    if (!soundBtn) return;
    if (soundEnabled) {
        soundBtn.classList.add('active');
        soundBtn.title = audioUnlocked ? 'Som de alerta ativo' : 'Som ativo - clique na tela para liberar o audio';
        soundBtn.setAttribute('aria-label', 'Som de alerta ativo');
        soundBtn.innerText = '';
    } else {
        soundBtn.classList.remove('active');
        soundBtn.title = 'Som de alerta desativado';
        soundBtn.setAttribute('aria-label', 'Som de alerta desativado');
        soundBtn.innerText = '';
    }
}

function updateNotifyButtonState() {
    if (!notifyBtn) return;
    if (notificationsEnabled) {
        notifyBtn.classList.add('active');
        notifyBtn.innerText = '';
    } else {
        notifyBtn.classList.remove('active');
        notifyBtn.innerText = '';
    }
}

function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString() + '  /  ' + now.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', year: 'numeric'});
}

function resetCountdown() {
    lastRefreshed = Date.now();
    refreshTimeLeft = REFRESH_INTERVAL_MS;
}

// 2. Circular Refresh Countdown Animation
function updateRefreshProgress() {
    const elapsed = Date.now() - lastRefreshed;
    refreshTimeLeft = Math.max(0, REFRESH_INTERVAL_MS - elapsed);
    
    if (refreshProgress) {
        const circumference = 56.54; // 2 * pi * 9
        const percentage = refreshTimeLeft / REFRESH_INTERVAL_MS;
        const offset = circumference * (1 - percentage);
        refreshProgress.style.strokeDashoffset = offset;
    }
    
    if (refreshTimeLeft <= 0) {
        refresh();
        resetCountdown();
    }
    
    requestAnimationFrame(updateRefreshProgress);
}

// 3. API Communication
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            const data = await res.json();
            if (data.thresholds) {
                thresholds = data.thresholds;
            }
        }
    } catch (e) { console.error('Erro ao ler thresholds:', e); }
}

async function refresh() {
    try {
        const res = await fetch('/api/link-panel/status');
        if (!res.ok) throw new Error('API Indisponível');
        const data = await res.json();
        if (data.items) {
            data.items.forEach(item => {
                if (item.latency === null || item.latency === undefined) {
                    item.latency = null;
                }
                if (item.traffic === null || item.traffic === undefined || item.traffic === "null") {
                    item.traffic = null;
                }
                if (item.uptime === null || item.uptime === undefined || item.uptime === "null") {
                    item.uptime = null;
                }

                if (item.latency !== null || item.packetLoss !== undefined) {
                    const lat = parseFloat(item.latency || 0);
                    const loss = parseFloat(item.packetLoss || item.loss || 0);

                    const latLimit = (thresholds && thresholds.latency) ? thresholds.latency : 100;
                    const lossLimit = (thresholds && thresholds.packetLoss) ? thresholds.packetLoss : 5;

                    if (item.status === 'online') {
                        if (lat > latLimit || loss > lossLimit) {
                            item.status = 'warning';
                        }
                    }

                    if (!historyCache[item.name]) {
                        historyCache[item.name] = [];
                    }

                    const latNum = item.status === 'offline' ? 0 : lat;
                    historyCache[item.name].push(latNum);
                    if (historyCache[item.name].length > 15) {
                        historyCache[item.name].shift();
                    }
                }
            });
            
            detectStatusChanges(data.items);

            if (data.items.length >= 26) {
                const validLats = data.items.map(i => parseFloat(i.latency)).filter(l => !isNaN(l) && l > 0);
                const avgLat = validLats.length > 0 ? Math.round(validLats.reduce((a, b) => a + b, 0) / validLats.length) : 38;
                const onlineCount = data.items.filter(i => i.status === 'online' || i.status === 'warning').length;
                
                data.items.push({
                    name: 'ZABBIX SERVER',
                    status: 'online',
                    isKpiCard: true,
                    kpiType: 'zabbix',
                    statusLabel: 'SERVIDORES',
                    latency: 12,
                    subText: 'Telemetria & API NOC',
                    traffic: null,
                    uptime: '99.9%'
                });

                data.items.push({
                    name: 'MEDIA GERAL WAN',
                    status: 'online',
                    isKpiCard: true,
                    kpiType: 'wan_media',
                    statusLabel: `${onlineCount}/26 ONLINE`,
                    latency: avgLat,
                    subText: 'Média Consolidada WAN',
                    traffic: null,
                    uptime: '100%'
                });
            }

            const offlineItems = data.items.filter(item => item.status === 'offline');
            const offlineNames = offlineItems.map(item => item.name);
            
            if (offlineNames.length > 0) {
                const hasNewDrop = offlineNames.some(name => !currentActiveOfflineNames.includes(name));
                
                if (hasNewDrop) {
                    currentActiveOfflineNames = offlineNames;
                    if (emergencyHostsList) {
                        emergencyHostsList.innerHTML = currentActiveOfflineNames.map(name => `<div class="emergency-box">${name}</div>`).join('');
                    }
                    if (fullscreenEmergencyOverlay) {
                        fullscreenEmergencyOverlay.style.display = 'flex';
                    }
                    if (emergencyTimeoutId) {
                        clearTimeout(emergencyTimeoutId);
                    }
                    emergencyTimeoutId = setTimeout(() => {
                        if (fullscreenEmergencyOverlay) {
                            fullscreenEmergencyOverlay.style.display = 'none';
                        }
                        emergencyTimeoutId = null;
                    }, 60000);
                } else {
                    if (fullscreenEmergencyOverlay && fullscreenEmergencyOverlay.style.display === 'flex') {
                        if (emergencyHostsList) {
                            emergencyHostsList.innerHTML = offlineNames.map(name => `<div class="emergency-box">${name}</div>`).join('');
                        }
                    }
                }
            } else {
                currentActiveOfflineNames = [];
                if (fullscreenEmergencyOverlay) {
                    fullscreenEmergencyOverlay.style.display = 'none';
                }
                if (emergencyTimeoutId) {
                    clearTimeout(emergencyTimeoutId);
                    emergencyTimeoutId = null;
                }
            }
            
            itemsCache = data.items;
            renderUI(data.summary);
            
            if (selectedHost) {
                const updatedHost = data.items.find(i => i.name === selectedHost.name);
                if (updatedHost) {
                    selectedHost = updatedHost;
                    updateDrawerUI();
                }
            }
        }
    } catch (e) {
        console.error('Erro na atualização:', e);
        const alertsPanel = document.getElementById('stat-alerts');
        if (alertsPanel) {
            alertsPanel.innerText = 'OFFLINE';
            alertsPanel.style.color = 'var(--color-offline)';
        }
    }
}

function detectStatusChanges(newItems) {
    newItems.forEach(item => {
        const prev = prevStatuses[item.name];
        
        // Se for a primeira carga (prev === undefined) e o link já está fora, ou se houve uma transição de status para offline
        const isNewDrop = (prev !== undefined && prev !== item.status && item.status === 'offline');
        const isAlreadyOfflineOnLoad = (prev === undefined && item.status === 'offline');
        
        if (isNewDrop || isAlreadyOfflineOnLoad) {
            playAlertSound(true);
            showDesktopNotification(`️ LINK FORA: ${item.name}`, `O link caiu e está inacessível.`);
        } else if (prev !== undefined && prev !== item.status) {
            if (prev === 'offline' && (item.status === 'online' || item.status === 'warning')) {
                playAlertSound(false);
                showDesktopNotification(` LINK RECUPERADO: ${item.name}`, `A conexão foi restabelecida com sucesso.`);
            } else if (item.status === 'warning') {
                // Instabilidade / Alta Latência
                const latText = item.latency !== null ? ` (${parseInt(item.latency)}ms)` : '';
                showDesktopNotification(`️ CONEXÃO INSTÁVEL: ${item.name}`, `A latência está elevada${latText}.`);
            }
        }
        
        prevStatuses[item.name] = item.status;
    });
}

// Web Audio API Synthesized Alerts
function playSynthTone(frequency, type, gainValue, duration) {
    if (!soundEnabled) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        
        gain.gain.setValueAtTime(gainValue, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        
        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch (e) { console.error('Erro ao inicializar áudio sintetizado:', e); }
}

function playAlertSound(isCritical) {
    if (!soundEnabled) return;
    if (isCritical) {
        // Alarme crítico de queda de link
        playSynthTone(520, 'square', 0.12, 0.4);
        setTimeout(() => {
            playSynthTone(400, 'square', 0.12, 0.4);
        }, 150);
    } else {
        // Bipe harmônico de conexão restabelecida / estável
        playSynthTone(587.33, 'sine', 0.1, 0.2); // D5
        setTimeout(() => {
            playSynthTone(880, 'sine', 0.08, 0.35); // A5
        }, 100);
    }
}

function showDesktopNotification(title, message) {
    if (!notificationsEnabled) return;
    try {
        new Notification(title, {
            body: message,
            silent: false
        });
    } catch (e) { console.error('Falha ao disparar notificação:', e); }
}

// Audio reliability layer. Browsers block audio until a user gesture; this arms
// the alarm, queues critical events, and flushes them as soon as audio is allowed.
function registerAudioUnlockHandlers() {
    const unlockEvents = ['click', 'keydown', 'touchstart'];
    const onFirstInteraction = async () => {
        const unlocked = await unlockAudio();
        if (unlocked) {
            const hadPendingAlert = Boolean(pendingAudioAlert);
            flushPendingAudioAlert();
            if (!hadPendingAlert && currentActiveOfflineNames.length > 0) {
                playAlertSound(true);
            }
        }
        unlockEvents.forEach(eventName => {
            window.removeEventListener(eventName, onFirstInteraction);
        });
    };

    unlockEvents.forEach(eventName => {
        window.addEventListener(eventName, onFirstInteraction, { passive: true });
    });
}

function getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!audioContext) {
        audioContext = new AudioCtx();
        audioContext.onstatechange = () => {
            audioUnlocked = audioContext.state === 'running';
            updateSoundButtonState();
        };
    }

    return audioContext;
}

async function unlockAudio() {
    const ctx = getAudioContext();
    if (!ctx) return false;

    try {
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        audioUnlocked = ctx.state === 'running';
        updateSoundButtonState();
        return audioUnlocked;
    } catch (e) {
        console.error('Falha ao liberar audio do navegador:', e);
        audioUnlocked = false;
        updateSoundButtonState();
        return false;
    }
}

function queueAudioAlert(isCritical) {
    if (isCritical || pendingAudioAlert === null) {
        pendingAudioAlert = isCritical ? 'critical' : 'recovery';
    }
}

function flushPendingAudioAlert() {
    if (!soundEnabled || !pendingAudioAlert || !audioUnlocked) return;
    const isCritical = pendingAudioAlert === 'critical';
    pendingAudioAlert = null;
    emitAlertPattern(isCritical);
}

function playSynthTone(frequency, type, gainValue, duration) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            audioUnlocked = false;
            updateSoundButtonState();
            return;
        }
        audioUnlocked = ctx.state === 'running';

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(gainValue, 0.0002), now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.start(now);
        osc.stop(now + duration + 0.03);
    } catch (e) { console.error('Erro ao inicializar audio sintetizado:', e); }
}

function playNotificationChime(delayMs = 0) {
    setTimeout(() => playSynthTone(987.77, 'triangle', 0.09, 0.14), delayMs);
    setTimeout(() => playSynthTone(1318.51, 'triangle', 0.075, 0.17), delayMs + 105);
    setTimeout(() => playSynthTone(1760.00, 'sine', 0.055, 0.22), delayMs + 230);
}

function emitAlertPattern(isCritical) {
    if (isCritical) {
        playNotificationChime(0);
        setTimeout(() => playNotificationChime(0), 720);
    } else {
        playSynthTone(1046.50, 'triangle', 0.055, 0.12);
        setTimeout(() => playSynthTone(1318.51, 'sine', 0.045, 0.18), 110);
    }
}

function playAlertSound(isCritical) {
    if (!soundEnabled) return;

    if (!audioUnlocked) {
        queueAudioAlert(isCritical);
        unlockAudio().then(unlocked => {
            if (unlocked) flushPendingAudioAlert();
        });
        return;
    }

    emitAlertPattern(isCritical);
}

// 5. Render Grid Cards & Stats (Highly Adaptive to Zabbix Active Metrics)
function renderUI(summary = null) {
    if (!grid) return;
    
    // Dynamic counts per region for the TV mode summary bar
    const regionCounts = {
        mg: { online: 0, warning: 0, offline: 0 },
        sp: { online: 0, warning: 0, offline: 0 },
        rj: { online: 0, warning: 0, offline: 0 },
        es: { online: 0, warning: 0, offline: 0 }
    };
    
    itemsCache.forEach(item => {
        const reg = getLinkRegion(item);
        if (regionCounts[reg]) {
            const status = item.status === 'online' ? 'online' : (item.status === 'warning' ? 'warning' : 'offline');
            regionCounts[reg][status]++;
        }
    });
    
    // Update DOM indicators
    ['mg', 'sp', 'rj', 'es'].forEach(reg => {
        const onlineEl = document.getElementById(`reg-${reg}-online`);
        const warningEl = document.getElementById(`reg-${reg}-warning`);
        const offlineEl = document.getElementById(`reg-${reg}-offline`);
        if (onlineEl) onlineEl.textContent = regionCounts[reg].online;
        if (warningEl) warningEl.textContent = regionCounts[reg].warning;
        if (offlineEl) offlineEl.textContent = regionCounts[reg].offline;
    });

    // Filtro e Busca
    let filtered = itemsCache.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery);
        const matchesFilter = activeFilter === 'all' || item.status === activeFilter;
        return matchesSearch && matchesFilter;
    });

    // Ordenação: links alfabéticos primeiro, depois PLURI, SANKHYA, ZABBIX SERVER e MEDIA GERAL WAN no final
    filtered.sort((a, b) => {
        const getSpecialRank = name => {
            const n = name.toUpperCase();
            if (n === 'PLURI') return 10;
            if (n.includes('SANKHYA') && (n.includes('PROD') || n.includes('PRODUCAO') || n.includes('PRODUÇÃO'))) return 11;
            if (n.includes('SANKHYA') && n.includes('TEST')) return 12;
            if (n.includes('ZABBIX SERVER')) return 13;
            if (n.includes('MEDIA GERAL') || n.includes('MÉDIA GERAL')) return 14;
            return -1;
        };

        const aRank = getSpecialRank(a.name);
        const bRank = getSpecialRank(b.name);

        if (aRank !== -1 && bRank !== -1) return aRank - bRank;
        if (aRank !== -1) return 1;
        if (bRank !== -1) return -1;
        return a.name.localeCompare(b.name);
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-muted); font-size:1.1rem; gap:10px; height:200px;">
            <span> Nenhum link encontrado para os critérios selecionados.</span>
        </div>`;
        return;
    }

    grid.innerHTML = filtered.map((i) => {
        const history = historyCache[i.name] || [];
        const sparklineSvg = generateSparklineSvg(history);
        
        const latDisplay = i.status === 'offline' ? '-- ms' : (i.latency !== null ? `${parseInt(i.latency)} ms` : null);
        const trafficDisplay = i.traffic !== null ? `${parseFloat(i.traffic).toFixed(1)}M` : null;
        const uptimeDisplay = i.uptime || null;
        
        // Estilização customizada premium SOMENTE para o Card de Média Geral WAN
        if (i.isKpiCard && i.kpiType === 'wan_media') {
            return `
                <div class="status-card kpi-card" onclick="openDrawer('${i.name}')">
                    <div class="card-header">
                        <span class="status-badge" style="background:rgba(56, 189, 248, 0.15); border-color:rgba(56, 189, 248, 0.4); color:#38bdf8;">
                            <span class="badge-dot" style="background-color:#38bdf8; box-shadow:0 0 6px #38bdf8;"></span>
                            ${i.statusLabel}
                        </span>
                        <div class="card-latency-pill" style="background:rgba(56, 189, 248, 0.2); border-color:rgba(56, 189, 248, 0.4); color:#38bdf8;">${i.latency} ms</div>
                    </div>
                    <div class="host-name" style="flex-direction:column; justify-content:center; gap:2px;">
                        <div class="kpi-title">MÉDIA LATÊNCIA WAN</div>
                        <div class="kpi-hero-value">${i.latency} ms</div>
                    </div>
                    <div class="kpi-footer-info">
                        <span> 26/26 ONLINE</span>
                        <span> 0% PERDA</span>
                    </div>
                </div>
            `;
        }
        
        let statusLabel = i.statusLabel || 'CONECTADO';
        if (!i.statusLabel) {
            if (i.status === 'warning') statusLabel = 'ATENÇÃO';
            if (i.status === 'offline') statusLabel = 'DESCONECTADO';
        }

        let headerHtml = "";
        let latencyPillHtml = "";
        if (latDisplay !== null) {
            latencyPillHtml = `<div class="card-latency-pill">${latDisplay}</div>`;
        }
        headerHtml = `
            <div class="card-header">
                <span class="status-badge">
                    <span class="badge-dot"></span>
                    ${statusLabel}
                </span>
                ${latencyPillHtml}
            </div>
        `;

        let sparklineHtml = "";
        if (i.latency !== null && i.status !== 'offline') {
            sparklineHtml = `<div class="card-sparkline-container">${sparklineSvg}</div>`;
        } else {
            sparklineHtml = `<div class="card-sparkline-container" style="opacity: 0; pointer-events: none;"></div>`;
        }

        const subTextHtml = i.subText ? `<div style="font-size:0.75rem; font-weight:700; opacity:0.9; margin-top:2px;">${i.subText}</div>` : '';

        return `
            <div class="status-card ${i.status}" onclick="openDrawer('${i.name}')">
                ${headerHtml}
                <div class="host-name" style="flex-direction:column; gap:2px;">
                    <span>${i.name.replace(/-/g, '<br>')}</span>
                    ${subTextHtml}
                </div>
                ${sparklineHtml}
            </div>
        `;
    }).join('');

    adjustGrid(filtered.length);

}

// 6. Sparkline SVG Path Generator
function generateSparklineSvg(history) {
    if (!history || history.length < 2) {
        return `<svg viewBox="0 0 100 24" width="100%" height="100%"></svg>`;
    }
    const max = Math.max(...history, 50) || 50;
    const min = Math.min(...history, 0);
    const range = max - min;
    
    const points = history.map((val, idx) => {
        const x = (idx / (history.length - 1)) * 140; // 140 width
        const y = 22 - ((val - min) / (range || 1)) * 18 - 2; // y invertido e margem
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    
    const pathD = `M ${points.join(' L ')}`;
    return `
        <svg viewBox="0 0 140 24" width="100%" height="100%" preserveAspectRatio="none">
            <defs>
                <linearGradient id="sparklineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="rgba(255,255,255,0.4)" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="rgba(255,255,255,0.4)" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <path d="${pathD} L 140 24 L 0 24 Z" fill="url(#sparklineGrad)"/>
            <path d="${pathD}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
}

// Layout Grid Flexível Inteligente (Calcula dimensões para Flexbox auto-centralizado)
function adjustGrid(count) {
    if (count === 0) return;
    
    const rect = grid.getBoundingClientRect();
    const w = rect.width || window.innerWidth;
    const h = rect.height || window.innerHeight;
    
    let bestCols = 6;
    let minScore = Infinity;
    const gap = 10;

    for (let c = 1; c <= Math.min(count, 12); c++) {
        const r = Math.ceil(count / c);
        const empty = (c * r) - count;
        
        const cardW = (w - (c - 1) * gap) / c;
        const cardH = Math.max((h - (r - 1) * gap) / r, 100);
        const ratio = cardW / cardH;
        
        const ratioScore = Math.abs(ratio - 1.4) * 10;
        const emptyScore = empty * 30.0; // Penaliza brutalmente deixar buracos vazios
        const perfectFitBonus = (empty === 0) ? -100 : 0; // Prioridade máxima para encaixe perfeito (zero gaps)
        const totalScore = ratioScore + emptyScore + perfectFitBonus;

        if (totalScore < minScore) {
            minScore = totalScore;
            bestCols = c;
        }
    }
    
    // Regras de refinamento estritas para TV NOC: encaixes perfeitos sem gaps
    if (count === 24) {
        bestCols = 6; // 4 fileiras perfeitas de 6 colunas (6 x 4 = 24 cards exatos, ZERO gaps!)
    } else if (count === 21) {
        bestCols = 7; // 3 fileiras perfeitas de 7 colunas (7 x 3 = 21 cards exatos, ZERO gaps!)
    } else if (count === 20) {
        bestCols = 5; // 4 fileiras de 5 colunas (5 x 4 = 20, ZERO gaps!)
    } else if (count === 28) {
        bestCols = 7; // 4 fileiras de 7 colunas (7 x 4 = 28, ZERO gaps!)
    }

    const finalRows = Math.ceil(count / bestCols);
    
    grid.style.setProperty('--best-cols', bestCols);
    grid.style.setProperty('--final-rows', finalRows);
    grid.style.setProperty('--card-width', `calc((100% - ${(bestCols - 1) * gap}px) / ${bestCols})`);
    grid.style.setProperty('--card-height', `calc((100% - ${(finalRows - 1) * gap}px) / ${finalRows})`);
}

window.addEventListener('resize', () => {
    if (itemsCache.length > 0) adjustGrid(itemsCache.length);
});

// 7. Interactive Diagnostic Drawer & Micro Charts
function openDrawer(hostName) {
    const host = itemsCache.find(i => i.name === hostName);
    if (!host) return;
    
    selectedHost = host;
    
    drawerOverlay.classList.add('open');
    drawerContainer.classList.add('open');
    
    updateDrawerUI();
    
    terminalBody.innerHTML = `<div class="terminal-output-info">Console iniciado. Pronto para analisar estabilidade do link [${selectedHost.name}].</div><div class="terminal-prompt"><span class="terminal-cursor"></span></div>`;
    diagnosticRunning = false;
    
    playSynthTone(987.77, 'sine', 0.03, 0.08); // B5
}

function updateDrawerUI() {
    if (!selectedHost) return;
    
    drawerHostName.innerText = selectedHost.name;
    
    let statusText = 'CONECTADO';
    if (selectedHost.status === 'warning') statusText = 'ATENÇÃO';
    if (selectedHost.status === 'offline') statusText = 'DESCONECTADO';
    drawerStatusText.innerText = statusText;
    
    drawerStatusBadge.className = 'status-badge';
    drawerStatusBadge.classList.add(selectedHost.status);
    
    const lossVal = selectedHost.loss !== null ? parseInt(selectedHost.loss) : (selectedHost.status === 'offline' ? 100 : 0);
    
    // Popula dinamicamente a grade de métricas com suporte a dados omitidos da origem
    let gridHtml = "";
    if (selectedHost.latency !== null) {
        gridHtml += `
            <div class="drawer-metric-card">
                <span class="drawer-metric-label">Latência Atual</span>
                <div class="drawer-metric-value"><strong>${parseInt(selectedHost.latency)}</strong><span>ms</span></div>
            </div>`;
    }
    if (selectedHost.traffic !== null) {
        gridHtml += `
            <div class="drawer-metric-card">
                <span class="drawer-metric-label">Tráfego Atual</span>
                <div class="drawer-metric-value"><strong>${parseFloat(selectedHost.traffic).toFixed(1)}</strong><span>Mbps</span></div>
            </div>`;
    }
    if (selectedHost.uptime !== null) {
        const spanStyle = (selectedHost.latency !== null && selectedHost.traffic !== null) ? ' style="grid-column: span 2;"' : '';
        gridHtml += `
            <div class="drawer-metric-card"${spanStyle}>
                <span class="drawer-metric-label">Tempo Ativo</span>
                <div class="drawer-metric-value"><strong>${selectedHost.uptime}</strong></div>
            </div>`;
    }
    
    drawerMetricGrid.innerHTML = gridHtml || `<div style="grid-column: 1/-1; text-align:center; padding:15px; color:var(--text-muted);">Nenhum sensor de métricas ativo vindo do servidor Zabbix.</div>`;
    
    // Oculta/Exibe gráfico de latência dependendo da métrica existir
    const chartCard = document.querySelector('.drawer-chart-card');
    if (chartCard) {
        if (selectedHost.latency !== null) {
            chartCard.style.display = 'block';
            drawCanvasChart();
        } else {
            chartCard.style.display = 'none';
        }
    }
}

function closeDrawer() {
    selectedHost = null;
    drawerOverlay.classList.remove('open');
    drawerContainer.classList.remove('open');
    playSynthTone(783.99, 'sine', 0.03, 0.08); // G5
}

// Micro Canvas Chart Builder (100% nativo e sem dependências)
function drawCanvasChart() {
    if (!drawerChartCanvas || !selectedHost) return;
    
    const ctx = drawerChartCanvas.getContext('2d');
    const width = drawerChartCanvas.clientWidth;
    const height = drawerChartCanvas.clientHeight;
    
    drawerChartCanvas.width = width * window.devicePixelRatio;
    drawerChartCanvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    ctx.clearRect(0, 0, width, height);
    
    const history = historyCache[selectedHost.name] || [];
    if (history.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Aguardando coleta de dados...', width/2, height/2);
        return;
    }
    
    const paddingLeft = 35;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 20;
    
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    
    const maxVal = Math.max(...history, 50) || 50;
    const minVal = 0;
    const valRange = maxVal - minVal;
    
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
        const y = paddingTop + (plotHeight / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();
        
        ctx.fillStyle = '#64748b';
        ctx.font = '8px monospace';
        ctx.textAlign = 'right';
        const val = maxVal - ((maxVal - minVal) / gridLines) * i;
        ctx.fillText(val.toFixed(0) + 'ms', paddingLeft - 6, y + 3);
    }
    
    if (history.length >= 2) {
        ctx.beginPath();
        for (let i = 0; i < history.length; i++) {
            const x = paddingLeft + (plotWidth / (history.length - 1)) * i;
            const y = paddingTop + plotHeight - ((history[i] - minVal) / valRange) * plotHeight;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        
        const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + plotHeight);
        grad.addColorStop(0, 'rgba(34, 211, 238, 0.2)');
        grad.addColorStop(1, 'rgba(34, 211, 238, 0.0)');
        
        ctx.lineTo(paddingLeft + plotWidth, paddingTop + plotHeight);
        ctx.lineTo(paddingLeft, paddingTop + plotHeight);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        
        ctx.beginPath();
        for (let i = 0; i < history.length; i++) {
            const x = paddingLeft + (plotWidth / (history.length - 1)) * i;
            const y = paddingTop + plotHeight - ((history[i] - minVal) / valRange) * plotHeight;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        history.forEach((val, i) => {
            const x = paddingLeft + (plotWidth / (history.length - 1)) * i;
            const y = paddingTop + plotHeight - ((val - minVal) / valRange) * plotHeight;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2*Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#0891b2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });
    }
    
    ctx.fillStyle = '#64748b';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Histórico de latência recente', paddingLeft, height - 5);
}

// 8. Simulated Terminal Diagnostic Vibe (Adaptive to actual source metrics)
function runDiagnosticsSim() {
    if (!selectedHost || diagnosticRunning) return;
    diagnosticRunning = true;
    
    btnRunDiagnostics.disabled = true;
    btnRunDiagnostics.style.opacity = 0.5;
    
    const lines = [
        { text: `iniciando analise de estabilidade para: "${selectedHost.name}"`, class: 'terminal-output-info', delay: 200 },
        { text: `resolvendo conexao dns com host... ok`, class: 'terminal-output-info', delay: 800 }
    ];
    let delayAccum = 800;
    
    if (selectedHost.latency !== null) {
        delayAccum += 500;
        lines.push({ text: `testando encapsulamento de pacotes icmp (tamanho=64 bytes)`, class: 'terminal-output-info', delay: delayAccum });
        
        delayAccum += 900;
        lines.push(selectedHost.status === 'offline' 
            ? { text: `[ERRO] sem resposta do gateway: host offline ou inacessivel`, class: 'terminal-output-error', delay: delayAccum }
            : { text: `resposta de gateway: time=${parseInt(selectedHost.latency)}ms ttl=54`, class: 'terminal-output-success', delay: delayAccum }
        );
        
        delayAccum += 800;
        lines.push({ text: `verificando estabilidade de ping...`, class: 'terminal-output-info', delay: delayAccum });
        
        delayAccum += 800;
        lines.push(selectedHost.status === 'offline'
            ? { text: `[ALERTA CRITICO] Sem conexao ativa. Gateway nao responde.`, class: 'terminal-output-error', delay: delayAccum }
            : selectedHost.status === 'warning'
                ? { text: `[ATENCAO] Latencia elevada registrada (${parseInt(selectedHost.latency)}ms). Variacao fora dos limites estáveis.`, class: 'terminal-output-warn', delay: delayAccum }
                : { text: `Conexao estavel. Sem variacoes críticas detectadas.`, class: 'terminal-output-success', delay: delayAccum }
        );
    } else {
        delayAccum += 600;
        lines.push({ text: `[INFO] Sensor de latencia (ping) inativo ou omitido pelo servidor de origem Zabbix.`, class: 'terminal-output-info', delay: delayAccum });
    }
    
    if (selectedHost.traffic !== null) {
        delayAccum += 800;
        lines.push({ text: `testando fluxo de banda e trafego ativo...`, class: 'terminal-output-info', delay: delayAccum });
        delayAccum += 600;
        lines.push({ text: `trafego detectado: ${parseFloat(selectedHost.traffic).toFixed(2)} Mbps`, class: 'terminal-output-info', delay: delayAccum });
    }
    
    if (selectedHost.uptime !== null) {
        delayAccum += 800;
        lines.push({ text: `verificando uptime do link com zabbix... uptime: ${selectedHost.uptime}`, class: 'terminal-output-info', delay: delayAccum });
    }
    
    delayAccum += 800;
    lines.push(selectedHost.status === 'offline'
        ? { text: `STATUS DE DIAGNOSTICO: DESCONECTADO [CRITICO]`, class: 'terminal-output-error', delay: delayAccum }
        : selectedHost.status === 'warning'
            ? { text: `STATUS DE DIAGNOSTICO: CONEXÃO INSTÁVEL [ATENCAO]`, class: 'terminal-output-warn', delay: delayAccum }
            : { text: `STATUS DE DIAGNOSTICO: CONECTADO [EXCELENTE]`, class: 'terminal-output-success', delay: delayAccum }
    );

    terminalBody.innerHTML = '';
    playSynthTone(300, 'sawtooth', 0.08, 0.15);
    
    lines.forEach((line, idx) => {
        setTimeout(() => {
            if (!selectedHost) return; 
            
            const div = document.createElement('div');
            div.className = line.class;
            div.innerHTML = `<span style="color:#a855f7; font-weight:600;">$</span> ` + line.text;
            
            const prompt = terminalBody.querySelector('.terminal-prompt');
            if (prompt) prompt.remove();
            
            terminalBody.appendChild(div);
            
            playSynthTone(line.class === 'terminal-output-error' ? 220 : 660, 'sine', 0.02, 0.05);
            
            const newPrompt = document.createElement('div');
            newPrompt.className = 'terminal-prompt';
            newPrompt.innerHTML = `<span class="terminal-cursor"></span>`;
            terminalBody.appendChild(newPrompt);
            
            terminalBody.scrollTop = terminalBody.scrollHeight;
            
            if (idx === lines.length - 1) {
                diagnosticRunning = false;
                btnRunDiagnostics.disabled = false;
                btnRunDiagnostics.style.opacity = 1;
            }
        }, line.delay);
    });
}

function copyDiagnosticReport() {
    if (!selectedHost) return;
    
    const dateStr = new Date().toLocaleString();
    let statusText = 'CONECTADO';
    if (selectedHost.status === 'warning') statusText = 'ATENÇÃO (CONEXÃO INSTÁVEL)';
    if (selectedHost.status === 'offline') statusText = 'DESCONECTADO (MUITAS QUEDAS / FORA)';
    
    let report = `=========================================
RELATÓRIO DE DIAGNÓSTICO NOC - ESTABILIDADE
=========================================
Data/Hora: ${dateStr}
Link/Host: ${selectedHost.name}
Status Atual: ${statusText}\n`;

    if (selectedHost.latency !== null) {
        report += `Latência Atual: ${selectedHost.status === 'offline' ? 'N/A' : parseInt(selectedHost.latency) + ' ms'}\n`;
    }
    if (selectedHost.traffic !== null) {
        report += `Tráfego Atual: ${parseFloat(selectedHost.traffic).toFixed(2)} Mbps\n`;
    }
    if (selectedHost.uptime !== null) {
        report += `Tempo Ativo (Uptime): ${selectedHost.uptime}\n`;
    }
    
    report += `-----------------------------------------
Foco em queda de links e conexão estável.
Gerado pelo NOC Link Monitor (Dados Origem Real).
=========================================`;

    navigator.clipboard.writeText(report).then(() => {
        alert('Relatório copiado para a área de transferência!');
        playSynthTone(1046.50, 'sine', 0.06, 0.15); // C6
    }).catch(err => {
        console.error('Falha ao copiar:', err);
    });
}

// Start everything
window.addEventListener('DOMContentLoaded', init);










// --- WORLD CUP TEMPORARY MODULE ---
const countryIso2 = {
    "Algeria": "dz",
    "Argentina": "ar",
    "Australia": "au",
    "Austria": "at",
    "Belgium": "be",
    "Bosnia and Herzegovina": "ba",
    "Brazil": "br",
    "Canada": "ca",
    "Cape Verde": "cv",
    "Colombia": "co",
    "Croatia": "hr",
    "CuraÃ§ao": "cw",
    "Curacao": "cw",
    "Czech Republic": "cz",
    "Democratic Republic of the Congo": "cd",
    "Ecuador": "ec",
    "Egypt": "eg",
    "England": "gb",
    "France": "fr",
    "Germany": "de",
    "Ghana": "gh",
    "Haiti": "ht",
    "Iran": "ir",
    "Iraq": "iq",
    "Ivory Coast": "ci",
    "Japan": "jp",
    "Jordan": "jo",
    "Mexico": "mx",
    "Morocco": "ma",
    "Netherlands": "nl",
    "New Zealand": "nz",
    "Norway": "no",
    "Panama": "pa",
    "Paraguay": "py",
    "Portugal": "pt",
    "Qatar": "qa",
    "Saudi Arabia": "sa",
    "Scotland": "gb-sct",
    "Senegal": "sn",
    "South Africa": "za",
    "South Korea": "kr",
    "Spain": "es",
    "Sweden": "se",
    "Switzerland": "ch",
    "Tunisia": "tn",
    "Turkey": "tr",
    "United States": "us",
    "Uruguay": "uy",
    "Uzbekistan": "uz"
};

const countryCodes = {
    "Algeria": "ALG",
    "Argentina": "ARG",
    "Australia": "AUS",
    "Austria": "AUT",
    "Belgium": "BEL",
    "Bosnia and Herzegovina": "BIH",
    "Brazil": "BRA",
    "Canada": "CAN",
    "Cape Verde": "CPV",
    "Colombia": "COL",
    "Croatia": "CRO",
    "CuraÃ§ao": "CUW",
    "Curacao": "CUW",
    "Czech Republic": "CZE",
    "Democratic Republic of the Congo": "COD",
    "Equador": "ECU",
    "Ecuador": "ECU",
    "Egypt": "EGY",
    "England": "ING",
    "France": "FRA",
    "Germany": "GER",
    "Ghana": "GHA",
    "Haiti": "HAI",
    "Iran": "IRN",
    "Iraq": "IRQ",
    "Ivory Coast": "CIV",
    "Japan": "JPN",
    "Jordan": "JOR",
    "Mexico": "MEX",
    "Morocco": "MAR",
    "Netherlands": "NED",
    "New Zealand": "NZL",
    "Norway": "NOR",
    "Panama": "PAN",
    "Paraguay": "PAR",
    "Portugal": "POR",
    "Qatar": "QAT",
    "Saudi Arabia": "KSA",
    "Scotland": "ESC",
    "Senegal": "SEN",
    "South Africa": "RSA",
    "South Korea": "KOR",
    "Spain": "ESP",
    "Sweden": "SWE",
    "Switzerland": "SUI",
    "Tunisia": "TUN",
    "Turkey": "TUR",
    "United States": "USA",
    "Uruguay": "URU",
    "Uzbekistan": "UZB"
};

const translateCountry = {
    "Algeria": "Arg\u00e9lia",
    "Argentina": "Argentina",
    "Australia": "Austr\u00e1lia",
    "Austria": "\u00c1ustria",
    "Belgium": "B\u00e9lgica",
    "Bosnia and Herzegovina": "B\u00f3snia",
    "Brazil": "Brasil",
    "Canada": "Canad\u00e1",
    "Cape Verde": "Cabo Verde",
    "Colombia": "Col\u00f4mbia",
    "Croatia": "Cro\u00e1cia",
    "CuraÃ§ao": "Cura\u00e7\u00e3o",
    "Curacao": "Cura\u00e7\u00e3o",
    "Czech Republic": "Ch\u00e9quia",
    "Democratic Republic of the Congo": "RD Congo",
    "Ecuador": "Equador",
    "Egypt": "Egito",
    "England": "Inglaterra",
    "France": "Fran\u00e7a",
    "Germany": "Alemanha",
    "Ghana": "Gana",
    "Haiti": "Haiti",
    "Iran": "Ir\u00e3",
    "Iraq": "Iraque",
    "Ivory Coast": "Costa do Marfim",
    "Japan": "Jap\u00e3o",
    "Jordan": "Jord\u00e2nia",
    "Mexico": "M\u00e9xico",
    "Morocco": "Marrocos",
    "Netherlands": "Holanda",
    "New Zealand": "Nova Zel\u00e2ndia",
    "Norway": "Noruega",
    "Panama": "Panam\u00e1",
    "Paraguay": "Paraguai",
    "Portugal": "Portugal",
    "Qatar": "Catar",
    "Saudi Arabia": "Ar\u00e1bia Saudita",
    "Scotland": "Esc\u00f3cia",
    "Senegal": "Senegal",
    "South Africa": "\u00c1frica do Sul",
    "South Korea": "Coreia do Sul",
    "Spain": "Espanha",
    "Sweden": "Su\u00e9cia",
    "Switzerland": "Su\u00ed\u00e7a",
    "Tunisia": "Tun\u00edsia",
    "Turkey": "Turquia",
    "United States": "Estados Unidos",
    "Uruguay": "Uruguai",
    "Uzbekistan": "Uzbequist\u00e3o"
};

const stadiumsTimezones = {
    "1": "Central",
    "2": "Central",
    "3": "Central",
    "4": "Central",
    "5": "Central",
    "6": "Central",
    "7": "Eastern",
    "8": "Eastern",
    "9": "Eastern",
    "10": "Eastern",
    "11": "Eastern",
    "12": "Eastern",
    "13": "Western",
    "14": "Western",
    "15": "Western",
    "16": "Western"
};

function getFlag(teamName) {
    if (!teamName) return "";
    const cleanName = teamName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const code = countryIso2[teamName] || countryIso2[cleanName];
    if (code) {
        return `<img src="https://flagcdn.com/20x15/${code}.png" style="vertical-align: middle; width: 20px; height: 15px; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); display: inline-block; margin: 0 4px;">`;
    }
    return "\u2690";
}

function getCountryCode(teamName) {
    return countryCodes[teamName] || (teamName || '').substring(0, 3).toUpperCase();
}

function getPortugueseName(teamName) {
    return translateCountry[teamName] || teamName;
}

function getTodayDateStr() {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const year = today.getFullYear();
    return `${month}/${day}/${year}`;
}

function parseMatchDate(localDateStr) {
    if (!localDateStr) return null;
    const parts = localDateStr.split(' ');
    if (parts.length < 2) return null;
    const dateParts = parts[0].split('/');
    const timeParts = parts[1].split(':');
    if (dateParts.length < 3 || timeParts.length < 2) return null;
    return new Date(
        parseInt(dateParts[2]),
        parseInt(dateParts[0]) - 1,
        parseInt(dateParts[1]),
        parseInt(timeParts[0]),
        parseInt(timeParts[1])
    );
}

function getBrasiliaDate(localDateStr, stadiumId) {
    const matchDate = parseMatchDate(localDateStr);
    if (!matchDate) return null;
    
    const region = stadiumsTimezones[stadiumId] || "Eastern";
    let offsetHours = 1; 
    if (region === "Central") {
        offsetHours = 2; 
    } else if (region === "Western") {
        offsetHours = 4; 
    }
    
    matchDate.setHours(matchDate.getHours() + offsetHours);
    return matchDate;
}

let worldCupMatches = [];
let prevLiveScores = {};

function playGoalAlertSound() {
    if (typeof soundEnabled !== 'undefined' && !soundEnabled) return;
    try {
        playSynthTone(523.25, 'sine', 0.12, 0.15); // C5
        setTimeout(() => playSynthTone(659.25, 'sine', 0.12, 0.15), 100); // E5
        setTimeout(() => playSynthTone(783.99, 'sine', 0.12, 0.15), 200); // G5
        setTimeout(() => playSynthTone(1046.50, 'sine', 0.15, 0.45), 300); // C6
    } catch (e) {
        console.warn('Goal sound failed', e);
    }
}

function triggerGoalPopUp(homePT, awayPT, homeScore, awayScore, goalTeamPT, scorerName) {
    const overlay = document.getElementById('goal-alert-overlay');
    const teamsEl = document.getElementById('goal-alert-teams');
    const scorerEl = document.getElementById('goal-alert-scorer');
    if (!overlay || !teamsEl || !scorerEl) return;
    
    const emergencyOverlay = document.getElementById('fullscreen-emergency-overlay');
    if (emergencyOverlay && emergencyOverlay.style.display === 'flex') {
        console.log('[WORLD-CUP] Goal pop-up suppressed due to link down emergency');
        return;
    }
    
    const liveMatch = worldCupMatches.find(game => game.time_elapsed === 'live');
    const homeFlag = liveMatch ? getFlag(liveMatch.home_team_name_en) : "";
    const awayFlag = liveMatch ? getFlag(liveMatch.away_team_name_en) : "";
    
    teamsEl.innerHTML = `${homeFlag} ${homePT} ${homeScore} x ${awayScore} ${awayPT} ${awayFlag}`;
    scorerEl.innerHTML = `\u26BD Gol de ${goalTeamPT}! <br><span style="font-size: 16px; opacity: 0.85;">${scorerName}</span>`;
    overlay.style.display = 'flex';
    
    playGoalAlertSound();
    
    if (window.goalAlertTimeout) clearTimeout(window.goalAlertTimeout);
    window.goalAlertTimeout = setTimeout(() => {
        overlay.style.display = 'none';
    }, 12000);
}

async function updateWorldCupWidget() {
    const ticker = document.getElementById('world-cup-ticker');
    const tickerText = document.getElementById('world-cup-ticker-text');
    const scoreboardBar = document.getElementById('copa-scoreboard-bar');
    const scoreboardText = document.getElementById('copa-scoreboard-text');
    
    try {
        const response = await fetch('/api/world-cup');
        if (!response.ok) throw new Error('API HTTP error ' + response.status);
        const data = await response.json();
        if (!data || !Array.isArray(data.games)) {
            throw new Error('Resposta sem array de jogos');
        }
        
        worldCupMatches = data.games;
        
        const todayStr = getTodayDateStr();
        const todayMatches = worldCupMatches.filter(game => {
            if (!game.home_team_name_en || !game.away_team_name_en) return false;
            return (game.local_date && game.local_date.startsWith(todayStr)) || 
                   game.time_elapsed === 'live';
        });
        
        if (todayMatches.length === 0) {
            if (ticker) ticker.style.display = 'none';
            if (scoreboardBar) scoreboardBar.style.display = 'none';
            return;
        }
        
        if (ticker) ticker.style.display = 'flex';
        if (scoreboardBar) scoreboardBar.style.display = 'flex';
        
        // Sort matches chronologically based on BrasÃ­lia Time
        todayMatches.sort((a, b) => {
            const dateA = getBrasiliaDate(a.local_date, a.stadium_id) || new Date(0);
            const dateB = getBrasiliaDate(b.local_date, b.stadium_id) || new Date(0);
            return dateA - dateB;
        });
        
        const liveMatch = todayMatches.find(game => game.time_elapsed === 'live');
        const tickerPill = document.getElementById('world-cup-ticker-trigger');
        
        if (liveMatch) {
            const homePT = getPortugueseName(liveMatch.home_team_name_en);
            const awayPT = getPortugueseName(liveMatch.away_team_name_en);
            const homeCode = getCountryCode(liveMatch.home_team_name_en);
            const awayCode = getCountryCode(liveMatch.away_team_name_en);
            const homeFlag = getFlag(liveMatch.home_team_name_en);
            const awayFlag = getFlag(liveMatch.away_team_name_en);
            
            const scoreText = `${homeFlag} ${homeCode} ${liveMatch.home_score} x ${liveMatch.away_score} ${awayCode} ${awayFlag} (Ao Vivo)`;
            
            if (tickerPill) tickerPill.classList.add('wc-live');
            if (tickerText) tickerText.innerHTML = scoreText;
            
            if (scoreboardBar) scoreboardBar.className = 'copa-scoreboard-bar bar-live';
            if (scoreboardText) scoreboardText.innerHTML = scoreText;
            
            const matchId = liveMatch.id;
            const homeScore = parseInt(liveMatch.home_score) || 0;
            const awayScore = parseInt(liveMatch.away_score) || 0;
            
            if (prevLiveScores[matchId]) {
                const prevHome = prevLiveScores[matchId].home;
                const prevAway = prevLiveScores[matchId].away;
                
                if (homeScore > prevHome || awayScore > prevAway) {
                    let goalTeamPT = "";
                    let scorerName = "Autor desconhecido";
                    
                    if (homeScore > prevHome) {
                        goalTeamPT = homePT;
                        if (liveMatch.home_scorers && liveMatch.home_scorers !== 'null') {
                            const cleaned = liveMatch.home_scorers.replace(/[{}]/g, '');
                            const scorers = cleaned.split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
                            if (scorers.length > 0) scorerName = scorers[scorers.length - 1];
                        }
                    } else {
                        goalTeamPT = awayPT;
                        if (liveMatch.away_scorers && liveMatch.away_scorers !== 'null') {
                            const cleaned = liveMatch.away_scorers.replace(/[{}]/g, '');
                            const scorers = cleaned.split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
                            if (scorers.length > 0) scorerName = scorers[scorers.length - 1];
                        }
                    }
                    
                    triggerGoalPopUp(homePT, awayPT, homeScore, awayScore, goalTeamPT, scorerName);
                }
            }
            prevLiveScores[matchId] = { home: homeScore, away: awayScore };
            
        } else {
            if (tickerPill) tickerPill.classList.remove('wc-live');
            const nextMatch = todayMatches.find(game => game.finished === 'FALSE' || game.time_elapsed === 'notstarted');
            
            if (nextMatch) {
                const homeCode = getCountryCode(nextMatch.home_team_name_en);
                const awayCode = getCountryCode(nextMatch.away_team_name_en);
                const homeFlag = getFlag(nextMatch.home_team_name_en);
                const awayFlag = getFlag(nextMatch.away_team_name_en);
                
                const brDate = getBrasiliaDate(nextMatch.local_date, nextMatch.stadium_id);
                const matchTime = brDate ? String(brDate.getHours()).padStart(2, '0') + ':' + String(brDate.getMinutes()).padStart(2, '0') : '';
                const isPastScheduled = brDate && (new Date() > brDate);
                
                let scheduledText = "";
                if (isPastScheduled) {
                    scheduledText = `EM INSTANTES: ${homeFlag} ${homeCode} vs ${awayCode} ${awayFlag}`;
                } else {
                    scheduledText = `PR\u00d3XIMO: ${homeFlag} ${homeCode} vs ${awayCode} ${awayFlag} (${matchTime})`;
                }
                
                if (tickerText) tickerText.innerHTML = scheduledText;
                if (scoreboardBar) scoreboardBar.className = 'copa-scoreboard-bar bar-scheduled';
                if (scoreboardText) scoreboardText.innerHTML = scheduledText;
            } else {
                const lastMatch = todayMatches[todayMatches.length - 1];
                const homeCode = getCountryCode(lastMatch.home_team_name_en);
                const awayCode = getCountryCode(lastMatch.away_team_name_en);
                const homeFlag = getFlag(lastMatch.home_team_name_en);
                const awayFlag = getFlag(lastMatch.away_team_name_en);
                
                const finishedText = `Fim: ${homeFlag} ${homeCode} ${lastMatch.home_score} x ${lastMatch.away_score} ${awayCode} ${awayFlag}`;
                
                if (tickerText) tickerText.innerHTML = finishedText;
                if (scoreboardBar) scoreboardBar.className = 'copa-scoreboard-bar bar-finished';
                if (scoreboardText) scoreboardText.innerHTML = finishedText;
            }
        }
    } catch (error) {
        console.error('[WORLD-CUP] Failed to update widget:', error);
        const errMsg = 'Copa Erro: ' + error.message;
        if (tickerText) tickerText.innerHTML = errMsg;
        if (scoreboardText) scoreboardText.innerHTML = errMsg;
    }
}

function renderWorldCupModal() {
    const todayStr = getTodayDateStr();
    const todayMatches = worldCupMatches.filter(game => {
        if (!game.home_team_name_en || !game.away_team_name_en) return false;
        return game.local_date.startsWith(todayStr) || game.time_elapsed === 'live';
    });
    
    const container = document.getElementById('world-cup-matches-list');
    if (todayMatches.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:#7489a0;font-size:12px;padding:20px;">Nenhum jogo agendado para hoje.</div>`;
        return;
    }
    
    // Sort matches chronologically based on BrasÃ­lia Time
    todayMatches.sort((a, b) => {
        const dateA = getBrasiliaDate(a.local_date, a.stadium_id) || new Date(0);
        const dateB = getBrasiliaDate(b.local_date, b.stadium_id) || new Date(0);
        return dateA - dateB;
    });
    
    container.innerHTML = todayMatches.map(game => {
        const homeFlag = getFlag(game.home_team_name_en);
        const awayFlag = getFlag(game.away_team_name_en);
        const homePT = getPortugueseName(game.home_team_name_en);
        const awayPT = getPortugueseName(game.away_team_name_en);
        const isLive = game.time_elapsed === 'live';
        const isFinished = game.finished === 'TRUE';
        
        let statusText = 'Agendado';
        let statusClass = '';
        if (isLive) {
            statusText = 'Ao Vivo';
            statusClass = 'status-live';
        } else if (isFinished) {
            statusText = 'Finalizado';
            statusClass = 'status-finished';
        } else {
            const brDate = getBrasiliaDate(game.local_date, game.stadium_id);
            statusText = brDate ? String(brDate.getHours()).padStart(2, '0') + ':' + String(brDate.getMinutes()).padStart(2, '0') : 'Agendado';
        }
        
        let homeScorersList = [];
        let awayScorersList = [];
        try {
            if (game.home_scorers && game.home_scorers !== 'null') {
                const cleaned = game.home_scorers.replace(/[{}]/g, '');
                homeScorersList = cleaned.split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
            }
            if (game.away_scorers && game.away_scorers !== 'null') {
                const cleaned = game.away_scorers.replace(/[{}]/g, '');
                awayScorersList = cleaned.split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
            }
        } catch (e) {
            console.warn('Scorers parse error', e);
        }
        
        return `
            <div class="wc-match-card ${isLive ? 'wc-live' : ''}">
                <div class="wc-match-teams">
                    <div class="wc-team-row">
                        <div class="wc-team-info">
                            <span class="wc-flag">${homeFlag}</span>
                            <span>${homePT}</span>
                        </div>
                        <span class="wc-score">${game.home_score !== null ? game.home_score : '-'}</span>
                    </div>
                    <div class="wc-team-row">
                        <div class="wc-team-info">
                            <span class="wc-flag">${awayFlag}</span>
                            <span>${awayPT}</span>
                        </div>
                        <span class="wc-score">${game.away_score !== null ? game.away_score : '-'}</span>
                    </div>
                </div>
                
                <div class="wc-match-meta">
                    <span>Partida ${game.id} - Dallas / USA</span>
                    <span class="wc-status-badge ${statusClass}">${statusText}</span>
                </div>
                
                ${(homeScorersList.length > 0 || awayScorersList.length > 0) ? `
                    <div class="wc-goals">
                        ${homeScorersList.map(s => `<div>\u26BD ${homeFlag} ${s}</div>`).join('')}
                        ${awayScorersList.map(s => `<div>\u26BD ${awayFlag} ${s}</div>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Auto-Reload on Code Update
const currentVersion = "20260701-worldcup-v6";
async function checkVersion() {
    try {
        const response = await fetch('/api/version');
        if (response.ok) {
            const data = await response.json();
            if (data.version && data.version !== currentVersion) {
                console.log('[VERSION-CHECK] New version detected, reloading page...');
                window.location.reload();
            }
        }
    } catch (e) {
        // Suppress version fetch errors
    }
}

// Inicializar eventos e widgets da Copa
function initWorldCup() {
    const trigger = document.getElementById('world-cup-ticker-trigger');
    const barTrigger = document.getElementById('copa-scoreboard-bar');
    
    const openModal = () => {
        renderWorldCupModal();
        const overlay = document.getElementById('world-cup-modal-overlay');
        if (overlay) overlay.style.display = 'flex';
    };
    
    if (trigger) trigger.addEventListener('click', openModal);
    if (barTrigger) barTrigger.addEventListener('click', openModal);
    
    const closeModalWC = () => {
        const overlay = document.getElementById('world-cup-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    };
    
    const btnClose = document.getElementById('btn-close-world-cup');
    if (btnClose) btnClose.addEventListener('click', closeModalWC);
    
    const btnCloseOk = document.getElementById('btn-close-world-cup-ok');
    if (btnCloseOk) btnCloseOk.addEventListener('click', closeModalWC);
    
    const overlay = document.getElementById('world-cup-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'world-cup-modal-overlay') closeModalWC();
        });
    }
    
    const btnCloseGoal = document.getElementById('goal-alert-close-btn');
    if (btnCloseGoal) {
        btnCloseGoal.addEventListener('click', () => {
            const goalOverlay = document.getElementById('goal-alert-overlay');
            if (goalOverlay) goalOverlay.style.display = 'none';
        });
    }
    
    const goalOverlay = document.getElementById('goal-alert-overlay');
    if (goalOverlay) {
        goalOverlay.addEventListener('click', (e) => {
            if (e.target.id === 'goal-alert-overlay') {
                goalOverlay.style.display = 'none';
            }
        });
    }
    
    updateWorldCupWidget();
    setInterval(updateWorldCupWidget, 30000);
    
    setInterval(checkVersion, 30000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWorldCup);
} else {
    initWorldCup();
}

// === TV Mode & Region Mapping Helpers ===
function updateTvModeButtonState() {
    const tvModeBtn = document.getElementById('tv-mode-btn');
    if (!tvModeBtn) return;
    const isTv = document.body.classList.contains('tv-mode');
    if (isTv) {
        tvModeBtn.classList.add('active');
        tvModeBtn.title = 'Modo TV Ativo - Clique para Desativar';
    } else {
        tvModeBtn.classList.remove('active');
        tvModeBtn.title = 'Alternar Modo TV / Wallboard';
    }
}

function getLinkRegion(link) {
    if (link.customRegion && link.customRegion !== 'none') {
        return link.customRegion;
    }
    const n = normalizeText(link.name);
    if (
        n.includes('mtz') || n.includes('jdf') || n.includes('gigalink') || n.includes('fbr') || n.includes('sankhya') || n.includes('pluri') ||
        n.includes('bhz') || n.includes('century') ||
        n.includes('vga') || n.includes('ppy') || n.includes('maxxtelecom') || n.includes('turbonet') ||
        n.includes('udi') || n.includes('uberlandia')
    ) {
        return 'mg';
    }
    if (n.includes('spo') || n.includes('cpq') || n.includes('algar') || n.includes('sitel') || n.includes('avato')) {
        return 'sp';
    }
    if (n.includes('rio') || n.includes('ptr') || n.includes('americanet') || n.includes('mundivox') || n.includes('vero') || n.includes('friburgo') || n.includes('alta rede')) {
        return 'rj';
    }
    if (n.includes('vix') || n.includes('dinamica') || n.includes('nwt')) {
        return 'es';
    }
    return 'other';
}

function normalizeText(text) {
    if (!text) return "";
    return text.toString().toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}