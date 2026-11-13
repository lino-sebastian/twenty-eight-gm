import * as Deck from '@letele/playing-cards';
import type { Card } from '../../shared/cards';

/**
 * Card art: Adrian Kennard's classic French-pattern designs (CC0), packaged as React SVGs
 * by @letele/playing-cards. Component names are suit + rank, e.g. "Sj" for the Jack of spades.
 */
const RANK_KEY: Record<string, string> = { J: 'j', Q: 'q', K: 'k', A: 'a', '10': '10', '9': '9', '8': '8', '7': '7' };
const SUIT_WORD = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' } as const;

function Art({ card }: { card: Card }) {
  const Comp = (Deck as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>)[`${card.suit}${RANK_KEY[card.rank]}`];
  return Comp ? <Comp className="card-art" preserveAspectRatio="xMidYMid meet" aria-hidden /> : <span>{card.id}</span>;
}

export function CardFace({
  card,
  onClick,
  playable,
  dim,
  selected,
  small,
  className,
  style,
}: {
  card: Card;
  onClick?: () => void;
  playable?: boolean;
  dim?: boolean;
  selected?: boolean;
  small?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cls = ['card', playable ? 'playable' : '', dim ? 'dim' : '', selected ? 'selected' : '', small ? 'small' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const label = `${card.rank} of ${SUIT_WORD[card.suit]}`;
  if (onClick)
    return (
      <button type="button" className={cls} onClick={playable ? onClick : undefined} aria-label={label} aria-disabled={!playable} style={style}>
        <Art card={card} />
      </button>
    );
  return (
    <div className={cls} aria-label={label} style={style}>
      <Art card={card} />
    </div>
  );
}

export function CardBack({ small, label }: { small?: boolean; label?: string }) {
  return (
    <div className={`card back${small ? ' small' : ''}`} aria-label={label ? `${label} cards` : 'Face-down card'}>
      {label ? <span className="back-label">{label}</span> : null}
    </div>
  );
}
