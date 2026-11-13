import { useEffect, useRef, useState } from 'react';
import { SUIT_NAMES, SUIT_SYMBOLS, sortHand } from '../../shared/cards';
import type { Action, CompletedTrick, PlayedCard, PlayerView, Seat } from '../../shared/game';
import type { StatePayload } from '../../shared/protocol';
import { CardBack, CardFace } from './cards';
import { ack } from './Lobby';
import { socket } from './socket';

type Pos = 'bottom' | 'right' | 'top' | 'left';
const POSITIONS: Pos[] = ['bottom', 'right', 'top', 'left'];

export function Table({ state, onError, onLeave }: { state: StatePayload; onError: (m: string) => void; onLeave: () => void }) {
  const g = state.game!;
  const { room, you } = state;
  const me = you.seat ?? 0;
  // Play passes anticlockwise, so the next player sits on your right.
  const posOf = (s: Seat): Pos => POSITIONS[(s - me + 4) % 4];
  const seatName = (s: Seat) => {
    const info = room.seats[s];
    if (info.kind === 'bot') return info.name;
    if (info.kind === 'human') return info.playerId === you.id ? 'You' : info.name;
    return `Seat ${s + 1}`;
  };
  const myTeam = (me % 2) as 0 | 1;
  const teamLabel = (t: number) => (you.seat === null ? (t === 0 ? 'Team A' : 'Team B') : t === myTeam ? 'Us' : 'Them');
  /** Team name for use inside a sentence. */
  const teamName = (t: number) => (you.seat === null ? (t === 0 ? 'Team A' : 'Team B') : t === myTeam ? 'Your team' : 'The other team');

  const send = (a: Action) => socket.emit('action', a, ack(onError));
  const [selected, setSelected] = useState<string | null>(null);
  const shownTrick = useShownTrick(g);
  const myTurn = you.seat !== null && g.turn === you.seat;

  useEffect(() => setSelected(null), [g.phase]);

  const onCardClick = (id: string) => {
    if (g.phase === 'chooseTrump' || g.phase === 'chooseTrump2') {
      setSelected(id);
    } else if (g.phase === 'playing') {
      send({ type: 'play', cardId: id });
    }
  };

  const choosingTrump = myTurn && (g.phase === 'chooseTrump' || g.phase === 'chooseTrump2');
  const hand = sortHand(g.myHand);
  const lastBid = (s: Seat) => {
    const bids = g.bids.filter((b) => b.seat === s);
    const b = bids[bids.length - 1];
    if (!b || !(g.phase === 'bidding1' || g.phase === 'bidding2' || g.phase.startsWith('choose'))) return null;
    return b.amount === null ? 'Pass' : String(b.amount);
  };

  return (
    <main className="table-wrap">
      <header className="scorebar">
        <div className="scores">
          {[myTeam, 1 - myTeam].map((t) => (
            <div key={t} className={`score team-${t}`}>
              <span className="muted">{teamLabel(t)}</span>
              <strong>{g.scores[t]}</strong>
            </div>
          ))}
          <div className="muted small">to {g.settings.targetScore}</div>
        </div>
        <div className="hand-info">
          <span className="muted small">Hand {g.handNumber}</span>
          {g.highBid && (
            <span>
              Bid <strong>{g.highBid.amount}</strong> by {seatName(g.highBid.seat)}
            </span>
          )}
          <TrumpBadge g={g} seatName={seatName} />
        </div>
        <div className="row">
          {you.isHost && (
            <button
              className="small-btn"
              onClick={() => {
                if (window.confirm('End this game and return everyone to the lobby?')) socket.emit('endGame', ack(onError));
              }}
            >
              End game
            </button>
          )}
          <button className="small-btn" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <div className="felt">
        {([0, 1, 2, 3] as Seat[])
          .filter((s) => posOf(s) !== 'bottom' || you.seat === null)
          .map((s) => (
            <Opponent
              key={s}
              pos={posOf(s)}
              name={seatName(s)}
              count={g.handCounts[s]}
              active={g.turn === s && g.phase !== 'handOver' && g.phase !== 'matchOver'}
              dealer={g.dealer === s}
              bid={lastBid(s)}
              hiddenTrump={g.hasHiddenTrump && g.bidder === s}
              status={statusOf(room.seats[s])}
              team={s % 2}
            />
          ))}

        <div className="center">
          <Trick trick={shownTrick} posOf={posOf} />
          <div className="center-info">
            <span className={`team-${myTeam}`}>
              {teamLabel(myTeam)}: {g.pointsWon[myTeam]} pts · {g.tricksWon[myTeam]} tricks
            </span>
            <span className={`team-${1 - myTeam}`}>
              {teamLabel(1 - myTeam)}: {g.pointsWon[1 - myTeam]} pts · {g.tricksWon[1 - myTeam]} tricks
            </span>
          </div>
        </div>
      </div>

      {g.notice && <div className="notice">{g.notice}</div>}

      <section className="me">
        <div className="prompt">
          <Prompt g={g} myTurn={myTurn} seatName={seatName} spectating={you.seat === null} />
        </div>

        {myTurn && (g.phase === 'bidding1' || g.phase === 'bidding2') && <BidPanel g={g} send={send} />}

        {choosingTrump && (
          <div className="actions">
            <button className="primary" disabled={!selected} onClick={() => selected && send({ type: 'chooseTrump', cardId: selected })}>
              {selected ? `Place ${selected.slice(0, -1)}${SUIT_SYMBOLS[selected.slice(-1) as 'S']} face down as trump` : 'Pick a card above'}
            </button>
          </div>
        )}

        {myTurn && g.phase === 'playing' && g.canCallTrump && (
          <div className="actions">
            <button className="primary" onClick={() => send({ type: 'callTrump' })}>
              {g.bidder === you.seat ? 'Reveal trump and play one' : 'Ask for trump'}
            </button>
          </div>
        )}

        {you.seat !== null && (
          <div className="hand">
            {hand.map((c) => {
              const playable = (myTurn && g.phase === 'playing' && g.legalCardIds.includes(c.id)) || choosingTrump;
              return (
                <CardFace
                  key={c.id}
                  card={c}
                  playable={playable}
                  dim={myTurn && g.phase === 'playing' && !playable}
                  selected={selected === c.id}
                  onClick={() => onCardClick(c.id)}
                />
              );
            })}
            {g.hasHiddenTrump && g.bidder === you.seat && g.trumpCard && (
              <div className="hidden-trump-slot">
                <CardFace
                  card={g.trumpCard}
                  small
                  playable={myTurn && g.legalCardIds.includes(g.trumpCard.id)}
                  onClick={myTurn && g.legalCardIds.includes(g.trumpCard.id) ? () => send({ type: 'play', cardId: g.trumpCard!.id }) : undefined}
                />
                <span className="muted small">Your face-down trump</span>
              </div>
            )}
          </div>
        )}
      </section>

      {(g.phase === 'handOver' || g.phase === 'matchOver') && g.result && (
        <ResultOverlay g={g} seatName={seatName} teamLabel={teamLabel} teamName={teamName} myTeam={myTeam} isHost={you.isHost} seated={you.seat !== null} onError={onError} />
      )}
    </main>
  );
}

function statusOf(info: StatePayload['room']['seats'][number]): string | null {
  if (info.kind === 'bot') return '🤖';
  if (info.kind === 'human' && info.botPlaying) return 'bot playing';
  if (info.kind === 'human' && !info.connected) return 'reconnecting…';
  return null;
}

/** Keep showing a completed trick for a moment so everyone sees who won it. */
function useShownTrick(g: PlayerView): { cards: PlayedCard[]; winner: Seat | null } {
  const [hold, setHold] = useState<CompletedTrick | null>(null);
  const count = g.tricksWon[0] + g.tricksWon[1];
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current && g.lastTrick) {
      setHold(g.lastTrick);
      const t = window.setTimeout(() => setHold(null), 1500);
      prev.current = count;
      return () => window.clearTimeout(t);
    }
    prev.current = count;
  }, [count, g.lastTrick]);
  if (g.trick.length > 0 || !hold) return { cards: g.trick, winner: null };
  return { cards: hold.cards, winner: hold.winner };
}

function Trick({ trick, posOf }: { trick: { cards: PlayedCard[]; winner: Seat | null }; posOf: (s: Seat) => Pos }) {
  return (
    <div className="trick">
      {trick.cards.map((p) => (
        <div key={p.card.id} className={`trick-card at-${posOf(p.seat)}${trick.winner === p.seat ? ' winner' : ''}`}>
          <CardFace card={p.card} small />
          {p.countsAsTrump && <span className="trump-mark">trump</span>}
        </div>
      ))}
    </div>
  );
}

function Opponent(props: {
  pos: Pos;
  name: string;
  count: number;
  active: boolean;
  dealer: boolean;
  bid: string | null;
  hiddenTrump: boolean;
  status: string | null;
  team: number;
}) {
  return (
    <div className={`opponent at-${props.pos}${props.active ? ' active' : ''}`}>
      <div className={`opp-name team-${props.team}`}>
        {props.name}
        {props.dealer && <span className="tag" title="Dealer">D</span>}
      </div>
      {props.status && <div className="muted small">{props.status}</div>}
      <div className="opp-cards">
        {props.count > 0 && <CardBack small label={String(props.count)} />}
        {props.hiddenTrump && <CardBack small label="T" />}
      </div>
      {props.bid && <div className="bubble">{props.bid}</div>}
    </div>
  );
}

function TrumpBadge({ g, seatName }: { g: PlayerView; seatName: (s: Seat) => string }) {
  if (g.bidder === null) return null;
  if (g.trumpSuit && g.trumpRevealed)
    return (
      <span className={`trump-badge ${g.trumpSuit === 'H' || g.trumpSuit === 'D' ? 'red' : ''}`}>
        Trump {SUIT_SYMBOLS[g.trumpSuit]} {g.revealedBy !== null && <span className="badge-note">(asked by {seatName(g.revealedBy)})</span>}
      </span>
    );
  if (g.trumpSuit) return <span className="trump-badge hidden">Trump {SUIT_SYMBOLS[g.trumpSuit]} (only you know)</span>;
  if (g.hasHiddenTrump) return <span className="trump-badge hidden">Trump hidden</span>;
  return null;
}

function Prompt({ g, myTurn, seatName, spectating }: { g: PlayerView; myTurn: boolean; seatName: (s: Seat) => string; spectating: boolean }) {
  const who = seatName(g.turn);
  if (g.phase === 'handOver' || g.phase === 'matchOver') return null;
  if (!myTurn) {
    const verb =
      g.phase === 'bidding1' || g.phase === 'bidding2' ? 'to bid' : g.phase.startsWith('choose') ? 'to choose trump' : 'to play';
    return <span className="muted">{spectating ? 'Watching. ' : ''}Waiting for {who} {verb}…</span>;
  }
  switch (g.phase) {
    case 'bidding1':
      return <span>Your bid. {g.canPass ? 'Bid higher or pass.' : `You open the bidding (at least ${g.minBid}).`}</span>;
    case 'bidding2':
      return <span>All 8 cards dealt. Raise to {g.minBid ?? 24}+ or pass.</span>;
    case 'chooseTrump':
    case 'chooseTrump2':
      return <span>You won the bid. Pick a card: its suit becomes trump and it stays face down.</span>;
    case 'playing':
      if (g.trick.length === 0) return <span>Your lead.</span>;
      if (g.canCallTrump && g.legalCardIds.length === 0) return <span>You can't follow suit. Reveal trump to continue.</span>;
      if (g.canCallTrump) return <span>You can't follow suit. Discard a card or ask for trump.</span>;
      return <span>Your turn. Play a highlighted card.</span>;
  }
}

function BidPanel({ g, send }: { g: PlayerView; send: (a: Action) => void }) {
  const min = g.minBid;
  const options = min === null ? [] : Array.from({ length: 28 - min + 1 }, (_, i) => min + i);
  return (
    <div className="bid-panel">
      <div className="bid-grid">
        {options.map((n) => (
          <button key={n} className="bid-btn" onClick={() => send({ type: 'bid', amount: n })}>
            {n}
          </button>
        ))}
      </div>
      <div className="actions">
        {g.canPass && <button onClick={() => send({ type: 'pass' })}>Pass</button>}
        {g.canRequestRedeal && <button onClick={() => send({ type: 'requestRedeal' })}>No points: redeal</button>}
      </div>
    </div>
  );
}

function ResultOverlay(props: {
  g: PlayerView;
  seatName: (s: Seat) => string;
  teamLabel: (t: number) => string;
  teamName: (t: number) => string;
  myTeam: number;
  isHost: boolean;
  seated: boolean;
  onError: (m: string) => void;
}) {
  const { g, seatName, teamLabel, teamName, myTeam } = props;
  const r = g.result!;
  const bidTeam = r.bidder % 2;
  const over = g.phase === 'matchOver';
  return (
    <div className="overlay">
      <div className="result panel">
        {over ? <h2>{teamName(g.winner!)} won the match!</h2> : <h2>Hand {r.handNumber} result</h2>}
        <p>
          {seatName(r.bidder)} bid <strong>{r.bid}</strong> with {SUIT_NAMES[r.trumpSuit]} {SUIT_SYMBOLS[r.trumpSuit]} as trump.
        </p>
        <p>
          {teamName(bidTeam)} took <strong>{r.points[bidTeam]}</strong> points, so the bid {r.success ? 'was made' : 'failed'}.
        </p>
        <table className="result-table">
          <tbody>
            {[myTeam, 1 - myTeam].map((t) => (
              <tr key={t} className={`team-${t}`}>
                <td>{teamLabel(t)}</td>
                <td>{r.points[t]} pts</td>
                <td>{r.delta[t] > 0 ? `+${r.delta[t]}` : r.delta[t]}</td>
                <td>
                  <strong>{g.scores[t]}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!over && props.seated && (
          <button className="primary" onClick={() => socket.emit('action', { type: 'nextHand' }, ack(props.onError))}>
            Next hand
          </button>
        )}
        {!over && <p className="muted small">The next hand starts by itself in a few seconds.</p>}
        {over &&
          (props.isHost ? (
            <button className="primary" onClick={() => socket.emit('endGame', ack(props.onError))}>
              Back to lobby
            </button>
          ) : (
            <p className="muted">Waiting for the host to start a new match.</p>
          ))}
      </div>
    </div>
  );
}
