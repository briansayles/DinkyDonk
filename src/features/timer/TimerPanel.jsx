import { useLayoutEffect, useRef } from "react";
import {
  formatBlinds,
  formatChipNumber,
  formatClock,
} from "../../domain/tournament";

function TimerChip({ chip, onAnimationEnd, onDoubleClick }) {
  const chipRef = useRef(null);

  useLayoutEffect(() => {
    const element = chipRef.current;
    if (!element) {
      return;
    }

    const context = document.createElement("canvas").getContext("2d");
    if (!context) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const diameter = entry.contentRect.width;
      const text = element.textContent ?? "";
      const fontFamily = window.getComputedStyle(element).fontFamily;
      const referenceSize = 100;
      context.font = `700 ${referenceSize}px ${fontFamily}`;
      const textWidth = context.measureText(text).width;
      if (textWidth === 0 || diameter === 0) {
        return;
      }

      const maxFontSize = diameter * 0.4;
      const fontSize = Math.min(maxFontSize, (diameter * 0.7 * referenceSize) / textWidth);
      element.style.fontSize = `${fontSize}px`;
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [chip.denomination]);

  return (
    <div
      ref={chipRef}
      className={[
        "timer-chip",
        chip.isColoringUp && !chip.isExiting
          ? "timer-chip-coloring-up"
          : "",
        chip.isEntering ? "timer-chip-entering" : "",
        chip.isExiting ? "timer-chip-removing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ 
        "--chip-color": chip.color, 
        "--chip-edge-spot-color": chip.edgeSpotColor ?? "#ffffff",
        "--chip-text-color": chip.textColor ?? "#ffffff",
        "--chip-edge-spot-quantity": chip.edgeSpotQuantity ?? 6,
      }}
      onAnimationEnd={(event) => onAnimationEnd(chip.key, event.animationName)}
      role="img"
      aria-hidden={chip.isExiting}
      aria-label={`${formatChipNumber(chip.denomination)} chip`}
      title="Double-click to edit chip settings"
      onDoubleClick={onDoubleClick}
    >
      {formatChipNumber(chip.denomination)}
    </div>
  );
}

function TimerClock({ remainingMs }) {
  const clockRef = useRef(null);
  const text = formatClock(remainingMs);

  useLayoutEffect(() => {
    const element = clockRef.current;
    const container = element?.closest(".timer-clock-area");
    const context = document.createElement("canvas").getContext("2d");
    if (!element || !container || !context) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      const circleDiameter =
        element.parentElement?.getBoundingClientRect().width ?? 0;
      const availableWidth = container.clientWidth;
      const fontFamily = window.getComputedStyle(element).fontFamily;
      const referenceSize = 100;
      context.font = `700 ${referenceSize}px ${fontFamily}`;
      const textWidth = context.measureText(text).width;
      if (circleDiameter > 0 && availableWidth > 0 && textWidth > 0) {
        const fontSize = Math.min(
          circleDiameter * 0.4725,
          (availableWidth * 0.9 * referenceSize) / textWidth,
        );
        element.style.fontSize = `${fontSize}px`;
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [text]);

  return (
    <p ref={clockRef} className="timer-clock" aria-live="off">
      {text}
    </p>
  );
}

export function TimerIcon({ name }) {
  return (
    <svg
      className="timer-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {name === "play" && (
        <path d="M8 5v14l11-7z" fill="currentColor" />
      )}
      {name === "pause" && (
        <>
          <path d="M7 5h4v14H7z" fill="currentColor" />
          <path d="M15 5h4v14h-4z" fill="currentColor" />
        </>
      )}
      {name === "reset" && (
        <>
          <path d="M5 5v6h6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M5.5 11a7 7 0 1 1 .8 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {name === "collapse" && (
        <path
          d="m6 15 6-6 6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {name === "expand" && (
        <path
          d="m6 9 6 6 6-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {name === "rewind" && (
        <>
          <path d="M4 5h2v14H4z" fill="currentColor" />
          <path d="m19 5-10 7 10 7z" fill="currentColor" />
        </>
      )}
      {name === "previous" && (
        <>
          <path d="M4 5h2v14H4z" fill="currentColor" />
          <path d="M8 5h2v14H8z" fill="currentColor" />
          <path d="m20 5-9 7 9 7z" fill="currentColor" />
        </>
      )}
      {name === "next" && (
        <>
          <path d="M18 5v14" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m6 6 8 6-8 6z" fill="currentColor" />
        </>
      )}
      {name === "fullscreen" && (
        <path
          d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {name === "exit-fullscreen" && (
        <path
          d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export default function TimerPanel({
  activeTimerMessage,
  activeTimerMessageIndex,
  children,
  currentLevel,
  elapsedMs,
  hourProgress,
  minuteProgress,
  nextLevel,
  onEditSection,
  onFinishChipAnimation,
  onJumpToNextLevel,
  onJumpToPreviousLevel,
  onResetTimer,
  onRestartCurrentLevel,
  onSetTimerSettings,
  onToggleFullscreen,
  onToggleTimer,
  progressColor,
  secondProgress,
  startedAt,
  timerChips,
  timerIsFullscreen,
  timerSettings,
  totalDurationMs,
}) {
  return (
    <div className="timer-display">
      <div className="timer-current-blinds-row">
        <div className="timer-current-blinds-logo-slot">
          <img src="/dinkydonk-logo.svg" alt="DinkyDonk" />
        </div>
        <div
          className="timer-blinds-group"
          title="Double-click to edit the blinds schedule"
          onDoubleClick={() => onEditSection("edit-entry-levels")}
        >
          <p className="timer-blinds" aria-hidden={!currentLevel}>
            {!currentLevel
              ? "\u00a0"
              : currentLevel.level.isBreak
                ? "BREAK"
                : formatBlinds(
                    currentLevel.level.smallBlind,
                    currentLevel.level.bigBlind,
                    currentLevel.level.ante,
                  )}
          </p>
          <p className="timer-blinds-label">Current Blinds</p>
        </div>
        <div className="timer-current-blinds-qr-slot">
          <img src="/qr-code.png" alt="QR code" />
        </div>
      </div>
      {currentLevel && (
        <div
          className="timer-next-blinds-group"
          title="Double-click to edit the blinds schedule"
          onDoubleClick={() => onEditSection("edit-entry-levels")}
        >
          <p className="timer-next-blinds">
            {!nextLevel
              ? "Last Level"
              : nextLevel.level.isBreak
                ? "BREAK"
                : formatBlinds(
                    nextLevel.level.smallBlind,
                    nextLevel.level.bigBlind,
                    nextLevel.level.ante,
                  )}
          </p>
          <p className="timer-next-blinds-label">Next Blinds</p>
        </div>
      )}
      <div className="timer-left-chips" aria-label="Chips in use">
        {timerChips.map((chip) => (
          <TimerChip
            key={chip.key}
            chip={chip}
            onAnimationEnd={onFinishChipAnimation}
            onDoubleClick={() => onEditSection("edit-entry-chips")}
          />
        ))}
      </div>
      <div className="timer-clock-area">
        {currentLevel ? (
          <div className={`timer-countdown timer-progress-${progressColor}`}>
            <svg
              className="timer-progress-ring"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <circle
                className="timer-progress-track"
                cx="50"
                cy="50"
                r="46"
              />
              <circle
                className="timer-progress-value timer-progress-hours"
                cx="50"
                cy="50"
                r="46"
                style={{
                  strokeDasharray: 289.03,
                  strokeDashoffset: 289.03 * (1 - hourProgress),
                }}
              />
              <circle
                className="timer-progress-track"
                cx="50"
                cy="50"
                r="42.6"
              />
              <circle
                className="timer-progress-value timer-progress-minutes"
                cx="50"
                cy="50"
                r="42.6"
                style={{
                  strokeDasharray: 267.66,
                  strokeDashoffset: 267.66 * (1 - minuteProgress),
                }}
              />
              <circle
                className="timer-progress-track"
                cx="50"
                cy="50"
                r="39.2"
              />
              <circle
                className="timer-progress-value timer-progress-seconds"
                cx="50"
                cy="50"
                r="39.2"
                style={{
                  strokeDasharray: 246.3,
                  strokeDashoffset: 246.3 * (1 - secondProgress),
                }}
              />
            </svg>
            <TimerClock remainingMs={currentLevel.remainingMs} />
            <div className="timer-message" aria-live="polite">
              <span
                key={activeTimerMessageIndex}
                className="timer-message-text"
              >
                {activeTimerMessage}
              </span>
            </div>
          </div>
        ) : (
          <p className="timer-complete">
            {totalDurationMs === 0
              ? "This structure has no timed levels."
              : "Tournament complete"}
          </p>
        )}
      </div>
      {children}
      <div className="timer-bottom-center">
        <div className="timer-controls">
          <button
            className="timer-control-button"
            type="button"
            onClick={onResetTimer}
            disabled={elapsedMs === 0 && startedAt === null}
            aria-label="Reset timer"
            title="Reset timer"
          >
            <TimerIcon name="reset" />
          </button>
          <button
            className="timer-control-button"
            type="button"
            onClick={onJumpToPreviousLevel}
            disabled={!currentLevel || currentLevel.index === 0}
            aria-label="Rewind to previous level"
            title="Rewind to previous level"
          >
            <TimerIcon name="previous" />
          </button>
          <button
            className="timer-control-button"
            type="button"
            onClick={onRestartCurrentLevel}
            disabled={!currentLevel}
            aria-label="Reset this level"
            title="Reset this level"
          >
            <TimerIcon name="rewind" />
          </button>
          <button
            className="timer-toggle"
            type="button"
            onClick={onToggleTimer}
            disabled={
              totalDurationMs === 0 ||
              (startedAt === null && elapsedMs >= totalDurationMs)
            }
            aria-label={startedAt === null ? "Play timer" : "Pause timer"}
            title={startedAt === null ? "Play timer" : "Pause timer"}
          >
            <TimerIcon name={startedAt === null ? "play" : "pause"} />
          </button>
          <button
            className="timer-control-button"
            type="button"
            onClick={onJumpToNextLevel}
            disabled={!nextLevel}
            aria-label="Jump to next level"
            title="Jump to next level"
          >
            <TimerIcon name="next" />
          </button>
          <label className="timer-volume-control">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={timerSettings.volume}
              onChange={(event) =>
                onSetTimerSettings((current) => ({
                  ...current,
                  volume: Number(event.target.value),
                }))
              }
              aria-label="Timer volume"
            />
          </label>
          <button
            className="timer-control-button"
            type="button"
            onClick={onToggleFullscreen}
            aria-label={
              timerIsFullscreen ? "Exit fullscreen" : "Enter fullscreen"
            }
            aria-pressed={timerIsFullscreen}
            title={
              timerIsFullscreen ? "Exit fullscreen" : "Enter fullscreen"
            }
          >
            <TimerIcon
              name={timerIsFullscreen ? "exit-fullscreen" : "fullscreen"}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
