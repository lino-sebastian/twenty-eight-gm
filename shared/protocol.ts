import type { Action, PlayerView, Seat, Settings } from './game.js';

export type SeatInfo =
  | { kind: 'empty' }
  | { kind: 'human'; playerId: string; name: string; connected: boolean; botPlaying: boolean }
  | { kind: 'bot'; name: string };

export interface RoomPlayer {
  id: string;
  name: string;
  seat: Seat | null;
  connected: boolean;
  isHost: boolean;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  settings: Settings;
  seats: SeatInfo[];
  players: RoomPlayer[];
  status: 'lobby' | 'playing';
}

export interface StatePayload {
  room: RoomInfo;
  you: { id: string; seat: Seat | null; isHost: boolean };
  game: PlayerView | null;
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServer {
  createRoom: (p: { name: string; token: string }, ack: Ack<{ code: string }>) => void;
  joinRoom: (p: { code: string; name: string; token: string }, ack: Ack<{ code: string }>) => void;
  leaveRoom: (ack?: Ack) => void;
  sit: (p: { seat: Seat }, ack?: Ack) => void;
  standUp: (ack?: Ack) => void;
  addBot: (p: { seat: Seat }, ack?: Ack) => void;
  clearSeat: (p: { seat: Seat }, ack?: Ack) => void;
  updateSettings: (p: Partial<Settings>, ack?: Ack) => void;
  startGame: (ack?: Ack) => void;
  endGame: (ack?: Ack) => void;
  action: (p: Action, ack?: Ack) => void;
}

export interface ServerToClient {
  state: (p: StatePayload) => void;
  kicked: (p: { reason: string }) => void;
}
