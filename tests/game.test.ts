import { describe, expect, it } from 'vitest';
import { Card, cardPoints, fullDeck, makeCard, parseCard } from '../shared/cards';
import {
  MatchState,
  Seat,
  applyAction,
  dealHand,
  legalPlays,
  minBidFor,
  newMatch,
  DEFAULT_SETTINGS,
  viewFor,
  GameError,
  trickWinner,
} from '../shared/game';
import { chooseBotAction } from '../shared/bot';

/** Seeded RNG so failures are reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function matchWithHand(hand: ReturnType<typeof dealHand>): MatchState {
  return { settings: { ...DEFAULT_SETTINGS }, scores: [0, 0], handNumber: 1, hand, history: [], winner: null, notice: null };
}

/** Build a deck so that seat s gets firstFour[s] then secondFour[s] (dealer 3, so seat 0 is dealt first). */
function riggedDeck(firstFour: string[][], secondFour: string[][]): Card[] {
  const deck: Card[] = [];
  for (let i = 0; i < 4; i++) for (let s = 0; s < 4; s++) deck.push(parseCard(firstFour[s][i]));
  for (let i = 0; i < 4; i++) for (let s = 0; s < 4; s++) deck.push(parseCard(secondFour[s][i]));
  return deck;
}

const FIRST = [
  ['JS', '9S', 'AS', '7H'],
  ['JH', '9H', 'AH', '7D'],
  ['JD', '9D', 'AD', '7C'],
  ['10S', 'KS', '8S', '7S'],
];
const SECOND = [
  ['10H', 'KH', 'QS', '8H'],
  ['JC', '9C', 'AC', '10C'],
  ['10D', 'KD', 'QD', '8D'],
  ['KC', 'QC', '8C', 'QH'],
];

function setup(): MatchState {
  return matchWithHand(dealHand(3, Math.random, riggedDeck(FIRST, SECOND)));
}

function act(m: MatchState, seat: number, a: Parameters<typeof applyAction>[2]) {
  return applyAction(m, seat as Seat, a);
}

describe('deck', () => {
  it('has 32 cards worth 28 points', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(32);
    expect(cardPoints(deck)).toBe(28);
  });
});

describe('bidding', () => {
  it('opening bidder must bid at least the minimum and cannot pass', () => {
    const m = setup();
    expect(m.hand.turn).toBe(0);
    expect(() => act(m, 0, { type: 'pass' })).toThrow(GameError);
    expect(() => act(m, 0, { type: 'bid', amount: 13 })).toThrow(GameError);
    expect(() => act(m, 1, { type: 'bid', amount: 15 })).toThrow(/not your turn/);
  });

  it('requires 20 to overcall your partner', () => {
    let m = setup();
    m = act(m, 0, { type: 'bid', amount: 15 });
    m = act(m, 1, { type: 'pass' });
    expect(minBidFor(m, 2)).toBe(20);
    expect(() => act(m, 2, { type: 'bid', amount: 16 })).toThrow(GameError);
    m = act(m, 2, { type: 'bid', amount: 20 });
    expect(m.hand.highBid).toEqual({ seat: 2, amount: 20 });
  });

  it('ends after one turn each, even when the last player bids', () => {
    let m = setup();
    m = act(m, 0, { type: 'bid', amount: 14 });
    m = act(m, 1, { type: 'bid', amount: 15 });
    m = act(m, 2, { type: 'bid', amount: 16 });
    m = act(m, 3, { type: 'bid', amount: 20 });
    expect(m.hand.phase).toBe('chooseTrump');
    expect(m.hand.bidder).toBe(3);
    expect(m.hand.turn).toBe(3);
  });

  it('gives each player one turn, then the second round only allows 28', () => {
    let m = setup();
    m = act(m, 0, { type: 'bid', amount: 16 });
    m = act(m, 1, { type: 'pass' });
    m = act(m, 2, { type: 'pass' });
    m = act(m, 3, { type: 'pass' });
    expect(m.hand.phase).toBe('chooseTrump');
    expect(m.hand.turn).toBe(0);
    m = act(m, 0, { type: 'chooseTrump', cardId: 'AS' });
    expect(m.hand.phase).toBe('bidding2');
    expect(m.hand.hands[0]).toHaveLength(7);
    expect(m.hand.hands[1]).toHaveLength(8);
    expect(minBidFor(m, 0)).toBe(28);
    expect(() => act(m, 0, { type: 'bid', amount: 24 })).toThrow(GameError);
    for (const s of [0, 1, 2, 3]) m = act(m, s, { type: 'pass' });
    expect(m.hand.phase).toBe('playing');
    expect(m.hand.turn).toBe(0);
  });

  it('a second round raise hands trump choice to the raiser', () => {
    let m = setup();
    m = act(m, 0, { type: 'bid', amount: 16 });
    for (const s of [1, 2, 3]) m = act(m, s, { type: 'pass' });
    m = act(m, 0, { type: 'chooseTrump', cardId: 'AS' });
    m = act(m, 0, { type: 'pass' });
    m = act(m, 1, { type: 'bid', amount: 28 });
    // 28 cannot be beaten, so the round ends at once.
    expect(m.hand.phase).toBe('chooseTrump2');
    expect(m.hand.bidder).toBe(1);
    expect(m.hand.hands[0]).toHaveLength(8); // AS returned
    m = act(m, 1, { type: 'chooseTrump', cardId: '7D' });
    expect(m.hand.phase).toBe('playing');
    expect(m.hand.trumpSuit).toBe('D');
  });
});

function toPlaying(trumpCard = 'AS'): MatchState {
  let m = setup();
  m = act(m, 0, { type: 'bid', amount: 16 });
  for (const s of [1, 2, 3]) m = act(m, s, { type: 'pass' });
  m = act(m, 0, { type: 'chooseTrump', cardId: trumpCard });
  for (const s of [0, 1, 2, 3]) m = act(m, s, { type: 'pass' });
  return m;
}

describe('play', () => {
  it('bidder cannot lead the hidden trump suit while holding other suits', () => {
    const m = toPlaying();
    const legal = legalPlays(m, 0);
    expect(legal.cardIds.some((id) => id.endsWith('S'))).toBe(false);
    expect(legal.cardIds).toContain('10H');
  });

  it('players must follow suit; others may call for trump', () => {
    let m = toPlaying();
    m = act(m, 0, { type: 'play', cardId: '7H' });
    // Seat 1 holds hearts: must follow.
    expect(legalPlays(m, 1).cardIds.every((id) => id.endsWith('H'))).toBe(true);
    expect(legalPlays(m, 1).canCallTrump).toBe(false);
    m = act(m, 1, { type: 'play', cardId: 'JH' });
    // Seat 2 has no hearts: may discard anything or call trump.
    const l2 = legalPlays(m, 2);
    expect(l2.canCallTrump).toBe(true);
    expect(l2.cardIds).toHaveLength(8);
  });

  it('calling trump reveals it and forces a trump if held', () => {
    let m = toPlaying();
    m = act(m, 0, { type: 'play', cardId: '7H' });
    m = act(m, 1, { type: 'play', cardId: 'JH' });
    m = act(m, 2, { type: 'play', cardId: '7C' });
    // Seat 3 holds QH: must follow.
    m = act(m, 3, { type: 'play', cardId: 'QH' });
    expect(m.hand.tricks[0].winner).toBe(1);
    expect(m.hand.tricks[0].points).toBe(3);

    // Seat 1 leads clubs; seat 2 has 7C gone, so seat 2... use diamonds instead.
    m = act(m, 1, { type: 'play', cardId: '7D' });
    // Seat 2 follows diamonds.
    m = act(m, 2, { type: 'play', cardId: 'JD' });
    // Seat 3 has no diamonds: call trump (spades), and must play a spade.
    expect(legalPlays(m, 3).canCallTrump).toBe(true);
    m = act(m, 3, { type: 'callTrump' });
    expect(m.hand.trumpRevealed).toBe(true);
    expect(m.hand.hands[0].map((c) => c.id)).toContain('AS');
    expect(legalPlays(m, 3).cardIds.every((id) => id.endsWith('S'))).toBe(true);
    m = act(m, 3, { type: 'play', cardId: '7S' });
    // Seat 0 has no diamonds and trump is revealed: any card.
    m = act(m, 0, { type: 'play', cardId: 'KH' });
    expect(m.hand.tricks[1].winner).toBe(3); // 7 of trump beats JD
  });

  it('a trump played before the reveal does not count as trump', () => {
    let m = toPlaying();
    m = act(m, 0, { type: 'play', cardId: '7H' });
    m = act(m, 1, { type: 'play', cardId: '9H' });
    m = act(m, 2, { type: 'play', cardId: '7C' });
    // Seat 3 must follow with QH.
    m = act(m, 3, { type: 'play', cardId: 'QH' });
    expect(m.hand.tricks[0].winner).toBe(1);
    m = act(m, 1, { type: 'play', cardId: 'AH' });
    // Seat 2 has no hearts and discards JD without calling: cannot win.
    m = act(m, 2, { type: 'play', cardId: 'JD' });
    m = act(m, 3, { type: 'callTrump' });
    m = act(m, 3, { type: 'play', cardId: '8S' });
    expect(viewFor(m, 2).trick[2].countsAsTrump).toBe(true);
    m = act(m, 0, { type: 'play', cardId: '10H' });
    expect(m.hand.tricks[1].winner).toBe(3);
  });
  it('a led Jack still wins when trump turns out to be the led suit', () => {
    // A leads JH, B has no hearts and asks for trump: it is hearts. B discards 8S,
    // C follows with QH (now a trump), D plays 10S. The Jack is higher, so A wins.
    const play = (seat: Seat, id: string, countsAsTrump: boolean) => ({ seat, card: parseCard(id), countsAsTrump });
    expect(trickWinner([play(0, 'JH', false), play(1, '8S', false), play(2, 'QH', true), play(3, '10S', false)])).toBe(0);
    // A higher trump of the same suit still beats it, and a trump of the suit cuts other suits.
    expect(trickWinner([play(0, '9H', false), play(1, '8S', false), play(2, 'JH', true), play(3, '10S', false)])).toBe(2);
    expect(trickWinner([play(0, 'JD', false), play(1, '7H', true), play(2, '9D', false), play(3, 'AD', false)])).toBe(1);
  });
});

describe('views', () => {
  it('hide the trump from everyone but the bidder until revealed', () => {
    const m = toPlaying();
    expect(viewFor(m, 0).trumpSuit).toBe('S');
    expect(viewFor(m, 1).trumpSuit).toBeNull();
    expect(viewFor(m, 1).trumpCard).toBeNull();
    expect(viewFor(m, 1).hasHiddenTrump).toBe(true);
    expect(viewFor(m, 1).handCounts).toEqual([8, 8, 8, 8]);
    expect((viewFor(m, 1) as unknown as { hands?: unknown }).hands).toBeUndefined();
  });
});

describe('full games with bots', () => {
  it('plays 200 matches without errors and always counts 28 points', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      let m = newMatch(DEFAULT_SETTINGS, 0, r);
      let steps = 0;
      while (m.winner === null) {
        if (++steps > 20000) throw new Error(`Seed ${seed} did not finish`);
        if (m.hand.phase === 'handOver') {
          const res = m.hand.result!;
          expect(res.points[0] + res.points[1]).toBe(28);
          m = applyAction(m, 0, { type: 'nextHand' }, r);
          continue;
        }
        const seat = m.hand.turn;
        const action = chooseBotAction(m, seat);
        expect(action).not.toBeNull();
        m = applyAction(m, seat, action!, r);
      }
      expect(Math.max(...m.scores)).toBeGreaterThanOrEqual(6);
    }
  });
});

void makeCard;

describe('scoring', async () => {
  const { gamePointsForBid } = await import('../shared/game');
  it('uses the bid bands', () => {
    expect(gamePointsForBid(14)).toEqual([1, 2]);
    expect(gamePointsForBid(19)).toEqual([1, 2]);
    expect(gamePointsForBid(20)).toEqual([2, 3]);
    expect(gamePointsForBid(24)).toEqual([2, 3]);
    expect(gamePointsForBid(25)).toEqual([3, 4]);
    expect(gamePointsForBid(28)).toEqual([3, 4]);
  });
});
