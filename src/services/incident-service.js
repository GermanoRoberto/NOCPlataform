const incidentRepository = require('../repositories/incident-repository');
const telegramClient = require('../infrastructure/telegram/telegram-client');
const config = require('../core/config');
const logger = require('../core/logger');

class IncidentService {
    constructor() {
        this.deviceStates = new Map();

        // Limiares Anti-Flapping e Anti-Spam
        // Quedas com menos de 60s são consideradas micro-oscilações transitórias e NÃO disparam alerta no Telegram
        this.minDownDurationMs = 60000; // 60 segundos de indisponibilidade ininterrupta
        this.minDownConfirmations = 4;  // Pelo menos 4 coletas consecutivas com perda
        this.minUpConfirmations = 3;    // Pelo menos 3 coletas consecutivas com sucesso para confirmar retorno

        // Reconciliação defensiva no boot para sanear eventuais incidentes órfãos em caso de restart
        incidentRepository.reconcileOrphanedActiveIncidents().catch(err => {
            logger.warn({ error: err.message }, 'Falha na reconciliação inicial de incidentes.');
        });
    }

    formatDuration(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
        return parts.join(' ');
    }

    async processDeviceState(device) {
        const id = String(device.id);
        const name = device.name || '';
        const nameUpper = name.toUpperCase();

        // Regra de Produção: Gateways e equipamentos DrayTek/Roteadores não devem disparar alertas de queda independentes
        // para evitar mensagens duplicadas e alarmes ruidosos.
        if (nameUpper.includes('GATEWAY') || nameUpper.includes('DRAYTEK') || nameUpper.includes('ROTEADOR')) {
            return;
        }

        const isOffline = (device.status === 'offline');
        const now = Date.now();
        const currentClock = Number(device.lastClock || 0);

        if (!this.deviceStates.has(id)) {
            this.deviceStates.set(id, {
                confirmedState: isOffline ? 'down' : 'up',
                downStartedAt: isOffline ? now : null,
                downStreak: isOffline ? 1 : 0,
                upStreak: isOffline ? 0 : 1,
                lastClock: currentClock,
                alertSent: false,
                incidentId: null,
                lastRecoveryAt: null,
                ip: device.ip || 'N/A',
                isp: device.isp || 'Telecom',
                city: device.city || 'Filial',
                branchCode: device.branchCode || 'MATRIZ',
                draytekAccess: device.draytekAccess || []
            });
            return;
        }

        const tracker = this.deviceStates.get(id);
        if (device.ip) tracker.ip = device.ip;
        if (device.isp) tracker.isp = device.isp;
        if (device.city) tracker.city = device.city;
        if (device.branchCode) tracker.branchCode = device.branchCode;
        if (device.draytekAccess) tracker.draytekAccess = device.draytekAccess;

        const isNewSample = (currentClock === 0 || currentClock !== tracker.lastClock);
        if (currentClock > 0) tracker.lastClock = currentClock;

        if (isOffline) {
            tracker.upStreak = 0;

            if (tracker.confirmedState === 'up') {
                if (tracker.downStartedAt === null) {
                    tracker.downStartedAt = now;
                    tracker.downStreak = 1;
                } else if (isNewSample) {
                    tracker.downStreak++;
                }

                const downDuration = now - tracker.downStartedAt;

                // Anti-Flapping: Exige persistência ininterrupta (>= 60s E >= 4 confirmações)
                if (tracker.downStreak >= this.minDownConfirmations && downDuration >= this.minDownDurationMs) {
                    tracker.confirmedState = 'down';
                    tracker.alertSent = true;

                    try {
                        const incId = await incidentRepository.createIncident({
                            assetId: id,
                            assetType: device.type || 'link',
                            name,
                            downAt: new Date(tracker.downStartedAt).toISOString()
                        });
                        tracker.incidentId = incId;
                        logger.warn({ assetId: id, name, incidentId: incId, downDurationText: this.formatDuration(downDuration) }, '[INCIDENT_DOWN] Queda sustentada confirmada após janela de validação.');

                        // Enviar alerta Telegram no padrão corporativo rico de produção com link de acesso ao DrayTek ativo
                        await telegramClient.notifyIncidentDown({
                            assetId: id,
                            name,
                            ip: tracker.ip || device.ip || 'N/A',
                            isp: tracker.isp || device.isp,
                            city: tracker.city || device.city,
                            branchCode: tracker.branchCode || device.branchCode,
                            draytekAccess: device.draytekAccess || tracker.draytekAccess || [],
                            downAt: new Date(tracker.downStartedAt).toISOString(),
                            signal: 'Host inacessível (100% Packet Loss) via ICMP Ping.',
                            impact: 'Interrupção de conectividade no circuito principal da filial.',
                            action: 'Verificar roteador de borda ou abrir chamado urgente com o provedor.'
                        });
                    } catch (e) {
                        logger.error({ assetId: id, error: e.message }, 'Erro ao registrar incidente de queda.');
                    }
                }
            } else {
                // Já estava confirmado em 'down', continua mantendo streak
                if (isNewSample) tracker.downStreak++;
            }
        } else {
            // Dispositivo ONLINE
            if (isNewSample) tracker.upStreak++;
            tracker.downStreak = 0;

            if (tracker.confirmedState === 'up') {
                // Se estava acumulando contagem de queda transitória (< 60s) mas voltou antes da confirmação:
                // Trata-se de micro-oscilação / flapping. Zera o temporizador e NUNCA envia alerta de spam ao Telegram.
                if (tracker.downStartedAt !== null) {
                    const blipDuration = now - tracker.downStartedAt;
                    logger.info({ assetId: id, name, blipDurationMs: blipDuration }, 'Flapping/Micro-queda transitória descartada (< 60s). Alerta suprimido.');
                    tracker.downStartedAt = null;
                }
            } else if (tracker.confirmedState === 'down') {
                // Estava em queda REAL confirmada e agora começou a responder
                // Exige pelo menos minUpConfirmations (3 ciclos) para garantir que não foi apenas um pacote isolado
                if (tracker.upStreak >= this.minUpConfirmations) {
                    tracker.confirmedState = 'up';
                    const upTimestamp = now;
                    const durationMs = tracker.downStartedAt ? (upTimestamp - tracker.downStartedAt) : 0;
                    const durationText = this.formatDuration(durationMs);

                    try {
                        if (tracker.incidentId) {
                            await incidentRepository.resolveIncident(
                                tracker.incidentId,
                                new Date(upTimestamp).toISOString(),
                                durationMs,
                                durationText
                            );
                        }
                        // Sincronização com o banco: baixa qualquer registro ativo residual para este asset
                        await incidentRepository.resolveActiveIncidentsForAsset(
                            id,
                            new Date(upTimestamp).toISOString(),
                            durationMs,
                            durationText
                        );
                    } catch (e) {
                        logger.error({ assetId: id, error: e.message }, 'Erro ao resolver incidente no banco.');
                    }

                    logger.info({ assetId: id, name, durationText }, '[INCIDENT_UP] Ativo normalizado com sucesso.');

                    // Se enviou alerta de queda, agora exclui a mensagem de queda do Telegram e envia apenas a normalização
                    if (tracker.alertSent) {
                        try {
                            await telegramClient.notifyIncidentUp({
                                assetId: id,
                                name,
                                ip: tracker.ip || device.ip || 'N/A',
                                upAt: new Date(upTimestamp).toISOString(),
                                durationText
                            });
                        } catch (e) {
                            logger.error({ assetId: id, error: e.message }, 'Erro ao notificar retorno no Telegram.');
                        }
                    }

                    tracker.incidentId = null;
                    tracker.downStartedAt = null;
                    tracker.alertSent = false;
                    tracker.lastRecoveryAt = now;
                }
            }
        }
    }
}

module.exports = new IncidentService();
