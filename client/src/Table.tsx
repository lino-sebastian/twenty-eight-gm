import { useEffect, useMemo, useRef, useState } from 'react';
import { SUIT_NAMES, SUIT_SYMBOLS, sortHand } from '../../shared/cards';
import type { Action, CompletedTrick, PlayedCard, PlayerView, Seat } from '../../shared/game';
import type { StatePayload } from '../../shared/protocol';
import { CardBack, CardFace } from './cards';
import { ack } from './Lobby';
import { socket } from './socket';
import { VoiceControls, useVoice } from './voice';
import { playCardDown, playDeal, playSwordSwing, setSoundEnabled, soundEnabled } from './sound';

type Pos = 'bottom' | 'right' | 'top' | 'left';
const POSITIONS: Pos[] = ['bottom', 'right', 'top', 'left'];

/** How long a finished trick stays on the table (the server waits a little longer before bots lead). */
const TRICK_HOLD_MS = 4_500;
const TRICK_COLLECT_MS = 700;

export function Table({
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
  const teamName = (t: number) => room.teamNames[t];

  // Waiting for the server to accept a move: block double clicks and hide the card being played.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [state]);
  const send = (a: Action, key: string) => {
    setPending(key);
    socket.emit('action', a, (res) => {
      if (!res.ok) {
        setPending(null);
        onError(res.error);
      }
    });
  };

  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [g.phase]);

  const shown = useShownTrick(g);
  const deal = useDeal(g);
  useTrickSounds(g);
  const [soundOn, setSoundOn] = useState(soundEnabled());
  const dealDelay = useDealtCardDelays(g, me);
  const myTurn = you.seat !== null && g.turn === you.seat && !shown.holding;
  const choosingTrump = myTurn && (g.phase === 'chooseTrump' || g.phase === 'chooseTrump2');
  const playing = myTurn && g.phase === 'playing' && !pending;

  const onCardClick = (id: string) => {
    if (choosingTrump) setSelected(id);
    else if (playing) send({ type: 'play', cardId: id }, id);
  };

  const hand = sortHand(g.myHand);
  const inBidding = g.phase === 'bidding1' || g.phase === 'bidding2' || g.phase.startsWith('choose');
  const lastBid = (s: Seat) => {
    if (!inBidding) return null;
    const bids = g.bids.filter((b) => b.seat === s);
    const b = bids[bids.length - 1];
    if (!b) return null;
    return b.amount === null ? 'Pass' : String(b.amount);
  };
  const inVoice = (s: Seat) => {
    const info = room.seats[s];
    return info.kind === 'human' && room.voice.includes(info.playerId);
  };

  return (
    <main className="table-wrap">
      <header className="scorebar">
        <div className="scores">
          {[myTeam, 1 - myTeam].map((t) => (
            <div key={t} className={`score team-${t}`} title={t === myTeam && you.seat !== null ? 'Your team' : undefined}>
              <span className="score-name">
                {teamName(t)}
                {t === myTeam && you.seat !== null && <span className="you-dot" aria-label="your team" />}
              </span>
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
          <VoiceControls voice={voice} count={room.voice.length} />
          <button
            type="button"
            className="small-btn"
            title={soundOn ? 'Turn game sounds off' : 'Turn game sounds on'}
            aria-label={soundOn ? 'Sound on' : 'Sound off'}
            onClick={() => {
              setSoundEnabled(!soundOn);
              setSoundOn(!soundOn);
            }}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
          {you.isHost && (
            <button
              type="button"
              className="small-btn"
              onClick={() => {
                if (window.confirm('End this game and return everyone to the lobby?')) socket.emit('endGame', ack(onError));
              }}
            >
              End game
            </button>
          )}
          <button type="button" className="small-btn" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <div className="felt">
        <TrumpPanel g={g} seatName={seatName} isBidder={you.seat !== null && g.bidder === you.seat} />
        {([0, 1, 2, 3] as Seat[])
          .filter((s) => posOf(s) !== 'bottom' || you.seat === null)
          .map((s) => (
            <Opponent
              key={s}
              pos={posOf(s)}
              name={seatName(s)}
              count={g.handCounts[s]}
              active={g.turn === s && !shown.holding && g.phase !== 'handOver' && g.phase !== 'matchOver'}
              dealer={g.dealer === s}
              bid={lastBid(s)}
              hiddenTrump={g.hasHiddenTrump && g.bidder === s}
              status={statusOf(room.seats[s])}
              team={s % 2}
              voice={inVoice(s)}
            />
          ))}

        <div className="table-center">
          <div className="stage">
            <div className="table-surface" aria-hidden>
              <div className="table-felt">
                <span className="table-logo">28</span>
              </div>
            </div>
            {deal && <DealAnimation key={deal.key} dealer={g.dealer} count={deal.count} posOf={posOf} />}
            <Trick shown={shown} posOf={posOf} />
          </div>
          {shown.holding && shown.winner !== null && (
            <div className={`trick-winner team-${shown.winner % 2}`}>
              {seatName(shown.winner)} {seatName(shown.winner) === 'You' ? 'win' : 'wins'} the trick
            </div>
          )}
          <div className="center-info">
            {[myTeam, 1 - myTeam].map((t) => (
              <span key={t} className={`team-${t}`}>
                {teamName(t)}: {g.pointsWon[t]} pts · {g.tricksWon[t]} tricks
              </span>
            ))}
          </div>
        </div>
      </div>

      {g.notice && <div className="notice">{g.notice}</div>}

      <section className="me">
        <div className="prompt" aria-live="polite">
          <Prompt g={g} myTurn={myTurn} holding={shown.holding} seatName={seatName} spectating={you.seat === null} />
        </div>

        {myTurn && (g.phase === 'bidding1' || g.phase === 'bidding2') && (
          <BidPanel g={g} pending={!!pending} send={send} />
        )}

        {choosingTrump && (
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={!selected || !!pending}
              onClick={() => selected && send({ type: 'chooseTrump', cardId: selected }, 'trump')}
            >
              {selected ? `Place ${selected.slice(0, -1)}${SUIT_SYMBOLS[selected.slice(-1) as 'S']} face down as തുറുപ്പ്` : 'Pick a card below'}
            </button>
          </div>
        )}

        {playing && g.canCallTrump && (
          <div className="actions">
            <button type="button" className="primary" onClick={() => send({ type: 'callTrump' }, 'call')}>
              {g.bidder === you.seat ? 'Reveal തുറുപ്പ് and play one' : 'Ask for തുറുപ്പ്'}
            </button>
          </div>
        )}

        {you.seat !== null && (
          <div className={`hand${playing || choosingTrump ? ' my-turn' : ''}`}>
            {hand.map((c, i) => {
              const legal = playing && g.legalCardIds.includes(c.id);
              const playable = legal || choosingTrump;
              return (
                <CardFace
                  key={c.id}
                  card={c}
                  playable={playable}
                  dim={playing && !legal}
                  selected={selected === c.id}
                  className={pending === c.id ? 'leaving' : dealDelay(c.id) !== null ? 'dealt-in' : undefined}
                  onClick={() => onCardClick(c.id)}
                  style={{ '--i': i, '--n': hand.length, animationDelay: dealDelay(c.id) !== null ? `${dealDelay(c.id)}ms` : undefined } as React.CSSProperties}
                />
              );
            })}
            {g.hasHiddenTrump && g.bidder === you.seat && g.trumpCard && (
              <div className="hidden-trump-slot">
                <CardFace
                  card={g.trumpCard}
                  small
                  playable={playing && g.legalCardIds.includes(g.trumpCard.id)}
                  onClick={() => playing && send({ type: 'play', cardId: g.trumpCard!.id }, g.trumpCard!.id)}
                />
                <span className="muted small">Your face-down തുറുപ്പ്</span>
              </div>
            )}
          </div>
        )}
      </section>

      {(g.phase === 'handOver' || g.phase === 'matchOver') && g.result && !shown.holding && (
        <Celebration
          g={g}
          seatName={seatName}
          teamName={teamName}
          myTeam={you.seat === null ? null : myTeam}
          isHost={you.isHost}
          seated={you.seat !== null}
          onError={onError}
        />
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

/** Time between cards flying out of the dealer's hands. */
const DEAL_STEP_MS = 85;

/** Detect a fresh deal: 4 cards each at the start of a hand, or 4 more after the first bidding. */
function useDeal(g: PlayerView): { key: string; count: number } | null {
  const dealKey =
    g.phase === 'bidding1' && g.bids.length === 0 ? `${g.handNumber}-1-${g.notice ?? ''}` :
    g.phase === 'bidding2' && !g.bids.some((b) => b.round === 2) ? `${g.handNumber}-2` : null;
  const [deal, setDeal] = useState<{ key: string; count: number } | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!dealKey || dealKey === last.current) return;
    last.current = dealKey;
    setDeal({ key: dealKey, count: 16 });
    playDeal(16, DEAL_STEP_MS);
    const t = window.setTimeout(() => setDeal(null), 16 * DEAL_STEP_MS + 700);
    return () => window.clearTimeout(t);
  }, [dealKey]);
  return deal;
}

/** Card backs fly from the middle of the table to each player in dealing order. */
function DealAnimation({ dealer, count, posOf }: { dealer: Seat; count: number; posOf: (s: Seat) => Pos }) {
  return (
    <div className="deal" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const seat = ((dealer + 1 + i) % 4) as Seat;
        return (
          <div key={i} className={`deal-card to-${posOf(seat)}`} style={{ animationDelay: `${i * DEAL_STEP_MS}ms` }}>
            <CardBack small />
          </div>
        );
      })}
    </div>
  );
}

/** For cards that just arrived in my hand, the delay that matches when the dealer reaches me. */
function useDealtCardDelays(g: PlayerView, me: Seat) {
  const seen = useRef<{ hand: number; ids: Set<string> }>({ hand: -1, ids: new Set() });
  const fresh = useRef<Map<string, number>>(new Map());
  if (seen.current.hand !== g.handNumber) {
    seen.current = { hand: g.handNumber, ids: new Set() };
    fresh.current = new Map();
  }
  const offset = (me - g.dealer - 1 + 8) % 4;
  const newIds = g.myHand.map((c) => c.id).filter((id) => !seen.current.ids.has(id));
  // Only animate real deals (4 new cards), not the trump card coming back into the bidder's hand.
  if (newIds.length >= 4) {
    newIds.forEach((id, k) => fresh.current.set(id, (k * 4 + offset) * DEAL_STEP_MS + 380));
  }
  newIds.forEach((id) => seen.current.ids.add(id));
  return (id: string) => fresh.current.get(id) ?? null;
}

/** True when a trump is played on a trick led in another suit (the trick is "cut"). */
function isCut(p: PlayedCard, led: PlayedCard | undefined) {
  return p.countsAsTrump && !!led && led.card.suit !== p.card.suit;
}

/** A soft tap for each card played, and a sword swing when a trump cuts the trick. */
function useTrickSounds(g: PlayerView) {
  const seen = useRef<{ hand: number; ids: Set<string> } | null>(null);
  const cards = g.trick.length ? g.trick : g.lastTrick?.cards ?? [];
  const sig = `${g.handNumber}:${cards.map((p) => p.card.id).join(',')}`;
  useEffect(() => {
    const first = seen.current === null;
    if (!seen.current || seen.current.hand !== g.handNumber) seen.current = { hand: g.handNumber, ids: new Set() };
    const fresh = cards.filter((p) => !seen.current!.ids.has(p.card.id));
    fresh.forEach((p) => seen.current!.ids.add(p.card.id));
    if (first || fresh.length === 0) return;
    const newest = fresh[fresh.length - 1];
    if (isCut(newest, cards[0])) playSwordSwing();
    else playCardDown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}

interface ShownTrick {
  cards: PlayedCard[];
  winner: Seat | null;
  holding: boolean;
  collecting: boolean;
}

/** Keep a completed trick on the table for a few seconds so everyone sees who won it. */
function useShownTrick(g: PlayerView): ShownTrick {
  const [hold, setHold] = useState<{ trick: CompletedTrick; collecting: boolean } | null>(null);
  const count = g.tricksWon[0] + g.tricksWon[1];
  const prev = useRef(count);
  const lastTrick = useRef(g.lastTrick);
  lastTrick.current = g.lastTrick;
  const timers = useRef<number[]>([]);
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  // Only a change in the number of finished tricks starts or stops the hold. Other state
  // updates (which arrive often) must not reset the timers.
  useEffect(() => {
    const grew = count > prev.current;
    prev.current = count;
    clearTimers();
    const trick = lastTrick.current;
    if (!grew || !trick) {
      setHold(null);
      return;
    }
    setHold({ trick, collecting: false });
    timers.current.push(
      window.setTimeout(() => setHold({ trick, collecting: true }), TRICK_HOLD_MS - TRICK_COLLECT_MS),
      window.setTimeout(() => setHold(null), TRICK_HOLD_MS),
    );
  }, [count, g.handNumber]);
  useEffect(() => clearTimers, []);
  // A new card on the table means play has moved on.
  if (!hold || g.trick.length > 0) return { cards: g.trick, winner: null, holding: false, collecting: false };
  return { cards: hold.trick.cards, winner: hold.trick.winner, holding: true, collecting: hold.collecting };
}

function Trick({ shown, posOf }: { shown: ShownTrick; posOf: (s: Seat) => Pos }) {
  return (
    <div className={`trick${shown.collecting && shown.winner !== null ? ` collect-${posOf(shown.winner)}` : ''}`}>
      {shown.cards.map((p) => (
        <div
          key={p.card.id}
          className={`trick-card at-${posOf(p.seat)}${shown.winner === p.seat ? ' winner' : ''}${isCut(p, shown.cards[0]) ? ' cut' : ''}`}
        >
          <CardFace card={p.card} small />
          {p.countsAsTrump && <span className="trump-mark">തുറുപ്പ്</span>}
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
  voice: boolean;
}) {
  return (
    <div className={`opponent at-${props.pos}${props.active ? ' active' : ''}`}>
      <div className={`opp-name team-${props.team}`}>
        {props.name}
        {props.dealer && (
          <span className="tag" title="Dealer">
            D
          </span>
        )}
        {props.voice && (
          <span className="tag voice" title="In voice chat">
            🎤
          </span>
        )}
      </div>
      {props.status && <div className="muted small">{props.status}</div>}
      <div className="opp-cards">
        {props.count > 0 && <CardBack mini label={String(props.count)} />}
        {props.hiddenTrump && <CardBack mini label="തു" />}
      </div>
      {props.bid && <div className="bubble">{props.bid}</div>}
    </div>
  );
}

/** Trump indicator in the bottom-right corner of the table, clear of the players' names. */
function TrumpPanel({ g, seatName, isBidder }: { g: PlayerView; seatName: (s: Seat) => string; isBidder: boolean }) {
  if (g.bidder === null || (!g.trumpCard && !g.hasHiddenTrump)) return null;
  const revealed = g.trumpRevealed && g.trumpSuit && g.trumpCard;
  const card = revealed || (isBidder && g.trumpCard) ? <CardFace card={g.trumpCard!} small /> : <CardBack small label="?" />;
  return (
    <div className={`trump-panel${revealed ? ' revealed' : ''}`} key={revealed ? 'shown' : 'hidden'}>
      {card}
      <div className="trump-info">
        <div className="trump-panel-label">തുറുപ്പ്</div>
        {revealed ? (
          <>
            <div className={`trump-suit ${g.trumpSuit === 'H' || g.trumpSuit === 'D' ? 'red' : ''}`}>
              {SUIT_SYMBOLS[g.trumpSuit!]} {SUIT_NAMES[g.trumpSuit!]}
            </div>
            {g.revealedBy !== null && <div className="muted small">asked by {seatName(g.revealedBy)}</div>}
          </>
        ) : isBidder && g.trumpCard ? (
          <div className="muted small">hidden · only you know</div>
        ) : (
          <div className="muted small">hidden by {seatName(g.bidder)}</div>
        )}
      </div>
    </div>
  );
}

function TrumpBadge({ g, seatName }: { g: PlayerView; seatName: (s: Seat) => string }) {
  if (g.bidder === null) return null;
  if (g.trumpSuit && g.trumpRevealed)
    return (
      <span className={`trump-badge ${g.trumpSuit === 'H' || g.trumpSuit === 'D' ? 'red' : ''}`}>
        തുറുപ്പ് {SUIT_SYMBOLS[g.trumpSuit]} {g.revealedBy !== null && <span className="badge-note">(asked by {seatName(g.revealedBy)})</span>}
      </span>
    );
  if (g.trumpSuit) return <span className="trump-badge hidden">തുറുപ്പ് {SUIT_SYMBOLS[g.trumpSuit]} (only you know)</span>;
  if (g.hasHiddenTrump) return <span className="trump-badge hidden">തുറുപ്പ് hidden</span>;
  return null;
}

function Prompt({
  g,
  myTurn,
  holding,
  seatName,
  spectating,
}: {
  g: PlayerView;
  myTurn: boolean;
  holding: boolean;
  seatName: (s: Seat) => string;
  spectating: boolean;
}) {
  if (g.phase === 'handOver' || g.phase === 'matchOver') return null;
  if (holding) return <span className="muted">Collecting the trick…</span>;
  const who = seatName(g.turn);
  if (!myTurn) {
    const verb =
      g.phase === 'bidding1' || g.phase === 'bidding2' ? 'to bid' : g.phase.startsWith('choose') ? 'to choose തുറുപ്പ്' : 'to play';
    return (
      <span className="muted">
        {spectating ? 'Watching. ' : ''}Waiting for {who} {verb}…
      </span>
    );
  }
  switch (g.phase) {
    case 'bidding1':
      return <span>Your bid (one turn each). {g.canPass ? 'Bid higher or pass.' : `You open the bidding (at least ${g.minBid}).`}</span>;
    case 'bidding2':
      return g.minBid !== null ? <span>All 8 cards dealt. Bid 28 to take every point, or pass.</span> : <span>All 8 cards dealt. Nobody can bid higher, so pass.</span>;
    case 'chooseTrump':
    case 'chooseTrump2':
      return <span>You won the bid. Pick a card: its suit becomes തുറുപ്പ് and it stays face down.</span>;
    case 'playing':
      if (g.trick.length === 0) return <span>Your lead.</span>;
      if (g.canCallTrump && g.legalCardIds.length === 0) return <span>You can't follow suit. Reveal തുറുപ്പ് to continue.</span>;
      if (g.canCallTrump) return <span>You can't follow suit. Discard a card or ask for തുറുപ്പ്.</span>;
      return <span>Your turn. Play a highlighted card.</span>;
  }
}

function BidPanel({ g, pending, send }: { g: PlayerView; pending: boolean; send: (a: Action, key: string) => void }) {
  const min = g.minBid;
  const options = min === null ? [] : Array.from({ length: 28 - min + 1 }, (_, i) => min + i);
  return (
    <div className="bid-panel">
      <div className="bid-grid">
        {options.map((n) => (
          <button type="button" key={n} className="bid-btn" disabled={pending} onClick={() => send({ type: 'bid', amount: n }, 'bid')}>
            {n}
          </button>
        ))}
      </div>
      <div className="actions">
        {g.canPass && (
          <button type="button" disabled={pending} onClick={() => send({ type: 'pass' }, 'pass')}>
            Pass
          </button>
        )}
        {g.canRequestRedeal && (
          <button type="button" disabled={pending} onClick={() => send({ type: 'requestRedeal' }, 'redeal')}>
            No points: redeal
          </button>
        )}
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ['#f2c14e', '#ff6b6b', '#4dabf7', '#69db7c', '#e599f7', '#ffffff'];

function Confetti({ count }: { count: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 6,
      })),
    [count],
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.size,
            height: p.size * 0.45,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function Celebration(props: {
  g: PlayerView;
  seatName: (s: Seat) => string;
  teamName: (t: number) => string;
  myTeam: number | null;
  isHost: boolean;
  seated: boolean;
  onError: (m: string) => void;
}) {
  const { g, seatName, teamName, myTeam } = props;
  const r = g.result!;
  const bidTeam = r.bidder % 2;
  const handWinner = r.success ? bidTeam : 1 - bidTeam;
  const over = g.phase === 'matchOver';
  const weWon = myTeam === null || (over ? g.winner === myTeam : handWinner === myTeam);
  const order = myTeam === null ? [0, 1] : [myTeam, 1 - myTeam];
  return (
    <div className="overlay">
      {weWon && <Confetti count={over ? 120 : 60} />}
      <div className={`result panel team-${over ? g.winner : handWinner}${weWon ? ' won' : ''}`}>
        <div className="result-emoji" aria-hidden>
          {over ? '🏆' : weWon ? '🎉' : '👏'}
        </div>
        <h2 className="result-title">
          {over ? `${teamName(g.winner!)} win the match!` : `${teamName(handWinner)} win the hand!`}
        </h2>
        <p>
          {seatName(r.bidder)} bid <strong>{r.bid}</strong> with {SUIT_NAMES[r.trumpSuit]} {SUIT_SYMBOLS[r.trumpSuit]} as തുറുപ്പ്, and{' '}
          {teamName(bidTeam)} took <strong>{r.points[bidTeam]}</strong> points. The bid {r.success ? 'was made' : 'failed'}.
        </p>
        <table className="result-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Card points</th>
              <th>This hand</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.map((t) => (
              <tr key={t} className={`team-${t}`}>
                <td>{teamName(t)}</td>
                <td>{r.points[t]}</td>
                <td>{r.delta[t] > 0 ? `+${r.delta[t]}` : r.delta[t]}</td>
                <td>
                  <strong>{g.scores[t]}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!over && props.seated && (
          <button type="button" className="primary" onClick={() => socket.emit('action', { type: 'nextHand' }, ack(props.onError))}>
            Start next hand
          </button>
        )}
        {!over && <p className="muted small">The next hand starts when any player presses the button.</p>}
        {over &&
          (props.isHost ? (
            <button type="button" className="primary" onClick={() => socket.emit('endGame', ack(props.onError))}>
              Back to lobby
            </button>
          ) : (
            <p className="muted">Waiting for the host to start a new match.</p>
          ))}
      </div>
    </div>
  );
}
