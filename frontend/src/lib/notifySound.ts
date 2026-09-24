let context: AudioContext | null = null;
let pending: "order" | "message" | "kitchen" | null = null;
let listenersBound = false;

function getContext() {
  if (!context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

function canPlay(audio: AudioContext) {
  return audio.state === "running";
}

async function resumeContext() {
  const audio = getContext();
  if (!audio) return null;
  const state = audio.state as string;
  if (state === "suspended" || state === "interrupted") {
    try {
      await audio.resume();
    } catch {
      return audio;
    }
  }
  return audio;
}

function playOrderTone(audio: AudioContext) {
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  gain.connect(audio.destination);

  const first = audio.createOscillator();
  first.type = "sine";
  first.frequency.setValueAtTime(880, now);
  first.connect(gain);
  first.start(now);
  first.stop(now + 0.16);

  const second = audio.createOscillator();
  second.type = "sine";
  second.frequency.setValueAtTime(1174, now + 0.12);
  second.connect(gain);
  second.start(now + 0.12);
  second.stop(now + 0.42);
}

function playMessageTone(audio: AudioContext) {
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.11, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  gain.connect(audio.destination);

  const tone = audio.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(740, now);
  tone.frequency.exponentialRampToValueAtTime(980, now + 0.08);
  tone.connect(gain);
  tone.start(now);
  tone.stop(now + 0.28);
}

/** Alerta da cozinha: alto, curto e repetido (pedido impresso na estação). */
function playKitchenPrintTone(audio: AudioContext) {
  const now = audio.currentTime;
  const pulses: Array<{ at: number; freq: number; dur: number }> = [
    { at: 0, freq: 980, dur: 0.18 },
    { at: 0.22, freq: 1310, dur: 0.2 },
    { at: 0.48, freq: 1560, dur: 0.28 },
    { at: 0.9, freq: 1310, dur: 0.18 },
    { at: 1.12, freq: 1760, dur: 0.42 },
  ];

  for (const pulse of pulses) {
    const start = now + pulse.at;
    const end = start + pulse.dur;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.55, start + 0.012);
    gain.gain.setValueAtTime(0.5, end - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(audio.destination);

    const tone = audio.createOscillator();
    tone.type = "square";
    tone.frequency.setValueAtTime(pulse.freq, start);
    tone.connect(gain);
    tone.start(start);
    tone.stop(end + 0.01);

    const bright = audio.createOscillator();
    const brightGain = audio.createGain();
    brightGain.gain.setValueAtTime(0.0001, start);
    brightGain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
    brightGain.gain.exponentialRampToValueAtTime(0.0001, end);
    bright.type = "triangle";
    bright.frequency.setValueAtTime(pulse.freq * 2, start);
    bright.connect(brightGain);
    brightGain.connect(audio.destination);
    bright.start(start);
    bright.stop(end + 0.01);
  }
}

function flushPending() {
  if (!pending || !context || !canPlay(context)) return;
  const kind = pending;
  pending = null;
  if (kind === "order") playOrderTone(context);
  else if (kind === "message") playMessageTone(context);
  else playKitchenPrintTone(context);
}

async function play(kind: "order" | "message" | "kitchen") {
  const audio = await resumeContext();
  if (!audio) return;
  if (!canPlay(audio)) {
    pending = kind;
    return;
  }
  pending = null;
  if (kind === "order") playOrderTone(audio);
  else if (kind === "message") playMessageTone(audio);
  else playKitchenPrintTone(audio);
}

export async function unlockNotifySound() {
  const audio = await resumeContext();
  if (audio && canPlay(audio)) flushPending();
}

export function playNewOrderSound() {
  void play("order");
}

export function playNewMessageSound() {
  void play("message");
}

/** Som alto na estação da impressora após cupom impresso. */
export function playKitchenPrintSound() {
  void play("kitchen");
}

export function bindNotifySoundUnlock() {
  if (listenersBound || typeof window === "undefined") return () => undefined;
  listenersBound = true;

  const onGesture = () => {
    void unlockNotifySound();
  };
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    void unlockNotifySound();
  };

  const gestureOpts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener("pointerdown", onGesture, gestureOpts);
  window.addEventListener("touchstart", onGesture, gestureOpts);
  window.addEventListener("click", onGesture, gestureOpts);
  window.addEventListener("keydown", onGesture, gestureOpts);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("pageshow", onVisible);

  void unlockNotifySound();

  return () => {
    listenersBound = false;
    window.removeEventListener("pointerdown", onGesture, gestureOpts);
    window.removeEventListener("touchstart", onGesture, gestureOpts);
    window.removeEventListener("click", onGesture, gestureOpts);
    window.removeEventListener("keydown", onGesture, gestureOpts);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("pageshow", onVisible);
  };
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
