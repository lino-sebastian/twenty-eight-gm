import type { Card } from '../../shared/cards';
import { SUIT_SYMBOLS } from '../../shared/cards';

const red = (c: Card) => c.suit === 'H' || c.suit === 'D';

export function CardFace({
  card,
  onClick,
  playable,
  dim,
  selected,
  small,
}: {
  card: Card;
  onClick?: () => void;
  playable?: boolean;
  dim?: boolean;
  selected?: boolean;
  small?: boolean;
}) {
  const cls = ['card', red(card) ? 'red' : 'black', playable ? 'playable' : '', dim ? 'dim' : '', selected ? 'selected' : '', small ? 'small' : '']
    .filter(Boolean)
    .join(' ');
  const label = `${card.rank} of ${{ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[card.suit]}`;
  const content = (
    <>
      <span className="corner">
        {card.rank}
        <br />
        {SUIT_SYMBOLS[card.suit]}
      </span>
      <span className="pip">{SUIT_SYMBOLS[card.suit]}</span>
    </>
  );
  if (onClick)
    return (
      <button className={cls} onClick={onClick} aria-label={label} disabled={!playable}>
        {content}
      </button>
    );
  return (
    <div className={cls} aria-label={label}>
      {content}
    </div>
  );
}

export function CardBack({ small, label }: { small?: boolean; label?: string }) {
  return (
    <div className={`card back${small ? ' small' : ''}`} aria-label={label ?? 'Face-down card'}>
      {label ? <span className="back-label">{label}</span> : null}
    </div>
  );
}
