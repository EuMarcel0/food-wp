let context: AudioContext | null = null;
let pending: "order" | "message" | null = null;
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

function flushPending() {
  if (!pending || !context || !canPlay(context)) return;
  const kind = pending;
  pending = null;
  if (kind === "order") playOrderTone(context);
  else playMessageTone(context);
}

async function play(kind: "order" | "message") {
  const audio = await resumeContext();
  if (!audio) return;
  if (!canPlay(audio)) {
    pending = kind;
    return;
  }
  pending = null;
  if (kind === "order") playOrderTone(audio);
  else playMessageTone(audio);
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
