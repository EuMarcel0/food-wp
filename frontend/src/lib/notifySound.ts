let context: AudioContext | null = null;
let unlocked = false;

function getContext() {
  if (!context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

export function unlockNotifySound() {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") {
    void audio.resume();
  }
  unlocked = true;
}

export function playNewOrderSound() {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") {
    void audio.resume();
  }
  if (!unlocked && audio.state !== "running") return;

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

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
