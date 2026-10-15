// The live room on start.ng: everyone in the Hangout sees each other move and wave.
// The server side is startng-be app/live.py; message types are described there.
import { getLiveTicket } from './platform.js';

// Close codes from the server.
const BAD_TICKET = 4401;
const ROOM_FULL = 4403;
const REPLACED = 4409;

export class LiveRoom {
  /**
   * handlers: onMessage(msg), onReconnecting(reason), onBlocked(reason) where reason is
   * 'signin' (needs signing in) or 'replaced' (joined again from another tab).
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.ws = null;
    this.tries = 0;
    this.stopped = false;
  }

  async connect() {
    if (this.stopped) return;
    const pass = await getLiveTicket();
    if (!pass) return this.retry('lost');
    if (pass.error) return this.handlers.onBlocked('signin');
    const ws = new WebSocket(`${pass.url}?ticket=${encodeURIComponent(pass.ticket)}`);
    this.ws = ws;
    ws.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'welcome') this.tries = 0;
      this.handlers.onMessage(msg);
    });
    ws.addEventListener('close', (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (e.code === REPLACED) return this.handlers.onBlocked('replaced');
      if (e.code === BAD_TICKET) return this.handlers.onBlocked('signin');
      this.retry(e.code === ROOM_FULL ? 'full' : 'lost');
    });
  }

  retry(reason) {
    if (this.stopped) return;
    const delay = Math.min(15000, 1000 * 2 ** this.tries++);
    this.handlers.onReconnecting(reason);
    setTimeout(() => this.connect(), delay);
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
  }

  rejoin() {
    this.stopped = false;
    this.tries = 0;
    this.connect();
  }
}
