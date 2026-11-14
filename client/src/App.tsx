import { useCallback, useEffect, useRef, useState } from 'react';
import type { StatePayload } from '../../shared/protocol';
import { Lobby } from './Lobby';
import { Table } from './Table';
import { playerToken, saveName, savedName, socket } from './socket';
import { useVoice } from './voice';

function codeFromUrl(): string | null {
  const m = window.location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})\/?$/);
  if (m) return m[1].toUpperCase();
  const q = new URLSearchParams(window.location.search).get('room');
  return q ? q.toUpperCase() : null;
}

export function App() {
  const [name, setName] = useState(savedName());
  const [joinCode, setJoinCode] = useState(codeFromUrl() ?? '');
  const [state, setState] = useState<StatePayload | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roomRef = useRef<string | null>(null);
  const voice = useVoice((m) => showErrorRef.current(m));
  const showErrorRef = useRef<(m: string) => void>(() => undefined);
  roomRef.current = roomCode;

  const showError = useCallback((msg: string) => {
    setError(msg);
    window.setTimeout(() => setError((e) => (e === msg ? null : e)), 4000);
  }, []);

  showErrorRef.current = showError;

  const join = useCallback(
    (code: string, playerName: string) => {
      setBusy(true);
      socket.emit('joinRoom', { code, name: playerName, token: playerToken() }, (res) => {
        setBusy(false);
        if (res.ok) {
          setRoomCode(res.code);
          window.history.replaceState(null, '', `/r/${res.code}`);
        } else {
          showError(res.error);
          if (!roomRef.current) window.history.replaceState(null, '', '/');
        }
      });
    },
    [showError],
  );

  useEffect(() => {
    const onState = (p: StatePayload) => setState(p);
    const onConnect = () => {
      setConnected(true);
      // Re-claim our seat after a dropped connection.
      if (roomRef.current) join(roomRef.current, savedName() || 'Player');
    };
    const onDisconnect = () => setConnected(false);
    socket.on('state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('state', onState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [join]);

  // Arriving from an invite link with a saved name: join straight away.
  useEffect(() => {
    const code = codeFromUrl();
    if (code && savedName()) join(code, savedName());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = () => {
    const n = name.trim();
    if (!n) return showError('Enter your name first.');
    saveName(n);
    setBusy(true);
    socket.emit('createRoom', { name: n, token: playerToken() }, (res) => {
      setBusy(false);
      if (res.ok) {
        setRoomCode(res.code);
        window.history.replaceState(null, '', `/r/${res.code}`);
      } else showError(res.error);
    });
  };

  const submitJoin = () => {
    const n = name.trim();
    if (!n) return showError('Enter your name first.');
    if (!joinCode.trim()) return showError('Enter the room code.');
    saveName(n);
    join(joinCode.trim().toUpperCase(), n);
  };

  const leave = () => {
    if (voice.status !== 'off') voice.leave();
    socket.emit('leaveRoom');
    setRoomCode(null);
    setState(null);
    window.history.replaceState(null, '', '/');
  };

  const inRoom = roomCode && state && state.room.code === roomCode;

  return (
    <div className="app">
      {!connected && <div className="banner">Connecting to the server…</div>}
      {error && (
        <div className="toast" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {!inRoom ? (
        <Home
          name={name}
          setName={setName}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          onCreate={create}
          onJoin={submitJoin}
          busy={busy || !connected}
          invited={!!codeFromUrl()}
        />
      ) : state.room.status === 'lobby' || !state.game ? (
        <Lobby state={state} onError={showError} onLeave={leave} voice={voice} />
      ) : (
        <Table state={state} onError={showError} onLeave={leave} voice={voice} />
      )}
    </div>
  );
}

function Home(props: {
  name: string;
  setName: (s: string) => void;
  joinCode: string;
  setJoinCode: (s: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  busy: boolean;
  invited: boolean;
}) {
  return (
    <main className="home">
      <h1>
        <span className="logo">28</span> Card Game
      </h1>
      <p className="tagline">Play Twenty-Eight with friends. Make a room, share the link, and deal.</p>
      <label className="field">
        Your name
        <input
          value={props.name}
          maxLength={20}
          autoFocus
          placeholder="e.g. Adam"
          onChange={(e) => props.setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (props.invited ? props.onJoin() : props.onCreate())}
        />
      </label>
      <div className="home-actions">
        {!props.invited && (
          <section className="panel">
            <h2>Start a new room</h2>
            <button className="primary" disabled={props.busy} onClick={props.onCreate}>
              Create room
            </button>
          </section>
        )}
        <section className="panel">
          <h2>{props.invited ? 'You were invited to a room' : 'Join a room'}</h2>
          <div className="row">
            <input
              aria-label="Room code"
              value={props.joinCode}
              placeholder="Room code"
              maxLength={8}
              onChange={(e) => props.setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && props.onJoin()}
            />
            <button className={props.invited ? 'primary' : ''} disabled={props.busy} onClick={props.onJoin}>
              Join
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
