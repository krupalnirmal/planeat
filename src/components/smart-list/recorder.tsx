'use client';

import { Mic, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * M4 — "mic → record (max 60s) … waveform feedback and visible timer during
 * recording; client-side compression (webm/opus)."
 *
 * The waveform is not decoration. On a cheap Android phone in a noisy market a
 * customer cannot tell whether the mic is working, and a recording that turns
 * out to be silence after sixty seconds of talking is the fastest way to lose
 * them. A bar that moves with their voice is the only honest signal available.
 *
 * webm/opus keeps a minute of speech in the tens of kilobytes, which matters
 * when it is being uploaded over rural 4G.
 */

const MAX_SECONDS = 60;
const BAR_COUNT = 24;

export function Recorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (blob: Blob, mimeType: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('smartList');

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Everything the browser handed us has to be given back, or the mic stays
  // on after the customer navigates away — visible as a permanent recording
  // indicator, and a genuine privacy problem.
  function cleanup() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void audioContextRef.current?.close();
    audioContextRef.current = null;

    recorderRef.current = null;
  }

  useEffect(() => cleanup, []);

  useEffect(() => {
    if (!recording) return;

    const timer = setInterval(() => {
      setSeconds((value) => {
        if (value + 1 >= MAX_SECONDS) {
          // M4's hard cap. Stopping ourselves is kinder than uploading a file
          // the server will reject.
          recorderRef.current?.stop();
          return MAX_SECONDS;
        }
        return value + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [recording]);

  function pickMimeType(): string {
    // Opus in WebM is the smallest thing every Android Chrome can produce.
    // Safari only offers mp4, so it is the fallback rather than the default.
    for (const candidate of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    }
    return '';
  }

  async function start() {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(t('micUnsupported'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType.split(';')[0] || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        cleanup();
        setRecording(false);
        setLevels(new Array(BAR_COUNT).fill(0));
        if (blob.size > 0) onRecorded(blob, type);
      };

      // ── The waveform.
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);

        // Peak deviation from silence (128), normalised. Peak rather than RMS
        // because it reacts visibly to speech on a small screen.
        let peak = 0;
        for (const sample of data) peak = Math.max(peak, Math.abs(sample - 128));

        setLevels((previous) => [...previous.slice(1), Math.min(1, peak / 60)]);
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);

      recorder.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      cleanup();
      setError(t('micDenied'));
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  return (
    <div className="rounded-[var(--radius)] border border-border/60 bg-background p-5 text-center">
      {recording ? (
        <>
          <div
            className="flex h-16 items-center justify-center gap-1"
            role="img"
            aria-label={t('recording')}
          >
            {levels.map((level, index) => (
              <span
                key={index}
                className="w-1.5 rounded-full bg-primary transition-[height] duration-75"
                style={{ height: `${Math.max(8, level * 64)}px` }}
              />
            ))}
          </div>

          <p className="mt-3 text-sm font-semibold text-danger" aria-live="polite">
            {t('recording')} {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('maxSeconds', { seconds: MAX_SECONDS })}
          </p>

          <button
            type="button"
            onClick={stop}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-danger text-sm font-bold text-white"
          >
            <Square className="size-4 fill-current" aria-hidden />
            {t('stopRecording')}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            className={cn(
              'mx-auto grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg',
              disabled && 'opacity-50',
            )}
            aria-label={t('speak')}
          >
            <Mic className="size-9" aria-hidden />
          </button>

          <p className="mt-4 text-sm font-semibold">{t('speak')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('recordHint')}</p>
        </>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
