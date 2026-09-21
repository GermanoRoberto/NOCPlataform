class SseClient {
    constructor(url = '/api/status/stream') {
        this.url = url;
        this.es = null;
        this.attempts = 0;
        this.maxDelay = 15000;
        this.statusListeners = new Set();
    }

    connect() {
        if (this.es) this.es.close();

        this.es = new EventSource(this.url);

        this.es.onopen = () => {
            this.attempts = 0;
            this.notifyStatus(true);
        };

        this.es.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                window.appStore.setTelemetry(data);
            } catch (err) {
                console.error('[SSE Parse]', err);
            }
        };

        this.es.onerror = () => {
            this.notifyStatus(false);
            this.es.close();
            const delay = Math.min(1000 * Math.pow(1.5, this.attempts++), this.maxDelay);
            setTimeout(() => this.connect(), delay);
        };
    }

    onStatusChange(cb) {
        this.statusListeners.add(cb);
        return () => this.statusListeners.delete(cb);
    }

    notifyStatus(online) {
        for (const cb of this.statusListeners) {
            try { cb(online); } catch (e) {}
        }
    }
}
window.sseClient = new SseClient();
