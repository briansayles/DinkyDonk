export const timerSettingsStorageKey = "dinky-donk-timer-settings";

export const defaultTimerSettings = {
  alarmSound: "triple-ding",
  volume: 1,
  spokenAnnouncementEnabled: true,
  announcementSpeed: 1,
  countdownWarningSeconds: 10,
  countdownWarningSound: "single-ding",
  countdownWarningSpeechEnabled: false,
  countdownWarningAnnouncement: "{seconds} seconds remaining.",
  announcement:
    "The blinds are now {smallBlind} and {bigBlind}{antePhrase}.",
};

const alarmSoundOptions = [
  "single-ding",
  "double-ding",
  "triple-ding",
  "alarm-clock",
  "hockey-horn",
  "train-whistle",
  "ship-horn",
  "off",
];

export function normalizeTimerSettings(settings) {
  return {
    alarmSound: alarmSoundOptions.includes(settings?.alarmSound)
      ? settings.alarmSound
      : defaultTimerSettings.alarmSound,
    volume:
      typeof settings?.volume === "number" && Number.isFinite(settings.volume)
        ? Math.max(0, Math.min(1, settings.volume))
        : defaultTimerSettings.volume,
    spokenAnnouncementEnabled:
      typeof settings?.spokenAnnouncementEnabled === "boolean"
        ? settings.spokenAnnouncementEnabled
        : defaultTimerSettings.spokenAnnouncementEnabled,
    announcementSpeed:
      typeof settings?.announcementSpeed === "number" &&
      Number.isFinite(settings.announcementSpeed)
        ? Math.max(0.5, Math.min(2, settings.announcementSpeed))
        : defaultTimerSettings.announcementSpeed,
    countdownWarningSeconds:
      typeof settings?.countdownWarningSeconds === "number" &&
      Number.isFinite(settings.countdownWarningSeconds)
        ? Math.max(
            1,
            Math.min(3_600, Math.floor(settings.countdownWarningSeconds)),
          )
        : defaultTimerSettings.countdownWarningSeconds,
    countdownWarningSound: alarmSoundOptions.includes(
      settings?.countdownWarningSound,
    )
      ? settings.countdownWarningSound
      : defaultTimerSettings.countdownWarningSound,
    countdownWarningSpeechEnabled:
      typeof settings?.countdownWarningSpeechEnabled === "boolean"
        ? settings.countdownWarningSpeechEnabled
        : defaultTimerSettings.countdownWarningSpeechEnabled,
    countdownWarningAnnouncement:
      typeof settings?.countdownWarningAnnouncement === "string"
        ? settings.countdownWarningAnnouncement
        : defaultTimerSettings.countdownWarningAnnouncement,
    announcement:
      typeof settings?.announcement === "string"
        ? settings.announcement
        : defaultTimerSettings.announcement,
  };
}
