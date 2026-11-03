// 겨울 소원마을 공개판 서버 (Cloudflare Worker + Durable Objects)
// - Hub(하나): 방문자 토큰 · 닉네임(중복 금지) · 옷장(아이템·조각) · 오늘의 선물 · 소원 · 편지 · 방문자 수 · 방 배정
// - Room(마을마다 여러 개, 방 하나 40명): 지금 있는 사람 위치·표정 · 눈덩이 · 종소리 (실시간 WebSocket)
// 아이템 뽑기는 서버에서만 한다 (확률을 바꿔 치기 못 하게).
import { DurableObject } from "cloudflare:workers";
import { ITEMS, SLOTS, RATES, GOLD_RATES, DUPE_FRAG, FRAG_COST, GIFTS_PER_DAY, cleanText, nickKey } from "../public/rules.js";

const ROOM_CAP = 40;
const VILLAGES = ["santa", "sun"];
const PRESETS = {
  santa: ["가족 모두 건강하게", "올해도 수고했어", "합격하게 해 주세요", "내년엔 연애하게", "행복한 크리스마스", "다 잘될 거야"],
  sun: ["새해 복 많이 받으세요", "올해는 꼭 이루자", "건강이 최고", "돈 많이 벌게 해 주세요", "가족 모두 행복하게", "작년보다 나은 한 해"],
};
const kst = () => new Date(Date.now() + 9 * 3600e3);
const kstDay = () => kst().toISOString().slice(0, 10);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const recoveryCode = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => CODE_ABC[b % CODE_ABC.length]).join("");
const hub = (env) => env.HUB.get(env.HUB.idFromName("hub"));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const room = url.searchParams.get("room") || "";
      if (!/^(santa|sun)-\d{1,4}$/.test(room)) return new Response("bad room", { status: 400 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("websocket only", { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(request);
    }
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "POST" && Number(request.headers.get("content-length") || 0) > 4096) return json({ error: "too_big" }, 413);
      return hub(env).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (token TEXT PRIMARY KEY, uid TEXT UNIQUE, nick TEXT, nick_key TEXT UNIQUE, hat INTEGER DEFAULT 0, look TEXT DEFAULT '000000', owned TEXT DEFAULT '[]', frag INTEGER DEFAULT 0, code TEXT UNIQUE, created TEXT, last_day TEXT, streak INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS gifts (uid TEXT, day TEXT, slot TEXT, PRIMARY KEY (uid, day, slot));
      CREATE TABLE IF NOT EXISTS wishes (v TEXT, uid TEXT, preset TEXT, text TEXT, at TEXT, PRIMARY KEY (v, uid));
      CREATE TABLE IF NOT EXISTS letters (uid TEXT PRIMARY KEY, text TEXT, at TEXT);
      CREATE TABLE IF NOT EXISTS visits (day TEXT PRIMARY KEY, n INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS rooms (room TEXT PRIMARY KEY, n INTEGER DEFAULT 0, at INTEGER);
    `);
    this.tries = new Map(); // 이어하기 코드 마구 넣기 막기 (IP별)
  }

  user(token) {
    if (typeof token !== "string" || !/^[0-9a-f]{40}$/.test(token)) return null;
    return this.sql.exec("SELECT * FROM users WHERE token = ?", token).toArray()[0] || null;
  }
  profile(u) {
    const day = kstDay();
    const got = this.sql.exec("SELECT slot FROM gifts WHERE uid = ? AND day = ?", u.uid, day).toArray().map((r) => r.slot);
    return { uid: u.uid, nick: u.nick, hat: u.hat, look: u.look, owned: JSON.parse(u.owned), frag: u.frag, code: u.code, streak: u.streak, day, gifts: got, hour: kst().getUTCHours() };
  }
  // Room 이 접속한 사람의 이름을 물어봄 (이름은 서버가 정함 — 남의 이름을 사칭 못 하게)
  async whois(token) { const u = this.user(token); return u && u.nick ? { uid: u.uid, nick: u.nick } : null; }
  async roomCount(room, n) { this.sql.exec("INSERT INTO rooms (room, n, at) VALUES (?, ?, ?) ON CONFLICT(room) DO UPDATE SET n = excluded.n, at = excluded.at", room, n, Date.now()); }

  async fetch(request) {
    const url = new URL(request.url), path = url.pathname.slice(5);
    let body = {};
    if (request.method === "POST") { try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); } }
    const day = kstDay();

    if (path === "hello") {
      let u = this.user(body.token);
      if (!u) {
        const token = hex(20), uid = hex(6);
        this.sql.exec("INSERT INTO users (token, uid, hat, owned, code, created, last_day, streak) VALUES (?, ?, ?, ?, ?, ?, ?, 1)", token, uid, Math.floor(Math.random() * 7), JSON.stringify(SLOTS.map(([sl]) => sl + ":0")), recoveryCode(), new Date().toISOString(), day);
        this.sql.exec("INSERT INTO visits (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1", day);
        u = this.user(token);
      } else if (u.last_day !== day) {
        const y = new Date(Date.parse(day) - 864e5).toISOString().slice(0, 10);
        this.sql.exec("UPDATE users SET last_day = ?, streak = ? WHERE token = ?", day, u.last_day === y ? u.streak + 1 : 1, u.token);
        this.sql.exec("INSERT INTO visits (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1", day);
        u = this.user(u.token);
      }
      return json({ token: u.token, profile: this.profile(u) });
    }

    if (path === "room") { // 사람이 있는 방부터 채우고, 다 차면 새 방
      const v = url.searchParams.get("v"), full = url.searchParams.get("full");
      if (!VILLAGES.includes(v)) return json({ error: "bad_village" }, 400);
      if (full && /^(santa|sun)-\d{1,4}$/.test(full)) await this.roomCount(full, ROOM_CAP);
      const fresh = Date.now() - 120e3, no = (r) => Number(r.room.split("-")[1]);
      const rows = this.sql.exec("SELECT room, n, at FROM rooms WHERE room LIKE ?", v + "-%").toArray().map((r) => ({ ...r, n: r.at < fresh ? 0 : r.n }));
      const open = rows.filter((r) => r.n > 0 && r.n < ROOM_CAP).sort((x, y) => y.n - x.n);
      if (open.length) return json({ room: open[0].room });
      const busy = new Set(rows.filter((r) => r.n >= ROOM_CAP).map(no));
      let i = 1; while (busy.has(i)) i++;
      return json({ room: `${v}-${i}` });
    }

    if (path === "wishes") {
      const v = url.searchParams.get("v");
      if (!VILLAGES.includes(v)) return json({ error: "bad_village" }, 400);
      const list = this.sql.exec("SELECT uid AS id, preset, text, at FROM wishes WHERE v = ? ORDER BY at DESC LIMIT 200", v).toArray();
      const total = this.sql.exec("SELECT COUNT(*) AS c FROM wishes WHERE v = ?", v).one().c;
      return json({ list, total });
    }

    if (path === "stats") {
      const today = this.sql.exec("SELECT n FROM visits WHERE day = ?", day).toArray()[0]?.n || 0;
      const total = this.sql.exec("SELECT COUNT(*) AS c FROM users").one().c;
      const online = this.sql.exec("SELECT COALESCE(SUM(n), 0) AS c FROM rooms WHERE at > ?", Date.now() - 120e3).one().c;
      return json({ today, total, online });
    }

    if (path === "restore") { // 다른 기기에서 이어하기
      const ip = request.headers.get("cf-connecting-ip") || "?", t = this.tries.get(ip) || { n: 0, at: Date.now() };
      if (Date.now() - t.at > 600e3) { t.n = 0; t.at = Date.now(); }
      if (++t.n > 8) return json({ error: "too_many" }, 429);
      this.tries.set(ip, t);
      const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const u = code.length === 10 ? this.sql.exec("SELECT token FROM users WHERE code = ?", code).toArray()[0] : null;
      return u ? json({ token: u.token }) : json({ error: "not_found" }, 404);
    }

    // 여기부터는 토큰 필요
    const u = this.user(body.token);
    if (!u) return json({ error: "no_user" }, 401);

    if (path === "nick") {
      const c = cleanText(body.nick, 8);
      if (!c.ok || c.text.length < 2) return json({ error: "bad_nick", why: c.why || "2~8자로 써 주세요." }, 400);
      const key = nickKey(c.text);
      if (["운영자", "관리자", "산타", "admin", "운영", "공지"].includes(key)) return json({ error: "taken", why: "쓸 수 없는 이름이에요." }, 409);
      const other = this.sql.exec("SELECT token FROM users WHERE nick_key = ?", key).toArray()[0];
      if (other && other.token !== u.token) return json({ error: "taken", why: "이미 누가 쓰고 있는 이름이에요." }, 409);
      const hat = Math.max(0, Math.min(6, body.hat | 0));
      this.sql.exec("UPDATE users SET nick = ?, nick_key = ?, hat = ? WHERE token = ?", c.text, key, hat, u.token);
      return json({ profile: this.profile(this.user(u.token)) });
    }

    if (path === "look") {
      const owned = new Set(JSON.parse(u.owned)), look = String(body.look || "");
      if (!/^\d{6}$/.test(look)) return json({ error: "bad_look" }, 400);
      for (let i = 0; i < 6; i++) { const sl = SLOTS[i][0], k = Number(look[i]); if (k >= ITEMS[sl].length || !owned.has(sl + ":" + k)) return json({ error: "not_owned" }, 403); }
      this.sql.exec("UPDATE users SET look = ? WHERE token = ?", look, u.token);
      return json({ ok: true });
    }

    if (path === "gift") {
      // slot: "santa-0".."santa-2", "sun-0".."sun-2", "gold" (산타마을 밤 8시대만)
      const slot = String(body.slot || "");
      const m = /^(santa|sun)-(\d)$/.exec(slot), gold = slot === "gold";
      if (!(m && Number(m[2]) < GIFTS_PER_DAY) && !gold) return json({ error: "bad_slot" }, 400);
      if (gold && kst().getUTCHours() !== 20) return json({ error: "not_now", why: "황금 선물은 밤 8시대에만 있어요." }, 409);
      const done = this.sql.exec("SELECT 1 FROM gifts WHERE uid = ? AND day = ? AND slot = ?", u.uid, day, slot).toArray().length;
      if (done) return json({ error: "already" }, 409);
      this.sql.exec("INSERT INTO gifts (uid, day, slot) VALUES (?, ?, ?)", u.uid, day, slot);
      const owned = new Set(JSON.parse(u.owned)), rates = gold ? GOLD_RATES : RATES;
      const x = Math.random(), r = x < rates[2] ? 2 : x < rates[2] + rates[1] ? 1 : 0;
      const pool = []; SLOTS.forEach(([sl]) => ITEMS[sl].forEach(([name, rr], i) => { if (i > 0 && rr === r && !owned.has(sl + ":" + i)) pool.push({ sl, i, name, r }); }));
      let item, frag = u.frag;
      if (pool.length) { item = { ...pool[Math.floor(Math.random() * pool.length)], fresh: true }; owned.add(item.sl + ":" + item.i); }
      else { frag += DUPE_FRAG[r]; item = { r, fresh: false, frag: DUPE_FRAG[r] }; }
      this.sql.exec("UPDATE users SET owned = ?, frag = ? WHERE token = ?", JSON.stringify([...owned]), frag, u.token);
      return json({ item, profile: this.profile(this.user(u.token)) });
    }

    if (path === "exchange") { // 눈송이 조각 30개 → 원하는 아이템
      const sl = String(body.sl || ""), i = body.i | 0;
      if (!ITEMS[sl] || i <= 0 || i >= ITEMS[sl].length) return json({ error: "bad_item" }, 400);
      const owned = new Set(JSON.parse(u.owned));
      if (owned.has(sl + ":" + i)) return json({ error: "owned" }, 409);
      if (u.frag < FRAG_COST) return json({ error: "not_enough" }, 409);
      owned.add(sl + ":" + i);
      this.sql.exec("UPDATE users SET owned = ?, frag = frag - ? WHERE token = ?", JSON.stringify([...owned]), FRAG_COST, u.token);
      return json({ profile: this.profile(this.user(u.token)) });
    }

    if (path === "wish") {
      const v = body.v;
      if (!VILLAGES.includes(v) || !PRESETS[v].includes(body.preset)) return json({ error: "bad_wish" }, 400);
      const c = cleanText(body.text, 20);
      if (!c.ok) return json({ error: "bad_text", why: c.why }, 400);
      this.sql.exec("INSERT INTO wishes (v, uid, preset, text, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(v, uid) DO UPDATE SET preset = excluded.preset, text = excluded.text, at = excluded.at", v, u.uid, body.preset, c.text, new Date().toISOString());
      return json({ ok: true });
    }

    if (path === "letter") {
      const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (!text) return json({ error: "empty" }, 400);
      this.sql.exec("INSERT INTO letters (uid, text, at) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET text = excluded.text, at = excluded.at", u.uid, text, new Date().toISOString());
      return json({ ok: true });
    }

    return json({ error: "not_found" }, 404);
  }
}

export class Room extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.name = null; }

  async fetch(request) {
    this.name = new URL(request.url).searchParams.get("room");
    const live = this.ctx.getWebSockets().filter((w) => w.deserializeAttachment()?.uid);
    if (live.length >= ROOM_CAP) return new Response("full", { status: 503 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ room: this.name, peer: hex(6), uid: null, nick: null, p: null, last: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(msg, except) { const s = JSON.stringify(msg); for (const w of this.ctx.getWebSockets()) { if (w === except || !w.deserializeAttachment()?.uid) continue; try { w.send(s); } catch {} } }
  async report() {
    const a = this.ctx.getWebSockets().map((w) => w.deserializeAttachment()).filter((x) => x?.uid);
    const room = a[0]?.room || this.name; if (room) await hub(this.env).roomCount(room, a.length);
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 1024) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment(); if (!me) return;
    if (m.t === "auth") {
      const who = await hub(this.env).whois(String(m.token || ""));
      if (!who) { ws.close(4001, "no_user"); return; }
      me.uid = who.uid; me.nick = who.nick; ws.serializeAttachment(me);
      const peers = this.ctx.getWebSockets().map((w) => w.deserializeAttachment()).filter((x) => x?.uid && x.peer !== me.peer && x.p).map((x) => ({ peer: x.peer, d: { ...x.p, n: x.nick } }));
      ws.send(JSON.stringify({ t: "hi", peer: me.peer, peers }));
      await this.report();
      return;
    }
    if (!me.uid) return;
    const now = Date.now();
    if (m.t === "p") { // 내 위치·표정·꾸미기 (서버가 이름을 붙여서 돌림)
      if (now - me.last < 80) return;
      const d = m.d || {};
      const p = { x: clamp(d.x), z: clamp(d.z), r: Number(d.r) || 0, h: Math.max(0, Math.min(6, d.h | 0)), s: !!d.s, e: typeof d.e === "string" ? d.e.slice(0, 4) : "", et: Number(d.et) || 0, k: /^\d{6}$/.test(String(d.k)) ? String(d.k) : "000000" };
      me.p = p; me.last = now; ws.serializeAttachment(me);
      this.broadcast({ t: "p", peer: me.peer, d: { ...p, n: me.nick } }, ws);
    } else if (m.t === "ball") {
      const d = m.d || {};
      if (![d.fx, d.fz, d.tx, d.tz].every(Number.isFinite)) return;
      this.broadcast({ t: "ball", peer: me.peer, d: { fx: clamp(d.fx), fz: clamp(d.fz), tx: clamp(d.tx), tz: clamp(d.tz), n: me.nick } }, ws);
    } else if (m.t === "bell") {
      this.broadcast({ t: "bell", peer: me.peer }, ws);
    }
  }
  async webSocketClose(ws) { const me = ws.deserializeAttachment(); if (me?.uid) this.broadcast({ t: "leave", peer: me.peer }, ws); await this.report(); }
  async webSocketError(ws) { await this.webSocketClose(ws); }
}
const clamp = (v) => Math.max(-30, Math.min(30, Number(v) || 0));
