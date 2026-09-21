class SettingsView {
    constructor() {
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        // 1. Alternância de Abas em Configurações
        const tabChips = document.querySelectorAll('.settings-tabs .filter-chip[data-settings-tab]');
        tabChips.forEach(chip => {
            chip.addEventListener('click', () => {
                tabChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');

                const tab = chip.getAttribute('data-settings-tab');
                const panes = {
                    'thresholds': document.getElementById('paneSettingsThresholds'),
                    'integrations': document.getElementById('paneSettingsIntegrations'),
                    'units': document.getElementById('paneSettingsUnits'),
                    'v8': document.getElementById('paneSettingsV8')
                };

                Object.keys(panes).forEach(k => {
                    if (panes[k]) panes[k].style.display = (k === tab ? 'block' : 'none');
                });
            });
        });

        // 2. Salvar Parâmetros
        const btnSave = document.getElementById('btnSaveSettings');
        if (btnSave) {
            btnSave.addEventListener('click', async () => {
                const toner = Number(document.getElementById('inputSettingToner')?.value || 15);
                const latency = Number(document.getElementById('inputSettingLatency')?.value || 150);
                const loss = Number(document.getElementById('inputSettingLoss')?.value || 2);
                const retention = Number(document.getElementById('inputSettingRetention')?.value || 90);

                try {
                    const res = await fetch('/api/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            thresholds: { toner, latency, loss, retention }
                        })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        alert('Parâmetros operacionais e limiares de alerta salvos com sucesso.');
                    } else {
                        alert(`Erro ao salvar: ${data.message || 'Falha na requisição'}`);
                    }
                } catch (e) {
                    alert(`Falha de rede: ${e.message}`);
                }
            });
        }

        // 3. Testar Conexão Zabbix
        const btnZabbix = document.getElementById('btnTestZabbix');
        if (btnZabbix) {
            btnZabbix.addEventListener('click', async () => {
                btnZabbix.textContent = 'Conectando ao Zabbix...';
                try {
                    const res = await fetch('/api/config/test-zabbix', { method: 'POST' });
                    const data = await res.json();
                    alert(`[TESTE ZABBIX RPC]\nStatus: ${data.success ? 'CONEXÃO BEM-SUCEDIDA' : 'FALHA DE CONEXÃO'}\nDetalhes: ${data.output || data.message || 'API 6.4.21 Operacional'}`);
                } catch (e) {
                    alert(`Erro de teste: ${e.message}`);
                } finally {
                    btnZabbix.textContent = 'Testar Conexão Zabbix';
                }
            });
        }

        // 4. Testar Alerta Telegram
        const btnTelegram = document.getElementById('btnTestTelegram');
        if (btnTelegram) {
            btnTelegram.addEventListener('click', async () => {
                btnTelegram.textContent = 'Disparando mensagem...';
                try {
                    const res = await fetch('/api/config/test-telegram', { method: 'POST' });
                    const data = await res.json();
                    alert(`[TESTE BOT TELEGRAM]\nStatus: ${data.success ? 'DISPARO CONCLUÍDO' : 'FALHA DE ENVIO'}\nDetalhes: ${data.message || 'Canal NOC notificado com sucesso'}`);
                } catch (e) {
                    alert(`Erro de teste: ${e.message}`);
                } finally {
                    btnTelegram.textContent = 'Testar Envio Telegram';
                }
            });
        }
    }

    async render() {
        this.init();
        try {
            const res = await fetch('/api/config');
            if (!res.ok) return;
            const config = await res.json();
            if (config.thresholds) {
                const elToner = document.getElementById('inputSettingToner');
                const elLat = document.getElementById('inputSettingLatency');
                const elLoss = document.getElementById('inputSettingLoss');
                const elRet = document.getElementById('inputSettingRetention');

                if (elToner && config.thresholds.toner) elToner.value = config.thresholds.toner;
                if (elLat && config.thresholds.latency) elLat.value = config.thresholds.latency;
                if (elLoss && config.thresholds.loss) elLoss.value = config.thresholds.loss;
                if (elRet && config.thresholds.retention) elRet.value = config.thresholds.retention;
            }
        } catch (e) {}
    }
}
window.settingsView = new SettingsView();
