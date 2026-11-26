import Peer, { type DataConnection, type PeerOptions } from 'peerjs';

/**
 * 다른 사람 도시 구경: one player shows their city under a short code, and friends who type the
 * code see it as it is now, kept up to date while they watch. The browsers talk directly (WebRTC);
 * a free public broker only introduces them, as in 셋모아 쑥쑥. Visitors only look: what they see
 * is a copy, never saved and never sent back.
 */

type Msg = { t: 'city'; z: string; host: string } | { t: 'bye' };

const PREFIX = 'naedosi-city-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function peerOptions(): PeerOptions {
  const q = new URLSearchParams(location.search).get('peer');
  const base = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  if (!q) return base;
  const [host, port] = q.split(':');
  return { ...base, host, port: +(port || 9000), path: '/', secure: false };
}

const errText = (type?: string) =>
  type === 'peer-unavailable' ? '그 코드로 열린 도시가 없어요. 코드를 다시 확인해 주세요.'
  : type === 'network' || type === 'server-error' || type === 'socket-error' ? '연결 서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.'
  : type === 'browser-incompatible' ? '이 브라우저는 친구와 연결할 수 없어요.'
  : '연결하지 못했어요. 잠시 후 다시 해 주세요.';

/** Showing my city: friends connect with the code and get the city now and again as it changes. */
export class Showcase {
  private peer: Peer | null = null;
  private conns = new Set<DataConnection>();
  code = '';
  onCount: ((n: number) => void) | null = null;

  constructor(private snapshot: () => { z: string; host: string }) {}

  get viewers() { return this.conns.size; }

  open(): Promise<string> {
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
        peer.on('connection', (c) => {
          c.on('open', () => {
            this.conns.add(c);
            this.onCount?.(this.conns.size);
            c.send({ t: 'city', ...this.snapshot() } satisfies Msg);
          });
          const gone = () => { if (this.conns.delete(c)) this.onCount?.(this.conns.size); };
          c.on('close', gone);
          c.on('error', gone);
        });
      };
      tryOpen(3);
    });
  }

  /** Send the city as it is now to everyone watching. */
  push() {
    if (!this.conns.size) return;
    const m: Msg = { t: 'city', ...this.snapshot() };
    for (const c of this.conns) if (c.open) c.send(m);
  }

  close() {
    for (const c of this.conns) { try { c.send({ t: 'bye' } satisfies Msg); } catch { /* gone */ } }
    setTimeout(() => { this.peer?.destroy(); this.peer = null; }, 300);
    this.conns.clear();
  }
}

/** Visit a friend's city by its code. `onCity` gets each copy of it; `onEnd` when the friend stops. */
export function visit(code: string, onCity: (z: string, host: string) => void, onEnd: (why: string) => void): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerOptions());
    let got = false;
    const stop = () => { try { peer.destroy(); } catch { /* gone */ } };
    peer.on('error', (e: { type?: string }) => { if (!got) { stop(); reject(new Error(errText(e.type))); } });
    peer.on('open', () => {
      const c = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true });
      const timer = setTimeout(() => { if (!got) { stop(); reject(new Error('친구 도시에서 답이 없어요. 코드를 다시 확인해 주세요.')); } }, 20000);
      c.on('data', (raw) => {
        const m = raw as Msg;
        if (m.t === 'city') {
          onCity(m.z, m.host);
          if (!got) { got = true; clearTimeout(timer); resolve(stop); }
        }
        if (m.t === 'bye') { stop(); onEnd('친구가 도시 보여주기를 끝냈어요.'); }
      });
      c.on('close', () => { if (got) onEnd('친구 도시와 연결이 끊겼어요.'); });
    });
  });
}
