class Store {
    constructor() {
        this.state = {
            links: [],
            computers: [],
            printers: [],
            incidents: [],
            recommendations: [],
            exchanges: [],
            aiops: { predictiveAlerts: [], rootCauseCorrelations: [], operatorScorecard: [] },
            summary: {},
            meta: {},
            activeView: 'dashboard',
            settings: {}
        };
        this.subscribers = new Set();
    }

    getState() {
        return this.state;
    }

    setTelemetry(payload) {
        if (!payload) return;
        this.state = {
            ...this.state,
            links: Array.isArray(payload.links) ? payload.links : this.state.links,
            computers: Array.isArray(payload.computers) ? payload.computers : this.state.computers,
            printers: Array.isArray(payload.printers) ? payload.printers : this.state.printers,
            incidents: Array.isArray(payload.incidents) ? payload.incidents : this.state.incidents,
            recommendations: Array.isArray(payload.recommendations) ? payload.recommendations : this.state.recommendations,
            exchanges: Array.isArray(payload.exchanges) ? payload.exchanges : this.state.exchanges,
            aiops: payload.aiops || this.state.aiops,
            summary: payload.summary || this.state.summary,
            meta: payload.meta || this.state.meta
        };
        this.notify();
    }

    setSettings(settings) {
        this.state.settings = settings;
        this.notify();
    }

    setActiveView(view) {
        if (this.state.activeView !== view) {
            this.state.activeView = view;
            this.notify();
        }
    }

    subscribe(fn) {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }

    notify() {
        for (const fn of this.subscribers) {
            try { fn(this.state); } catch (e) { console.error('[STORE ERROR]', e); }
        }
    }
}
window.appStore = new Store();
