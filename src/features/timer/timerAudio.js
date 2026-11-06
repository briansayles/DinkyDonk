const alarmPatterns = {
  "single-ding": [
    { frequency: 880, start: 0, duration: 0.6, type: "sine", volume: 0.25 },
  ],
  "double-ding": [0, 0.62].map((start) => ({
    frequency: 880,
    start,
    duration: 0.6,
    type: "sine",
    volume: 0.25,
  })),
  "triple-ding": [0, 0.62, 1.24].map((start) => ({
    frequency: 880,
    start,
    duration: 0.6,
    type: "sine",
    volume: 0.25,
  })),
  "alarm-clock": [0, 0.28, 0.56].map((start) => ({
    frequency: 1000,
    start,
    duration: 0.18,
    type: "square",
    volume: 0.12,
  })),
  "hockey-horn": [
    { frequency: 231, start: 0, duration: 1.7, type: "sawtooth", volume: 0.1 },
    { frequency: 295, start: 0, duration: 1.7, type: "sawtooth", volume: 0.1 },
    { frequency: 335, start: 0, duration: 1.7, type: "triangle", volume: 0.12 },
  ],
  "train-whistle": [0, 0.82].flatMap((start) => [
    {
      frequency: 880,
      endFrequency: 740,
      start,
      duration: 0.68,
      type: "sine",
      volume: 0.18,
    },
    {
      frequency: 1175,
      endFrequency: 988,
      start,
      duration: 0.68,
      type: "sine",
      volume: 0.16,
    },
  ]),
  "ship-horn": [
    { frequency: 131, start: 0, duration: 1.8, type: "sawtooth", volume: 0.18 },
    { frequency: 175, start: 0, duration: 1.8, type: "triangle", volume: 0.16 },
  ],
};

export function playTimerAlarm(audioContext, volume, sound, onComplete) {
  if (sound === "off") {
    onComplete();
    return;
  }

  if (!audioContext || audioContext.state !== "running") {
    console.error("Timer alarm audio is not available.");
    onComplete();
    return;
  }

  const notes = alarmPatterns[sound];
  if (!notes) {
    console.error("Unknown timer alarm sound.", sound);
    onComplete();
    return;
  }

  const now = audioContext.currentTime;
  const masterVolume = audioContext.createGain();
  masterVolume.gain.setValueAtTime(volume, now);
  masterVolume.connect(audioContext.destination);

  let finalOscillator = null;
  let finalEndTime = 0;
  for (const note of notes) {
    const startTime = now + note.start;
    const endTime = startTime + note.duration;
    const oscillator = audioContext.createOscillator();
    const noteVolume = audioContext.createGain();
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, startTime);
    if (note.endFrequency) {
      oscillator.frequency.linearRampToValueAtTime(
        note.endFrequency,
        endTime,
      );
    }
    noteVolume.gain.setValueAtTime(0.0001, startTime);
    noteVolume.gain.exponentialRampToValueAtTime(
      note.volume,
      startTime + 0.025,
    );
    noteVolume.gain.setValueAtTime(note.volume, endTime - 0.08);
    noteVolume.gain.exponentialRampToValueAtTime(0.0001, endTime);
    oscillator.connect(noteVolume);
    noteVolume.connect(masterVolume);
    oscillator.start(startTime);
    oscillator.stop(endTime);
    if (endTime > finalEndTime) {
      finalEndTime = endTime;
      finalOscillator = oscillator;
    }
  }

  finalOscillator?.addEventListener("ended", onComplete);
}
