const telegramClient = require('../infrastructure/telegram/telegram-client');
const logger = require('../core/logger');

class MacroTransitService {
    constructor() {
        this.isMacroIncidentActive = false;
        this.incidentStartedAt = null;
        this.lastAlertSentAt = null;
        this.alertCooldownMs = 30 * 60 * 1000; // 30 minutos de cooldown para não floodar
        this.currentReport = null;
        this.normalStreak = 0;
    }

    getStatus() {
        return {
            active: this.isMacroIncidentActive,
            startedAt: this.incidentStartedAt,
            lastAlertAt: this.lastAlertSentAt,
            report: this.currentReport
        };
    }

    async evaluate(links = []) {
        if (!Array.isArray(links) || links.length === 0) return;

        // Filtrar apenas circuitos WAN genuínos (excluindo gateways internos e sistemas locais como Sankhya)
        const wanLinks = links.filter(l => {
            const nameUpper = (l.name || '').toUpperCase();
            if (nameUpper.includes('GATEWAY') || nameUpper.includes('DRAYTEK') || nameUpper.includes('ROTEADOR')) return false;
            if (nameUpper.includes('SANKHYA') && (l.latency !== null && l.latency < 25)) return false;
            return l.status !== 'offline'; // Apenas links online com medição ativa de latência
        });

        if (wanLinks.length < 5) return;

        // Links com latência anômala (acima de 140ms)
        const highLatencyLinks = wanLinks.filter(l => l.latency !== null && Number(l.latency) >= 140);
        const impactedCount = highLatencyLinks.length;
        const totalCount = wanLinks.length;
        const impactedPct = Math.round((impactedCount / totalCount) * 100);

        // Identificar cidades e operadoras distintas impactadas
        const affectedCities = new Set();
        const affectedOperators = new Set();
        let totalLatencySum = 0;

        highLatencyLinks.forEach(l => {
            if (l.city) affectedCities.add(l.city);
            const nameParts = (l.name || '').split('-');
            if (nameParts.length > 1) {
                const op = nameParts[1].trim();
                if (op) affectedOperators.add(op);
            }
            totalLatencySum += Number(l.latency);
        });

        const avgLatency = impactedCount > 0 ? Math.round(totalLatencySum / impactedCount) : 0;

        // Critérios de Validação Rigorosa:
        // 1. Quórum: Mínimo de 4 links e pelo menos 55% dos links WAN em anomalia
        // 2. Co-ocorrência geográfica: Pelo menos 2 cidades/filiais diferentes impactadas simultaneamente
        const isAnomalyDetected = (impactedCount >= 4 && impactedPct >= 55 && affectedCities.size >= 2);

        const now = Date.now();

        if (isAnomalyDetected) {
            this.normalStreak = 0;
            const report = {
                impactedCount,
                totalCount,
                impactedPct,
                avgLatency,
                baselineLatency: 30,
                regions: Array.from(affectedCities),
                operators: Array.from(affectedOperators)
            };
            this.currentReport = report;

            if (!this.isMacroIncidentActive) {
                // Início do Incidente Macro
                this.isMacroIncidentActive = true;
                this.incidentStartedAt = new Date().toISOString();
                this.lastAlertSentAt = now;
                logger.warn({ report }, '[MACRO_TRANSIT] Incidente macro de tráfego/backbone confirmado. Disparando alerta Telegram.');
                await telegramClient.sendMacroTransitAlert(report).catch(err => {
                    logger.error({ error: err.message }, 'Falha ao enviar alerta macro no Telegram');
                });
            } else if (now - (this.lastAlertSentAt || 0) >= this.alertCooldownMs) {
                // Notificação de atualização periódica após cooldown
                this.lastAlertSentAt = now;
                logger.info({ report }, '[MACRO_TRANSIT] Reenvio periódico de status do incidente macro.');
                await telegramClient.sendMacroTransitAlert(report).catch(() => {});
            }
        } else if (this.isMacroIncidentActive) {
            // Se estava ativo e a anomalia baixou de 35% por 2 ciclos consecutivos
            if (impactedPct <= 35) {
                this.normalStreak++;
                if (this.normalStreak >= 2) {
                    const startMs = this.incidentStartedAt ? new Date(this.incidentStartedAt).getTime() : now;
                    const durationMs = Math.max(0, now - startMs);
                    const totalSec = Math.floor(durationMs / 1000);
                    const durationText = `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;

                    const recoveryReport = {
                        avgLatency: avgLatency > 0 ? avgLatency : 32,
                        durationText
                    };

                    logger.info({ recoveryReport }, '[MACRO_TRANSIT] Normalização do trânsito IP confirmada. Disparando comunicado Telegram.');
                    await telegramClient.sendMacroTransitRecovery(recoveryReport).catch(() => {});

                    this.isMacroIncidentActive = false;
                    this.incidentStartedAt = null;
                    this.currentReport = null;
                    this.normalStreak = 0;
                }
            } else {
                this.normalStreak = 0;
            }
        }
    }
}

module.exports = new MacroTransitService();
