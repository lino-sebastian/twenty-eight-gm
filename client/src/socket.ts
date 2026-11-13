import { io, Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';

export type GameSocket = Socket<ServerToClient, ClientToServer>;

export const socket: GameSocket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

function randomToken() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: fine, the token just won't survive a reload */
  }
}

let memoryToken: string | null = null;

/** A secret per-browser token so a reload or dropped connection gets the same seat back. */
export function playerToken(): string {
  const existing = storageGet('t28.token') ?? memoryToken;
  if (existing) return existing;
  const t = randomToken();
  memoryToken = t;
  storageSet('t28.token', t);
  return t;
}

export const savedName = () => storageGet('t28.name') ?? '';
export const saveName = (n: string) => storageSet('t28.name', n);
