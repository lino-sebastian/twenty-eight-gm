import { Card, Suit, cardPoints, fullDeck, parseCard, rankStrength, shuffle } from './cards.js';

export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

export const SEATS: Seat[] = [0, 1, 2, 3];

/** Play passes to the next seat. On screen the next seat sits to your right (anticlockwise). */
export const nextSeat = (s: Seat): Seat => ((s + 1) % 4) as Seat;
export const teamOf = (s: Seat): Team => (s % 2) as Team;
export const partnerOf = (s: Seat): Seat => ((s + 2) % 4) as Seat;

export interface Settings {
  /** Lowest opening bid. Standard is 14. */
  minBid: number;
  /** Game points a team needs to win the match. */
  targetScore: number;
  /** Award 1 extra card point for the last trick (29 in total). */
  lastTrickBonus: boolean;
}

export const DEFAULT_SETTINGS: Settings = { minBid: 14, targetScore: 6, lastTrickBonus: false };

/** You must bid at least this much to overcall your own partner in the first round. */
export const PARTNER_OVERCALL_MIN = 20;
/** Any raise in the second bidding round must be at least this much. */
export const SECOND_ROUND_MIN = 24;
export const MAX_BID = 28;

export type Phase =
  | 'bidding1' // 4 cards each, first bidding round
  | 'chooseTrump' // final bidder of round 1 puts a trump card face down
  | 'bidding2' // 8 cards each, optional raise to 24+
  | 'chooseTrump2' // a round 2 raiser picks a new trump card
  | 'playing'
  | 'handOver'
  | 'matchOver';

export interface BidEntry {
  seat: Seat;
  /** null = pass */
  amount: number | null;
  round: 1 | 2;
}

export interface PlayedCard {
  seat: Seat;
  card: Card;
  /** True when trump was already revealed as this card was played and it is of the trump suit. */
  countsAsTrump: boolean;
}

export interface CompletedTrick {
  cards: PlayedCard[];
  winner: Seat;
  points: number;
}

export interface HandResult {
  handNumber: number;
  bidder: Seat;
  bid: number;
  trumpSuit: Suit;
  points: [number, number];
  success: boolean;
  /** Game points added to each team this hand. */
  delta: [number, number];
  redeal?: false;
}

export interface HandState {
  dealer: Seat;
  phase: Phase;
  hands: Card[][];
  /** Cards still to be dealt in the second round of the deal. */
  stock: Card[];
  turn: Seat;
  bids: BidEntry[];
  highBid: { seat: Seat; amount: number } | null;
  passesInRow: number;
  round2Raised: boolean;
  bidder: Seat | null;
  trumpSuit: Suit | null;
  /** The face-down card. Stays set after reveal so everyone can see what it was. */
  trumpCard: Card | null;
  trumpRevealed: boolean;
  revealedBy: Seat | null;
  leader: Seat;
  trick: PlayedCard[];
  tricks: CompletedTrick[];
  /** Seat that called for trump this trick and so must play a trump if able. */
  mustTrump: Seat | null;
  result: HandResult | null;
}

export interface MatchState {
  settings: Settings;
  scores: [number, number];
  handNumber: number;
  hand: HandState;
  history: HandResult[];
  winner: Team | null;
  /** Short message about the last notable event, such as a redeal. */
  notice: string | null;
}

export type Action =
  | { type: 'bid'; amount: number }
  | { type: 'pass' }
  | { type: 'requestRedeal' }
  | { type: 'chooseTrump'; cardId: string }
  | { type: 'play'; cardId: string }
  | { type: 'callTrump' }
  | { type: 'nextHand' };

export class GameError extends Error {}

type Rng = () => number;

export function newMatch(settings: Settings = DEFAULT_SETTINGS, dealer: Seat = 0, rng: Rng = Math.random): MatchState {
  return {
    settings: { ...settings },
    scores: [0, 0],
    handNumber: 1,
    hand: dealHand(dealer, rng),
    history: [],
    winner: null,
    notice: null,
  };
}

export function dealHand(dealer: Seat, rng: Rng = Math.random, deck?: Card[]): HandState {
  const cards = deck ? deck.slice() : shuffle(fullDeck(), rng);
  const hands: Card[][] = [[], [], [], []];
  // Deal 4 to each, starting from the dealer's right (the next seat).
  let s = nextSeat(dealer);
  for (let i = 0; i < 16; i++) {
    hands[s].push(cards[i]);
    s = nextSeat(s);
  }
  return {
    dealer,
    phase: 'bidding1',
    hands,
    stock: cards.slice(16),
    turn: nextSeat(dealer),
    bids: [],
    highBid: null,
    passesInRow: 0,
    round2Raised: false,
    bidder: null,
    trumpSuit: null,
    trumpCard: null,
    trumpRevealed: false,
    revealedBy: null,
    leader: nextSeat(dealer),
    trick: [],
    tricks: [],
    mustTrump: null,
    result: null,
  };
}

function dealSecondRound(h: HandState) {
  let s = nextSeat(h.dealer);
  for (let i = 0; i < 16; i++) {
    h.hands[s].push(h.stock[i]);
    s = nextSeat(s);
  }
  h.stock = [];
}

/** Minimum legal bid for this seat right now, or null if it cannot bid. */
export function minBidFor(m: MatchState, seat: Seat): number | null {
  const h = m.hand;
  if (h.turn !== seat) return null;
  if (h.phase === 'bidding1') {
    let min = m.settings.minBid;
    if (h.highBid) {
      min = Math.max(min, h.highBid.amount + 1);
      if (h.highBid.seat === partnerOf(seat)) min = Math.max(min, PARTNER_OVERCALL_MIN);
    }
    return min <= MAX_BID ? min : null;
  }
  if (h.phase === 'bidding2') {
    const min = Math.max(SECOND_ROUND_MIN, (h.highBid?.amount ?? 0) + 1);
    return min <= MAX_BID ? min : null;
  }
  return null;
}

export function canPass(m: MatchState, seat: Seat): boolean {
  const h = m.hand;
  if (h.turn !== seat) return false;
  if (h.phase === 'bidding2') return true;
  // The opening bidder may not pass.
  return h.phase === 'bidding1' && h.highBid !== null;
}

export function canRequestRedeal(m: MatchState, seat: Seat): boolean {
  const h = m.hand;
  return h.phase === 'bidding1' && h.bids.length === 0 && h.turn === seat && cardPoints(h.hands[seat]) === 0;
}

/** Cards in the seat's hand, not counting the bidder's face-down trump card. */
function handOf(h: HandState, seat: Seat): Card[] {
  return h.hands[seat];
}

export interface LegalPlays {
  cardIds: string[];
  canCallTrump: boolean;
}

export function legalPlays(m: MatchState, seat: Seat): LegalPlays {
  const h = m.hand;
  const none: LegalPlays = { cardIds: [], canCallTrump: false };
  if (h.phase !== 'playing' || h.turn !== seat) return none;
  const hand = handOf(h, seat);
  const ids = (cs: Card[]) => cs.map((c) => c.id);
  const isBidderHidden = seat === h.bidder && !h.trumpRevealed;
  const trump = h.trumpSuit!;

  if (isBidderHidden && hand.length === 0) {
    // Only the face-down card is left: it is revealed and played.
    return { cardIds: [h.trumpCard!.id], canCallTrump: false };
  }

  if (h.trick.length === 0) {
    if (isBidderHidden) {
      const nonTrump = hand.filter((c) => c.suit !== trump);
      return { cardIds: ids(nonTrump.length ? nonTrump : hand), canCallTrump: false };
    }
    return { cardIds: ids(hand), canCallTrump: false };
  }

  const led = h.trick[0].card.suit;
  const follow = hand.filter((c) => c.suit === led);
  if (follow.length) return { cardIds: ids(follow), canCallTrump: false };

  if (h.mustTrump === seat) {
    const trumps = hand.filter((c) => c.suit === trump);
    return { cardIds: ids(trumps.length ? trumps : hand), canCallTrump: false };
  }

  if (!h.trumpRevealed) {
    if (isBidderHidden) {
      // Trump suit led and the bidder has none in hand: discard without revealing.
      if (led === trump) return { cardIds: ids(hand), canCallTrump: false };
      const nonTrump = hand.filter((c) => c.suit !== trump);
      return { cardIds: ids(nonTrump), canCallTrump: true };
    }
    return { cardIds: ids(hand), canCallTrump: true };
  }

  return { cardIds: ids(hand), canCallTrump: false };
}

function trickWinner(trick: PlayedCard[]): Seat {
  const led = trick[0].card.suit;
  let best = trick[0];
  for (const p of trick.slice(1)) {
    if (p.countsAsTrump && !best.countsAsTrump) best = p;
    else if (p.countsAsTrump === best.countsAsTrump) {
      const sameSuit = p.card.suit === best.card.suit;
      const eligible = p.countsAsTrump || p.card.suit === led;
      if (eligible && sameSuit && rankStrength(p.card.rank) > rankStrength(best.card.rank)) best = p;
    }
  }
  return best.seat;
}

function revealTrump(h: HandState, by: Seat) {
  h.trumpRevealed = true;
  h.revealedBy = by;
  h.hands[h.bidder!].push(h.trumpCard!);
}

function finishBidding2(m: MatchState) {
  const h = m.hand;
  if (h.round2Raised) {
    // The previous trump card goes back to whoever placed it; the new bidder picks again.
    const prevBidder = h.bidder!;
    h.hands[prevBidder].push(h.trumpCard!);
    h.trumpCard = null;
    h.trumpSuit = null;
    h.bidder = h.highBid!.seat;
    h.phase = 'chooseTrump2';
    h.turn = h.bidder;
  } else {
    startPlay(m);
  }
}

function startPlay(m: MatchState) {
  const h = m.hand;
  // Redeal if the bidding side holds every trump.
  const trumpCount = [h.bidder!, partnerOf(h.bidder!)]
    .flatMap((s) => h.hands[s])
    .concat(h.trumpCard ? [h.trumpCard] : [])
    .filter((c) => c.suit === h.trumpSuit).length;
  if (trumpCount === 8) {
    redeal(m, 'The bidding side held all 8 cards of the തുറുപ്പ് suit, so the cards were redealt.');
    return;
  }
  h.phase = 'playing';
  h.leader = nextSeat(h.dealer);
  h.turn = h.leader;
}

function redeal(m: MatchState, notice: string, rng: Rng = Math.random) {
  m.hand = dealHand(m.hand.dealer, rng);
  m.notice = notice;
}

function scoreHand(m: MatchState) {
  const h = m.hand;
  const points: [number, number] = [0, 0];
  h.tricks.forEach((t, i) => {
    points[teamOf(t.winner)] += t.points + (m.settings.lastTrickBonus && i === 7 ? 1 : 0);
  });
  const bid = h.highBid!.amount;
  const bidTeam = teamOf(h.bidder!);
  const success = points[bidTeam] >= bid;
  const [win, lose] = gamePointsForBid(bid);
  const delta: [number, number] = [0, 0];
  // A made bid scores for the bidders; a failed bid scores (more) for the opponents.
  if (success) delta[bidTeam] = win;
  else delta[(1 - bidTeam) as Team] = lose;
  m.scores[0] += delta[0];
  m.scores[1] += delta[1];
  const result: HandResult = {
    handNumber: m.handNumber,
    bidder: h.bidder!,
    bid,
    trumpSuit: h.trumpSuit!,
    points,
    success,
    delta,
  };
  h.result = result;
  m.history.push(result);
  const target = m.settings.targetScore;
  const scorer: Team = success ? bidTeam : ((1 - bidTeam) as Team);
  if (m.scores[scorer] >= target) m.winner = scorer;
  h.phase = m.winner !== null ? 'matchOver' : 'handOver';
}

/** Game points for making or failing a bid: [won if made, lost if failed]. */
export function gamePointsForBid(bid: number): [number, number] {
  if (bid >= 25) return [3, 4];
  if (bid >= 20) return [2, 3];
  return [1, 2];
}

/** Apply an action for a seat. Returns a new state; throws GameError if the action is not allowed. */
export function applyAction(state: MatchState, seat: Seat, action: Action, rng: Rng = Math.random): MatchState {
  const m: MatchState = structuredClone(state);
  const h = m.hand;
  const notYourTurn = () => new GameError("It's not your turn.");

  switch (action.type) {
    case 'requestRedeal': {
      if (!canRequestRedeal(m, seat)) throw new GameError('You can only ask for a redeal with no point cards, before any bid.');
      redeal(m, 'The opening bidder had no point cards and asked for a redeal.', rng);
      return m;
    }
    case 'bid': {
      if (h.phase !== 'bidding1' && h.phase !== 'bidding2') throw new GameError('Bidding is over.');
      if (h.turn !== seat) throw notYourTurn();
      const min = minBidFor(m, seat);
      if (min === null || !Number.isInteger(action.amount) || action.amount < min || action.amount > MAX_BID)
        throw new GameError(min === null ? 'You cannot bid higher.' : `Bid must be between ${min} and ${MAX_BID}.`);
      const round = h.phase === 'bidding1' ? 1 : 2;
      h.bids.push({ seat, amount: action.amount, round });
      h.highBid = { seat, amount: action.amount };
      h.passesInRow = 0;
      m.notice = null;
      if (round === 2) h.round2Raised = true;
      if (action.amount === MAX_BID) {
        // Nobody can go higher.
        if (round === 1) {
          h.bidder = seat;
          h.phase = 'chooseTrump';
          h.turn = seat;
        } else finishBidding2(m);
        return m;
      }
      h.turn = nextSeat(seat);
      return m;
    }
    case 'pass': {
      if (h.turn !== seat) throw notYourTurn();
      if (!canPass(m, seat)) throw new GameError('The opening bidder must bid.');
      const round = h.phase === 'bidding1' ? 1 : 2;
      h.bids.push({ seat, amount: null, round });
      h.passesInRow++;
      m.notice = null;
      if (round === 1 && h.passesInRow === 3) {
        h.bidder = h.highBid!.seat;
        h.phase = 'chooseTrump';
        h.turn = h.bidder;
      } else if (round === 2 && (h.round2Raised ? h.passesInRow === 3 : h.passesInRow === 4)) {
        finishBidding2(m);
      } else {
        h.turn = nextSeat(seat);
      }
      return m;
    }
    case 'chooseTrump': {
      if (h.phase !== 'chooseTrump' && h.phase !== 'chooseTrump2') throw new GameError('Not choosing തുറുപ്പ് now.');
      if (h.turn !== seat) throw notYourTurn();
      const idx = h.hands[seat].findIndex((c) => c.id === action.cardId);
      if (idx < 0) throw new GameError('That card is not in your hand.');
      const [card] = h.hands[seat].splice(idx, 1);
      h.trumpCard = card;
      h.trumpSuit = card.suit;
      if (h.phase === 'chooseTrump') {
        dealSecondRound(h);
        if (h.hands.some((hand, s) => hand.concat(s === seat ? [card] : []).filter((c) => c.rank === 'J').length === 4)) {
          redeal(m, 'One player was dealt all four Jacks, so the cards were redealt.', rng);
          return m;
        }
        h.phase = 'bidding2';
        h.passesInRow = 0;
        h.turn = nextSeat(h.dealer);
      } else {
        startPlay(m);
      }
      return m;
    }
    case 'callTrump': {
      if (h.phase !== 'playing') throw new GameError('Not playing now.');
      if (h.turn !== seat) throw notYourTurn();
      if (!legalPlays(m, seat).canCallTrump) throw new GameError('You can only ask for തുറുപ്പ് when you cannot follow suit.');
      revealTrump(h, seat);
      h.mustTrump = seat;
      m.notice = null;
      return m;
    }
    case 'play': {
      if (h.phase !== 'playing') throw new GameError('Not playing now.');
      if (h.turn !== seat) throw notYourTurn();
      const legal = legalPlays(m, seat);
      if (!legal.cardIds.includes(action.cardId)) throw new GameError("You can't play that card now.");
      m.notice = null;
      let card: Card;
      if (seat === h.bidder && !h.trumpRevealed && h.trumpCard?.id === action.cardId) {
        revealTrump(h, seat);
      }
      const idx = h.hands[seat].findIndex((c) => c.id === action.cardId);
      [card] = h.hands[seat].splice(idx, 1);
      h.trick.push({ seat, card, countsAsTrump: h.trumpRevealed && card.suit === h.trumpSuit });
      if (h.trick.length < 4) {
        h.turn = nextSeat(seat);
        return m;
      }
      const winner = trickWinner(h.trick);
      h.tricks.push({ cards: h.trick, winner, points: cardPoints(h.trick.map((p) => p.card)) });
      h.trick = [];
      h.mustTrump = null;
      h.leader = winner;
      h.turn = winner;
      if (h.tricks.length === 8) scoreHand(m);
      return m;
    }
    case 'nextHand': {
      if (h.phase !== 'handOver') throw new GameError('The hand is not over.');
      m.handNumber++;
      m.hand = dealHand(nextSeat(h.dealer), rng);
      m.notice = null;
      return m;
    }
  }
}

/** What one player is allowed to see. */
export interface PlayerView {
  seat: Seat | null;
  settings: Settings;
  scores: [number, number];
  handNumber: number;
  winner: Team | null;
  notice: string | null;
  history: HandResult[];
  dealer: Seat;
  phase: Phase;
  turn: Seat;
  myHand: Card[];
  handCounts: number[];
  bids: BidEntry[];
  highBid: { seat: Seat; amount: number } | null;
  bidder: Seat | null;
  /** Visible to the bidder, or to everyone once revealed. */
  trumpSuit: Suit | null;
  trumpCard: Card | null;
  hasHiddenTrump: boolean;
  trumpRevealed: boolean;
  revealedBy: Seat | null;
  trick: PlayedCard[];
  lastTrick: CompletedTrick | null;
  tricksWon: [number, number];
  pointsWon: [number, number];
  result: HandResult | null;
  // Moves available to this player
  minBid: number | null;
  canPass: boolean;
  canRequestRedeal: boolean;
  legalCardIds: string[];
  canCallTrump: boolean;
}

export function viewFor(m: MatchState, seat: Seat | null): PlayerView {
  const h = m.hand;
  const seesTrump = h.trumpRevealed || (seat !== null && seat === h.bidder) || h.phase === 'handOver' || h.phase === 'matchOver';
  const tricksWon: [number, number] = [0, 0];
  const pointsWon: [number, number] = [0, 0];
  for (const t of h.tricks) {
    tricksWon[teamOf(t.winner)]++;
    pointsWon[teamOf(t.winner)] += t.points;
  }
  const legal = seat !== null ? legalPlays(m, seat) : { cardIds: [], canCallTrump: false };
  return {
    seat,
    settings: m.settings,
    scores: m.scores,
    handNumber: m.handNumber,
    winner: m.winner,
    notice: m.notice,
    history: m.history,
    dealer: h.dealer,
    phase: h.phase,
    turn: h.turn,
    myHand: seat !== null ? h.hands[seat] : [],
    handCounts: h.hands.map((cs, s) => cs.length + (s === h.bidder && h.trumpCard && !h.trumpRevealed ? 1 : 0)),
    bids: h.bids,
    highBid: h.highBid,
    bidder: h.bidder,
    trumpSuit: seesTrump ? h.trumpSuit : null,
    trumpCard: seesTrump ? h.trumpCard : null,
    hasHiddenTrump: h.trumpCard !== null && !h.trumpRevealed,
    trumpRevealed: h.trumpRevealed,
    revealedBy: h.revealedBy,
    trick: h.trick,
    lastTrick: h.tricks.length ? h.tricks[h.tricks.length - 1] : null,
    tricksWon,
    pointsWon,
    result: h.result,
    minBid: seat !== null ? minBidFor(m, seat) : null,
    canPass: seat !== null && canPass(m, seat),
    canRequestRedeal: seat !== null && canRequestRedeal(m, seat),
    legalCardIds: legal.cardIds,
    canCallTrump: legal.canCallTrump,
  };
}

export { parseCard };
