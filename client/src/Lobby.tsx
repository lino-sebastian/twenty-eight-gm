import { useState } from 'react';
import type { Seat } from '../../shared/game';
import type { StatePayload } from '../../shared/protocol';
import { socket } from './socket';
import { VoiceControls, useVoice } from './voice';

export function ack(onError: (m: string) => void) {
  return (res: { ok: boolean; error?: string }) => {
    if (!res.ok && res.error) onError(res.error);
  };
}

export function Lobby({
  state,
  onError,
  onLeave,
  voice,
}: {
  state: StatePayload;
  onError: (m: string) => void;
  onLeave: () => void;
  voice: ReturnType<typeof useVoice>;
}) {
  const { room, you } = state;
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const canShare = typeof navigator.share === 'function';
  const link = `${window.location.origin}/r/${room.code}`;
  const full = room.seats.every((s) => s.kind !== 'empty');
  const watchers = room.players.filter((p) => p.seat === null);

  const copy = async (what: 'link' | 'code') => {
    const text = what === 'link' ? link : room.code;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers or plain-http pages: fall back to a hidden text box.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(what);
    window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
  };

  const share = async () => {
    try {
      await navigator.share({ title: '28 Card Game', text: `Join my 28 game. Room code ${room.code}`, url: link });
    } catch {
      /* cancelled */
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
              {room.voice.includes(s.playerId) && <span className="tag voice" title="In voice chat">🎤</span>}
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
          <VoiceControls voice={voice} count={room.voice.length} />
          <button onClick={onLeave}>Leave</button>
        </div>
      </header>

      <section className="panel invite">
        <h2>Invite players</h2>
        <div className="invite-row">
          <code className="invite-link">{link}</code>
          <button type="button" className="primary" onClick={() => copy('link')}>
            {copied === 'link' ? '✓ Copied' : 'Copy link'}
          </button>
          <button type="button" onClick={() => copy('code')}>
            {copied === 'code' ? '✓ Copied' : 'Copy code'}
          </button>
          {canShare && (
            <button type="button" onClick={share}>
              Share…
            </button>
          )}
        </div>
      </section>

      <div className="teams">
        {[0, 1].map((t) => (
          <section key={t} className={`team team-${t}`}>
            <TeamName
              team={t as 0 | 1}
              name={room.teamNames[t]}
              editable={you.isHost || (you.seat !== null && you.seat % 2 === t)}
              onError={onError}
            />
            <p className="muted small">Partners sit opposite each other.{(you.isHost || (you.seat !== null && you.seat % 2 === t)) && " Tap the name to rename the team."}</p>
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

function TeamName({ team, name, editable, onError }: { team: 0 | 1; name: string; editable: boolean; onError: (m: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null && draft.trim() && draft.trim() !== name) socket.emit('setTeamName', { team, name: draft }, ack(onError));
    setDraft(null);
  };
  if (!editable) return <h2 className="team-title">{name}</h2>;
  return (
    <input
      className="team-title-input"
      aria-label={`Name of team ${team + 1}`}
      value={draft ?? name}
      maxLength={24}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      title="Click to rename your team"
    />
  );
}
