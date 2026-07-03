import type { Server, Socket } from 'socket.io';
import type { Mode, Role, SubmittedAction } from '@iwj/shared';
import { ALL_ROLES, EV } from '@iwj/shared';
import { GameRoom } from './engine/GameRoom.js';

export const rooms = new Map<string, GameRoom>();
const sessions = new Map<string, string>(); // token -> roomCode

function makeCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  } while (rooms.has(code));
  return code;
}

type Ack = (res: Record<string, unknown>) => void;
const ok = (ack: Ack | undefined, extra: Record<string, unknown> = {}) => ack?.({ ok: true, ...extra });
const fail = (ack: Ack | undefined, error: string) => ack?.({ ok: false, error });

export function registerSockets(io: Server): void {
  const pushViews = (room: GameRoom) => {
    for (const m of room.members) {
      if (m.socketId) io.to(m.socketId).emit(EV.VIEW, room.buildView(m));
    }
  };

  io.on('connection', (socket: Socket) => {
    let myRoom: GameRoom | null = null;
    let myToken: string | null = null;

    const bind = (room: GameRoom, token: string) => {
      myRoom = room;
      myToken = token;
      const m = room.byToken(token);
      if (m) m.socketId = socket.id;
      sessions.set(token, room.code);
    };

    socket.on(EV.CREATE, (payload: { mode: Mode; name: string; role?: Role }, ack: Ack) => {
      const mode: Mode = payload?.mode === 'demo' ? 'demo' : 'real';
      const room = new GameRoom(makeCode(), mode);
      room.onChange = () => pushViews(room);
      rooms.set(room.code, room);
      const host = room.addMember((payload?.name || '').slice(0, 40), { isHost: true });
      bind(room, host.token);
      if (mode === 'demo') {
        const role = payload?.role && ALL_ROLES.includes(payload.role) ? payload.role : 'journalist_1';
        room.claimRole(host.token, role);
        const err = room.start(host.token, true);
        if (err) return fail(ack, err);
      }
      ok(ack, { roomCode: room.code, token: host.token });
      pushViews(room);
    });

    socket.on(EV.JOIN, (payload: { roomCode: string; name: string }, ack: Ack) => {
      const room = rooms.get((payload?.roomCode || '').toUpperCase().trim());
      if (!room) return fail(ack, 'room not found');
      if (room.phase !== 'lobby') return fail(ack, 'game already started');
      if (room.members.filter(m => !m.isAi).length >= 5) return fail(ack, 'room is full');
      const m = room.addMember((payload?.name || '').slice(0, 40));
      bind(room, m.token);
      ok(ack, { token: m.token });
      pushViews(room);
    });

    socket.on(EV.RESUME, (payload: { token: string }, ack: Ack) => {
      const code = sessions.get(payload?.token);
      const room = code ? rooms.get(code) : undefined;
      const m = room?.byToken(payload?.token);
      if (!room || !m) return fail(ack, 'session not found');
      bind(room, payload.token);
      ok(ack);
      socket.emit(EV.VIEW, room.buildView(m));
      pushViews(room);
    });

    socket.on(EV.CLAIM, (payload: { role: Role }, ack: Ack) => {
      if (!myRoom || !myToken) return fail(ack, 'not in a room');
      const err = myRoom.claimRole(myToken, payload?.role);
      err ? fail(ack, err) : ok(ack);
    });

    socket.on(EV.START, (payload: { fillAi?: boolean }, ack: Ack) => {
      if (!myRoom || !myToken) return fail(ack, 'not in a room');
      const err = myRoom.start(myToken, payload?.fillAi ?? false);
      err ? fail(ack, err) : ok(ack);
    });

    socket.on(EV.READY, (_payload: unknown, ack: Ack) => {
      if (!myRoom || !myToken) return fail(ack, 'not in a room');
      myRoom.setReady(myToken);
      ok(ack);
    });

    socket.on(EV.ACTION, (payload: SubmittedAction, ack: Ack) => {
      if (!myRoom || !myToken) return fail(ack, 'not in a room');
      const err = myRoom.submitAction(myToken, { choices: payload?.choices ?? {}, freeText: payload?.freeText ?? '' });
      err ? fail(ack, err) : ok(ack);
    });

    socket.on(EV.INTERVIEW, (payload: { text: string }, ack: Ack) => {
      if (!myRoom || !myToken) return fail(ack, 'not in a room');
      const err = myRoom.submitInterviewReply(myToken, payload?.text ?? '');
      err ? fail(ack, err) : ok(ack);
    });

    socket.on(EV.FORCESKIP, (_payload: unknown, ack: Ack) => {
      if (!myRoom || !myToken) return fail(ack, 'not in a room');
      const err = myRoom.forceSkip(myToken);
      err ? fail(ack, err) : ok(ack);
    });

    socket.on('disconnect', () => {
      if (myRoom && myToken) {
        const m = myRoom.byToken(myToken);
        if (m && m.socketId === socket.id) m.socketId = null;
        pushViews(myRoom);
      }
    });
  });
}
