const { SimpleLinearRegression } = require('ml-regression');
const db = require('../infrastructure/database/connection');
const logger = require('../core/logger');

class PredictiveAnalyticsService {
    /**
     * Previsão determinística de esgotamento de toner via regressão linear (ml-regression)
     * @param {string|number} printerId 
     * @returns {Promise<Object>}
     */
    async forecastToner(printerId) {
        try {
            const rows = await db.query(
                `SELECT toner_level, black_counter, strftime('%s', timestamp) as ts 
                 FROM printers_history 
                 WHERE printer_id = ? AND toner_level IS NOT NULL 
                 ORDER BY timestamp ASC LIMIT 500`,
                [String(printerId)]
            );

            if (!rows || rows.length < 2) {
                return {
                    printerId: String(printerId),
                    status: 'insufficient_data',
                    message: 'Dados históricos insuficientes para regressão linear (mínimo de 2 amostras necessárias).',
                    dataPoints: rows ? rows.length : 0,
                    slopePerDay: null,
                    daysRemaining: null,
                    estimatedExhaustionDate: null,
                    r2: null
                };
            }

            const t0 = Number(rows[0].ts);
            const x = [];
            const y = [];

            for (const r of rows) {
                const dayOffset = (Number(r.ts) - t0) / 86400; // Em dias
                const level = Number(r.toner_level);
                if (!isNaN(dayOffset) && !isNaN(level)) {
                    x.push(dayOffset);
                    y.push(level);
                }
            }

            if (x.length < 2) {
                return {
                    printerId: String(printerId),
                    status: 'insufficient_data',
                    message: 'Amostras válidas insuficientes.',
                    dataPoints: x.length
                };
            }

            const currentDayOffset = x[x.length - 1];
            const currentToner = y[y.length - 1];

            // Verifica se todos os valores são idênticos (sem variância)
            const allSame = y.every(val => val === y[0]);
            if (allSame) {
                return {
                    printerId: String(printerId),
                    status: 'stable',
                    currentToner,
                    slopePerDay: 0,
                    daysRemaining: null,
                    estimatedExhaustionDate: null,
                    r2: 1.0,
                    dataPoints: x.length,
                    message: 'Nível de toner inalterado no período analisado.'
                };
            }

            const regression = new SimpleLinearRegression(x, y);
            const score = regression.score(x, y);
            const slope = regression.slope; // Taxa de variação de toner (% por dia)

            let daysRemaining = null;
            let estimatedDate = null;
            let status = 'stable';

            if (slope < -0.01) { // Toner consumindo
                status = 'depleting';
                // Quando y = 0 => 0 = slope * x + intercept => x = -intercept / slope
                const targetDayOffset = (0 - regression.intercept) / slope;
                const remaining = targetDayOffset - currentDayOffset;
                daysRemaining = remaining > 0 ? Math.round(remaining * 10) / 10 : 0;
                estimatedDate = new Date(Date.now() + Math.max(0, daysRemaining) * 86400 * 1000).toISOString();
            } else if (slope > 0.05) {
                status = 'swapped_or_refilled';
            }

            return {
                printerId: String(printerId),
                status,
                currentToner,
                slopePerDay: Math.round(slope * 1000) / 1000,
                daysRemaining,
                estimatedExhaustionDate: estimatedDate,
                r2: Math.round(score.r2 * 1000) / 1000,
                dataPoints: x.length,
                message: status === 'depleting'
                    ? `Consumo estimado em ${Math.abs(Math.round(slope * 100) / 100)}% ao dia. Esgotamento previsto em aproximadamente ${daysRemaining} dias.`
                    : 'Nível de toner estável ou sem tendência linear de esgotamento no momento.'
            };
        } catch (err) {
            logger.error({ err, printerId }, 'Erro ao calcular regressão de toner');
            throw err;
        }
    }

    /**
     * Previsão de saturação de largura de banda via regressão linear (ml-regression)
     * @param {string|number} linkId 
     * @param {number|null} contractedBandwidth 
     * @returns {Promise<Object>}
     */
    async forecastBandwidth(linkId, contractedBandwidth = null) {
        try {
            const rows = await db.query(
                `SELECT traffic, bandwidth, strftime('%s', timestamp) as ts 
                 FROM links_history 
                 WHERE link_id = ? AND traffic IS NOT NULL 
                 ORDER BY timestamp ASC LIMIT 500`,
                [String(linkId)]
            );

            if (!rows || rows.length < 2) {
                return {
                    linkId: String(linkId),
                    status: 'insufficient_data',
                    message: 'Dados históricos de tráfego insuficientes para regressão linear.',
                    dataPoints: rows ? rows.length : 0
                };
            }

            const t0 = Number(rows[0].ts);
            const x = [];
            const y = [];
            let maxBandwidth = contractedBandwidth || Number(rows[rows.length - 1].bandwidth) || 0;

            for (const r of rows) {
                const dayOffset = (Number(r.ts) - t0) / 86400;
                const traffic = Number(r.traffic);
                if (!isNaN(dayOffset) && !isNaN(traffic)) {
                    x.push(dayOffset);
                    y.push(traffic);
                }
            }

            if (x.length < 2) {
                return {
                    linkId: String(linkId),
                    status: 'insufficient_data',
                    message: 'Amostras válidas insuficientes.',
                    dataPoints: x.length
                };
            }

            const currentDayOffset = x[x.length - 1];
            const currentTraffic = y[y.length - 1];

            const allSame = y.every(val => val === y[0]);
            if (allSame) {
                return {
                    linkId: String(linkId),
                    status: 'stable',
                    currentTraffic,
                    contractedBandwidth: maxBandwidth,
                    growthRateMbpsPerDay: 0,
                    daysToSaturation: null,
                    r2: 1.0,
                    dataPoints: x.length,
                    saturationRisk: 'LOW',
                    message: 'Tráfego constante no período avaliado.'
                };
            }

            const regression = new SimpleLinearRegression(x, y);
            const score = regression.score(x, y);
            const slope = regression.slope; // Mbps por dia

            let daysToSaturation = null;
            let saturationRisk = 'LOW';

            if (slope > 0.05 && maxBandwidth > 0) {
                const targetDayOffset = (maxBandwidth - regression.intercept) / slope;
                const remaining = targetDayOffset - currentDayOffset;
                if (remaining > 0) {
                    daysToSaturation = Math.round(remaining * 10) / 10;
                    if (daysToSaturation <= 7) saturationRisk = 'CRITICAL';
                    else if (daysToSaturation <= 30) saturationRisk = 'HIGH';
                    else if (daysToSaturation <= 90) saturationRisk = 'MEDIUM';
                    else saturationRisk = 'LOW';
                }
            }

            return {
                linkId: String(linkId),
                status: slope > 0.05 ? 'growing' : (slope < -0.05 ? 'decreasing' : 'stable'),
                currentTraffic,
                contractedBandwidth: maxBandwidth,
                growthRateMbpsPerDay: Math.round(slope * 1000) / 1000,
                daysToSaturation,
                saturationRisk,
                r2: Math.round(score.r2 * 1000) / 1000,
                dataPoints: x.length,
                message: daysToSaturation !== null
                    ? `Crescimento de tráfego projetado em ${Math.round(slope * 100) / 100} Mbps/dia. Saturação estimada em ${daysToSaturation} dias.`
                    : 'Tráfego estável ou sem risco iminente de saturação de banda.'
            };
        } catch (err) {
            logger.error({ err, linkId }, 'Erro ao calcular regressão de largura de banda');
            throw err;
        }
    }
}

module.exports = new PredictiveAnalyticsService();
