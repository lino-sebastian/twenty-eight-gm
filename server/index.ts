import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { Action, Seat } from '../shared/game.js';
import type { Ack, ClientToServer, ServerToClient } from '../shared/protocol.js';
import { RoomError, RoomManager } from './rooms.js';

const PORT = Number(process.env.PORT ?? 3001);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'client', 'dist');

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: true } });

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

if (existsSync(dist)) {
  app.use(express.static(dist));
  // Invite links such as /r/ABCDE are handled by the client.
  app.get(/^\/(?!socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const rooms = new RoomManager({
  state: (socketId, payload) => io.to(socketId).emit('state', payload),
  voicePeerLeft: (socketId, peer) => io.to(socketId).emit('voicePeerLeft', { socketId: peer }),
});

const isSeat = (s: unknown): s is Seat => s === 0 || s === 1 || s === 2 || s === 3;

/** Run a handler and turn errors into an ack the client can show. */
function handle<T extends object>(ack: Ack<T> | undefined, fn: () => T | void) {
  try {
    const result = fn();
    ack?.({ ok: true, ...(result ?? {}) } as { ok: true } & T);
  } catch (e) {
    const error = e instanceof RoomError ? e.message : 'Something went wrong.';
    if (!(e instanceof RoomError)) console.error(e);
    ack?.({ ok: false, error });
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', (p, ack) =>
    handle(ack, () => {
      if (typeof p?.token !== 'string' || p.token.length < 8) throw new RoomError('Missing player token.');
      const room = rooms.createRoom(socket.id, String(p.name ?? ''), p.token);
      return { code: room.code };
    }),
  );
  socket.on('joinRoom', (p, ack) =>
    handle(ack, () => {
      if (typeof p?.token !== 'string' || p.token.length < 8) throw new RoomError('Missing player token.');
      const room = rooms.joinRoom(socket.id, String(p.code ?? ''), String(p.name ?? ''), p.token);
      return { code: room.code };
    }),
  );
  socket.on('leaveRoom', (ack) => handle(ack, () => rooms.leave(socket.id)));
  socket.on('sit', (p, ack) =>
    handle(ack, () => {
      if (!isSeat(p?.seat)) throw new RoomError('Bad seat.');
      rooms.sit(socket.id, p.seat);
    }),
  );
  socket.on('standUp', (ack) => handle(ack, () => rooms.standUp(socket.id)));
  socket.on('addBot', (p, ack) =>
    handle(ack, () => {
      if (!isSeat(p?.seat)) throw new RoomError('Bad seat.');
      rooms.addBot(socket.id, p.seat);
    }),
  );
  socket.on('clearSeat', (p, ack) =>
    handle(ack, () => {
      if (!isSeat(p?.seat)) throw new RoomError('Bad seat.');
      rooms.clearSeat(socket.id, p.seat);
    }),
  );
  socket.on('updateSettings', (p, ack) => handle(ack, () => rooms.updateSettings(socket.id, p ?? {})));
  socket.on('startGame', (ack) => handle(ack, () => rooms.startGame(socket.id)));
  socket.on('endGame', (ack) => handle(ack, () => rooms.endGame(socket.id)));
  socket.on('action', (p, ack) =>
    handle(ack, () => {
      if (!p || typeof p !== 'object' || typeof (p as Action).type !== 'string') throw new RoomError('Bad action.');
      rooms.action(socket.id, p);
    }),
  );
  socket.on('setTeamName', (p, ack) =>
    handle(ack, () => {
      if ((p?.team !== 0 && p?.team !== 1) || typeof p.name !== 'string') throw new RoomError('Bad team name.');
      rooms.setTeamName(socket.id, p.team, p.name);
    }),
  );
  socket.on('voiceJoin', (ack) => handle(ack, () => ({ peers: rooms.voiceJoin(socket.id) })));
  socket.on('voiceLeave', () => rooms.voiceLeave(socket.id));
  socket.on('voiceSignal', (p) => {
    if (!p || typeof p.to !== 'string' || !p.signal) return;
    if (!rooms.canSignal(socket.id, p.to)) return;
    io.to(p.to).emit('voiceSignal', { from: socket.id, signal: p.signal });
  });
  socket.on('disconnect', () => rooms.disconnect(socket.id));
});

http.listen(PORT, () => {
  const mode = existsSync(dist) ? 'serving the built app' : 'API only (run the client with `npm run dev`)';
  console.log(`28 server listening on http://localhost:${PORT} - ${mode}`);
});
