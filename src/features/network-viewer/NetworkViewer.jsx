import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatChipNumber, formatCurrency, sortChips, sortLevels } from "../../domain/tournament";
import { defaultTimerSettings } from "../settings/timerSettings";
import TimerPanel from "../timer/TimerPanel";
import { getDisplayedTimerMessage, getTimerMessages } from "../timer/timerMessages";
import { useTimer } from "../timer/useTimer";
import { getViewerSummary } from "./viewerSummary";
import { getViewerShareUrl } from "./viewerShare";

const TIMER_ANCHOR_DRIFT_THRESHOLD_MS = 2_000;
const VIEWER_SYNC_INTERVAL_MS = 1_000;

export default function NetworkViewer() {
  const [tournament, setTournament] = useState(null);
  const [status, setStatus] = useState("Connecting to the desktop app...");

  useEffect(() => {
    let active = true;
    let timeout;
    let controller;

    async function synchronize() {
      controller = new AbortController();
      const requestTimeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/api/timer", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const snapshot = await response.json();
        if (!active) return;
        const now = Date.now();
        setTournament((previous) => {
          if (!snapshot) return null;

          const previousElapsedMs =
            previous?.timerIsRunning && previous.timerStartedAt !== null
              ? previous.timerElapsedMs + now - previous.timerStartedAt
              : null;
          const shouldResetAnchor =
            snapshot.running &&
            (
              !previous?.timerIsRunning ||
              previous.id !== snapshot.id ||
              previousElapsedMs === null ||
              Math.abs(snapshot.elapsedMs - previousElapsedMs) >
                TIMER_ANCHOR_DRIFT_THRESHOLD_MS
            );

          return {
            ...snapshot,
            levels: sortLevels(snapshot.levels),
            chips: sortChips(snapshot.chips),
            timerElapsedMs:
              snapshot.running && !shouldResetAnchor
                ? previous.timerElapsedMs
                : snapshot.elapsedMs,
            timerIsRunning: snapshot.running,
            timerStartedAt: snapshot.running
              ? shouldResetAnchor
                ? now
                : previous.timerStartedAt
              : null,
          };
        });
        setStatus(snapshot ? "" : "No active tournament. Select one in the desktop app.");
      } catch (error) {
        if (active) {
          console.error("Could not synchronize the timer.", error);
          setStatus("Connection lost. The displayed timer may be out of date; retrying...");
        }
      } finally {
        window.clearTimeout(requestTimeout);
        if (active) timeout = window.setTimeout(synchronize, VIEWER_SYNC_INTERVAL_MS);
      }
    }

    synchronize();
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  const summary = useMemo(() => tournament ? getViewerSummary(tournament) : null, [tournament]);
  const { messages, averageChipstackMessage } = getTimerMessages({
    name: tournament?.name,
    startingPlayers: tournament?.buyinCount ?? 0,
    totalEntries: summary?.totalEntries ?? 0,
    totalPrizePool: summary?.totalPrizePool ?? 0,
    effectivePayoutPlaces: summary?.effectivePayoutPlaces ?? 0,
    allowPayoutOverride: tournament?.allowPayoutOverride ?? false,
    payoutPlaces: tournament?.payoutPlaces ?? 0,
    payouts: tournament?.payouts ?? [],
    remainingPlayers: summary?.remainingPlayers ?? 0,
    averageChipstack: summary?.averageChipstack ?? 0,
  });
  const timer = useTimer({
    activeTab: "Timer",
    activeTournament: tournament,
    timerMessages: messages,
    timerSettings: defaultTimerSettings,
    readOnly: true,
  });
  const message = getDisplayedTimerMessage(
    timer.activeTimerMessage, timer.activeTimerMessageIndex, messages,
    averageChipstackMessage, summary?.averageChipstack ?? 0, timer.currentLevel,
  );
  const viewerUrl = getViewerShareUrl(window.location);
  const viewerShare = !viewerUrl ? (
    <p className="network-viewer-share-warning">
      Open the viewer using a network address to share it.
    </p>
  ) : (
    <a className="network-viewer-share" href={viewerUrl} aria-label={`Scan to open the timer at ${viewerUrl}`}>
      <QRCodeSVG value={viewerUrl} size={160} marginSize={4} aria-hidden="true" />
      <span>Scan to view timer</span>
    </a>
  );

  return (
    <section
      ref={timer.timerPanelRef}
      className={`tab-panel timer-tab-panel network-viewer${timer.startedAt !== null ? " timer-tab-panel-active" : ""}`}
      aria-label="Read-only tournament timer"
    >
      {status && <p className="network-viewer-status" role="status">{status}</p>}
      {timer.timerFullscreenError && <p className="timer-fullscreen-error" role="alert">{timer.timerFullscreenError}</p>}
      {tournament && (
        <div className="active-structure-panel timer-panel-content">
          <TimerPanel
            readOnly
            activeTimerMessage={message}
            activeTimerMessageIndex={timer.activeTimerMessageIndex}
            timerMessageCount={messages.length}
            currentLevel={timer.currentLevel}
            elapsedMs={timer.elapsedMs}
            hourProgress={timer.hourProgress}
            minuteProgress={timer.minuteProgress}
            nextLevel={timer.nextLevel}
            onFinishChipAnimation={timer.finishTimerChipAnimation}
            onToggleFullscreen={timer.toggleTimerFullscreen}
            progressColor={timer.progressColor}
            secondProgress={timer.secondProgress}
            startedAt={timer.startedAt}
            timerChips={timer.timerChips}
            timerIsFullscreen={timer.timerIsFullscreen}
            timerSettings={defaultTimerSettings}
            totalDurationMs={timer.totalDurationMs}
          >
            <div className="timer-right-middle timer-entry-column network-viewer-summary">
              {viewerShare}
              <dl>
                <dt>Starting players</dt><dd>{formatChipNumber(tournament.buyinCount)}</dd>
                <dt>Prize pool</dt><dd>{formatCurrency(summary.totalPrizePool)}</dd>
                <dt>Players paid</dt><dd>{formatChipNumber(summary.effectivePayoutPlaces)}</dd>
                <dt>Players remaining</dt><dd>{formatChipNumber(summary.remainingPlayers)}</dd>
                <dt>Chips in play</dt><dd>{formatChipNumber(summary.totalChipsInPlay)}</dd>
                <dt>Tables</dt><dd>{formatChipNumber(summary.tableCount)}</dd>
              </dl>
            </div>
          </TimerPanel>
        </div>
      )}
      {!tournament && <div className="network-viewer-share-empty">{viewerShare}</div>}
    </section>
  );
}
