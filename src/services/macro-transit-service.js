const telegramClient = require('../infrastructure/telegram/telegram-client');
const logger = require('../core/logger');

class MacroTransitService {
    constructor() {
        this.isMacroIncidentActive = false;
        this.incidentStartedAt = null;
        this.lastAlertSentAt = null;

        // Cooldown entre alertas de repetição: 2 horas (impede flood de mensagens no bot durante anomalias prolongadas)
        this.alertCooldownMs = 2 * 60 * 60 * 1000;

        // Janela de persistência contínua necessária para confirmar incidente macro no Telegram:
        // Exige pelo menos 18 coletas consecutivas (3 minutos ininterruptos a cada 10s) para descartar oscilações momentâneas
        this.anomalyStreak = 0;
        this.minAnomalyStreak = 18;

        // Janela de normalização necessária para confirmar retorno e exclusão do alerta:
        // Exige pelo menos 12 coletas consecutivas (2 minutos ininterruptos) com tráfego estabilizado
        this.normalStreak = 0;
        this.minNormalStreak = 12;

        this.currentReport = null;
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

        // Links com latência severamente anômala (acima de 150ms)
        const highLatencyLinks = wanLinks.filter(l => l.latency !== null && Number(l.latency) >= 150);
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
        // 1. Quórum: Mínimo de 5 links e pelo menos 60% dos links WAN em anomalia severa (>= 150ms)
        // 2. Co-ocorrência geográfica ampla: Pelo menos 3 cidades/polos distintos impactados simultaneamente
        const isAnomalyDetected = (impactedCount >= 5 && impactedPct >= 60 && affectedCities.size >= 3);

        const now = Date.now();

        if (isAnomalyDetected) {
            this.normalStreak = 0;
            this.anomalyStreak++;

            const report = {
                impactedCount,
                totalCount,
                impactedPct,
                avgLatency,
                baselineLatency: 30,
                regions: Array.from(affectedCities),
                operators: Array.from(affectedOperators),
                persistingCycles: this.anomalyStreak
            };
            this.currentReport = report;

            // Se atingir 6 ciclos (1 minuto) de anomalia, ativa o banner visual no painel web
            if (!this.isMacroIncidentActive && this.anomalyStreak >= 6) {
                this.isMacroIncidentActive = true;
                this.incidentStartedAt = new Date().toISOString();
            }

            // Para DISPARAR no Telegram: exige persistência comprovada de pelo menos 18 ciclos (3 minutos ininterruptos)
            if (this.anomalyStreak >= this.minAnomalyStreak) {
                const shouldSendInitialAlert = !this.lastAlertSentAt;
                const shouldSendCooldownAlert = this.lastAlertSentAt && (now - this.lastAlertSentAt >= this.alertCooldownMs);

                if (shouldSendInitialAlert || shouldSendCooldownAlert) {
                    this.lastAlertSentAt = now;
                    logger.warn({ report, streak: this.anomalyStreak }, '[MACRO_TRANSIT] Incidente macro sustentado confirmado (>= 3 min). Disparando alerta Telegram.');
                    await telegramClient.sendMacroTransitAlert(report).catch(err => {
                        logger.error({ error: err.message }, 'Falha ao enviar alerta macro no Telegram');
                    });
                }
            }
        } else {
            // Anomalia não detectada neste ciclo
            this.anomalyStreak = 0;

            if (this.isMacroIncidentActive) {
                // Se a taxa de links impactados baixou de 25%
                if (impactedPct <= 25) {
                    this.normalStreak++;
                    // Exige 12 ciclos consecutivos (2 minutos ininterruptos) para confirmar a normalização
                    if (this.normalStreak >= this.minNormalStreak) {
                        const startMs = this.incidentStartedAt ? new Date(this.incidentStartedAt).getTime() : now;
                        const durationMs = Math.max(0, now - startMs);
                        const totalSec = Math.floor(durationMs / 1000);
                        const durationText = `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;

                        const recoveryReport = {
                            avgLatency: avgLatency > 0 ? avgLatency : 32,
                            durationText
                        };

                        // Só envia recuperação no Telegram se um alerta de queda/anomalia realmente tiver sido transmitido
                        if (this.lastAlertSentAt) {
                            logger.info({ recoveryReport }, '[MACRO_TRANSIT] Normalização do trânsito IP confirmada (>= 2 min). Disparando limpeza e comunicado Telegram.');
                            await telegramClient.sendMacroTransitRecovery(recoveryReport).catch(() => {});
                        }

                        this.isMacroIncidentActive = false;
                        this.incidentStartedAt = null;
                        this.lastAlertSentAt = null;
                        this.currentReport = null;
                        this.normalStreak = 0;
                    }
                } else {
                    this.normalStreak = 0;
                }
            } else {
                this.currentReport = null;
                this.normalStreak = 0;
            }
        }
    }
}

module.exports = new MacroTransitService();
