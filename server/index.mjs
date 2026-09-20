// Temple Runner leaderboard API. Node 22+, no dependencies: node:sqlite for storage.
//   GET  /api/health          -> { ok: true }
//   GET  /api/scores?limit=10 -> { scores: [{ name, score, coins, distance, created_at }] }
//   POST /api/scores          -> body { name, score, coins, distance } -> { id, rank, top: [...] }
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = Number(process.env.PORT || 3002);
const DB_PATH = process.env.DB_PATH || '/data/scores.db';
const NAME_RE = /^[A-Za-z0-9 _.-]{1,12}$/;
const MAX_LIMIT = 50;
const POST_COOLDOWN_MS = 3000;

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
`);
const insert = db.prepare('INSERT INTO scores (name, score, coins, distance) VALUES (?, ?, ?, ?)');
const top = db.prepare('SELECT id, name, score, coins, distance, created_at FROM scores ORDER BY score DESC, id ASC LIMIT ?');
const rankOf = db.prepare('SELECT COUNT(*) AS n FROM scores WHERE score > ? OR (score = ? AND id < ?)');

const lastPost = new Map(); // ip -> timestamp

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/api/scores') {
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 10));
      return json(res, 200, { scores: top.all(limit) });
    }
    if (req.method === 'POST' && url.pathname === '/api/scores') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '?';
      const now = Date.now();
      if (now - (lastPost.get(ip) || 0) < POST_COOLDOWN_MS) return json(res, 429, { error: 'slow down' });
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid json' }); }
      const name = String(body.name ?? '').trim();
      const score = Number(body.score); const coins = Number(body.coins); const distance = Number(body.distance);
      if (!NAME_RE.test(name)) return json(res, 400, { error: 'name: 1-12 letters, digits, space, _ . -' });
      if (![score, coins, distance].every((v) => Number.isInteger(v) && v >= 0 && v < 1e7)) return json(res, 400, { error: 'bad numbers' });
      // Score is derived from distance and coins in the game; reject anything that does not add up.
      if (score !== distance + coins * 10) return json(res, 400, { error: 'score mismatch' });
      lastPost.set(ip, now);
      const { lastInsertRowid } = insert.run(name, score, coins, distance);
      const rank = rankOf.get(score, score, Number(lastInsertRowid)).n + 1;
      return json(res, 201, { id: Number(lastInsertRowid), rank, top: top.all(10) });
    }
    return json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`leaderboard api on :${PORT}, db ${DB_PATH}`));
