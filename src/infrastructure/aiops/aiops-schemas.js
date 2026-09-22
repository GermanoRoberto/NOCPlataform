const { z } = require('zod');

const AiopsActionSchema = z.object({
    id: z.string(),
    label: z.string(),
    tipo: z.enum(['DIAGNOSTIC', 'REMEDIATION']),
    nivel: z.number().int().min(1).max(3).default(1),
    seguro: z.boolean().default(true),
    comando_desc: z.string(),
    parametros: z.record(z.any()).optional()
});

const AiopsDiagnosticSchema = z.object({
    host_id: z.string(),
    status_apurado: z.enum(['NORMAL', 'ALERTA', 'CRITICO']),
    metricas_analisadas: z.object({
        latencia_ms: z.number().nullable(),
        perda_pacotes_pct: z.number().nullable(),
        jitter_ms: z.number().nullable()
    }),
    violacao_sla: z.boolean(),
    evidencias_literais: z.array(z.string()),
    acao_recomendada: z.string(),
    acoes_sugeridas: z.array(AiopsActionSchema).default([])
});

const ContextValidationSchema = z.object({
    test_id: z.string(),
    entrada_detectada: z.string(),
    ferramenta_acionada: z.string(),
    resultado_esperado: z.string(),
    resultado_obtido: z.string(),
    status: z.enum(['SUCESSO', 'FALHA']),
    observacoes_tecnicas: z.string()
});

module.exports = {
    AiopsDiagnosticSchema,
    ContextValidationSchema
};
