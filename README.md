# 28 Card Game

A multiplayer web app for **28 (Twenty-Eight)**, the trick-taking card game popular in Kerala and South India. Create a room, share the link or code with friends, fill empty seats with bots, and play.

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/lino-sebastian/twenty-eight-gm.git
cd twenty-eight-gm
npm install
npm run dev
```

Open https://localhost:5173 and create a room. The dev server uses a self-signed certificate (so phones allow the microphone for voice chat); your browser shows a warning the first time. Choose "Advanced" then "Proceed" (Chrome) or "Show details" then "visit this website" (Safari). Use `npm run dev:http` if you don't need voice.

**Trying it with several players on one computer:** each browser remembers who you are, so two tabs in the same browser count as the same player. Open the invite link in a private/incognito window or a different browser for each extra player.

**Playing with phones on the same Wi-Fi:** `npm run dev` prints a `Network:` address such as `https://192.168.1.20:5173`. Open that address on the other devices (accept the certificate warning once on each), or share the invite link from the lobby. Voice chat only works on `https://` addresses or `localhost`.

### Production build

```bash
npm run build   # builds the web client into client/dist
npm start       # serves the app and game server on http://localhost:3001
```

Set `PORT` to change the port. Any Node host that supports WebSockets (Render, Fly.io, Railway, a VPS) can run it with these two commands.

### Deploy to Render (free)

The repo includes a `render.yaml` blueprint.

1. Sign in at [render.com](https://render.com) with GitHub.
2. Choose **New → Blueprint**, pick this repository, and press **Apply**.
3. When the build finishes, open the `https://twenty-eight-….onrender.com` address and share room links from there. Voice works because the site is HTTPS.

Every push to `main` redeploys. On the free plan the service sleeps after about 15 minutes with no visitors; the first visit after that takes up to a minute to wake it, and any open rooms are lost.

### Tests

```bash
npm test          # rules engine tests, including 200 full bot-vs-bot matches
npm run typecheck
```

## Rules used

- 4 players in 2 fixed partnerships; partners sit opposite. Play passes anticlockwise.
- 32 cards. Rank in every suit: J, 9, A, 10, K, Q, 8, 7. Points: J = 3, 9 = 2, A = 1, 10 = 1 (28 in total).
- **Deal and bidding:** 4 cards each, then bidding. The player on the dealer's right must open at 14 or more (room setting: 14, 15 or 16). Each player gets one turn to bid higher or pass, and the highest bid wins. Overcalling your own partner needs at least 20.
- **Trump:** the winning bidder places one card face down; its suit is trump. Then 4 more cards each.
- **Second round:** after seeing all 8 cards, each player may bid 28 (all the points) or pass. A player who bids 28 picks a new face-down trump card and the old one goes back.
- **Play:** the player on the dealer's right leads. You must follow suit if you can. If you can't, either discard or **ask for trump**: the hidden card is shown, and you must play a trump if you have one. Before the reveal, no card counts as trump; trumps played before the reveal never count.
- The bidder may not lead the trump suit before the reveal unless they hold nothing else, and when they can't follow suit they either discard a non-trump card or reveal trump and play one.
- **Redeals:** a player dealt all four Jacks, the bidding side holding all 8 trumps, or the opening bidder holding no point cards (their choice).
- **Scoring:** the bidding side needs card points at least equal to the bid.

  | Bid | Made | Failed (points go to the other team) |
  | --- | --- | --- |
  | 14 to 19 | +1 | +2 |
  | 20 to 24 | +2 | +3 |
  | 25 to 28 | +3 | +4 |

  First team to the target (default 6 game points) wins the match.
- Card art: Adrian Kennard's classic playing card designs (public domain, CC0), via the `@letele/playing-cards` package.
- Not included, by choice: pair (K+Q of trump), double/redouble, Thani, Cot. An optional +1 point for the last trick is a room setting.

## Room features

- **Invite:** copy the link, copy just the room code, or use your phone's share sheet.
- **Team names:** tap a team name in the lobby to rename it. The host can rename both teams; players can rename their own.
- **Voice chat:** press **Join voice** in the lobby or at the table, then mute or leave whenever you like. Voice goes directly between browsers (WebRTC); the server only helps them connect. Players on very strict networks may not be able to connect without a TURN relay server.
- **Pacing:** each finished trick stays on the table for about 4.5 seconds and slides to the winner. After each hand the result and a celebration stay up until any player presses **Start next hand**.

- **Lobby music:** add an audio file at `client/public/music/lobby.mp3`, commit it, and it plays in the lobby on a loop with a Music on/off button. It fades out when the game starts. Only add music you have the rights to use, since the file is published with the app.
- **Bots at any stage:** anyone in the room can put a bot in an open seat, replace a player who has gone offline, or (during a game) press **Let a bot play** for an offline player instead of waiting 60 seconds.

## How rooms work

- Rooms have a 5-letter code and an invite link like `/r/ABCDE`. No accounts; players just enter a name.
- The host arranges seats, adds or removes bots, sets the rules, and starts the game. People who join after the start watch.
- If a player's connection drops, their seat is held for 60 seconds; after that a bot plays for them until they come back. Reloading the page reclaims the seat.
- Rooms live in server memory and are removed after 30 minutes with nobody connected. Restarting the server clears all rooms.

## Project layout

```
shared/   rules engine (cards.ts, game.ts), bot player (bot.ts), socket message types
server/   Express + Socket.IO server and room management
client/   React web app (Vite)
tests/    Vitest tests for the rules engine
```

All game logic runs on the server; each player only receives their own cards and what the rules let them see.
