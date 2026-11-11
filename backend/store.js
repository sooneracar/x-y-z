import fs from 'node:fs';
import path from 'node:path';

/** JSON-file state store with atomic, debounced writes. */
export class Store {
  constructor(file) {
    this.file = file;
    this.timer = null;
    this.data = null;
  }

  load(makeInitial) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        return this.data;
      } catch (err) {
        // Never silently discard a damaged save: keep it next to the new one.
        const backup = `${this.file}.corrupt-${Date.now()}`;
        fs.renameSync(this.file, backup);
        console.error(`[store] state file unreadable (${err.message}); moved to ${backup}`);
      }
    }
    this.data = makeInitial();
    this.saveNow();
    return this.data;
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.saveNow();
    }, 250);
  }

  saveNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
