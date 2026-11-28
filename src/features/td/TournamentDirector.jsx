import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatBlinds, formatClock, formatCurrency, getEntryContributions,
  normalizeMaxPlayersPerTable,
} from "../../domain/tournament";
import { MAX_PARTICIPANT_COUNT } from "../../domain/participants";
import { defaultTimerSettings } from "../settings/timerSettings";
import { useTimer } from "../timer/useTimer";
import { useTournaments } from "../tournaments/useTournaments";
import { getViewerSummary } from "../network-viewer/viewerSummary";
import { getHostClockOffset } from "./directorClock";

async function request(path, body) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, body === undefined ? { cache: "no-store", signal: controller.signal } : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await response.text() || `Server returned ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function EditableNumber({
  label, value, min = 0, max, step = 1, disabled, spinner = false,
  spinnerOnly = false, saving = false, onBegin, onCommit,
}) {
  const [draft, setDraft] = useState(null);
  const inputRef = useRef(null);
  const parsedDraft = draft === null || draft.trim() === "" ? NaN : Number(draft);
  const current = Number.isInteger(parsedDraft) ? parsedDraft : Number(value);
  const canDecrease = current > Number(min);
  const canIncrease = max === undefined || current < Number(max);

  function adjust(direction) {
    if (draft !== null && (draft.trim() === "" || !Number.isInteger(parsedDraft) ||
        parsedDraft < Number(min) || (max !== undefined && parsedDraft > Number(max)))) {
      onCommit(null, true);
      setDraft(null);
      return;
    }
    if (disabled || saving || (direction < 0 ? !canDecrease : !canIncrease)) return;
    const next = direction < 0
      ? Math.max(Number(min), current - 1)
      : Math.min(max === undefined ? Infinity : Number(max), current + 1);
    onBegin();
    onCommit(String(next), false);
    setDraft(null);
  }

  const input = (
    <input
      ref={inputRef}
      type="number" aria-label={label} min={min} max={max} step={step} disabled={disabled}
      inputMode={spinnerOnly ? "none" : undefined}
      aria-description={spinnerOnly ? "Use the spinner buttons or arrow keys to adjust the count." : undefined}
      value={draft ?? value}
      onFocus={() => { onBegin(); setDraft(String(value)); }}
      onChange={(event) => {
        if (!spinnerOnly) {
          onBegin();
          setDraft(event.target.value);
        }
      }}
      onKeyDown={(event) => {
        if (!spinnerOnly) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          adjust(event.key === "ArrowUp" ? 1 : -1);
          return;
        }
        const navigationKeys = ["ArrowLeft", "ArrowRight", "Home", "End", "Tab", "Shift", "Control", "Meta", "Alt", "Escape"];
        const copyOrSelect = (event.ctrlKey || event.metaKey) && ["a", "c"].includes(event.key.toLowerCase());
        if (!navigationKeys.includes(event.key) && !copyOrSelect) event.preventDefault();
      }}
      onBeforeInput={spinnerOnly ? (event) => event.preventDefault() : undefined}
      onPaste={spinnerOnly ? (event) => event.preventDefault() : undefined}
      onCut={spinnerOnly ? (event) => event.preventDefault() : undefined}
      onDrop={spinnerOnly ? (event) => event.preventDefault() : undefined}
      onBlur={(event) => {
        const invalid = draft !== null && (draft.trim() === "" || !Number.isFinite(Number(draft)) || !event.currentTarget.validity.valid);
        if (!invalid && draft !== null && Number(draft) !== Number(value)) onCommit(draft, false);
        else onCommit(null, invalid);
        setDraft(null);
      }}
    />
  );
  if (!spinner) return input;
  return <span className="td-spinner">
    <button type="button" aria-label={`Decrease ${label}`} disabled={disabled || saving || !canDecrease}
      onPointerDown={(event) => { if (document.activeElement === inputRef.current) event.preventDefault(); }}
      onClick={() => adjust(-1)}>−</button>
    {input}
    <button type="button" aria-label={`Increase ${label}`} disabled={disabled || saving || !canIncrease}
      onPointerDown={(event) => { if (document.activeElement === inputRef.current) event.preventDefault(); }}
      onClick={() => adjust(1)}>+</button>
  </span>;
}

function VolumeControl() {
  const [volume, setVolume] = useState(defaultTimerSettings.volume);
  const [error, setError] = useState("");
  const saved = useRef(null);
  const loaded = useRef(false);
  const pending = useRef(0);
  const conflicted = useRef(false);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    async function load() {
      if (pending.current || conflicted.current) return;
      try {
        const settings = await request("/api/td/settings");
        if (!active || pending.current || conflicted.current) return;
        saved.current = settings;
        loaded.current = true;
        setVolume(settings?.volume ?? defaultTimerSettings.volume);
        setError("");
      } catch (error) {
        console.error("Could not load volume.", error);
        if (active) setError("Could not synchronize volume.");
      }
    }
    load();
    const interval = window.setInterval(load, 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  function changeVolume(value) {
    setVolume(value);
    if (!loaded.current || conflicted.current) {
      setError("Reload the page before changing volume.");
      return;
    }
    pending.current += 1;
    queue.current = queue.current.then(async () => {
      if (conflicted.current) return;
      try {
        saved.current = await request("/api/td/settings", { expected: saved.current, volume: value });
        setError("");
      } catch (error) {
        console.error("Could not save volume.", error);
        conflicted.current = true;
        setError("Volume was not saved. Reload the page to use the latest settings.");
      }
    }).finally(() => { pending.current -= 1; });
  }

  return <div className="td-volume">
    <label>Volume <input type="range" min="0" max="1" step="0.05" value={volume}
      onChange={(event) => changeVolume(Number(event.target.value))} /></label>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export default function TournamentDirector() {
  const offset = useRef(0);
  const [clockOffset, setClockOffset] = useState(0);
  const [collapsed, setCollapsed] = useState({});
  const invokeCommand = useCallback(async (command, args) => {
    let result;
    const start = Date.now();
    if (command === "load_tournaments") {
      result = await request("/api/td");
    } else if (command === "apply_tournament_changes") {
      if (args.changes.length === 0) {
        result = await request("/api/td");
        if (args.activeChange && result.data.activeTournamentId !== args.activeChange.expected) {
          throw new Error("Conflict: the active tournament changed elsewhere.");
        }
      } else {
        const change = args.changes[0];
        if (args.changes.length !== 1 || change.kind !== "update" ||
            !args.activeChange || args.activeChange.expected !== change.expected.id ||
            args.activeChange.value !== change.expected.id) {
          throw new Error("Only the active tournament can be controlled.");
        }
        const mutableFields = [
          "buyins", "rebuys", "addons", "otherPrizePool", "otherChipstack", "bustouts",
          "payoutPlaces", "payouts", "maxPlayersPerTable", "timerIsRunning",
          "timerStartedAt", "timerElapsedMs",
        ];
        const tournament = { ...change.expected };
        for (const field of mutableFields) tournament[field] = change.tournament[field];
        result = await request("/api/td", { expected: change.expected, tournament });
      }
    } else {
      throw new Error(`Unsupported director operation: ${command}`);
    }
    const nextOffset = getHostClockOffset(result.hostTime, start, Date.now());
    offset.current = nextOffset;
    setClockOffset(nextOffset);
    return result.data;
  }, []);
  const hostNow = useCallback(() => Date.now() + offset.current, []);
  const controls = useTournaments({ invokeCommand, now: hostNow, reconcilePayouts: false });
  const tournament = controls.activeTournament;
  const timer = useTimer({
    activeTab: "Timer", activeTournament: tournament, timerMessages: [],
    timerSettings: defaultTimerSettings, updateTournamentTimer: controls.updateTournamentTimer,
    readOnly: true, clockOffsetMs: clockOffset,
  });

  function field(field, value, options = {}) {
    const key = options.index === undefined ? field : `${field}:${options.index}`;
    return <EditableNumber
      label={options.label ?? field} value={value ?? 0} min="0" max={options.max} step={options.step ?? 1}
      disabled={options.disabled} spinner={options.spinner} spinnerOnly={options.spinnerOnly} saving={controls.saving}
      onBegin={() => controls.beginTournamentFieldEdit(tournament, key)}
      onCommit={(draft, invalid) => {
        const expected = controls.endTournamentFieldEdit(tournament.id, key);
        if (invalid) {
          controls.setStorageError(`Enter a valid value for ${options.label ?? field}.`);
          return;
        }
        if (draft !== null && expected) {
          controls.updateTournamentField(tournament.id, field, draft, options.index,
            options.payoutPlaces, options.calculatedPayouts, expected);
          controls.flushTournamentFieldUpdates();
        }
      }}
    />;
  }

  const snapshot = tournament && {
    ...tournament,
    buyinCount: tournament.buyins.length,
    rebuyCount: tournament.rebuys.length,
    addonCount: tournament.addons.length,
    bustoutCount: tournament.bustouts.length,
  };
  const summary = snapshot && getViewerSummary(snapshot);
  const entries = tournament ? [
    { label: "Buy-ins", field: "buyinCount", count: snapshot.buyinCount, cost: tournament.buyinCost, chips: tournament.startingChipstack },
    ...(tournament.addonsAllowed ? [{ label: "Add-ons", field: "addonCount", count: snapshot.addonCount, cost: tournament.addonCost, chips: tournament.addonChipstack }] : []),
    ...(tournament.rebuysAllowed ? [{ label: "Rebuys", field: "rebuyCount", count: snapshot.rebuyCount, cost: tournament.rebuyCost, chips: tournament.rebuyChipstack }] : []),
  ] : [];
  const maxPerTable = tournament ? normalizeMaxPlayersPerTable(tournament.maxPlayersPerTable) : 9;
  const tableCount = summary?.tableCount ?? 0;
  const smallTable = tableCount ? Math.floor(summary.remainingPlayers / tableCount) : 0;
  const largeTables = tableCount ? summary.remainingPlayers % tableCount : 0;
  function collapseButton(section) {
    const closed = Boolean(collapsed[section]);
    return <button className="td-collapse" type="button" aria-expanded={!closed} aria-label={`${closed ? "Expand" : "Collapse"} ${section}`}
      onClick={() => setCollapsed((current) => ({ ...current, [section]: !closed }))}>
      {closed ? "Expand" : "Collapse"}
    </button>;
  }

  return <main className="td-page">
    <header>
      <div className="td-brand">
        <img src="/dinkydonk_logo_transparent_edges.png" alt="" />
        <h1>Tournament Director</h1>
      </div>
      <a href="/">View timer</a>
    </header>
    {controls.storageError && <div>
      <p className="td-error" role="alert">{controls.storageError}</p>
      <button type="button" disabled={controls.saving} onClick={async () => {
        controls.clearTournamentFieldEdits();
        try {
          await controls.loadTournaments();
          controls.setStorageError("");
        } catch (error) {
          console.error("Could not reload tournament.", error);
        }
      }}>Reload latest tournament</button>
    </div>}
    {controls.loadingTournaments && <p>Connecting to the desktop app...</p>}
    {!controls.loadingTournaments && !tournament && <p>No active tournament. Select one in the desktop app.</p>}
    {tournament && <>
      <h2 title={tournament.name}>{tournament.name}</h2>
      <section className="td-card td-timer">
        <h3>Timer</h3>
        <div className="td-timer-display">
          <p className="td-clock">{formatClock(timer.currentLevel?.remainingMs ?? 0)}</p>
          <p>{timer.currentLevel ? (timer.currentLevel.level.isBreak ? "Break" : formatBlinds(
            timer.currentLevel.level.smallBlind, timer.currentLevel.level.bigBlind, timer.currentLevel.level.ante,
          )) : "No timed levels"}</p>
        </div>
        <div className="td-transport">
          <button type="button" disabled={controls.saving} onClick={timer.resetTimer}>Reset</button>
          <button type="button" disabled={controls.saving} onClick={timer.jumpToPreviousLevel}>Previous level</button>
          <button type="button" disabled={controls.saving} onClick={timer.restartCurrentLevel}>Restart level</button>
          <button type="button" disabled={controls.saving} onClick={timer.jumpToNextLevel}>Next level</button>
          <button type="button" disabled={controls.saving} onClick={timer.toggleTimer}>{tournament.timerIsRunning ? "Pause" : "Play"}</button>
        </div>
        <VolumeControl />
      </section>
      <div className="td-grid">
        <section className="td-card">
          <h3>Entries <span className="td-heading-actions"><button type="button" disabled={controls.saving} onClick={() => controls.resetEntryCounts(tournament)}>Reset</button>{collapseButton("entries")}</span></h3>
          <div className="td-card-content td-scroll" tabIndex={0} role="region" aria-label="Entries details"><table className="td-entries-table"><thead><tr><th>Type</th><th>Count</th><th>Chips</th><th>Prize pool</th></tr></thead>
            {!collapsed.entries && <tbody>{entries.map((entry) => {
              const amounts = getEntryContributions(entry.count, entry.cost, entry.chips);
              return <tr key={entry.field}><th>{entry.label}</th><td>{field(entry.field, entry.count, { label: `${entry.label} count`, max: MAX_PARTICIPANT_COUNT, spinner: true, spinnerOnly: entry.field === "buyinCount" })}</td>
                <td data-label="Chips">{amounts.chipsInPlay.toLocaleString()}</td><td data-label="Prize pool">{formatCurrency(amounts.contribution)}</td></tr>;
            })}
            <tr><th>Other</th><td>—</td><td data-label="Chips">{field("otherChipstack", tournament.otherChipstack, { label: "Other chips", step: "any" })}</td>
              <td data-label="Prize pool">{field("otherPrizePool", tournament.otherPrizePool, { label: "Other prize pool", step: "any" })}</td></tr></tbody>}
            <tfoot><tr><th colSpan="2">Total</th><td data-label="Chips">{summary.totalChipsInPlay.toLocaleString()}</td><td data-label="Prize pool">{formatCurrency(summary.totalPrizePool)}</td></tr></tfoot>
          </table></div>
        </section>
        <section className="td-card">
          <h3>Bustouts <button type="button" disabled={controls.saving} onClick={() => controls.resetBustoutCount(tournament)}>Reset</button></h3>
          <div className="td-card-content" tabIndex={0} role="region" aria-label="Bustouts details">
            <div>Busted {field("bustoutCount", snapshot.bustoutCount, { label: "Bustouts count", max: Math.min(MAX_PARTICIPANT_COUNT, snapshot.buyinCount), spinner: true, spinnerOnly: true })}</div>
            <p>Remaining: {summary.remainingPlayers.toLocaleString()}</p><p>Average chipstack: {summary.averageChipstack.toLocaleString()}</p>
          </div>
        </section>
        <section className="td-card">
          <h3>Tables <span className="td-heading-actions"><button type="button" disabled={controls.saving} onClick={() => controls.resetTables(tournament)}>Reset</button>{collapseButton("tables")}</span></h3>
          <div className="td-card-content" tabIndex={0} role="region" aria-label="Tables details">
            <div>Max per table {field("maxPlayersPerTable", maxPerTable, { label: "Maximum players per table", spinner: true })}</div>
            <p>{tableCount.toLocaleString()} {tableCount === 1 ? "table" : "tables"}; {summary.remainingPlayers.toLocaleString()} players</p>
            {!collapsed.tables && tableCount > 0 && <p>{largeTables > 0 && `${largeTables} of ${smallTable + 1}; `}{tableCount - largeTables} of {smallTable}</p>}
          </div>
        </section>
        <section className="td-card">
          <h3>Payouts <span className="td-heading-actions"><button type="button" disabled={controls.saving || !tournament.allowPayoutOverride} onClick={() => controls.resetPayouts(tournament)}>Reset</button>{collapseButton("payouts")}</span></h3>
          <div className="td-card-content" tabIndex={0} role="region" aria-label="Payouts details">
            <div>Players paid {field("payoutPlaces", tournament.payoutPlaces || summary.defaultPayoutPlaces, {
              label: "Number of players paid", max: 1000, disabled: !tournament.allowPayoutOverride, spinner: true,
            })}</div>
            {!collapsed.payouts && <table><thead><tr><th>Place</th><th>Payout</th></tr></thead>
              <tbody>{summary.payouts.map((payout, index) => <tr key={index}><th>{index + 1}</th><td>{field("payout", payout, {
                label: `Payout for place ${index + 1}`, step: "any", index,
                payoutPlaces: summary.effectivePayoutPlaces, calculatedPayouts: summary.payouts,
                disabled: !tournament.allowPayoutOverride,
              })}</td></tr>)}</tbody></table>}
            <p>Total: {formatCurrency(summary.payouts.reduce((sum, payout) => sum + payout, 0))}</p>
          </div>
        </section>
      </div>
    </>}
  </main>;
}
