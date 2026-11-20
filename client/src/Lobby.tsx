import { useState } from 'react';
import type { Seat } from '../../shared/game';
import type { StatePayload } from '../../shared/protocol';
import { socket } from './socket';
import { VoiceControls, useVoice } from './voice';
import { LobbyMusic } from './music';

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

  const canEditTeam = (t: number) => you.isHost || (you.seat !== null && you.seat % 2 === t);

  const seatTile = (seat: Seat) => {
    const s = room.seats[seat];
    const mine = s.kind === 'human' && s.playerId === you.id;
    const offline = s.kind === 'human' && !s.connected;
    const initial = s.kind === 'human' ? s.name.trim().charAt(0).toUpperCase() || '?' : '';
    return (
      <div key={seat} className={`seat-tile seat-${seat} team-${seat % 2}${mine ? ' mine' : ''}${s.kind === 'empty' ? ' empty' : ''}`}>
        <div className={`avatar${offline ? ' offline' : ''}`}>{s.kind === 'bot' ? '🤖' : s.kind === 'human' ? initial : '+'}</div>
        <div className="seat-body">
          <div className="seat-name">
            {s.kind === 'empty' ? <span className="muted">Open seat</span> : s.kind === 'bot' ? s.name : s.name}
            {mine && <span className="you-pill">you</span>}
          </div>
          <div className="seat-tags">
            <span className="muted">Seat {seat + 1}</span>
            {s.kind === 'human' && room.hostId === s.playerId && <span className="tag">host</span>}
            {s.kind === 'human' && room.voice.includes(s.playerId) && <span className="tag voice">🎤</span>}
            {offline && <span className="tag warn">offline</span>}
          </div>
          <div className="seat-actions">
            {s.kind === 'empty' && (
              <>
                <button type="button" onClick={() => socket.emit('sit', { seat }, ack(onError))}>
                  Sit
                </button>
                <button type="button" onClick={() => socket.emit('addBot', { seat }, ack(onError))}>
                  + Bot
                </button>
              </>
            )}
            {s.kind === 'bot' && (
              <button type="button" onClick={() => socket.emit('clearSeat', { seat }, ack(onError))}>
                Remove
              </button>
            )}
            {mine && (
              <button type="button" onClick={() => socket.emit('standUp', ack(onError))}>
                Stand up
              </button>
            )}
            {offline && (
              <button type="button" onClick={() => socket.emit('addBot', { seat }, ack(onError))}>
                Replace with bot
              </button>
            )}
            {s.kind === 'human' && !mine && !offline && you.isHost && (
              <button type="button" onClick={() => socket.emit('clearSeat', { seat }, ack(onError))}>
                To watchers
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const seated = room.seats.filter((s) => s.kind !== 'empty').length;

  return (
    <main className="lobby">
      <header className="lobby-hero">
        <div className="hero-left">
          <div className="hero-logo">28</div>
          <div>
            <div className="hero-kicker">Game room</div>
            <button type="button" className="room-code" onClick={() => copy('code')} title="Copy room code">
              {room.code}
              <span className="copy-hint">{copied === 'code' ? '✓ copied' : 'copy'}</span>
            </button>
          </div>
        </div>
        <div className="hero-actions">
          <LobbyMusic />
          <VoiceControls voice={voice} count={room.voice.length} />
          <button type="button" className="small-btn" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <section className="glass invite">
        <div className="glass-title">Invite friends</div>
        <div className="invite-row">
          <code className="invite-link">{link}</code>
          <button type="button" className="primary" onClick={() => copy('link')}>
            {copied === 'link' ? '✓ Copied' : 'Copy link'}
          </button>
          {canShare && (
            <button type="button" onClick={share}>
              Share…
            </button>
          )}
        </div>
      </section>

      <section className="glass">
        <div className="glass-title row-between">
          <span>Seats</span>
          <span className="muted small">{seated}/4 ready</span>
        </div>
        <div className="team-chips">
          {[0, 1].map((t) => (
            <div key={t} className={`team-chip team-${t}`}>
              <span className="dot" />
              <TeamName team={t as 0 | 1} name={room.teamNames[t]} editable={canEditTeam(t)} onError={onError} />
              <span className="muted small">seats {t + 1} & {t + 3}</span>
            </div>
          ))}
        </div>
        <div className="seat-map">
          <div className="mini-table" aria-hidden>
            <span>28</span>
          </div>
          {([0, 1, 2, 3] as Seat[]).map(seatTile)}
        </div>
        <p className="muted small center">Partners sit opposite each other. Play passes to the right. Anyone can add a bot to an open seat.</p>
        {watchers.length > 0 && (
          <p className="muted small center">Watching: {watchers.map((w) => w.name + (w.connected ? '' : ' (offline)')).join(', ')}</p>
        )}
      </section>

      <details className="glass settings" open={you.isHost}>
        <summary className="glass-title">Rules for this room</summary>
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
      </details>

      <div className="start-bar">
        {you.isHost ? (
          <button type="button" className="primary big start-btn" disabled={!full} onClick={() => socket.emit('startGame', ack(onError))}>
            {full ? 'Deal the cards ▶' : `Waiting for ${4 - seated} more (or add bots)`}
          </button>
        ) : (
          <p className="muted center waiting">Waiting for the host to start the game…</p>
        )}
      </div>
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
