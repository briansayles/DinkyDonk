import { useLayoutEffect, useRef, useState } from "react";
import {
  formatBlinds,
  formatChipDenomination,
  formatChipNumber,
  formatClock,
  normalizeEdgeSpotQuantity,
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
      const diameter = entry.contentRect.width * 0.75;
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
      element.style.fontSize = `${fontSize * 0.9}px`;
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
        "--chip-entry-offset": chip.isEnteringBackwards ? "-180%" : "180%",
        "--chip-exit-offset": chip.isExitingBackwards ? "180%" : "-180%",
        "--chip-edge-spot-quantity": normalizeEdgeSpotQuantity(
          chip.edgeSpotQuantity,
        ),
      }}
      onAnimationEnd={(event) => onAnimationEnd(chip.key, event.animationName)}
      role="img"
      aria-hidden={chip.isExiting}
      aria-label={`${formatChipDenomination(chip.denomination)} chip`}
      title="Double-click to edit chip settings"
      onDoubleClick={onDoubleClick}
    >
      {formatChipDenomination(chip.denomination)}
    </div>
  );
}

function TimerClock({ remainingMs }) {
  const clockRef = useRef(null);
  const text = formatClock(remainingMs);

  useLayoutEffect(() => {
    const element = clockRef.current;
    const container = element?.closest(".timer-clock-area");
    const visual = element?.parentElement;
    const context = document.createElement("canvas").getContext("2d");
    if (!element || !container || !visual || !context) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      const circleBounds = visual.getBoundingClientRect();
      const circleDiameter = Math.min(circleBounds.width, circleBounds.height);
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
    resizeObserver.observe(visual);
    return () => resizeObserver.disconnect();
  }, [text]);

  return (
    <p ref={clockRef} className="timer-clock" aria-live="off">
      <span key={text} className="timer-clock-value">
        {text}
      </span>
    </p>
  );
}

function TimerProgress({ className, radius, circumference, progress }) {
  const circleRef = useRef(null);
  const previousProgressRef = useRef(progress);

  useLayoutEffect(() => {
    const circle = circleRef.current;
    // Keep the transition choice until the next progress change, even on rerenders.
    circle.style.transition = progress > previousProgressRef.current
      ? "stroke 0.25s ease"
      : "";
    circle.style.strokeDashoffset = circumference * (1 - progress);
    previousProgressRef.current = progress;
  }, [circumference, progress]);

  return (
    <circle
      ref={circleRef}
      className={`timer-progress-value ${className}`}
      cx="50"
      cy="50"
      r={radius}
      style={{ strokeDasharray: circumference }}
    />
  );
}

function useFitBlinds(value) {
  const groupRef = useRef(null);
  const valueRef = useRef(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const element = valueRef.current;
    if (!group || !element) {
      return;
    }

    const measure = document.createElement("span");
    measure.style.cssText =
      "position: fixed; visibility: hidden; white-space: pre; font-size: 100px; left: -10000px; top: 0;";
    document.body.appendChild(measure);

    const updateSize = () => {
      const style = window.getComputedStyle(element);
      measure.style.fontFamily = style.fontFamily;
      measure.style.fontWeight = style.fontWeight;
      measure.style.fontStyle = style.fontStyle;
      measure.style.fontStretch = style.fontStretch;
      measure.style.fontVariantNumeric = style.fontVariantNumeric;
      measure.style.fontFeatureSettings = style.fontFeatureSettings;
      measure.style.letterSpacing = style.letterSpacing;
      const texts = [value, ...Array.from(
        element.querySelectorAll('[aria-hidden="true"]'),
        (span) => span.textContent,
      )];
      const textWidth = Math.max(...texts.map((text) => {
        measure.textContent = text;
        return measure.getBoundingClientRect().width;
      }));
      const fontSize = parseFloat(style.fontSize);
      if (textWidth > 0 && fontSize > 0 && group.clientWidth > 0) {
        const padding = (parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)) / fontSize;
        element.style.setProperty(
          "--timer-blinds-fit",
          `${(group.clientWidth * 0.99) / (textWidth / 100 + padding)}px`,
        );
      }
    };

    const observer = new ResizeObserver(updateSize);
    const mutations = new MutationObserver(updateSize);
    observer.observe(group);
    mutations.observe(element, { childList: true, subtree: true, characterData: true });
    updateSize();
    return () => {
      observer.disconnect();
      mutations.disconnect();
      measure.remove();
    };
  }, [value]);

  return [groupRef, valueRef];
}

function NextBlinds({ direction, value, onEditSection }) {
  const [groupRef, valueRef] = useFitBlinds(value);

  return (
    <div
      ref={groupRef}
      className="timer-next-blinds-group"
      title="Double-click to edit the blinds schedule"
      onDoubleClick={() => onEditSection("edit-entry-levels")}
    >
      <p ref={valueRef} className="timer-next-blinds">
        <AnimatedBlindValue
          className="timer-next-blinds-value"
          direction={direction}
          value={value}
        />
      </p>
      <p className="timer-next-blinds-label">Next Blinds</p>
    </div>
  );
}

function AnimatedBlindValue({ className, direction, value }) {
  const previousValueRef = useRef(value);
  const transitionTimeoutRef = useRef(null);
  const [transition, setTransition] = useState(null);

  useLayoutEffect(() => {
    const previousValue = previousValueRef.current;
    previousValueRef.current = value;

    if (previousValue === value) {
      return;
    }

    window.clearTimeout(transitionTimeoutRef.current);
    if (!previousValue.trim()) {
      transitionTimeoutRef.current = null;
      setTransition(null);
      return;
    }

    setTransition({ value: previousValue, direction });
    transitionTimeoutRef.current = window.setTimeout(() => {
      transitionTimeoutRef.current = null;
      setTransition(null);
    }, 1200);
  }, [direction, value]);

  useLayoutEffect(
    () => () => window.clearTimeout(transitionTimeoutRef.current),
    [],
  );

  return (
    <>
      {transition !== null && (
        <span
          key={`leaving-${transition.value}-${transition.direction}`}
          className={`${className} ${className}-leaving-${transition.direction}`}
          aria-hidden="true"
        >
          {transition.value}
        </span>
      )}
      <span
        className={
          transition === null
            ? className
            : `${className} ${className}-entering-${transition.direction}`
        }
      >
        {value}
      </span>
    </>
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
      {name === "exit-timer" && (
        <path
          d="M13 4H5v16h8M10 12h10m-4-4 4 4-4 4"
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
  timerMessageCount,
  timerSettings,
  totalDurationMs,
}) {
  const currentLevelIndex = currentLevel?.index ?? null;
  const previousLevelIndexRef = useRef(currentLevelIndex);
  const chipContainerRef = useRef(null);
  const chipSlotsRef = useRef(new Map());
  const chipPositionsRef = useRef(new Map());
  const chipMoveAnimationsRef = useRef(new WeakMap());
  const blindsDirection =
    currentLevelIndex !== null &&
    previousLevelIndexRef.current !== null &&
    currentLevelIndex < previousLevelIndexRef.current
      ? "down"
      : "up";

  useLayoutEffect(() => {
    previousLevelIndexRef.current = currentLevelIndex;
  }, [currentLevelIndex]);

  useLayoutEffect(() => {
    const positions = new Map();
    for (const [key, slot] of chipSlotsRef.current) {
      const top = slot.offsetTop;
      positions.set(key, top);
      const previousTop = chipPositionsRef.current.get(key);
      if (previousTop === undefined || previousTop === top) {
        continue;
      }

      const previousAnimation = chipMoveAnimationsRef.current.get(slot);
      const transform = window.getComputedStyle(slot).transform;
      const currentOffset = previousAnimation && transform !== "none"
        ? new DOMMatrixReadOnly(transform).m42
        : 0;
      previousAnimation?.cancel();
      const animation = slot.animate(
        [
          { transform: `translateY(${previousTop - top + currentOffset}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 800, easing: "cubic-bezier(0.2, 0.75, 0.25, 1)" },
      );
      chipMoveAnimationsRef.current.set(slot, animation);
    }
    chipPositionsRef.current = positions;
  }, [timerChips]);

  useLayoutEffect(() => {
    const container = chipContainerRef.current;
    const observer = new ResizeObserver(() => {
      chipPositionsRef.current = new Map(
        [...chipSlotsRef.current].map(([key, slot]) => [key, slot.offsetTop]),
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const currentBlindsText = !currentLevel
    ? "\u00a0"
    : currentLevel.level.isBreak
      ? "BREAK"
      : formatBlinds(
          currentLevel.level.smallBlind,
          currentLevel.level.bigBlind,
          currentLevel.level.ante,
        );
  const nextBlindsText = !nextLevel
    ? "Last Level"
    : nextLevel.level.isBreak
      ? "BREAK"
      : formatBlinds(
          nextLevel.level.smallBlind,
          nextLevel.level.bigBlind,
          nextLevel.level.ante,
        );
  const isPaused = currentLevel && startedAt === null;
  const [currentBlindsGroupRef, currentBlindsValueRef] = useFitBlinds(currentBlindsText);

  return (
    <div className={`timer-display${isPaused ? " timer-display-paused" : ""}`}>
      <div className="timer-current-blinds-row">
        <div className="timer-current-blinds-logo-slot">
          <img src="/dinkydonk_logo_transparent_edges.png" alt="DinkyDonk" />
        </div>
        <div
          ref={currentBlindsGroupRef}
          className="timer-blinds-group"
          data-tour="timer-blinds"
          title="Double-click to edit the blinds schedule"
          onDoubleClick={() => onEditSection("edit-entry-levels")}
        >
          <div className="timer-current-blinds-content">
            <p ref={currentBlindsValueRef} className="timer-blinds" aria-hidden={!currentLevel}>
              <AnimatedBlindValue
                className="timer-blinds-value"
                direction={blindsDirection}
                value={currentBlindsText}
              />
            </p>
            {isPaused && (
              <span className="timer-paused-indicator" role="status">
                Timer Paused
              </span>
            )}
          </div>
          <p className="timer-blinds-label">Current Blinds</p>
        </div>
        <div className="timer-current-blinds-actions">
          <button
            className="timer-qr-fullscreen-button"
            type="button"
            onClick={onToggleFullscreen}
            data-tour="timer-fullscreen"
            aria-label={
              timerIsFullscreen ? "Exit Timer" : "Enter fullscreen"
            }
            aria-pressed={timerIsFullscreen}
            title={
              timerIsFullscreen ? "Exit Timer" : "Enter fullscreen"
            }
          >
            <TimerIcon
              name={timerIsFullscreen ? "exit-timer" : "fullscreen"}
            />
          </button>
        </div>
      </div>
      <div className="timer-next-blinds-row">
        <a
          className="timer-qr-link"
          href="https://briansayles.github.io/DinkyDonk"
          target="_blank"
          rel="noreferrer"
          title="Get DinkyDonk"
        >
          <img src="/DinkyDonk_QR_Code.png" alt="DinkyDonk GitHub QR code" />
          <span className="timer-qr-caption">
            <br/>Get DinkyDonk.<br/>It's free and open source!
          </span>
        </a>
        {currentLevel ? (
          <NextBlinds
            direction={blindsDirection}
            value={nextBlindsText}
            onEditSection={onEditSection}
          />
        ) : <div />}
        <a
          className="timer-qr-link"
          href="https://www.buymeacoffee.com/briansayles"
          data-tour="timer-support"
          target="_blank"
          rel="noreferrer"
          aria-label="Support DinkyDonk on Buy Me a Coffee"
          title="Buy the Developer a Coffee"
        >
          <img src="/qr-code.png" alt="Buy Me a Coffee QR code" />
          <span className="timer-qr-caption">
            <br/>Support DinkyDonk on<br/>Buy Me a Coffee!
          </span>
        </a>
      </div>
      <div 
        ref={chipContainerRef}
        className="timer-left-chips" 
        aria-label="Chips in use" 
        data-tour="timer-chips"
        style={{ "--timer-chip-slots": Math.max(4, timerChips.length) }}
      >
        {timerChips.map((chip) => (
          <div
            className="timer-chip-slot"
            key={chip.key}
            ref={(slot) => {
              if (slot) chipSlotsRef.current.set(chip.key, slot);
              else chipSlotsRef.current.delete(chip.key);
            }}
          >
            <TimerChip
              chip={chip}
              onAnimationEnd={onFinishChipAnimation}
              onDoubleClick={() => onEditSection("edit-entry-chips")}
            />
          </div>
        ))}
      </div>
      <div
        className="timer-clock-area"
        data-tour="timer-clock-area"
        title="Double-click to edit the blinds schedule"
        onDoubleClick={() => onEditSection("edit-entry-levels")}
      >
        {currentLevel ? (
          <div className={`timer-countdown timer-progress-${progressColor}`}>
            <div className="timer-countdown-visual">
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
                <TimerProgress
                  className="timer-progress-hours"
                  radius="46"
                  circumference={289.03}
                  progress={hourProgress}
                />
                <circle
                  className="timer-progress-track"
                  cx="50"
                  cy="50"
                  r="42.6"
                />
                <TimerProgress
                  className="timer-progress-minutes"
                  radius="42.6"
                  circumference={267.66}
                  progress={minuteProgress}
                />
                <circle
                  className="timer-progress-track"
                  cx="50"
                  cy="50"
                  r="39.2"
                />
                <TimerProgress
                  className="timer-progress-seconds"
                  radius="39.2"
                  circumference={246.3}
                  progress={secondProgress}
                />
              </svg>
              <TimerClock remainingMs={currentLevel.remainingMs} />
            </div>
            <div className="timer-message" aria-live="polite">
              <span
                key={activeTimerMessageIndex}
                className={`timer-message-text${timerMessageCount === 1 ? " timer-message-text-static" : ""}`}
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
      <div 
        className="timer-bottom-center"
        data-tour="timer-transport-controls"
      >
        <div className="timer-controls">
          <button
            className="timer-control-button"
            type="button"
            onClick={onResetTimer}
            data-tour="timer-reset"
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
            data-tour="timer-previous-level"
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
            data-tour="timer-reset-level"
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
            data-tour="timer-play-pause"
            disabled={totalDurationMs === 0 && startedAt === null}
            aria-label={startedAt === null ? "Play timer" : "Pause timer"}
            title={startedAt === null ? "Play timer" : "Pause timer"}
          >
            <TimerIcon name={startedAt === null ? "play" : "pause"} />
          </button>
          <button
            className="timer-control-button"
            type="button"
            onClick={onJumpToNextLevel}
            data-tour="timer-next-level"
            disabled={!nextLevel}
            aria-label="Jump to next level"
            title="Jump to next level"
          >
            <TimerIcon name="next" />
          </button>
          <label className="timer-volume-control" data-tour="timer-volume">
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
        </div>
      </div>
    </div>
  );
}
