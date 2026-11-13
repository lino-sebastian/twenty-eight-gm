import { Card, POINTS, SUITS, Suit, cardPoints, fullDeck, rankStrength } from './cards.js';
import { Action, MatchState, Seat, legalPlays, minBidFor, canPass, canRequestRedeal, partnerOf, teamOf } from './game.js';

/** A simple rule-based player used for empty seats and for players who drop out. */
export function chooseBotAction(m: MatchState, seat: Seat): Action | null {
  const h = m.hand;
  if (h.phase === 'handOver' || h.phase === 'matchOver' || h.turn !== seat) return null;

  if (h.phase === 'bidding1' || h.phase === 'bidding2') {
    if (canRequestRedeal(m, seat)) return { type: 'requestRedeal' };
    const min = minBidFor(m, seat);
    const estimate = estimateHand(h.hands[seat], h.phase === 'bidding2');
    if (min !== null && (!canPass(m, seat) || estimate >= min)) {
      // Do not fight a partner unless the hand is really strong.
      if (h.highBid && h.highBid.seat === partnerOf(seat) && estimate < min + 2 && canPass(m, seat)) return { type: 'pass' };
      return { type: 'bid', amount: min };
    }
    return { type: 'pass' };
  }

  if (h.phase === 'chooseTrump' || h.phase === 'chooseTrump2') {
    const suit = bestSuit(h.hands[seat]);
    const ofSuit = h.hands[seat].filter((c) => c.suit === suit);
    // Keep the strong cards in hand; put the weakest card of the suit face down.
    const card = ofSuit.sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank))[0];
    return { type: 'chooseTrump', cardId: card.id };
  }

  if (h.phase === 'playing') return choosePlay(m, seat);
  return null;
}

function bestSuit(hand: Card[]): Suit {
  let best: Suit = hand[0].suit;
  let bestScore = -1;
  for (const s of SUITS) {
    const cs = hand.filter((c) => c.suit === s);
    const score = cs.length * 10 + cardPoints(cs) * 3 + Math.max(0, ...cs.map((c) => rankStrength(c.rank)));
    if (cs.length && score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

function estimateHand(hand: Card[], full: boolean): number {
  const suit = bestSuit(hand);
  const length = hand.filter((c) => c.suit === suit).length;
  const pts = cardPoints(hand);
  if (!full) return 10 + pts * 1.2 + length * 1.5;
  return 8 + pts + length * 1.5;
}

function weakest(cards: Card[]): Card {
  return cards.slice().sort((a, b) => POINTS[a.rank] - POINTS[b.rank] || rankStrength(a.rank) - rankStrength(b.rank))[0];
}

function strongest(cards: Card[]): Card {
  return cards.slice().sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank))[0];
}

/** Cards not yet seen by anyone (not played and not in this player's hand). */
function unseen(m: MatchState, seat: Seat): Card[] {
  const h = m.hand;
  const seen = new Set<string>([
    ...h.hands[seat].map((c) => c.id),
    ...h.tricks.flatMap((t) => t.cards.map((p) => p.card.id)),
    ...h.trick.map((p) => p.card.id),
  ]);
  return fullDeck().filter((c) => !seen.has(c.id));
}

function choosePlay(m: MatchState, seat: Seat): Action {
  const h = m.hand;
  const legal = legalPlays(m, seat);
  const hand = h.hands[seat].concat(h.trumpCard && seat === h.bidder && !h.trumpRevealed ? [h.trumpCard] : []);
  const cards = legal.cardIds.map((id) => hand.find((c) => c.id === id)!).filter(Boolean);
  const trump = h.trumpSuit;
  const knowsTrump = h.trumpRevealed || seat === h.bidder;

  if (h.trick.length === 0) {
    // Lead a card that is the highest left in its suit, otherwise a low card.
    const others = unseen(m, seat);
    const masters = cards.filter((c) => !others.some((o) => o.suit === c.suit && rankStrength(o.rank) > rankStrength(c.rank)));
    if (masters.length && !(knowsTrump && masters.every((c) => c.suit === trump) && seat !== h.bidder)) {
      return { type: 'play', cardId: strongest(masters).id };
    }
    return { type: 'play', cardId: weakest(cards).id };
  }

  const led = h.trick[0].card.suit;
  const winning = currentWinner(h.trick);
  const partnerWinning = teamOf(winning.seat) === teamOf(seat);
  const trickPoints = cardPoints(h.trick.map((p) => p.card));

  if (legal.canCallTrump && !partnerWinning && (trickPoints >= 2 || cards.length === 0)) {
    return { type: 'callTrump' };
  }
  if (cards.length === 0) return { type: 'callTrump' };

  const beats = (c: Card) => {
    const asTrump = h.trumpRevealed && c.suit === trump;
    if (asTrump && !winning.countsAsTrump) return true;
    if (asTrump && winning.countsAsTrump) return rankStrength(c.rank) > rankStrength(winning.card.rank);
    if (winning.countsAsTrump) return false;
    return c.suit === led && rankStrength(c.rank) > rankStrength(winning.card.rank);
  };

  const isLast = h.trick.length === 3;
  if (partnerWinning) {
    // Feed points to a partner who is likely to win.
    const safe = isLast || winning.countsAsTrump || winning.card.rank === 'J';
    const pointCards = cards.filter((c) => POINTS[c.rank] > 0 && !(h.trumpRevealed && c.suit === trump));
    if (safe && pointCards.length) return { type: 'play', cardId: strongest(pointCards).id };
    return { type: 'play', cardId: weakest(cards).id };
  }
  const winners = cards.filter(beats);
  if (winners.length && (isLast || trickPoints > 0 || winners.some((c) => c.rank === 'J'))) {
    const pick = isLast ? winners.sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank))[0] : strongest(winners);
    return { type: 'play', cardId: pick.id };
  }
  return { type: 'play', cardId: weakest(cards).id };
}

function currentWinner(trick: MatchState['hand']['trick']) {
  const led = trick[0].card.suit;
  let best = trick[0];
  for (const p of trick.slice(1)) {
    if (p.countsAsTrump && !best.countsAsTrump) best = p;
    else if (p.countsAsTrump === best.countsAsTrump && p.card.suit === best.card.suit && (p.countsAsTrump || p.card.suit === led)) {
      if (rankStrength(p.card.rank) > rankStrength(best.card.rank)) best = p;
    }
  }
  return best;
}
