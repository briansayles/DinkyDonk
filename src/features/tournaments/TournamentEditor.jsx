import { useLayoutEffect, useRef, useState } from "react";
import {
  createNextLevel,
  chipStackMatchesStarting,
  formatChipNumber,
  formatChipStackTotal,
  getAggressivenessEvaluation,
  getChipSupportedPlayers,
  getLevelStatistics,
  getMaxChipSupportedPlayers,
  getStartingBigBlindMultiple,
  getStructureSupportedPlayers,
  hasLargeLevelChange,
  hasSmallLevelChange,
  DEFAULT_EDGE_SPOT_QUANTITY,
  DEFAULT_ALLOW_PAYOUT_OVERRIDE,
  DEFAULT_PAYOUT_MODEL,
  DEFAULT_PERCENT_PAID,
  MAX_EDGE_SPOT_QUANTITY,
  MIN_EDGE_SPOT_QUANTITY,
  PAYOUT_MODELS,
} from "../../domain/tournament";
import CurrencyInput from "../../components/CurrencyInput";

const SMALL_LEVEL_CHANGE_WARNING =
  "Small change from previous level. Consider removing this level or the previous one.";
const LARGE_LEVEL_CHANGE_WARNING =
  "Large change from previous level. Consider adding a level between this level and the previous one.";

export default function TournamentEditor({
  deleteTournament,
  draft,
  editingId,
  insertLevelAfter,
  saveTournament,
  saving,
  setDraft,
  setEditingId,
  updateLevel,
}) {
  const [startingChipstackFocused, setStartingChipstackFocused] = useState(false);
  const startingChipstackRef = useRef(null);
  useLayoutEffect(() => {
    const value = draft?.startingChipstack;
    const number = Number(value);
    const invalid = value != null && value !== "" &&
      (!Number.isFinite(number) || !Number.isInteger(number) || number < 0);
    startingChipstackRef.current?.setCustomValidity(
      invalid ? "Starting chipstack must be a non-negative whole number." : "",
    );
  }, [draft?.startingChipstack, startingChipstackFocused]);

  const startingBigBlindMultiple = draft
    ? getStartingBigBlindMultiple(draft.startingChipstack, draft.levels)
    : null;
  const structureSupportedPlayers = draft
    ? getStructureSupportedPlayers(draft.startingChipstack, draft.levels)
    : null;
  const levelStatistics = draft ? getLevelStatistics(draft.levels) : null;
  const percentFormat = new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const wholeNumberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const stackWarning = startingBigBlindMultiple === null
    ? undefined
    : startingBigBlindMultiple < 50
      ? "Short-stack tournament"
      : startingBigBlindMultiple >= 200
        ? "Deep-stack tournament"
        : undefined;

  return (
    <>
            {draft && (
              <form className="tournament-form" onSubmit={saveTournament}>
                <h3>{editingId ? "Edit structure" : "New structure"}</h3>
                <label className="form-field">
                  Structure name
                  <input
                    type="text"
                    value={draft.name}
                    disabled={saving}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <div className="tournament-details-fields">
                  <div className="tournament-cost-field">
                    <span
                      className="tournament-flag-spacer"
                      aria-hidden="true"
                    />
                    <label className="form-field">
                      Starting Chipstack
                      <input
                        ref={startingChipstackRef}
                        type={startingChipstackFocused ? "number" : "text"}
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={
                          startingChipstackFocused ||
                          draft.startingChipstack === "" ||
                          draft.startingChipstack == null
                            ? (draft.startingChipstack ?? "")
                            : formatChipNumber(draft.startingChipstack)
                        }
                        disabled={saving}
                        onFocus={() => setStartingChipstackFocused(true)}
                        onBlur={() => setStartingChipstackFocused(false)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            startingChipstack: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="tournament-cost-field" id="edit-entry-buyin">
                    <span
                      className="tournament-flag-spacer"
                      aria-hidden="true"
                    />
                    <label className="form-field">
                      Buyin Cost
                      <CurrencyInput
                        value={draft.buyinCost}
                        disabled={saving}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            buyinCost: value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Buyin description (optional)
                      <textarea
                        rows="2"
                        value={draft.buyinDescription}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            buyinDescription: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="tournament-cost-field" id="edit-entry-rebuy">
                    <label className="tournament-flag form-field">
                      <span>Rebuys Allowed?</span>
                      <input
                        type="checkbox"
                        checked={draft.rebuysAllowed}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            rebuysAllowed: event.target.checked,
                          }))
                        }
                      />
                      </label>
                    <label className="form-field">
                      Rebuy Cost
                      <CurrencyInput
                        value={draft.rebuyCost}
                        disabled={saving || !draft.rebuysAllowed}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            rebuyCost: value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Rebuy Chipstack
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draft.rebuyChipstack}
                        disabled={saving || !draft.rebuysAllowed}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            rebuyChipstack: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Rebuy description (optional)
                      <textarea
                        rows="2"
                        value={draft.rebuyDescription}
                        disabled={saving || !draft.rebuysAllowed}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            rebuyDescription: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="tournament-cost-field" id="edit-entry-addon">
                    <label className="tournament-flag form-field">
                      <span>Addons Allowed?</span>
                      <input
                        type="checkbox"
                        checked={draft.addonsAllowed}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            addonsAllowed: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Addon Cost
                      <CurrencyInput
                        value={draft.addonCost}
                        disabled={saving || !draft.addonsAllowed}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            addonCost: value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Addon Chipstack
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draft.addonChipstack}
                        disabled={saving || !draft.addonsAllowed}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            addonChipstack: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Addon description (optional)
                      <textarea
                        rows="2"
                        value={draft.addonDescription}
                        disabled={saving || !draft.addonsAllowed}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            addonDescription: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>

                <hr className="tournament-details-divider" />

                <section id="edit-entry-payout">
                  <h4 className="tournament-card-section-title">
                    Payout Settings
                  </h4>
                  <div className="tournament-details-fields">
                    <label className="form-field">
                      Percent of Field to be Paid
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={draft.percentPaid ?? DEFAULT_PERCENT_PAID}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            percentPaid: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Payout Model
                      <select
                        value={draft.payoutModel ?? DEFAULT_PAYOUT_MODEL}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            payoutModel: event.target.value,
                          }))
                        }
                      >
                        {PAYOUT_MODELS.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="tournament-flag form-field">
                      <span>Allow User Override</span>
                      <input
                        type="checkbox"
                        checked={
                          draft.allowPayoutOverride ??
                          DEFAULT_ALLOW_PAYOUT_OVERRIDE
                        }
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            allowPayoutOverride: event.target.checked,
                          }))
                        }
                      />
                    </label>
                  </div>
                </section>

                <hr className="tournament-details-divider" />

                <div className="levels-heading" id="edit-entry-chips">
                  <h4>Available Chips</h4>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        chips: [
                          ...current.chips,
                          {
                            color: "#ffffff",
                            denomination: "",
                            edgeSpotQuantity: DEFAULT_EDGE_SPOT_QUANTITY,
                            availableQuantity: "",
                            quantityPerPlayer: "",
                          },
                        ],
                      }))
                    }
                  >
                    Add chip
                  </button>
                </div>
                {draft.chips.length > 0 ? (
                  <div className="tournament-chip-table-wrapper">
                    <table className="tournament-chip-table tournament-chip-editor-table">
                      <thead>
                        <tr>
                          <th scope="col">Color</th>
                          <th scope="col">Text Color</th>
                          <th scope="col">Edge Spot Color</th>
                          <th scope="col">Edge Spot Quantity</th>
                          <th className="numeric-column" scope="col">Denomination</th>
                          <th className="numeric-column" scope="col">Per player</th>
                          <th className="numeric-column" scope="col">Per-player stack</th>
                          <th className="numeric-column" scope="col">Available</th>
                          <th className="numeric-column" scope="col">Players supported</th>
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.chips.map((chip, index) => (
                          <tr key={index}>
                            <td>
                              <input
                                type="color"
                                value={chip.color}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} color`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? { ...item, color: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="color"
                                value={chip.textColor}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} text color`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? { ...item, textColor: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="color"
                                value={chip.edgeSpotColor}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} edge spot color`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? { ...item, edgeSpotColor: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={MIN_EDGE_SPOT_QUANTITY}
                                max={MAX_EDGE_SPOT_QUANTITY}
                                step="1"
                                value={chip.edgeSpotQuantity}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} edge spot quantity`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? {
                                            ...item,
                                            edgeSpotQuantity: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={chip.denomination}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} denomination`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? {
                                            ...item,
                                            denomination: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={chip.quantityPerPlayer}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} quantity per player`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? {
                                            ...item,
                                            quantityPerPlayer: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <output className="chip-stack-value">
                                {chip.quantityPerPlayer === ""
                                  ? "Not set"
                                  : (
                                      Number(chip.denomination || 0) *
                                      Number(chip.quantityPerPlayer)
                                    ).toLocaleString()}
                              </output>
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={chip.availableQuantity}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} available quantity`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? {
                                            ...item,
                                            availableQuantity: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <output className="chip-stack-value chip-supported-value">
                                {getChipSupportedPlayers(chip) == null
                                  ? "∞"
                                  : formatChipNumber(
                                      getChipSupportedPlayers(chip),
                                    )}
                              </output>
                            </td>
                            <td>
                              <button
                                className="danger-button"
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.filter(
                                      (_, chipIndex) => chipIndex !== index,
                                    ),
                                  }))
                                }
                                aria-label={`Remove chip ${index + 1}`}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan="6" scope="row">Totals</th>
                          <td className="numeric-column">
                            <output className="chip-stack-value chip-stack-total">
                              {chipStackMatchesStarting(
                                draft.chips,
                                draft.startingChipstack,
                              ) && (
                                  <span
                                    className="chip-stack-match"
                                    role="img"
                                    aria-label="Per-player chipstack matches starting chipstack"
                                    title="Per-player chipstack matches starting chipstack"
                                  >
                                    ✓
                                  </span>
                                )}
                              {formatChipStackTotal(draft.chips)}
                            </output>
                          </td>
                          <td />
                          <td className="numeric-column">
                            <output className="chip-stack-value chip-supported-value">
                              {getMaxChipSupportedPlayers(draft.chips) == null
                                ? "∞"
                                : formatChipNumber(
                                    getMaxChipSupportedPlayers(draft.chips),
                                  )}
                            </output>
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="empty-state">No chips defined.</p>
                )}
                <hr className="tournament-details-divider" />

                <div className="levels-heading" id="edit-entry-levels">
                  <h4>Levels</h4>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setDraft((current) => {
                        const previousLevel = [...current.levels]
                          .reverse()
                          .find((level) => !level.isBreak);
                        return {
                          ...current,
                          levels: [
                            ...current.levels,
                            createNextLevel(
                              previousLevel,
                              current.levels.at(-1)?.duration ?? "",
                            ),
                          ],
                        };
                      })
                    }
                  >
                    Add level
                  </button>
                </div>

                <div className="tournament-level-table-wrapper">
                  <table className="tournament-level-table tournament-level-editor-table">
                    <thead>
                      <tr>
                        <th scope="col">Level</th>
                        <th className="numeric-column" scope="col">
                          Duration (min)
                        </th>
                        <th className="numeric-column" scope="col">
                          Small Blind
                        </th>
                        <th className="numeric-column" scope="col">
                          Big Blind
                        </th>
                        <th className="numeric-column" scope="col">Ante</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.levels.map((level, index) => {
                        const warning = [
                          hasSmallLevelChange(draft.levels, index) && SMALL_LEVEL_CHANGE_WARNING,
                          hasLargeLevelChange(draft.levels, index) && LARGE_LEVEL_CHANGE_WARNING,
                        ].filter(Boolean).join(" ") || undefined;
                        return <tr key={index} className={warning ? "level-change-warning" : undefined}>
                          <th scope="row" title={warning}>
                            {level.isBreak
                              ? "Break"
                              : draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length}
                          </th>
                          <td title={warning}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={level.duration ?? ""}
                              disabled={saving}
                              aria-description={warning}
                              aria-label={`${
                                level.isBreak
                                  ? "Break"
                                  : `Level ${draft.levels
                                      .slice(0, index + 1)
                                      .filter((item) => !item.isBreak).length}`
                              } duration in minutes`}
                              onChange={(event) =>
                                updateLevel(index, "duration", event.target.value)
                              }
                            />
                          </td>
                          <td title={warning}>
                            {!level.isBreak && (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={level.smallBlind ?? ""}
                                disabled={saving}
                                aria-description={warning}
                                aria-label={`Level ${draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length} Small Blind`}
                                onChange={(event) =>
                                  updateLevel(
                                    index,
                                    "smallBlind",
                                    event.target.value,
                                  )
                                }
                              />
                            )}
                          </td>
                          <td title={warning}>
                            {!level.isBreak && (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={level.bigBlind ?? ""}
                                disabled={saving}
                                aria-description={warning}
                                aria-label={`Level ${draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length} Big Blind`}
                                onChange={(event) =>
                                  updateLevel(
                                    index,
                                    "bigBlind",
                                    event.target.value,
                                  )
                                }
                              />
                            )}
                          </td>
                          <td title={warning}>
                            {!level.isBreak && (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={level.ante ?? ""}
                                disabled={saving}
                                aria-description={warning}
                                aria-label={`Level ${draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length} ante`}
                                onChange={(event) =>
                                  updateLevel(index, "ante", event.target.value)
                                }
                              />
                            )}
                          </td>
                          <td title={warning}>
                            <div className="level-action-buttons">
                              <button
                                className="danger-button"
                                type="button"
                                disabled={saving || draft.levels.length === 1}
                                onClick={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    levels: current.levels.filter(
                                      (_, levelIndex) => levelIndex !== index,
                                    ),
                                  }))
                                }
                                aria-label={`Remove ${
                                  level.isBreak
                                    ? "break"
                                    : `level ${draft.levels
                                        .slice(0, index + 1)
                                        .filter((item) => !item.isBreak).length}`
                                }`}
                              >
                                Remove
                              </button>
                              {!level.isBreak && index === 0 && (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      levels: [
                                        {
                                          duration: "",
                                          smallBlind: 0,
                                          bigBlind: 0,
                                          ante: 0,
                                          isBreak: true,
                                        },
                                        ...current.levels,
                                      ],
                                    }))
                                  }
                                >
                                  Break before
                                </button>
                              )}
                              {!level.isBreak &&
                                index < draft.levels.length - 1 &&
                                !draft.levels[index + 1].isBreak && (
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() =>
                                      setDraft((current) => ({
                                        ...current,
                                        levels: [
                                          ...current.levels.slice(0, index + 1),
                                          {
                                            duration: "",
                                            smallBlind: 0,
                                            bigBlind: 0,
                                            ante: 0,
                                            isBreak: true,
                                          },
                                          ...current.levels.slice(index + 1),
                                        ],
                                      }))
                                    }
                                    aria-label={`Insert break after level ${draft.levels
                                      .slice(0, index + 1)
                                      .filter((item) => !item.isBreak).length}`}
                                  >
                                    Break after
                                  </button>
                                )}
                              {!level.isBreak && (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => insertLevelAfter(index)}
                                  aria-label={`Insert level after level ${draft.levels
                                    .slice(0, index + 1)
                                    .filter((item) => !item.isBreak).length}`}
                                >
                                  Insert level
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="tournament-level-statistics">
                  <label className="form-field">
                    Structure Supports
                    <output
                      className="chip-stack-value"
                      title="Minimum buy-ins needed for chips in play to reach 10 times the final big blind, without rebuys or add-ons."
                    >
                      {structureSupportedPlayers === null
                        ? "Not set"
                        : `${wholeNumberFormat.format(structureSupportedPlayers)} ${structureSupportedPlayers === 1 ? "player" : "players"}`}
                    </output>
                  </label>
                  <label className="form-field">
                    Starting Stack in Multiples of First Big Blind
                    <output
                      className={`chip-stack-value starting-blind-multiple${stackWarning ? " starting-blind-multiple-warning" : ""}`}
                      title={stackWarning}
                      aria-description={stackWarning}
                    >
                      {startingBigBlindMultiple === null
                        ? "Not set"
                        : wholeNumberFormat.format(startingBigBlindMultiple)}
                    </output>
                  </label>
                  <label className="form-field">
                    Average Big Blind Growth per Level
                    <output className="chip-stack-value">
                      {levelStatistics.averageGrowth === null
                        ? "Not set"
                        : percentFormat.format(levelStatistics.averageGrowth)}
                    </output>
                  </label>
                  <label className="form-field">
                    Average Time per Level
                    <output className="chip-stack-value">
                      {levelStatistics.averageTime === null
                        ? "Not set"
                        : `${numberFormat.format(levelStatistics.averageTime)} min`}
                    </output>
                  </label>
                  <label className="form-field">
                    Aggressiveness
                    <output
                      className="chip-stack-value aggressiveness-value"
                      title="Average big blind growth divided by average level time."
                    >
                      {levelStatistics.aggressiveness === null
                        ? "Not set"
                        : `${wholeNumberFormat.format(levelStatistics.aggressiveness * 100)}% Big Blind Growth / Minute`}
                    </output>
                  </label>
                  <label className="form-field">
                    Aggressiveness Evaluation
                    <output className="chip-stack-value">
                      {getAggressivenessEvaluation(levelStatistics.aggressiveness) ?? "Not set"}
                    </output>
                  </label>
                </div>

                <div className="tournament-form-actions">
                  {editingId && (
                    <button
                      className="danger-button"
                      type="button"
                      disabled={saving}
                      onClick={() => deleteTournament(editingId)}
                    >
                      Delete structure
                    </button>
                  )}
                  <div className="form-actions">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setDraft(null);
                        setEditingId(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Save structure"}
                    </button>
                  </div>
                </div>
              </form>
            )}
    </>
  );
}
