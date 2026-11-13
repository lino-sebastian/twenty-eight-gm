import { randomBytes, randomUUID } from 'node:crypto';
import { chooseBotAction } from '../shared/bot.js';
import {
  Action,
  DEFAULT_SETTINGS,
  GameError,
  MatchState,
  SEATS,
  Seat,
  Settings,
  applyAction,
  newMatch,
  viewFor,
} from '../shared/game.js';
import type { RoomInfo, SeatInfo, StatePayload } from '../shared/protocol.js';

/** How long a dropped player's seat is held before a bot plays for them. */
export const RECONNECT_GRACE_MS = 60_000;
export const BOT_DELAY_MS = 900;
/** Extra pause after a trick completes, so people can see it. */
export const TRICK_PAUSE_MS = 1_400;
export const AUTO_NEXT_HAND_MS = 12_000;
/** Remove rooms nobody has been connected to for this long. */
export const IDLE_ROOM_MS = 30 * 60_000;

const BOT_NAMES = ['Bot Appu', 'Bot Kunju', 'Bot Mani', 'Bot Chinnu'];

type Occupant = { kind: 'human'; playerId: string } | { kind: 'bot'; name: string } | null;

interface Player {
  /** Public id, shown to other clients. */
  id: string;
  /** Secret token the browser keeps, used to reclaim a seat after a reload. */
  token: string;
  name: string;
  socketIds: Set<string>;
  dropTimer: NodeJS.Timeout | null;
}

export interface Room {
  code: string;
  hostId: string;
  settings: Settings;
  players: Map<string, Player>;
  seats: Occupant[];
  /** Seats whose human dropped out long enough that a bot now plays for them. */
  botPlaying: Set<Seat>;
  match: MatchState | null;
  timer: NodeJS.Timeout | null;
  emptySince: number | null;
}

export type Emit = (socketId: string, payload: StatePayload) => void;

export class RoomError extends Error {}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  rooms = new Map<string, Room>();
  /** socket id -> [room code, player id] */
  private sockets = new Map<string, { code: string; playerId: string }>();

  constructor(private emit: Emit) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(5);
      const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  createRoom(socketId: string, name: string, token: string): Room {
    this.leave(socketId);
    const code = this.newCode();
    const room: Room = {
      code,
      hostId: '',
      settings: { ...DEFAULT_SETTINGS },
      players: new Map(),
      seats: [null, null, null, null],
      botPlaying: new Set(),
      match: null,
      timer: null,
      emptySince: null,
    };
    this.rooms.set(code, room);
    const player = this.attach(room, socketId, name, token);
    room.hostId = player.id;
    room.seats[0] = { kind: 'human', playerId: player.id };
    this.broadcast(room);
    return room;
  }

  joinRoom(socketId: string, code: string, name: string, token: string): Room {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) throw new RoomError('No room with that code. Check the code or ask for a new link.');
    const current = this.sockets.get(socketId);
    if (current && current.code !== room.code) this.leave(socketId);
    const player = this.attach(room, socketId, name, token);
    // Sit new players in the first free seat while in the lobby.
    if (!room.match && this.seatOf(room, player.id) === null) {
      const free = SEATS.find((s) => room.seats[s] === null);
      if (free !== undefined) room.seats[free] = { kind: 'human', playerId: player.id };
    }
    this.broadcast(room);
    this.schedule(room);
    return room;
  }

  private attach(room: Room, socketId: string, name: string, token: string): Player {
    const cleanName = name.trim().slice(0, 20) || 'Player';
    let player = [...room.players.values()].find((p) => p.token === token);
    if (!player) {
      player = { id: randomUUID().slice(0, 8), token, name: cleanName, socketIds: new Set(), dropTimer: null };
      room.players.set(player.id, player);
    } else {
      player.name = cleanName;
    }
    player.socketIds.add(socketId);
    if (player.dropTimer) {
      clearTimeout(player.dropTimer);
      player.dropTimer = null;
    }
    const seat = this.seatOf(room, player.id);
    if (seat !== null) room.botPlaying.delete(seat);
    room.emptySince = null;
    this.sockets.set(socketId, { code: room.code, playerId: player.id });
    return player;
  }

  private seatOf(room: Room, playerId: string): Seat | null {
    const s = room.seats.findIndex((o) => o?.kind === 'human' && o.playerId === playerId);
    return s < 0 ? null : (s as Seat);
  }

  private ctx(socketId: string) {
    const ref = this.sockets.get(socketId);
    if (!ref) throw new RoomError('You are not in a room.');
    const room = this.rooms.get(ref.code);
    const player = room?.players.get(ref.playerId);
    if (!room || !player) throw new RoomError('You are not in a room.');
    return { room, player, seat: this.seatOf(room, player.id), isHost: room.hostId === player.id };
  }

  private requireHost(socketId: string) {
    const c = this.ctx(socketId);
    if (!c.isHost) throw new RoomError('Only the host can do that.');
    return c;
  }

  private requireLobby(room: Room) {
    if (room.match) throw new RoomError('The game has started.');
  }

  sit(socketId: string, seat: Seat) {
    const { room, player } = this.ctx(socketId);
    this.requireLobby(room);
    if (room.seats[seat] !== null) throw new RoomError('That seat is taken.');
    const old = this.seatOf(room, player.id);
    if (old !== null) room.seats[old] = null;
    room.seats[seat] = { kind: 'human', playerId: player.id };
    this.broadcast(room);
  }

  standUp(socketId: string) {
    const { room, seat } = this.ctx(socketId);
    this.requireLobby(room);
    if (seat !== null) room.seats[seat] = null;
    this.broadcast(room);
  }

  addBot(socketId: string, seat: Seat) {
    const { room } = this.requireHost(socketId);
    this.requireLobby(room);
    if (room.seats[seat] !== null) throw new RoomError('That seat is taken.');
    room.seats[seat] = { kind: 'bot', name: BOT_NAMES[seat] };
    this.broadcast(room);
  }

  clearSeat(socketId: string, seat: Seat) {
    const { room } = this.requireHost(socketId);
    this.requireLobby(room);
    room.seats[seat] = null;
    this.broadcast(room);
  }

  updateSettings(socketId: string, patch: Partial<Settings>) {
    const { room } = this.requireHost(socketId);
    this.requireLobby(room);
    const s = { ...room.settings };
    if (patch.minBid !== undefined) {
      if (![14, 15, 16].includes(patch.minBid)) throw new RoomError('Minimum bid must be 14, 15 or 16.');
      s.minBid = patch.minBid;
    }
    if (patch.targetScore !== undefined) {
      if (!Number.isInteger(patch.targetScore) || patch.targetScore < 1 || patch.targetScore > 50)
        throw new RoomError('Target must be between 1 and 50.');
      s.targetScore = patch.targetScore;
    }
    if (patch.lastTrickBonus !== undefined) s.lastTrickBonus = !!patch.lastTrickBonus;
    room.settings = s;
    this.broadcast(room);
  }

  startGame(socketId: string) {
    const { room } = this.requireHost(socketId);
    this.requireLobby(room);
    if (room.seats.some((o) => o === null)) throw new RoomError('Fill all four seats (add bots if needed) to start.');
    room.match = newMatch(room.settings, Math.floor(Math.random() * 4) as Seat);
    room.botPlaying.clear();
    for (const s of SEATS) {
      const o = room.seats[s];
      if (o?.kind === 'human' && room.players.get(o.playerId)!.socketIds.size === 0) room.botPlaying.add(s);
    }
    this.broadcast(room);
    this.schedule(room);
  }

  endGame(socketId: string) {
    const { room } = this.requireHost(socketId);
    this.stopTimer(room);
    room.match = null;
    room.botPlaying.clear();
    this.broadcast(room);
  }

  action(socketId: string, action: Action) {
    const { room, seat } = this.ctx(socketId);
    if (!room.match) throw new RoomError('The game has not started.');
    if (seat === null) throw new RoomError('You are watching, not playing.');
    this.apply(room, seat, action);
  }

  private apply(room: Room, seat: Seat, action: Action) {
    const before = room.match!;
    try {
      room.match = applyAction(before, seat, action);
    } catch (e) {
      if (e instanceof GameError) throw new RoomError(e.message);
      throw e;
    }
    const trickDone = room.match.hand.tricks.length > before.hand.tricks.length;
    this.broadcast(room);
    this.schedule(room, trickDone ? TRICK_PAUSE_MS : 0);
  }

  private isBotSeat(room: Room, seat: Seat) {
    return room.seats[seat]?.kind === 'bot' || room.botPlaying.has(seat);
  }

  /** Let a bot move if it is a bot's turn, or move on from a finished hand. */
  private schedule(room: Room, extraDelay = 0) {
    this.stopTimer(room);
    const m = room.match;
    if (!m) return;
    const h = m.hand;
    if (h.phase === 'matchOver') return;
    if (h.phase === 'handOver') {
      room.timer = setTimeout(() => {
        room.timer = null;
        if (room.match?.hand.phase === 'handOver') {
          room.match = applyAction(room.match, 0, { type: 'nextHand' });
          this.broadcast(room);
          this.schedule(room);
        }
      }, AUTO_NEXT_HAND_MS);
      return;
    }
    if (!this.isBotSeat(room, h.turn)) return;
    room.timer = setTimeout(() => {
      room.timer = null;
      const cur = room.match;
      if (!cur || !this.isBotSeat(room, cur.hand.turn)) return;
      const action = chooseBotAction(cur, cur.hand.turn);
      if (action) this.apply(room, cur.hand.turn, action);
    }, BOT_DELAY_MS + extraDelay);
  }

  private stopTimer(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
  }

  leave(socketId: string) {
    const ref = this.sockets.get(socketId);
    if (!ref) return;
    this.sockets.delete(socketId);
    const room = this.rooms.get(ref.code);
    const player = room?.players.get(ref.playerId);
    if (!room || !player) return;
    player.socketIds.delete(socketId);
    if (player.socketIds.size > 0) return;
    const seat = this.seatOf(room, player.id);
    if (room.match && seat !== null) {
      // Keep the seat; a bot steps in if they are gone too long.
      room.botPlaying.add(seat);
      this.schedule(room);
    } else {
      if (seat !== null) room.seats[seat] = null;
      room.players.delete(player.id);
    }
    this.afterPlayerGone(room, player.id);
  }

  disconnect(socketId: string) {
    const ref = this.sockets.get(socketId);
    if (!ref) return;
    this.sockets.delete(socketId);
    const room = this.rooms.get(ref.code);
    const player = room?.players.get(ref.playerId);
    if (!room || !player) return;
    player.socketIds.delete(socketId);
    if (player.socketIds.size > 0) return;
    player.dropTimer = setTimeout(() => {
      player.dropTimer = null;
      if (player.socketIds.size > 0) return;
      const seat = this.seatOf(room, player.id);
      if (room.match && seat !== null) {
        room.botPlaying.add(seat);
        this.schedule(room);
      } else if (!room.match) {
        if (seat !== null) room.seats[seat] = null;
        room.players.delete(player.id);
      }
      this.afterPlayerGone(room, player.id);
    }, RECONNECT_GRACE_MS);
    this.broadcast(room);
  }

  private afterPlayerGone(room: Room, playerId: string) {
    const connected = [...room.players.values()].filter((p) => p.socketIds.size > 0);
    if (room.hostId === playerId || !room.players.has(room.hostId)) {
      const seated = connected.find((p) => this.seatOf(room, p.id) !== null);
      if (seated ?? connected[0]) room.hostId = (seated ?? connected[0]).id;
    }
    if (connected.length === 0) room.emptySince = Date.now();
    this.broadcast(room);
  }

  private sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince && now - room.emptySince > IDLE_ROOM_MS) {
        this.stopTimer(room);
        for (const p of room.players.values()) if (p.dropTimer) clearTimeout(p.dropTimer);
        this.rooms.delete(code);
      }
    }
  }

  roomInfo(room: Room): RoomInfo {
    const seats: SeatInfo[] = room.seats.map((o, s) => {
      if (!o) return { kind: 'empty' };
      if (o.kind === 'bot') return { kind: 'bot', name: o.name };
      const p = room.players.get(o.playerId);
      return {
        kind: 'human',
        playerId: o.playerId,
        name: p?.name ?? 'Player',
        connected: !!p && p.socketIds.size > 0,
        botPlaying: room.botPlaying.has(s as Seat),
      };
    });
    return {
      code: room.code,
      hostId: room.hostId,
      settings: room.settings,
      seats,
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        seat: this.seatOf(room, p.id),
        connected: p.socketIds.size > 0,
        isHost: p.id === room.hostId,
      })),
      status: room.match ? 'playing' : 'lobby',
    };
  }

  broadcast(room: Room) {
    const info = this.roomInfo(room);
    for (const p of room.players.values()) {
      const seat = this.seatOf(room, p.id);
      const payload: StatePayload = {
        room: info,
        you: { id: p.id, seat, isHost: p.id === room.hostId },
        game: room.match ? viewFor(room.match, seat) : null,
      };
      for (const sid of p.socketIds) this.emit(sid, payload);
    }
  }
}
