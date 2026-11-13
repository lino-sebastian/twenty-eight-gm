import { useState } from 'react';
import type { Seat } from '../../shared/game';
import type { StatePayload } from '../../shared/protocol';
import { socket } from './socket';

const TEAM_NAMES = ['Team A', 'Team B'];

export function ack(onError: (m: string) => void) {
  return (res: { ok: boolean; error?: string }) => {
    if (!res.ok && res.error) onError(res.error);
  };
}

export function Lobby({ state, onError, onLeave }: { state: StatePayload; onError: (m: string) => void; onLeave: () => void }) {
  const { room, you } = state;
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/r/${room.code}`;
  const full = room.seats.every((s) => s.kind !== 'empty');
  const watchers = room.players.filter((p) => p.seat === null);

  const copy = async () => {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: '28 Card Game', text: `Join my 28 game. Room code ${room.code}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user cancelled share */
    }
  };

  const seatCard = (seat: Seat) => {
    const s = room.seats[seat];
    const mine = s.kind === 'human' && s.playerId === you.id;
    return (
      <div key={seat} className={`seat-card team-${seat % 2}${mine ? ' mine' : ''}`}>
        <div className="seat-label">Seat {seat + 1}</div>
        {s.kind === 'empty' && (
          <>
            <div className="seat-name muted">Empty</div>
            <div className="seat-actions">
              <button onClick={() => socket.emit('sit', { seat }, ack(onError))}>Sit here</button>
              {you.isHost && <button onClick={() => socket.emit('addBot', { seat }, ack(onError))}>Add bot</button>}
            </div>
          </>
        )}
        {s.kind === 'bot' && (
          <>
            <div className="seat-name">🤖 {s.name}</div>
            {you.isHost && (
              <div className="seat-actions">
                <button onClick={() => socket.emit('clearSeat', { seat }, ack(onError))}>Remove</button>
              </div>
            )}
          </>
        )}
        {s.kind === 'human' && (
          <>
            <div className="seat-name">
              {s.name}
              {mine && ' (you)'}
              {room.hostId === s.playerId && <span className="tag">host</span>}
              {!s.connected && <span className="tag warn">offline</span>}
            </div>
            <div className="seat-actions">
              {mine && <button onClick={() => socket.emit('standUp', ack(onError))}>Stand up</button>}
              {!mine && you.isHost && <button onClick={() => socket.emit('clearSeat', { seat }, ack(onError))}>Move to watchers</button>}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <main className="lobby">
      <header className="lobby-head">
        <div>
          <div className="muted">Room code</div>
          <div className="room-code">{room.code}</div>
        </div>
        <div className="row">
          <button className="primary" onClick={copy}>
            {copied ? 'Link copied' : 'Invite players'}
          </button>
          <button onClick={onLeave}>Leave</button>
        </div>
      </header>
      <p className="muted small">
        Share this link: <code>{link}</code>
      </p>

      <div className="teams">
        {[0, 1].map((t) => (
          <section key={t} className="team">
            <h2>{TEAM_NAMES[t]}</h2>
            <p className="muted small">Partners sit opposite each other.</p>
            {([t, t + 2] as Seat[]).map(seatCard)}
          </section>
        ))}
      </div>

      {watchers.length > 0 && (
        <p className="muted">
          Watching: {watchers.map((w) => w.name + (w.connected ? '' : ' (offline)')).join(', ')}
        </p>
      )}

      <section className="panel settings">
        <h2>Rules for this room</h2>
        <label className="field inline">
          Minimum opening bid
          <select
            value={room.settings.minBid}
            disabled={!you.isHost}
            onChange={(e) => socket.emit('updateSettings', { minBid: Number(e.target.value) }, ack(onError))}
          >
            {[14, 15, 16].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field inline">
          Game points to win the match
          <select
            value={room.settings.targetScore}
            disabled={!you.isHost}
            onChange={(e) => socket.emit('updateSettings', { targetScore: Number(e.target.value) }, ack(onError))}
          >
            {[3, 6, 10, 12, 15, 21].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field inline check">
          <input
            type="checkbox"
            checked={room.settings.lastTrickBonus}
            disabled={!you.isHost}
            onChange={(e) => socket.emit('updateSettings', { lastTrickBonus: e.target.checked }, ack(onError))}
          />
          1 extra point for the last trick
        </label>
        {!you.isHost && <p className="muted small">Only the host can change the rules.</p>}
      </section>

      {you.isHost ? (
        <button className="primary big" disabled={!full} onClick={() => socket.emit('startGame', ack(onError))}>
          {full ? 'Start game' : 'Fill all 4 seats to start'}
        </button>
      ) : (
        <p className="muted center">Waiting for the host to start the game…</p>
      )}
    </main>
  );
}
