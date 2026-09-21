class ChartManager {
    constructor() {
        this.instances = new Map();
    }

    getOrCreate(canvasId, configFactory) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        if (this.instances.has(canvasId)) {
            const chart = this.instances.get(canvasId);
            if (chart && chart.canvas === canvas) {
                try {
                    chart.resize();
                } catch (e) {}
                return chart;
            } else {
                try { chart.destroy(); } catch (e) {}
                this.instances.delete(canvasId);
            }
        }

        if (window.Chart && typeof window.Chart.getChart === 'function') {
            const domChart = window.Chart.getChart(canvas);
            if (domChart) {
                try { domChart.destroy(); } catch (e) {}
            }
        }

        const ctx = canvas.getContext('2d');
        const config = configFactory(ctx);
        const newChart = new Chart(ctx, config);
        this.instances.set(canvasId, newChart);
        return newChart;
    }

    updateChart(canvasId, configFactory, dataUpdater) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        let chart = this.instances.get(canvasId);
        if (!chart || chart.canvas !== canvas) {
            chart = this.getOrCreate(canvasId, configFactory);
        }

        if (chart && typeof dataUpdater === 'function') {
            try {
                dataUpdater(chart);
                chart.resize();
                chart.update('none');
            } catch (err) {
                console.warn(`[ChartManager] Erro ao atualizar ${canvasId}, recriando instância:`, err);
                this.destroy(canvasId);
                chart = this.getOrCreate(canvasId, configFactory);
                if (chart) {
                    try {
                        dataUpdater(chart);
                        chart.update('none');
                    } catch (e) {}
                }
            }
        }
        return chart;
    }

    resizeAll() {
        for (const [id, chart] of this.instances.entries()) {
            const canvas = document.getElementById(id);
            if (canvas && canvas.offsetParent !== null) {
                try {
                    chart.resize();
                    chart.update('none');
                } catch (e) {}
            }
        }
    }

    updateData(canvasId, updater) {
        const chart = this.instances.get(canvasId);
        if (chart) {
            try {
                updater(chart);
                chart.update('none');
            } catch (e) {}
        }
    }

    destroy(canvasId) {
        if (this.instances.has(canvasId)) {
            try {
                this.instances.get(canvasId).destroy();
            } catch (e) {}
            this.instances.delete(canvasId);
        }
    }

    destroyAll() {
        for (const chart of this.instances.values()) {
            try { chart.destroy(); } catch (e) {}
        }
        this.instances.clear();
    }
}
window.chartManager = new ChartManager();
