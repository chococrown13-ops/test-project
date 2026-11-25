import Peer, { type DataConnection, type PeerOptions } from 'peerjs';

/**
 * Playing with friends: one browser opens a room (the host) and the others join it by a short code.
 * The browsers talk directly (WebRTC); a free public broker only introduces them. The host keeps the
 * one true game: friends send what they do, the host applies it and sends the state back to all.
 */

/** Messages between host and friends. */
export type Msg =
  | { t: 'hello'; name: string }
  | { t: 'welcome'; seat: number }
  | { t: 'lobby'; names: string[]; count: number; theme: string }
  | { t: 'full' }
  | { t: 'act'; a: unknown }
  | { t: 'ready' }
  | { t: 'done' }
  | { t: 'err'; msg: string }
  | { t: 'state'; g: unknown; ready: number[]; deadline: number }
  | { t: 'fight'; g: unknown; matches: unknown[] }
  | { t: 'left'; seat: number; name: string };

const PREFIX = 'ssmss-room-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Where the broker is: the public one, or (for testing) one named in the address, ?peer=host:port. */
function peerOptions(): PeerOptions {
  const q = new URLSearchParams(location.search).get('peer');
  const base = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  if (!q) return base;
  const [host, port] = q.split(':');
  return { ...base, host, port: +(port || 9000), path: '/', secure: false };
}

export class Room {
  peer: Peer | null = null;
  /** Host: the friends' connections by seat. Friend: the one to the host (seat 0). */
  conns = new Map<number, DataConnection>();
  code = '';
  seat = 0;
  isHost = false;
  names: string[] = [];
  count = 4;
  onMsg: ((m: Msg, from: number) => void) | null = null;
  onClose: ((seat: number) => void) | null = null;
  /** Host: whether the game has started (no one joins after that). */
  started = false;

  /** Open a room; resolves with its code. */
  host(name: string, count: number): Promise<string> {
    this.isHost = true; this.seat = 0; this.names = [name]; this.count = count;
    return new Promise((resolve, reject) => {
      const tryOpen = (left: number) => {
        let code = '';
        for (let k = 0; k < 5; k++) code += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
        const peer = new Peer(PREFIX + code, peerOptions());
        peer.on('open', () => { this.peer = peer; this.code = code; resolve(code); });
        peer.on('error', (e: { type?: string }) => {
          if (e.type === 'unavailable-id' && left > 0) { peer.destroy(); tryOpen(left - 1); return; }
          if (!this.peer) reject(new Error(errText(e.type)));
        });
        peer.on('connection', (c) => this.accept(c));
      };
      tryOpen(3);
    });
  }

  private accept(c: DataConnection) {
    c.on('open', () => {
      c.on('data', (raw) => {
        const m = raw as Msg;
        if (m.t === 'hello') {
          if (this.started || this.names.length >= this.count) { c.send({ t: 'full' } satisfies Msg); setTimeout(() => c.close(), 300); return; }
          const seat = this.names.length;
          this.names.push(String(m.name).slice(0, 10) || `친구${seat}`);
          this.conns.set(seat, c);
          c.send({ t: 'welcome', seat } satisfies Msg);
          this.onMsg?.(m, seat);
          return;
        }
        const seat = [...this.conns].find(([, x]) => x === c)?.[0];
        if (seat !== undefined) this.onMsg?.(m, seat);
      });
      c.on('close', () => {
        const seat = [...this.conns].find(([, x]) => x === c)?.[0];
        if (seat === undefined) return;
        this.conns.delete(seat);
        this.onClose?.(seat);
      });
    });
  }

  /** Join a friend's room by its code. */
  join(code: string, name: string): Promise<number> {
    this.isHost = false;
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      let done = false;
      const fail = (msg: string) => { if (!done) { done = true; reject(new Error(msg)); peer.destroy(); } };
      peer.on('error', (e: { type?: string }) => fail(errText(e.type)));
      peer.on('open', () => {
        this.peer = peer;
        const c = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true });
        const timer = setTimeout(() => fail('방에 들어가지 못했어요. 코드를 확인하거나 잠시 뒤 다시 해 보세요.'), 15000);
        c.on('open', () => c.send({ t: 'hello', name } satisfies Msg));
        c.on('data', (raw) => {
          const m = raw as Msg;
          if (m.t === 'full') { clearTimeout(timer); fail('방이 꽉 찼거나 이미 시작했어요.'); return; }
          if (m.t === 'welcome') { clearTimeout(timer); done = true; this.seat = m.seat; this.code = code; this.conns.set(0, c); resolve(m.seat); }
          this.onMsg?.(m, 0);
        });
        c.on('close', () => { if (done) this.onClose?.(0); });
      });
    });
  }

  /** Host: to everyone. */
  broadcast(m: Msg) { for (const c of this.conns.values()) if (c.open) c.send(m); }
  /** To one seat (a friend to the host is seat 0). */
  send(m: Msg, seat = 0) { const c = this.conns.get(seat); if (c?.open) c.send(m); }

  close() { this.peer?.destroy(); this.peer = null; this.conns.clear(); }
}

function errText(type?: string): string {
  if (type === 'peer-unavailable') return '그 코드의 방이 없어요. 코드를 다시 확인해 주세요.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return '연결 서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.';
  if (type === 'browser-incompatible') return '이 브라우저에서는 친구와 하기를 쓸 수 없어요.';
  return '연결하지 못했어요. 잠시 뒤 다시 해 보세요.';
}
