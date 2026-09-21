// Temple Runner API. Node 22+, no dependencies: node:sqlite for storage.
//   GET  /api/health              -> { ok: true }
//   GET  /api/scores?limit=10     -> { scores: [{ name, score, coins, distance, created_at }] }
//   POST /api/scores              -> { name, score, coins, distance } -> { id, rank, top: [...] }
//   GET  /api/me                  -> player view (creates a guest + session cookie when there is none)
//   POST /api/progress            -> { coins, distance, rubies } credits a finished run -> view
//   POST /api/register            -> { username, password } turns the guest into an account (10 per IP per hour) -> view
//   POST /api/login               -> { username, password } -> view (new session)
//   POST /api/logout              -> fresh guest view
//   POST /api/unlock              -> { skin } spends rubies -> view
// Economy: 1 ruby per 10 000 coins collected across all runs; skins cost 0/1/5/10/10/10 rubies.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT || 3002);
const DB_PATH = process.env.DB_PATH || '/data/scores.db';
const NAME_RE = /^[A-Za-z0-9 _.-]{1,12}$/;
const USER_RE = /^[A-Za-z0-9_]{3,12}$/;
const MAX_LIMIT = 200;
const POST_COOLDOWN_MS = 3000;
const REGISTRATIONS_PER_IP_PER_HOUR = 10;
const RUBY_COINS = 10000;
const SKIN_COST = { adventurer: 0, 'adventurer-f': 1, hooded: 5, king: 10, witch: 10, soldier: 10 };
const COOKIE = 'tr_session';
const YEAR = 365 * 24 * 3600;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    distance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC, id ASC);
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'guest',
    username TEXT UNIQUE,
    pass_hash TEXT, salt TEXT,
    coins_total INTEGER NOT NULL DEFAULT 0,
    rubies_spent INTEGER NOT NULL DEFAULT 0,
    unlocked TEXT NOT NULL DEFAULT '["adventurer"]',
    best_score INTEGER NOT NULL DEFAULT 0,
    runs INTEGER NOT NULL DEFAULT 0,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    seen_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    player_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS registrations (ip TEXT NOT NULL, created_at INTEGER NOT NULL);
`);
try { db.exec('ALTER TABLE players ADD COLUMN rubies_bonus INTEGER NOT NULL DEFAULT 0'); } catch { /* already there */ }
const q = {
  insertScore: db.prepare('INSERT INTO scores (name, score, coins, distance) VALUES (?, ?, ?, ?)'),
  top: db.prepare('SELECT id, name, score, coins, distance, created_at FROM scores ORDER BY score DESC, id ASC LIMIT ?'),
  rankOf: db.prepare('SELECT COUNT(*) AS n FROM scores WHERE score > ? OR (score = ? AND id < ?)'),
  newPlayer: db.prepare('INSERT INTO players (ip) VALUES (?)'),
  player: db.prepare('SELECT * FROM players WHERE id = ?'),
  byName: db.prepare('SELECT * FROM players WHERE username = ? COLLATE NOCASE'),
  newSession: db.prepare('INSERT INTO sessions (token, player_id) VALUES (?, ?)'),
  session: db.prepare('SELECT player_id FROM sessions WHERE token = ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  progress: db.prepare("UPDATE players SET coins_total = coins_total + ?, best_score = MAX(best_score, ?), runs = runs + 1, rubies_bonus = rubies_bonus + ?, seen_at = datetime('now') WHERE id = ?"),
  register: db.prepare("UPDATE players SET kind = 'user', username = ?, pass_hash = ?, salt = ?, ip = ? WHERE id = ?"),
  unlock: db.prepare('UPDATE players SET unlocked = ?, rubies_spent = rubies_spent + ? WHERE id = ?'),
  regCount: db.prepare('SELECT COUNT(*) AS n FROM registrations WHERE ip = ? AND created_at > ?'),
  regAdd: db.prepare('INSERT INTO registrations (ip, created_at) VALUES (?, ?)'),
  regPrune: db.prepare('DELETE FROM registrations WHERE created_at < ?'),
};

const lastPost = new Map(); // ip -> timestamp

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 4096) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
async function readJson(req) { try { return JSON.parse((await readBody(req)) || '{}'); } catch { return null; } }
const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '?';
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const setCookie = (req, token) => `${COOKIE}=${token}; Path=/; Max-Age=${YEAR}; HttpOnly; SameSite=Lax${(req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : ''}`;

const hashPassword = (password, salt) => scryptSync(password, salt, 32).toString('hex');
const rubiesOf = (p) => Math.floor(p.coins_total / RUBY_COINS) + (p.rubies_bonus || 0) - p.rubies_spent;
function view(p) {
  return {
    guest: p.kind !== 'user', username: p.username, coinsTotal: p.coins_total, rubies: rubiesOf(p),
    nextRubyIn: RUBY_COINS - (p.coins_total % RUBY_COINS), unlocked: JSON.parse(p.unlocked), bestScore: p.best_score, runs: p.runs,
    skinCost: SKIN_COST,
  };
}

/** Resolve the session cookie to a player; create a guest (and a cookie) when missing. Returns { player, setCookieHeader? }. */
function currentPlayer(req) {
  const token = cookies(req)[COOKIE];
  if (token) {
    const s = q.session.get(token);
    if (s) { const p = q.player.get(s.player_id); if (p) return { player: p, token }; }
  }
  return startGuest(req);
}
function startGuest(req) {
  const { lastInsertRowid } = q.newPlayer.run(clientIp(req));
  const token = randomBytes(24).toString('base64url');
  q.newSession.run(token, Number(lastInsertRowid));
  return { player: q.player.get(Number(lastInsertRowid)), token, cookie: setCookie(req, token) };
}
function sessionFor(req, playerId) {
  const token = randomBytes(24).toString('base64url');
  q.newSession.run(token, playerId);
  return { player: q.player.get(playerId), token, cookie: setCookie(req, token) };
}
const respondView = (res, ctx, status = 200) => json(res, status, view(ctx.player), ctx.cookie ? { 'Set-Cookie': ctx.cookie } : {});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true });
    if (req.method === 'GET' && path === '/api/scores') {
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 10));
      return json(res, 200, { scores: q.top.all(limit) });
    }
    if (req.method === 'POST' && path === '/api/scores') {
      const ip = clientIp(req);
      const now = Date.now();
      if (now - (lastPost.get(ip) || 0) < POST_COOLDOWN_MS) return json(res, 429, { error: 'slow down' });
      const body = await readJson(req);
      if (!body) return json(res, 400, { error: 'invalid json' });
      const name = String(body.name ?? '').trim();
      const score = Number(body.score); const coins = Number(body.coins); const distance = Number(body.distance);
      if (!NAME_RE.test(name)) return json(res, 400, { error: 'name: 1-12 letters, digits, space, _ . -' });
      if (![score, coins, distance].every((v) => Number.isInteger(v) && v >= 0 && v < 1e7)) return json(res, 400, { error: 'bad numbers' });
      // Score is derived from distance and coins in the game; reject anything that does not add up.
      if (score !== distance + coins * 10) return json(res, 400, { error: 'score mismatch' });
      lastPost.set(ip, now);
      const { lastInsertRowid } = q.insertScore.run(name, score, coins, distance);
      const rank = q.rankOf.get(score, score, Number(lastInsertRowid)).n + 1;
      console.log(`score #${lastInsertRowid} ${name} ${score} (rank ${rank}) from ${ip}`);
      return json(res, 201, { id: Number(lastInsertRowid), rank, top: q.top.all(10) });
    }

    // ---- players -------------------------------------------------------------------------------
    if (req.method === 'GET' && path === '/api/me') return respondView(res, currentPlayer(req));
    if (req.method === 'POST' && path === '/api/progress') {
      const ctx = currentPlayer(req);
      const body = await readJson(req);
      if (!body) return json(res, 400, { error: 'invalid json' });
      const coins = Number(body.coins); const distance = Number(body.distance); const rubies = Number(body.rubies ?? 0);
      if (![coins, distance, rubies].every((v) => Number.isInteger(v) && v >= 0 && v < 1e6)) return json(res, 400, { error: 'bad numbers' });
      // Gems are laid about once per 2.6 km; allow a lucky run but not a flood.
      if (rubies > 1 + distance / 1200) return json(res, 400, { error: 'implausible' });
      // A run cannot yield more coins than the track could have offered (~0.8 per metre plus a little).
      if (coins > distance * 0.8 + 30) return json(res, 400, { error: 'implausible' });
      q.progress.run(coins, distance + coins * 10, rubies, ctx.player.id);
      ctx.player = q.player.get(ctx.player.id);
      return respondView(res, ctx);
    }
    if (req.method === 'POST' && path === '/api/register') {
      const ip = clientIp(req); const now = Date.now();
      q.regPrune.run(now - 3600_000);
      if (q.regCount.get(ip, now - 3600_000).n >= REGISTRATIONS_PER_IP_PER_HOUR) return json(res, 429, { error: 'too many accounts from this address, try later' });
      const body = await readJson(req);
      if (!body) return json(res, 400, { error: 'invalid json' });
      const username = String(body.username ?? '').trim(); const password = String(body.password ?? '');
      if (!USER_RE.test(username)) return json(res, 400, { error: 'username: 3-12 letters, digits or _' });
      if (password.length < 4 || password.length > 64) return json(res, 400, { error: 'password: at least 4 characters' });
      if (q.byName.get(username)) return json(res, 409, { error: 'that name is taken' });
      const ctx = currentPlayer(req);
      const salt = randomBytes(16).toString('hex');
      let target = ctx;
      if (ctx.player.kind === 'user') {
        // Already logged in: make a separate account and switch to it.
        const { lastInsertRowid } = q.newPlayer.run(ip);
        target = sessionFor(req, Number(lastInsertRowid));
      }
      q.register.run(username, hashPassword(password, salt), salt, ip, target.player.id);
      q.regAdd.run(ip, now);
      target.player = q.player.get(target.player.id);
      console.log(`registered ${username} (#${target.player.id}) from ${ip}`);
      return respondView(res, target, 201);
    }
    if (req.method === 'POST' && path === '/api/login') {
      const body = await readJson(req);
      if (!body) return json(res, 400, { error: 'invalid json' });
      const user = q.byName.get(String(body.username ?? '').trim());
      const ok = user && user.pass_hash && timingSafeEqual(Buffer.from(user.pass_hash, 'hex'), Buffer.from(hashPassword(String(body.password ?? ''), user.salt), 'hex'));
      if (!ok) return json(res, 401, { error: 'wrong name or password' });
      const old = cookies(req)[COOKIE]; if (old) q.delSession.run(old);
      return respondView(res, sessionFor(req, user.id));
    }
    if (req.method === 'POST' && path === '/api/logout') {
      const old = cookies(req)[COOKIE]; if (old) q.delSession.run(old);
      return respondView(res, startGuest(req));
    }
    if (req.method === 'POST' && path === '/api/unlock') {
      const ctx = currentPlayer(req);
      const body = await readJson(req);
      const skin = String(body?.skin ?? '');
      if (!(skin in SKIN_COST)) return json(res, 400, { error: 'unknown skin' });
      const unlocked = JSON.parse(ctx.player.unlocked);
      if (unlocked.includes(skin)) return respondView(res, ctx);
      const cost = SKIN_COST[skin];
      if (rubiesOf(ctx.player) < cost) return json(res, 402, { error: `needs ${cost} rubies` });
      unlocked.push(skin);
      q.unlock.run(JSON.stringify(unlocked), cost, ctx.player.id);
      ctx.player = q.player.get(ctx.player.id);
      return respondView(res, ctx);
    }
    return json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`leaderboard api on :${PORT}, db ${DB_PATH}`));
