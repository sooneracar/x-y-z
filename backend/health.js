import fs from 'node:fs';
import path from 'node:path';

const MAX_OUTAGES = 100;

/** Tracks connector up/down state, persists outages in state and appends them to a log file. */
export class Health {
  constructor({ state, logFile, onChange, now = () => Date.now() }) {
    this.state = state;
    this.logFile = logFile;
    this.onChange = onChange;
    this.now = now;
    this.status = 'disabled'; // disabled | connecting | connected | disconnected
    this.detail = '';
    this.since = now();
    this.everConnected = false;
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  }

  log(line) {
    const text = `${new Date(this.now()).toISOString()} ${line}\n`;
    try {
      fs.appendFileSync(this.logFile, text);
    } catch (err) {
      console.error('[health] cannot write log:', err.message);
    }
    process.stdout.write(`[health] ${text}`);
  }

  get openOutage() {
    const last = this.state.outages[this.state.outages.length - 1];
    return last && last.upAt == null ? last : null;
  }

  set(status, detail = '') {
    const now = this.now();
    const changed = status !== this.status;
    if (status === 'connected') {
      const open = this.openOutage;
      if (open) {
        open.upAt = now;
        open.durationMs = now - open.downAt;
        this.log(`RECONNECTED after ${Math.round(open.durationMs / 1000)}s`);
      } else if (changed) this.log('CONNECTED');
      this.everConnected = true;
    } else if (status === 'disconnected' && this.everConnected && !this.openOutage) {
      this.state.outages.push({ downAt: now, upAt: null, durationMs: null, reason: detail });
      if (this.state.outages.length > MAX_OUTAGES) this.state.outages.splice(0, this.state.outages.length - MAX_OUTAGES);
      this.log(`DISCONNECTED ${detail}`);
    }
    if (changed) this.since = now;
    this.status = status;
    this.detail = detail;
    this.onChange?.();
  }

  snapshot() {
    return {
      status: this.status,
      detail: this.detail,
      since: this.since,
      outages: this.state.outages.slice(-30).reverse(),
    };
  }
}
