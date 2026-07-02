import { io, Socket } from 'socket.io-client';
import { EV } from '@iwj/shared';
import type { Mode, Role, SubmittedAction } from '@iwj/shared';

/** Shape of every C→S ack. Create/join additionally return roomCode/token. */
export interface Ack {
  ok: boolean;
  error?: string;
  roomCode?: string;
  token?: string;
}

/** Singleton socket — same origin; vite proxies /socket.io to the server. */
export const socket: Socket = io();

const ACK_TIMEOUT_MS = 15000;

function emitAck(event: string, payload: unknown): Promise<Ack> {
  return new Promise((resolve) => {
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit(event, payload, (err: Error | null, res: Ack | undefined) => {
        if (err || !res) resolve({ ok: false, error: 'No response from server.' });
        else resolve(res);
      });
  });
}

export const createRoom = (payload: { mode: Mode; name: string; role?: Role }) =>
  emitAck(EV.CREATE, payload);

export const joinRoom = (payload: { roomCode: string; name: string }) =>
  emitAck(EV.JOIN, payload);

export const claimRole = (role: Role) => emitAck(EV.CLAIM, { role });

export const startGame = () => emitAck(EV.START, { fillAi: true });

export const sendReady = () => emitAck(EV.READY, {});

export const submitAction = (action: SubmittedAction) => emitAck(EV.ACTION, action);

export const resumeSession = (token: string) => emitAck(EV.RESUME, { token });

export const forceSkip = () => emitAck(EV.FORCESKIP, {});

// ---- session persistence (key namespaced by room code) ----

const KEY_PREFIX = 'iwj:session:';
const LAST_ROOM_KEY = 'iwj:lastRoom';

export interface SavedSession {
  token: string;
  roomCode: string;
}

export function saveSession(roomCode: string, token: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + roomCode, JSON.stringify({ token, roomCode }));
    localStorage.setItem(LAST_ROOM_KEY, roomCode);
  } catch {
    /* storage unavailable — resume just won't work */
  }
}

export function loadSession(): SavedSession | null {
  try {
    const roomCode = localStorage.getItem(LAST_ROOM_KEY);
    if (!roomCode) return null;
    const raw = localStorage.getItem(KEY_PREFIX + roomCode);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as SavedSession).token === 'string' &&
      typeof (parsed as SavedSession).roomCode === 'string'
    ) {
      return parsed as SavedSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    const roomCode = localStorage.getItem(LAST_ROOM_KEY);
    if (roomCode) localStorage.removeItem(KEY_PREFIX + roomCode);
    localStorage.removeItem(LAST_ROOM_KEY);
  } catch {
    /* ignore */
  }
}
