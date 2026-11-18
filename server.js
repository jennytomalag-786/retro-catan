// Servidor en tiempo real para la retro "El Camino de los Colonos".
// Sin dependencias: solo Node >= 18. Uso: node server.js  (PORT opcional)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'public', 'index.html');
const ROOM_TTL = 6 * 3600 * 1000;
const RES = ['trigo', 'ladrillo', 'oveja', 'madera', 'mineral'];
const POOLS = ['note', 'thief', 'prop'];
const POINTS = 3;
const NOMBRES = ['Los Deployadores', 'Las Bug Hunters', 'Team Hotfix', 'Los Refactorianos', 'Las Pull Requesters', 'Los Mergeadores', 'Las Hotfixeras'];
const RETOS = ['Describe tu sprint solo con un gesto', 'Explica tu último bug como si fuera un cuento de hadas', 'Habla como comerciante medieval durante 20 segundos', 'Imita el sonido de tu Daily Scrum', 'Resume el sprint en un emoji y defiéndelo', 'Dile un halago sincero a quien aparezca a tu derecha en pantalla', 'Cuenta un fracaso del sprint como si fuera una hazaña épica'];

const rooms = new Map();
const rid = (n = 8) => crypto.randomBytes(n).toString('hex').slice(0, n);
const clean = (s, max = 200) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const validCid = (c) => typeof c === 'string' && /^[a-z0-9]{8,32}$/.test(c);

function newRoom(cid) {
  let code;
  do { code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join(''); } while (rooms.has(code));
  const r = {
    code, facCids: new Set([cid]), facKey: rid(10), touched: Date.now(), startedAt: null,
    phase: 'llegada', sel: 'trigo', played: [], round: 0, roll: null, timer: null,
    notes: Object.fromEntries(RES.map((k) => [k, []])), thief: [], props: [],
    votes: { note: {}, thief: {}, prop: {} }, roti: {}, awards: ['', '', ''], names: [], reto: '',
    people: {}, clients: new Set(),
  };
  rooms.set(code, r);
  return r;
}

const sumVotes = (r, pool, id) => Object.values(r.votes[pool]).reduce((a, m) => a + (m[id] || 0), 0);
const usedPoints = (r, pool, cid) => Object.values(r.votes[pool][cid] || {}).reduce((a, b) => a + b, 0);

function viewFor(r, cid) {
  const fac = r.facCids.has(cid);
  const mv = (pool) => r.votes[pool][cid] || {};
  const ro = Object.values(r.roti);
  const online = [...new Set([...r.clients].map((c) => r.people[c.cid]?.name).filter(Boolean))];
  return {
    code: r.code, fac, facKey: fac ? r.facKey : undefined, now: Date.now(), startedAt: r.startedAt,
    phase: r.phase, sel: r.sel, played: r.played, round: r.round, roll: r.roll, timer: r.timer,
    notes: Object.fromEntries(RES.map((k) => [k, r.notes[k].map((n) => ({ id: n.id, t: n.t, v: sumVotes(r, 'note', n.id), mine: n.a === cid }))])),
    thief: r.thief.map((n) => ({ id: n.id, t: n.t, v: sumVotes(r, 'thief', n.id) })),
    props: r.props.map((n) => ({ id: n.id, t: n.t, ty: n.ty, o: n.o, d: n.d, s: n.s, v: sumVotes(r, 'prop', n.id), mine: n.a === cid })),
    myVotes: { note: mv('note'), thief: mv('thief'), prop: mv('prop') },
    points: POINTS,
    roti: { counts: [1, 2, 3, 4, 5].map((n) => ro.filter((v) => v === n).length), avg: ro.length ? ro.reduce((a, b) => a + b, 0) / ro.length : null, mine: r.roti[cid] || 0 },
    awards: r.awards, names: r.names, reto: r.reto, online, total: r.clients.size,
  };
}

function broadcast(r) {
  r.touched = Date.now();
  for (const c of r.clients) c.res.write(`data: ${JSON.stringify(viewFor(r, c.cid))}\n\n`);
}

function startTimer(r, sec, label) { r.timer = { end: Date.now() + sec * 1000, sec, label: clean(label, 40) }; }

function act(r, cid, b) {
  const fac = r.facCids.has(cid);
  const need = () => { if (!fac) throw new Error('Solo el facilitador'); };
  const find = (list, id) => list.find((n) => n.id === id);
  switch (b.type) {
    case 'name': r.people[cid] = { name: clean(b.name, 24) || 'Colono' }; break;
    case 'phase': need(); if (!['llegada', 'dados', 'ladron', 'comercio', 'ciudad', 'cierre'].includes(b.phase)) throw new Error('fase'); r.phase = b.phase; break;
    case 'sel': need(); if ([...RES, 'ladron', 'ciudad'].includes(b.sel)) r.sel = b.sel; break;
    case 'start': need(); if (!r.startedAt) r.startedAt = Date.now(); break;
    case 'timer': need(); startTimer(r, Math.min(3600, Math.max(5, +b.sec || 120)), b.label || ''); break;
    case 'stopTimer': need(); r.timer = null; break;
    case 'roll': {
      need();
      if (r.pending) throw new Error('El Ladrón está llegando');
      const d1 = crypto.randomInt(1, 7), d2 = crypto.randomInt(1, 7), sum = d1 + d2;
      const k = sum <= 3 ? 'trigo' : sum <= 5 ? 'ladrillo' : sum === 6 ? 'oveja' : sum === 7 ? 'ladron' : sum <= 9 ? 'madera' : 'mineral';
      r.roll = { id: rid(6), d1, d2, sum, k, repeat: false };
      if (k === 'ladron') {
        r.pending = true;
        setTimeout(() => { r.pending = false; r.phase = 'ladron'; r.sel = 'ladron'; startTimer(r, 300, 'Notas del Ladrón'); broadcast(r); }, 3800);
      } else if (r.played.includes(k)) r.roll.repeat = true;
      else { r.played.push(k); r.round++; r.sel = k; startTimer(r, 120, `Notas: ${k}`); }
      break;
    }
    case 'note': {
      if (!RES.includes(b.res)) throw new Error('recurso');
      const t = clean(b.text); if (!t) break;
      if (Object.values(r.notes).flat().length > 500) throw new Error('límite');
      r.notes[b.res].push({ id: rid(), t, a: cid }); break;
    }
    case 'thief': { const t = clean(b.text); if (!t) break; if (r.thief.length > 300) throw new Error('límite'); r.thief.push({ id: rid(), t }); break; } // sin autor: anónimo
    case 'prop': {
      const t = clean(b.text); if (!t) break; if (r.props.length > 100) throw new Error('límite');
      r.props.push({ id: rid(), t, ty: ['camino', 'poblado', 'ciudad'].includes(b.ty) ? b.ty : 'camino', o: clean(b.o, 40), d: clean(b.d, 30), s: clean(b.s, 120), a: cid }); break;
    }
    case 'del': {
      const lists = { note: Object.values(r.notes), thief: [r.thief], prop: [r.props] }[b.pool];
      if (!lists) break;
      for (const l of lists) {
        const i = l.findIndex((n) => n.id === b.id);
        if (i < 0) continue;
        if (!fac && l[i].a !== cid) throw new Error('No es tu nota');
        l.splice(i, 1);
        for (const m of Object.values(r.votes[b.pool])) delete m[b.id];
      }
      break;
    }
    case 'vote': {
      if (!POOLS.includes(b.pool)) break;
      const list = b.pool === 'note' ? Object.values(r.notes).flat() : b.pool === 'thief' ? r.thief : r.props;
      if (!find(list, b.id)) break;
      const mine = (r.votes[b.pool][cid] ||= {});
      if (b.d > 0) { if (usedPoints(r, b.pool, cid) >= POINTS) throw new Error('Ya usaste tus 3 puntos'); mine[b.id] = (mine[b.id] || 0) + 1; }
      else if (mine[b.id]) { mine[b.id]--; if (!mine[b.id]) delete mine[b.id]; }
      break;
    }
    case 'roti': { const n = +b.n; if (n >= 1 && n <= 5) r.roti[cid] = n; break; }
    case 'award': need(); { const i = +b.i; if (i >= 0 && i < 3) r.awards[i] = clean(b.text, 60); } break;
    case 'names': need(); r.names = [...NOMBRES].sort(() => Math.random() - 0.5).slice(0, 3); break;
    case 'reto': need(); r.reto = RETOS[crypto.randomInt(RETOS.length)]; break;
    case 'reset': need(); Object.assign(r, {
      phase: 'llegada', sel: 'trigo', played: [], round: 0, roll: null, timer: null, startedAt: null, pending: false,
      notes: Object.fromEntries(RES.map((k) => [k, []])), thief: [], props: [], votes: { note: {}, thief: {}, prop: {} }, roti: {}, awards: ['', '', ''], names: [], reto: '',
    }); break;
    default: throw new Error('acción desconocida');
  }
}

function readJson(req) {
  return new Promise((ok, ko) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 8192) { ko(new Error('grande')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ko(e); } });
  });
}
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    if (req.method === 'GET' && u.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(INDEX).pipe(res);
    }
    if (req.method === 'GET' && u.pathname === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size });

    if (req.method === 'GET' && u.pathname === '/events') {
      const r = rooms.get(clean(u.searchParams.get('room'), 8).toUpperCase());
      const cid = u.searchParams.get('cid');
      if (!r || !validCid(cid)) return json(res, 404, { error: 'Sala no encontrada' });
      if (u.searchParams.get('fk') && u.searchParams.get('fk') === r.facKey) r.facCids.add(cid);
      r.people[cid] = { name: clean(u.searchParams.get('name'), 24) || r.people[cid]?.name || 'Colono' };
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const c = { res, cid };
      r.clients.add(c);
      const ka = setInterval(() => res.write(': ka\n\n'), 20000);
      req.on('close', () => { clearInterval(ka); r.clients.delete(c); broadcast(r); });
      return broadcast(r);
    }

    if (req.method === 'POST' && u.pathname === '/api/create') {
      const b = await readJson(req);
      if (!validCid(b.cid)) return json(res, 400, { error: 'cid' });
      if (rooms.size > 200) return json(res, 503, { error: 'Demasiadas salas' });
      return json(res, 200, { code: newRoom(b.cid).code });
    }
    if (req.method === 'POST' && u.pathname === '/api/act') {
      const b = await readJson(req);
      const r = rooms.get(clean(b.room, 8).toUpperCase());
      if (!r || !validCid(b.cid)) return json(res, 404, { error: 'Sala no encontrada' });
      try { act(r, b.cid, b); } catch (e) { return json(res, 400, { error: e.message }); }
      broadcast(r);
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'no' });
  } catch (e) { if (!res.headersSent) json(res, 400, { error: 'bad request' }); }
});

setInterval(() => { for (const [k, r] of rooms) if (!r.clients.size && Date.now() - r.touched > ROOM_TTL) rooms.delete(k); }, 600000);
server.listen(PORT, () => console.log(`Retro Catan en http://localhost:${PORT}`));
