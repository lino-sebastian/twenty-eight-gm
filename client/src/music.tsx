import { useEffect, useRef, useState } from 'react';

/**
 * Lobby background music. Drop an audio file at client/public/music/lobby.mp3
 * (it is served as /music/lobby.mp3). If the file is missing, no music button is shown.
 * Browsers block sound until the visitor interacts with the page, so playback starts on
 * the first tap or click, and each visitor's on/off choice is remembered.
 */
export const LOBBY_MUSIC_URL = '/music/lobby.mp3';
const VOLUME = 0.35;

function readPref(): boolean {
  try {
    return localStorage.getItem('t28.music') !== 'off';
  } catch {
    return true;
  }
}

function savePref(on: boolean) {
  try {
    localStorage.setItem('t28.music', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

export function LobbyMusic() {
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(readPref());
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  // Only show the button if a real audio file is there (a missing file returns the app page instead).
  useEffect(() => {
    let cancelled = false;
    fetch(LOBBY_MUSIC_URL, { method: 'HEAD' })
      .then((r) => {
        if (!cancelled && r.ok && (r.headers.get('content-type') ?? '').startsWith('audio')) setAvailable(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!available) return;
    const a = new Audio(LOBBY_MUSIC_URL);
    a.loop = true;
    a.volume = VOLUME;
    a.onplay = () => setPlaying(true);
    a.onpause = () => setPlaying(false);
    audio.current = a;
    return () => {
      // Fade out when leaving the lobby (for example when the game starts).
      const start = a.volume;
      let step = 0;
      const t = window.setInterval(() => {
        step++;
        a.volume = Math.max(0, start * (1 - step / 10));
        if (step >= 10) {
          window.clearInterval(t);
          a.pause();
          a.src = '';
        }
      }, 60);
      audio.current = null;
    };
  }, [available]);

  // Start on load if allowed, otherwise on the first interaction.
  useEffect(() => {
    const a = audio.current;
    if (!a || !on) return;
    const tryPlay = () => a.play().catch(() => undefined);
    tryPlay();
    const unlock = () => {
      tryPlay();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [on, available]);

  if (!available) return null;
  const toggle = () => {
    const next = !on;
    setOn(next);
    savePref(next);
    if (!next) audio.current?.pause();
  };
  return (
    <button type="button" className={`music-btn${playing ? ' playing' : ''}`} onClick={toggle} title={on ? 'Turn music off' : 'Turn music on'}>
      <span className="eq" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {on ? 'Music on' : 'Music off'}
    </button>
  );
}
