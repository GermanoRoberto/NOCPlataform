const ollamaClient = require('../../infrastructure/ollama/ollama-client');
const predictiveService = require('../../services/predictive-analytics-service');
const db = require('../../infrastructure/database/connection');

class AiController {
    async getStatus(req, res) {
        try {
            const available = await ollamaClient.isAvailable();
            const models = available ? await ollamaClient.getModels() : [];
            res.json({
                available,
                models,
                activeModel: ollamaClient.model,
                endpoint: ollamaClient.baseUrl
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async diagnose(req, res) {
        try {
            const { asset, pingResult, model, forceFresh, reportType, reportData } = req.body || {};

            const isUp = await ollamaClient.isAvailable();
            if (!isUp) {
                return res.status(503).json({
                    error: 'Serviço de IA Ollama indisponível.',
                    details: 'Certifique-se de que o daemon do Ollama está rodando no servidor (192.168.100.222:11434 ou 127.0.0.1:11434).'
                });
            }

            if (reportType) {
                const result = await ollamaClient.diagnoseReport(reportType, reportData, model, Boolean(forceFresh));
                return res.json(result);
            }

            if (!asset) {
                return res.status(400).json({ error: 'Ativo ou Tipo de Relatório não informado para análise.' });
            }

            const result = await ollamaClient.diagnoseAsset(asset, pingResult, model, Boolean(forceFresh));
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async validateContext(req, res) {
        try {
            const { context, model } = req.body || {};
            if (!context) {
                return res.status(400).json({ error: 'Contexto para validação não informado.' });
            }

            const isUp = await ollamaClient.isAvailable();
            if (!isUp) {
                return res.status(503).json({
                    error: 'Serviço de IA Ollama indisponível.',
                    details: 'Ollama local não está acessível no momento.'
                });
            }

            const result = await ollamaClient.validateContext(context, model);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async getHistory(req, res) {
        try {
            const limit = Math.min(Number(req.query.limit) || 50, 200);
            const hostId = req.query.host_id;

            let sql = `SELECT * FROM aiops_diagnostics`;
            const params = [];

            if (hostId) {
                sql += ` WHERE host_id = ?`;
                params.push(String(hostId));
            }

            sql += ` ORDER BY created_at DESC LIMIT ?`;
            params.push(limit);

            const rows = await db.query(sql, params);
            res.json({
                total: rows.length,
                diagnostics: rows.map(r => ({
                    ...r,
                    metricas_analisadas: r.metricas_analisadas ? JSON.parse(r.metricas_analisadas) : null,
                    evidencias_literais: r.evidencias_literais ? JSON.parse(r.evidencias_literais) : [],
                    payload: r.payload_json ? JSON.parse(r.payload_json) : null
                }))
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async predictToner(req, res) {
        try {
            const { id } = req.params;
            const forecast = await predictiveService.forecastToner(id);
            res.json(forecast);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async predictBandwidth(req, res) {
        try {
            const { id } = req.params;
            const bandwidth = req.query.bandwidth ? Number(req.query.bandwidth) : null;
            const forecast = await predictiveService.forecastBandwidth(id, bandwidth);
            res.json(forecast);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
}

module.exports = new AiController();
