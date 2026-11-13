export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

/** Ranks from highest to lowest, as played in 28. */
export const RANKS = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  /** Stable id such as "JS" or "10H". */
  id: string;
  suit: Suit;
  rank: Rank;
}

export const POINTS: Record<Rank, number> = {
  J: 3,
  '9': 2,
  A: 1,
  '10': 1,
  K: 0,
  Q: 0,
  '8': 0,
  '7': 0,
};

export const SUIT_NAMES: Record<Suit, string> = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export function makeCard(rank: Rank, suit: Suit): Card {
  return { id: `${rank}${suit}`, rank, suit };
}

export function parseCard(id: string): Card {
  const suit = id.slice(-1) as Suit;
  const rank = id.slice(0, -1) as Rank;
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) throw new Error(`Bad card id ${id}`);
  return makeCard(rank, suit);
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit));
  return deck;
}

/** Higher number = stronger card within its suit. */
export function rankStrength(rank: Rank): number {
  return RANKS.length - RANKS.indexOf(rank);
}

export function cardPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + POINTS[c.rank], 0);
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sort for display: grouped by suit, strongest first. */
export function sortHand(cards: Card[]): Card[] {
  return cards
    .slice()
    .sort((a, b) =>
      a.suit === b.suit ? rankStrength(b.rank) - rankStrength(a.rank) : SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit),
    );
}
