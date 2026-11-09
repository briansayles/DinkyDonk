import {
  createNextLevel,
  formatChipNumber,
  formatChipStackTotal,
  getChipStackSummary,
  getChipSupportedPlayers,
  getMaxChipSupportedPlayers,
} from "../../domain/tournament";
import CurrencyInput from "../../components/CurrencyInput";

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
                        type="number"
                        min="0"
                        step="1"
                        value={draft.startingChipstack}
                        disabled={saving}
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
                          <th className="numeric-column" scope="col">Available</th>
                          <th className="numeric-column" scope="col">Per player</th>
                          <th className="numeric-column" scope="col">Per-player stack</th>
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
                                min="0"
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
                          <th colSpan="4" scope="row">Totals</th>
                          <td className="numeric-column">
                            <output className="chip-stack-value chip-stack-total">
                              {draft.startingChipstack !== "" &&
                                Number.isFinite(Number(draft.startingChipstack)) &&
                                getChipStackSummary(draft.chips).hasQuantities &&
                                !getChipStackSummary(draft.chips)
                                  .hasUnspecifiedQuantities &&
                                getChipStackSummary(draft.chips).total ===
                                  Number(draft.startingChipstack) && (
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
                          <td className="numeric-column">
                            {getMaxChipSupportedPlayers(draft.chips) == null
                              ? "∞"
                              : formatChipNumber(
                                  getMaxChipSupportedPlayers(draft.chips),
                                )}
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
                      {draft.levels.map((level, index) => (
                        <tr key={index}>
                          <th scope="row">
                            {level.isBreak
                              ? "Break"
                              : draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length}
                          </th>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={level.duration ?? ""}
                              disabled={saving}
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
                          <td>
                            {!level.isBreak && (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={level.smallBlind ?? ""}
                                disabled={saving}
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
                          <td>
                            {!level.isBreak && (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={level.bigBlind ?? ""}
                                disabled={saving}
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
                          <td>
                            {!level.isBreak && (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={level.ante ?? ""}
                                disabled={saving}
                                aria-label={`Level ${draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length} ante`}
                                onChange={(event) =>
                                  updateLevel(index, "ante", event.target.value)
                                }
                              />
                            )}
                          </td>
                          <td>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
