import { useEffect, useState } from 'react';
import { parseCard, SUIT_SYMBOLS } from '../../shared/cards';
import { CardBack, CardFace } from './cards';
import { playCardDown, playDeal, playSwordSwing } from './sound';

/**
 * "How to play 28": a step-by-step walkthrough of one example hand, drawn with the same
 * table, cards and seats as the real game. Opened at /how-to-play.
 */

const TRUMP = 'തുറുപ്പ്';
type Pos = 'bottom' | 'right' | 'top' | 'left';
const PEOPLE: Record<Pos, { name: string; team: 0 | 1; role: string }> = {
  bottom: { name: 'You', team: 0, role: 'Team A' },
  top: { name: 'Meera', team: 0, role: 'your partner' },
  right: { name: 'Arun', team: 1, role: 'Team B' },
  left: { name: 'Biju', team: 1, role: 'Team B' },
};

interface Scene {
  /** Cards on the table, by seat. */
  trick?: Partial<Record<Pos, string>>;
  /** Which trick card wins (highlighted). */
  winner?: Pos;
  /** Trump cards that cut the trick (sword flash). */
  cut?: Pos;
  /** Speech bubbles (bids). */
  bubbles?: Partial<Record<Pos, string>>;
  /** Your hand. */
  hand?: string[];
  /** Cards in your hand to highlight. */
  highlight?: string[];
  /** Cards in your hand to dim (not allowed). */
  dim?: string[];
  /** Card counts shown for the other players. */
  counts?: number;
  /** Trump panel: hidden card or revealed suit. */
  trump?: { hidden: boolean; card?: string; by?: string };
  /** Seat whose turn it is. */
  active?: Pos;
  /** Show the dealing animation. */
  deal?: boolean;
  /** A row of example cards instead of a table. */
  row?: { id: string; note?: string }[];
}

interface Step {
  title: React.ReactNode;
  body: React.ReactNode;
  scene: Scene;
  sound?: 'deal' | 'card' | 'sword';
}

const T = () => (
  <>
    trump (<span lang="ml">{TRUMP}</span>, <i>thuruppu</i>)
  </>
);

const STEPS: Step[] = [
  {
    title: 'Four players, two teams',
    body: (
      <>
        <p>28 is a trick-taking card game from Kerala for four players. You play in two fixed teams, and partners sit opposite each other.</p>
        <p>
          Here <b>you</b> and <b>Meera</b> are Team A. <b>Arun</b> and <b>Biju</b> are Team B. Play always passes to the <b>right</b> (anticlockwise),
          so after you comes Arun, then Meera, then Biju.
        </p>
      </>
    ),
    scene: { counts: 0 },
  },
  {
    title: 'The 32 cards',
    body: (
      <>
        <p>
          Only 32 cards are used: J, 9, A, 10, K, Q, 8 and 7 of each suit. In every suit the order from strongest to weakest is unusual:
        </p>
        <p className="tut-order">J › 9 › A › 10 › K › Q › 8 › 7</p>
        <p>So the Jack beats everything in its suit, and the 9 is second. Remember this, because it is not the normal order!</p>
      </>
    ),
    scene: { row: ['JS', '9S', 'AS', '10S', 'KS', 'QS', '8S', '7S'].map((id) => ({ id })) },
  },
  {
    title: 'Points: why it is called 28',
    body: (
      <>
        <p>Some cards carry points. Whoever wins them in a trick scores them for their team.</p>
        <table className="tut-table">
          <tbody>
            <tr>
              <td>Jack</td>
              <td>3 points</td>
            </tr>
            <tr>
              <td>9</td>
              <td>2 points</td>
            </tr>
            <tr>
              <td>Ace</td>
              <td>1 point</td>
            </tr>
            <tr>
              <td>10</td>
              <td>1 point</td>
            </tr>
            <tr>
              <td>K, Q, 8, 7</td>
              <td>0</td>
            </tr>
          </tbody>
        </table>
        <p>
          That is 7 points per suit, and <b>28 points</b> in the whole deck.
        </p>
      </>
    ),
    scene: {
      row: [
        { id: 'JH', note: '3' },
        { id: '9H', note: '2' },
        { id: 'AH', note: '1' },
        { id: '10H', note: '1' },
        { id: 'KH', note: '0' },
        { id: 'QH', note: '0' },
        { id: '8H', note: '0' },
        { id: '7H', note: '0' },
      ],
    },
  },
  {
    title: 'The deal: 4 cards first',
    body: (
      <>
        <p>The dealer gives everyone <b>4 cards</b> to start with. The other 4 come later, after the first bidding.</p>
        <p>In the app the cards fly out from the middle of the table, starting with the player on the dealer's right.</p>
      </>
    ),
    scene: { deal: true, counts: 4, hand: ['JD', '9D', 'AC', '7H'] },
    sound: 'deal',
  },
  {
    title: 'Bidding: one turn each',
    body: (
      <>
        <p>
          Looking at only 4 cards, each player gets <b>one turn</b> to bid: a number of points their team promises to win, or <b>Pass</b>. Each
          bid must be higher than the last.
        </p>
        <ul>
          <li>The first bidder must bid at least <b>14</b>.</li>
          <li>To bid over your own partner you must bid at least <b>20</b>.</li>
          <li>The highest bid wins. That player is the <b>bidder</b>.</li>
        </ul>
        <p>
          Here Arun opens with 15, Meera bids 17, Biju passes and you pass. <b>Meera wins the bid with 17.</b>
        </p>
      </>
    ),
    scene: { counts: 4, hand: ['JD', '9D', 'AC', '7H'], bubbles: { right: '15', top: '17', left: 'Pass', bottom: 'Pass' }, active: 'top' },
  },
  {
    title: <>Choosing the trump</>,
    body: (
      <>
        <p>
          The bidder chooses the <T /> suit by placing one of their cards <b>face down</b>. Nobody else knows which suit it is!
        </p>
        <p>
          Meera puts a card face down. In the app you see a "?" card in the {TRUMP} panel, and a little "തു" card next to Meera.
        </p>
        <p>When you are the bidder, you tap a card and press "Place … face down as {TRUMP}".</p>
      </>
    ),
    scene: { counts: 4, hand: ['JD', '9D', 'AC', '7H'], trump: { hidden: true }, active: 'top' },
  },
  {
    title: 'The other 4 cards, and the 28 bid',
    body: (
      <>
        <p>Now everyone gets <b>4 more cards</b>, 8 in total.</p>
        <p>
          With all 8 cards in view, each player may bid <b>28</b> (promising to win every point) or pass. If someone bids 28 they become the
          bidder and pick a new {TRUMP}. Usually everyone passes and play begins.
        </p>
      </>
    ),
    scene: { counts: 8, hand: ['JD', '9D', 'AC', '7H', '10D', 'KS', 'QC', '8H'], trump: { hidden: true } },
    sound: 'deal',
  },
  {
    title: 'Playing a trick',
    body: (
      <>
        <p>
          The player on the dealer's right leads any card. Going round to the right, everyone plays one card. <b>You must follow the suit
          that was led</b> if you can.
        </p>
        <p>
          The highest card of the led suit wins the trick and its points, and the winner leads next. Here Biju led the 10♦, you played the J♦,
          Arun played the K♦ and Meera the 8♦. <b>Your Jack wins</b>, which is 4 points for Team A (J 3 + 10 1).
        </p>
      </>
    ),
    scene: {
      counts: 7,
      hand: ['9D', 'AC', '7H', '10D', 'KS', 'QC', '8H'],
      trick: { left: '10D', bottom: 'JD', right: 'KD', top: '8D' },
      winner: 'bottom',
      trump: { hidden: true },
    },
    sound: 'card',
  },
  {
    title: 'Must follow suit',
    body: (
      <>
        <p>
          You lead next. Biju leads clubs later, and you still have the Q♣. Because you <b>have</b> a club, you <b>must</b> play it. The app
          only lets you tap the cards you are allowed to play (they glow gold). The others are greyed out.
        </p>
      </>
    ),
    scene: {
      counts: 6,
      hand: ['9D', 'AC', '7H', '10D', 'KS', 'QC'],
      highlight: ['AC', 'QC'],
      dim: ['9D', '7H', '10D', 'KS'],
      trick: { left: '9C' },
      active: 'bottom',
      trump: { hidden: true },
    },
  },
  {
    title: <>Can't follow? Ask for the trump</>,
    body: (
      <>
        <p>If you have no card of the led suit, you have two choices:</p>
        <ul>
          <li>
            <b>Discard</b> any card. It can't win the trick.
          </li>
          <li>
            <b>Ask for {TRUMP}</b>. The bidder must show the face-down card, so now everyone knows the <T />. You must then play a {TRUMP} card
            if you have one.
          </li>
        </ul>
        <p>Here hearts are led, you have none, so you press "Ask for {TRUMP}". It is revealed: <b>spades ♠</b> are {TRUMP}!</p>
      </>
    ),
    scene: {
      counts: 5,
      hand: ['9D', '10D', 'KS', 'AD', '8S'],
      highlight: ['KS', '8S'],
      dim: ['9D', '10D', 'AD'],
      trick: { right: 'JH', top: '9H' },
      active: 'bottom',
      trump: { hidden: false, card: '7S', by: 'You' },
    },
  },
  {
    title: <>The trump cuts!</>,
    body: (
      <>
        <p>
          Once revealed, any {TRUMP} card beats every card of the other suits. Even your small 8♠ beats Arun's J♥. This is called{' '}
          <b>cutting</b> the trick. In the app you'll hear a sword swing! ⚔️
        </p>
        <p>
          You win the trick, with J♥ 3 + 9♥ 2 = 5 points. Trumps only count from the moment they are revealed. A {TRUMP}-suit card played
          before that is just an ordinary card.
        </p>
      </>
    ),
    scene: {
      counts: 4,
      hand: ['9D', '10D', 'KS', 'AD'],
      trick: { right: 'JH', top: '9H', bottom: '8S', left: '7H' },
      winner: 'bottom',
      cut: 'bottom',
      trump: { hidden: false, card: '7S', by: 'You' },
    },
    sound: 'sword',
  },
  {
    title: 'Special rules for the bidder',
    body: (
      <>
        <p>Until the {TRUMP} is revealed, the bidder has two limits, so they can't use their secret too easily:</p>
        <ul>
          <li>They can't <b>lead</b> the {TRUMP} suit unless they have nothing else.</li>
          <li>
            If they can't follow suit, they either discard a non-{TRUMP} card, or reveal the {TRUMP} themselves and play one.
          </li>
        </ul>
        <p>The bidder's face-down card goes back into their hand once it is revealed.</p>
      </>
    ),
    scene: { counts: 4, hand: ['9D', '10D', 'KS', 'AD'], trump: { hidden: false, card: '7S', by: 'You' } },
  },
  {
    title: 'Scoring a hand',
    body: (
      <>
        <p>
          After all 8 tricks, the bidder's team counts its points. If they have <b>at least the bid</b>, they score game points. If not, the
          other team scores.
        </p>
        <table className="tut-table">
          <thead>
            <tr>
              <th>Bid</th>
              <th>Bid made</th>
              <th>Bid failed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>14–19</td>
              <td>+1</td>
              <td>+2 to the others</td>
            </tr>
            <tr>
              <td>20–24</td>
              <td>+2</td>
              <td>+3 to the others</td>
            </tr>
            <tr>
              <td>25–28</td>
              <td>+3</td>
              <td>+4 to the others</td>
            </tr>
          </tbody>
        </table>
        <p>
          Meera bid 17. If Team A ends with 17 or more points, Team A gets +1. With 16 or fewer, Team B gets +2. The first team to <b>6 game
          points</b> wins the match (the host can change this target).
        </p>
      </>
    ),
    scene: { counts: 0 },
  },
  {
    title: 'Ready to play!',
    body: (
      <>
        <p>Quick reminders:</p>
        <ul>
          <li>J › 9 › A › 10 › K › Q › 8 › 7. Jacks and 9s are worth the most.</li>
          <li>Follow suit if you can.</li>
          <li>
            Can't follow? Discard, or ask for the <T />.
          </li>
          <li>Feed points to your partner when they are winning a trick.</li>
        </ul>
        <p>Tip: you can practise against bots. Create a room and fill the other seats with "+ Bot".</p>
      </>
    ),
    scene: { counts: 0, bubbles: { top: '👍', left: '🙂', right: '😄' } },
  },
];

function TutorialTable({ scene }: { scene: Scene }) {
  if (scene.row)
    return (
      <div className="tut-row">
        {scene.row.map((c) => (
          <div key={c.id} className="tut-row-card">
            <CardFace card={parseCard(c.id)} small />
            {c.note !== undefined && <span className={`tut-points${c.note === '0' ? ' zero' : ''}`}>{c.note} pt</span>}
          </div>
        ))}
      </div>
    );
  return (
    <div className="tut-scene">
      <div className="tut-felt">
        <div className="table-surface tut-surface" aria-hidden>
          <div className="table-felt">
            <span className="table-logo">28</span>
          </div>
        </div>
        {(['top', 'left', 'right'] as Pos[]).map((p) => (
          <div key={p} className={`opponent at-${p}${scene.active === p ? ' active' : ''}`}>
            <div className={`opp-name team-${PEOPLE[p].team}`}>{PEOPLE[p].name}</div>
            <div className="muted small">{PEOPLE[p].role}</div>
            {!!scene.counts && (
              <div className="opp-cards">
                <CardBack mini label={String(scene.counts)} />
                {scene.trump?.hidden && p === 'top' && <CardBack mini label="തു" />}
              </div>
            )}
            {scene.bubbles?.[p] && <div className="bubble">{scene.bubbles[p]}</div>}
          </div>
        ))}
        {scene.bubbles?.bottom && <div className="bubble tut-you-bubble">{scene.bubbles.bottom}</div>}
        <div className="tut-trick">
          {(['bottom', 'right', 'top', 'left'] as Pos[])
            .filter((p) => scene.trick?.[p])
            .map((p) => (
              <div key={p} className={`trick-card at-${p}${scene.winner === p ? ' winner' : ''}${scene.cut === p ? ' cut' : ''}`}>
                <CardFace card={parseCard(scene.trick![p]!)} small />
                {scene.cut === p && <span className="trump-mark">{TRUMP}</span>}
              </div>
            ))}
        </div>
        {scene.deal && (
          <div className="deal tut-deal" aria-hidden>
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className={`deal-card to-${(['right', 'top', 'left', 'bottom'] as Pos[])[i % 4]}`} style={{ animationDelay: `${i * 85}ms` }}>
                <CardBack small />
              </div>
            ))}
          </div>
        )}
        {scene.trump && (
          <div className={`trump-panel tut-trump${scene.trump.hidden ? '' : ' revealed'}`}>
            {scene.trump.hidden ? <CardBack small label="?" /> : <CardFace card={parseCard(scene.trump.card!)} small />}
            <div className="trump-info">
              <div className="trump-panel-label">{TRUMP}</div>
              {scene.trump.hidden ? (
                <div className="muted small">hidden by Meera</div>
              ) : (
                <>
                  <div className="trump-suit">{SUIT_SYMBOLS[parseCard(scene.trump.card!).suit]} Spades</div>
                  <div className="muted small">asked by {scene.trump.by}</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="tut-you">
        <span className="opp-name team-0">You</span>
        {scene.active === 'bottom' && <span className="tut-turn">your turn</span>}
      </div>
      {scene.hand && (
        <div className="hand tut-hand">
          {scene.hand.map((id, i) => (
            <CardFace
              key={id}
              card={parseCard(id)}
              playable={scene.highlight?.includes(id)}
              dim={scene.dim?.includes(id)}
              className={scene.deal ? 'dealt-in' : undefined}
              style={scene.deal ? { animationDelay: `${(i * 4 + 3) * 85 + 380}ms` } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Tutorial() {
  const [i, setI] = useState(() => {
    const n = Number(new URLSearchParams(window.location.search).get('step'));
    return Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n - 1 : 0;
  });
  const step = STEPS[i];
  const go = (n: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, n));
    setI(next);
    const s = STEPS[next].sound;
    if (s === 'deal') playDeal(16, 85);
    if (s === 'card') playCardDown();
    if (s === 'sword') window.setTimeout(playSwordSwing, 150);
    window.history.replaceState(null, '', `/how-to-play?step=${next + 1}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(i + 1);
      if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className="tutorial">
      <header className="tut-head">
        <a className="tut-back" href="/">
          ← 28 Card Game
        </a>
        <h1>How to play 28</h1>
        <div className="tut-progress" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
          {STEPS.map((_, n) => (
            <button
              key={n}
              type="button"
              className={`tut-dot${n === i ? ' on' : n < i ? ' done' : ''}`}
              onClick={() => go(n)}
              aria-label={`Go to step ${n + 1}`}
            />
          ))}
        </div>
      </header>
      <div className="tut-body" key={i}>
        <TutorialTable scene={step.scene} />
        <section className="glass tut-text">
          <div className="tut-step">
            Step {i + 1} of {STEPS.length}
          </div>
          <h2>{step.title}</h2>
          {step.body}
        </section>
      </div>
      <nav className="tut-nav">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0}>
          ← Back
        </button>
        {i < STEPS.length - 1 ? (
          <button type="button" className="primary" onClick={() => go(i + 1)}>
            Next →
          </button>
        ) : (
          <a className="primary tut-play" href="/">
            Play now
          </a>
        )}
      </nav>
    </main>
  );
}
