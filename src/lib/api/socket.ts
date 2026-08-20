// src/lib/api/socket.ts
//
// Full rewrite. The old client used socket.io-client, which speaks the
// Engine.IO handshake/framing protocol. ws.go on the backend is a raw
// gorilla/websocket server with none of that — a Socket.IO client can't
// connect to it at all; the handshake just fails. This is a native
// WebSocket client that speaks ws.go's actual wire format: plain JSON
// frames shaped {"event": "...", "data": {...}}, one-way (server -> client
// only — nothing is ever sent back over this socket; bets/cashouts go
// through the REST endpoints in game.ts).
//
// Event names/payloads also differ from what this client used to expect —
// see hooks.ts for the mapping. Notably the cashout event is named
// "bet:cashout" (not "bet:cashedOut"), and none of the broadcasts include
// a username or betId.
//
// Auth: ws.go's ServeWS doesn't check any token (CheckOrigin always
// returns true, no claims parsing on the upgrade), so the `token` param
// here is currently a no-op — kept for forward compatibility in case the
// backend adds auth later. Every client, logged in or not, gets the same
// public broadcast stream.
//
// Reconnection: native WebSocket has no built-in retry, so this does a
// small manual backoff loop instead of socket.io's.

const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const WS_URL = RAW_API_URL.replace(/^http/, 'ws') + '/ws';

type Listener = (data: any) => void;

class SocketClient {
  private socket: WebSocket | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitlyClosed = false;

  connect(_token?: string) {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.explicitlyClosed = false;
    this.open();
  }

  private open() {
    this.socket = new WebSocket(WS_URL);

    this.socket.onopen = () => {
      console.log('[Socket] Connected');
      this.reconnectAttempts = 0;
    };

    this.socket.onclose = () => {
      console.log('[Socket] Disconnected');
      if (!this.explicitlyClosed) this.scheduleReconnect();
    };

    this.socket.onerror = (err) => {
      console.error('[Socket] Connection error:', err);
    };

    this.socket.onmessage = (msg) => {
      let envelope: { event?: string; data?: any };
      try {
        envelope = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (!envelope.event) return;
      this.emit(envelope.event, envelope.data);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= 5) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  disconnect() {
    this.explicitlyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  on(event: string, callback: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Listener) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  get isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

export const socketClient = new SocketClient();
