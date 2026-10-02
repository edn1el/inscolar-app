// Store de sesiones en un archivo JSON (data/sessions.json).
// En Render, data/ es el disco persistente, así que las sesiones sobreviven
// a reinicios y deploys (con MemoryStore todos se deslogueaban en cada deploy).
const fs = require('fs');
const path = require('path');
const session = require('express-session');

class FileSessionStore extends session.Store {
  constructor(filePath) {
    super();
    this.filePath = filePath || path.join(__dirname, '..', 'data', 'sessions.json');
    this.sessions = {};
    this.saveTimer = null;
    try {
      if (fs.existsSync(this.filePath)) this.sessions = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) || {};
    } catch (e) {
      this.sessions = {};
    }
    this.prune();
    setInterval(() => this.prune(), 15 * 60 * 1000).unref();
  }

  expiresOf(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires;
    return exp ? new Date(exp).getTime() : null;
  }

  prune() {
    const now = Date.now();
    let changed = false;
    Object.keys(this.sessions).forEach((sid) => {
      const exp = this.expiresOf(this.sessions[sid]);
      if (exp && exp <= now) { delete this.sessions[sid]; changed = true; }
    });
    if (changed) this.persist();
  }

  // Escritura diferida y atómica para no bloquear cada petición.
  persist() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        const tmp = this.filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.sessions));
        fs.renameSync(tmp, this.filePath);
      } catch (e) {
        console.warn('No se pudieron guardar las sesiones:', e.message);
      }
    }, 200);
  }

  get(sid, cb) {
    const sess = this.sessions[sid];
    if (!sess) return cb(null, null);
    const exp = this.expiresOf(sess);
    if (exp && exp <= Date.now()) { this.destroy(sid, () => {}); return cb(null, null); }
    cb(null, JSON.parse(JSON.stringify(sess)));
  }

  set(sid, sess, cb) {
    this.sessions[sid] = JSON.parse(JSON.stringify(sess));
    this.persist();
    cb && cb(null);
  }

  touch(sid, sess, cb) {
    if (this.sessions[sid]) {
      this.sessions[sid].cookie = JSON.parse(JSON.stringify(sess.cookie));
      this.persist();
    }
    cb && cb(null);
  }

  destroy(sid, cb) {
    delete this.sessions[sid];
    this.persist();
    cb && cb(null);
  }
}

module.exports = FileSessionStore;
