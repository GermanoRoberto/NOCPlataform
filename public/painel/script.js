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

// 1. Initial Setup and Listeners
function init() {

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
        soundBtn.innerText = '🔊';
    } else {
        soundBtn.classList.remove('active');
        soundBtn.title = 'Som de alerta desativado';
        soundBtn.setAttribute('aria-label', 'Som de alerta desativado');
        soundBtn.innerText = '🔇';
    }
}

function updateNotifyButtonState() {
    if (!notifyBtn) return;
    if (notificationsEnabled) {
        notifyBtn.classList.add('active');
        notifyBtn.innerText = '🔔';
    } else {
        notifyBtn.classList.remove('active');
        notifyBtn.innerText = '🔕';
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
            // Processa status com warning baseado nos thresholds de latência caso o backend não tenha feito
            data.items.forEach(item => {
                // Limpa valores 'null' caso venham nulos ou strings inválidas
                if (item.latency === null || item.latency === undefined) {
                    item.latency = null;
                }
                if (item.traffic === null || item.traffic === undefined || item.traffic === "null") {
                    item.traffic = null;
                }
                if (item.uptime === null || item.uptime === undefined || item.uptime === "null") {
                    item.uptime = null;
                }

                if (item.latency !== null) {
                    const lat = parseFloat(item.latency);
                    
                    // Se está online mas a latência está acima do limite, marca warning
                    if (item.status === 'online') {
                        if (lat > thresholds.latency) {
                            item.status = 'warning';
                        }
                    }
                    
                    // Cache de histórico de latência para sparklines (últimas 15)
                    if (!historyCache[item.name]) {
                        historyCache[item.name] = [];
                    }
                    
                    // Se offline empilha 0
                    const latNum = item.status === 'offline' ? 0 : lat;
                    historyCache[item.name].push(latNum);
                    if (historyCache[item.name].length > 15) {
                        historyCache[item.name].shift();
                    }
                }
            });
            
            // Detecta transições de status críticos para som e notificação
            detectStatusChanges(data.items);
            
            // Gerenciamento dinâmico do alerta em tela cheia (Fullscreen Warning Overlay)
            const offlineItems = data.items.filter(item => item.status === 'offline');
            const offlineNames = offlineItems.map(item => item.name);
            
            if (offlineNames.length > 0) {
                // Verifica se há alguma queda NOVA (um host offline que não estava na nossa lista ativa)
                const hasNewDrop = offlineNames.some(name => !currentActiveOfflineNames.includes(name));
                
                if (hasNewDrop) {
                    // Novo incidente detectado!
                    // Atualiza a lista ativa, renderiza caixas separadas e reinicia o timer de 1 minuto
                    currentActiveOfflineNames = offlineNames;
                    if (emergencyHostsList) {
                        emergencyHostsList.innerHTML = currentActiveOfflineNames.map(name => `<div class="emergency-box">${name}</div>`).join('');
                    }
                    if (fullscreenEmergencyOverlay) {
                        fullscreenEmergencyOverlay.style.display = 'flex';
                    }
                    
                    // Configura o cronômetro para fechar sozinho após 1 minuto (60000 ms)
                    if (emergencyTimeoutId) {
                        clearTimeout(emergencyTimeoutId);
                    }
                    emergencyTimeoutId = setTimeout(() => {
                        if (fullscreenEmergencyOverlay) {
                            fullscreenEmergencyOverlay.style.display = 'none';
                        }
                        emergencyTimeoutId = null;
                        // Mantemos a lista ativa preenchida para não re-disparar o alerta para as mesmas quedas já mostradas
                    }, 60000);
                } else {
                    // Quedas conhecidas e nenhuma nova queda.
                    // Se a tela de emergência ainda estiver ativa, garante que exibe os nomes corretos
                    if (fullscreenEmergencyOverlay && fullscreenEmergencyOverlay.style.display === 'flex') {
                        if (emergencyHostsList) {
                            emergencyHostsList.innerHTML = offlineNames.map(name => `<div class="emergency-box">${name}</div>`).join('');
                        }
                    }
                }
            } else {
                // Todos os links estão online! Limpa tudo e esconde a tela de emergência imediatamente
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
            
            // Se o Drawer estiver aberto, atualiza os dados em tempo real
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
        // Exibe erro na console operacional
        const alertsPanel = document.getElementById('stat-alerts');
        if (alertsPanel) {
            alertsPanel.innerText = 'OFFLINE';
            alertsPanel.style.color = 'var(--color-offline)';
        }
    }
}

// 4. Sound & Alert Notifications Engine (Focus on Link Drops and Connection Stability)
function detectStatusChanges(newItems) {
    newItems.forEach(item => {
        const prev = prevStatuses[item.name];
        
        // Se for a primeira carga (prev === undefined) e o link já está fora, ou se houve uma transição de status para offline
        const isNewDrop = (prev !== undefined && prev !== item.status && item.status === 'offline');
        const isAlreadyOfflineOnLoad = (prev === undefined && item.status === 'offline');
        
        if (isNewDrop || isAlreadyOfflineOnLoad) {
            playAlertSound(true);
            showDesktopNotification(`⚠️ LINK FORA: ${item.name}`, `O link caiu e está inacessível.`);
        } else if (prev !== undefined && prev !== item.status) {
            if (prev === 'offline' && (item.status === 'online' || item.status === 'warning')) {
                playAlertSound(false);
                showDesktopNotification(`✅ LINK RECUPERADO: ${item.name}`, `A conexão foi restabelecida com sucesso.`);
            } else if (item.status === 'warning') {
                // Instabilidade / Alta Latência
                const latText = item.latency !== null ? ` (${parseInt(item.latency)}ms)` : '';
                showDesktopNotification(`⚠️ CONEXÃO INSTÁVEL: ${item.name}`, `A latência está elevada${latText}.`);
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
    
    // Filtro e Busca
    let filtered = itemsCache.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery);
        const matchesFilter = activeFilter === 'all' || item.status === activeFilter;
        return matchesSearch && matchesFilter;
    });

    // Ordenação alfabética estrita, mas com PLURI sempre por último de tudo
    filtered.sort((a, b) => {
        if (a.name === 'PLURI') return 1;
        if (b.name === 'PLURI') return -1;
        return a.name.localeCompare(b.name);
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-muted); font-size:1.1rem; gap:10px; height:200px;">
            <span>🔍 Nenhum link encontrado para os critérios selecionados.</span>
        </div>`;
        return;
    }

    grid.innerHTML = filtered.map(i => {
        const history = historyCache[i.name] || [];
        const sparklineSvg = generateSparklineSvg(history);
        
        // Formata display de métricas de forma dinâmica
        const latDisplay = i.status === 'offline' ? '-- ms' : (i.latency !== null ? `${parseInt(i.latency)} ms` : null);
        const trafficDisplay = i.traffic !== null ? `${parseFloat(i.traffic).toFixed(1)}M` : null;
        const uptimeDisplay = i.uptime || null;
        
        let statusLabel = 'CONECTADO';
        if (i.status === 'warning') statusLabel = 'ATENÇÃO';
        if (i.status === 'offline') statusLabel = 'DESCONECTADO';

        // Constrói dinamicamente o header do card
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

        // Sparkline de latência (mantém contêiner vazio invisível se não houver dados para preservar alinhamento)
        let sparklineHtml = "";
        if (i.latency !== null && i.status !== 'offline') {
            sparklineHtml = `<div class="card-sparkline-container">${sparklineSvg}</div>`;
        } else {
            sparklineHtml = `<div class="card-sparkline-container" style="opacity: 0; pointer-events: none;"></div>`;
        }

        return `
            <div class="status-card ${i.status}" onclick="openDrawer('${i.name}')">
                ${headerHtml}
                <div class="host-name">${i.name.replace(/-/g, '<br>')}</div>
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
    const w = rect.width;
    const h = rect.height;
    
    let bestCols = 1;
    let minScore = Infinity;
    const gap = 10; // deve bater com o gap do CSS

    for (let c = 1; c <= count; c++) {
        const r = Math.ceil(count / c);
        const empty = (c * r) - count;
        
        // Impede que os cartões fiquem muito estreitos (mínimo de 200px)
        if ((w - (c - 1) * gap) / c < 200) continue; 
        
        const cardW = (w - (c - 1) * gap) / c;
        const cardH = Math.max((h - (r - 1) * gap) / r, 140);
        const ratio = cardW / cardH;
        
        // Score: prioriza proporção de 1.6 e dá peso menor a slots vazios
        const ratioScore = Math.abs(ratio - 1.6) * 12;
        const emptyScore = empty * 1.5;
        const totalScore = ratioScore + emptyScore;

        if (totalScore < minScore) {
            minScore = totalScore;
            bestCols = c;
        }
    }
    
    const finalRows = Math.ceil(count / bestCols);
    
    // Injeta as propriedades customizadas para os cartões no contêiner
    grid.style.setProperty('--best-cols', bestCols);
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
