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
  teamNames: [string, string];
  /** Player ids currently in the voice chat. */
  voice: string[];
  /** When the next hand starts by itself (ms since epoch), while a hand result is showing. */
  nextHandAt: number | null;
}

export interface VoicePeer {
  socketId: string;
  playerId: string;
}

/** WebRTC signalling message relayed between two browsers. */
export type VoiceSignal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

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
  setTeamName: (p: { team: 0 | 1; name: string }, ack?: Ack) => void;
  voiceJoin: (ack: Ack<{ peers: VoicePeer[] }>) => void;
  voiceLeave: () => void;
  voiceSignal: (p: { to: string; signal: VoiceSignal }) => void;
}

export interface ServerToClient {
  state: (p: StatePayload) => void;
  kicked: (p: { reason: string }) => void;
  voiceSignal: (p: { from: string; signal: VoiceSignal }) => void;
  voicePeerLeft: (p: { socketId: string }) => void;
}
