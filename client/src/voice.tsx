import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceSignal } from '../../shared/protocol';
import { socket } from './socket';

const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export type VoiceStatus = 'off' | 'connecting' | 'on';

/**
 * Peer-to-peer voice chat for the room. Each browser connects directly to every other browser
 * in the voice chat (fine for a table of 4 plus a few watchers); the server only relays the
 * connection set-up messages.
 */
export function useVoice(onError: (m: string) => void) {
  const [status, setStatus] = useState<VoiceStatus>('off');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const local = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const meter = useRef<{ ctx: AudioContext; raf: number } | null>(null);

  const closePeer = useCallback((id: string) => {
    peers.current.get(id)?.close();
    peers.current.delete(id);
    const a = audios.current.get(id);
    if (a) {
      a.srcObject = null;
      a.remove();
    }
    audios.current.delete(id);
  }, []);

  const makePeer = useCallback((id: string) => {
    closePeer(id);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    local.current?.getTracks().forEach((t) => pc.addTrack(t, local.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('voiceSignal', { to: id, signal: { kind: 'ice', candidate: e.candidate.toJSON() } });
    };
    pc.ontrack = (e) => {
      let a = audios.current.get(id);
      if (!a) {
        a = document.createElement('audio');
        a.autoplay = true;
        a.setAttribute('playsinline', '');
        document.body.appendChild(a);
        audios.current.set(id, a);
      }
      a.srcObject = e.streams[0];
      a.play().catch(() => undefined);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') closePeer(id);
    };
    peers.current.set(id, pc);
    return pc;
  }, [closePeer]);

  const stop = useCallback(() => {
    for (const id of [...peers.current.keys()]) closePeer(id);
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    if (meter.current) {
      cancelAnimationFrame(meter.current.raf);
      meter.current.ctx.close().catch(() => undefined);
      meter.current = null;
    }
    setSpeaking(false);
    setStatus('off');
  }, [closePeer]);

  const leave = useCallback(() => {
    socket.emit('voiceLeave');
    stop();
  }, [stop]);

  const join = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      onError('Voice needs a secure page. Use http://localhost, or run `npm run dev:https` for other devices.');
      return;
    }
    setStatus('connecting');
    try {
      local.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setStatus('off');
      onError('Microphone access was blocked. Allow the microphone for this site and try again.');
      return;
    }
    setMuted(false);
    startMeter(local.current, setSpeaking, meter);
    socket.emit('voiceJoin', async (res) => {
      if (!res.ok) {
        stop();
        onError(res.error);
        return;
      }
      setStatus('on');
      // The newcomer calls everyone already in the voice chat.
      for (const p of res.peers) {
        const pc = makePeer(p.socketId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('voiceSignal', { to: p.socketId, signal: { kind: 'offer', sdp: offer.sdp! } });
      }
    });
  }, [makePeer, onError, stop]);

  useEffect(() => {
    const onSignal = async ({ from, signal }: { from: string; signal: VoiceSignal }) => {
      if (!local.current) return;
      try {
        if (signal.kind === 'offer') {
          const pc = makePeer(from);
          await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voiceSignal', { to: from, signal: { kind: 'answer', sdp: answer.sdp! } });
        } else if (signal.kind === 'answer') {
          await peers.current.get(from)?.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        } else if (signal.kind === 'ice') {
          await peers.current.get(from)?.addIceCandidate(signal.candidate);
        }
      } catch (e) {
        console.warn('voice signal failed', e);
      }
    };
    const onLeft = ({ socketId }: { socketId: string }) => closePeer(socketId);
    const onDisconnect = () => stop();
    socket.on('voiceSignal', onSignal);
    socket.on('voicePeerLeft', onLeft);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('voiceSignal', onSignal);
      socket.off('voicePeerLeft', onLeft);
      socket.off('disconnect', onDisconnect);
    };
  }, [closePeer, makePeer, stop]);

  // Leave the voice chat when the component using it goes away (e.g. leaving the room).
  useEffect(() => () => {
    if (local.current) {
      socket.emit('voiceLeave');
      stop();
    }
  }, [stop]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    local.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  return { status, muted, speaking: speaking && !muted, join, leave, toggleMute };
}

function startMeter(
  stream: MediaStream,
  setSpeaking: (b: boolean) => void,
  ref: React.MutableRefObject<{ ctx: AudioContext; raf: number } | null>,
) {
  try {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let last = false;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const level = data.reduce((a, b) => a + b, 0) / data.length;
      const now = level > 18;
      if (now !== last) setSpeaking((last = now));
      ref.current!.raf = requestAnimationFrame(tick);
    };
    ref.current = { ctx, raf: requestAnimationFrame(tick) };
  } catch {
    /* level meter is optional */
  }
}

/** Voice controls shown in the lobby and at the table. */
export function VoiceControls({ voice, count }: { voice: ReturnType<typeof useVoice>; count: number }) {
  if (voice.status === 'off')
    return (
      <button type="button" className="small-btn voice-btn" onClick={voice.join} title="Talk with the room">
        🎤 Join voice{count > 0 ? ` (${count})` : ''}
      </button>
    );
  return (
    <span className="voice-controls">
      <button
        type="button"
        className={`small-btn voice-btn on${voice.speaking ? ' speaking' : ''}${voice.muted ? ' muted' : ''}`}
        onClick={voice.toggleMute}
        disabled={voice.status === 'connecting'}
        title={voice.muted ? 'Unmute' : 'Mute'}
      >
        {voice.status === 'connecting' ? 'Connecting…' : voice.muted ? '🔇 Muted' : '🎤 Live'}
      </button>
      <button type="button" className="small-btn" onClick={voice.leave}>
        Leave voice
      </button>
    </span>
  );
}
