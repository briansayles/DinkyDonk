import {
  formatChipNumber,
  formatChipStackTotal,
  formatCurrency,
  getChipColorUpsByLevel,
  getChipSupportedPlayers,
  getMaxChipSupportedPlayers,
} from "../../domain/tournament";

function TournamentActionIcon({ name }) {
  return (
    <svg
      className="tournament-card-action-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "edit" && (
        <path d="M4 20l4-.8L20 7.2 16.8 4 4.8 16zM14.8 6l3.2 3.2" />
      )}
      {name === "copy" && (
        <>
          <rect x="8" y="8" width="12" height="12" rx="1.5" />
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </>
      )}
      {name === "export" && (
        <>
          <path d="M13 21H5V3h8l4 4v5M13 3v5h4M17 13v8m-3-3 3 3 3-3" />
          <text x="6" y="16" fill="currentColor" stroke="none" fontSize="5" fontWeight="700">CSV</text>
        </>
      )}
      {name === "timer" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {name === "delete" && (
        <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 3v7m4-7v7" />
      )}
    </svg>
  );
}

export default function TournamentList({
  activeTournamentId,
  copyTournament,
  deleteTournament,
  draft,
  editTournament,
  expandedTournamentId,
  loadingTournaments,
  onExportTournament,
  onSetActive,
  saving,
  setExpandedTournamentId,
  tournaments,
}) {
  return (
    <>
            {!draft &&
              (!loadingTournaments && tournaments.length === 0 ? (
                <p className="empty-state" data-tour="empty-structures">
                  No tournament structures yet.
                </p>
              ) : tournaments.length > 0 ? (
                <ul className="tournament-list" data-tour="saved-structures">
                  {tournaments.map((tournament) => {
                    const colorUpsByLevel = getChipColorUpsByLevel(
                      tournament.chips ?? [],
                      tournament.levels,
                    );
                    const isExpanded =
                      expandedTournamentId === tournament.id;

                    return (
                    <li className="tournament-card" key={tournament.id}>
                      <div className="tournament-card-heading">
                        <h3>{tournament.name}</h3>
                        <div className="tournament-card-actions">
                          <button
                            className="tournament-card-action"
                            type="button"
                            disabled={saving}
                            aria-label={`Edit ${tournament.name}`}
                            title="Edit"
                            onClick={() => editTournament(tournament)}
                          >
                            <TournamentActionIcon name="edit" />
                          </button>
                          <button
                            className="tournament-card-action"
                            type="button"
                            disabled={saving}
                            aria-label={`Copy ${tournament.name}`}
                            title="Copy"
                            onClick={() => copyTournament(tournament.id)}
                          >
                            <TournamentActionIcon name="copy" />
                          </button>
                          <button
                            className="tournament-card-action"
                            type="button"
                            disabled={saving}
                            aria-label={`Export ${tournament.name} to CSV`}
                            title="Export CSVs"
                            onClick={() => onExportTournament(tournament)}
                          >
                            <TournamentActionIcon name="export" />
                          </button>
                          <button
                            className="tournament-card-action"
                            type="button"
                            disabled={saving}
                            aria-label={`Go to timer for ${tournament.name}`}
                            title="Go to Timer"
                            aria-pressed={activeTournamentId === tournament.id}
                            onClick={() => onSetActive(tournament.id)}
                          >
                            <TournamentActionIcon name="timer" />
                          </button>
                          <button
                            className="tournament-card-action tournament-card-delete"
                            type="button"
                            disabled={saving}
                            aria-label={`Delete ${tournament.name}`}
                            title="Delete"
                            onClick={() => deleteTournament(tournament.id)}
                          >
                            <TournamentActionIcon name="delete" />
                          </button>
                          <button
                            className="tournament-card-toggle"
                            type="button"
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${tournament.name}`}
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedTournamentId((current) =>
                                current === tournament.id ? null : tournament.id,
                              )
                            }
                          >
                            <span
                              className={`tournament-card-chevron${
                                isExpanded ? " expanded" : ""
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="tournament-card-content">
                        <h4 className="tournament-card-section-title">Costs</h4>
                        <dl className="tournament-details">
                        <div>
                          <dt>Buyin Cost</dt>
                          <dd>
                            {tournament.buyinCost == null
                              ? ""
                              : formatCurrency(tournament.buyinCost)}
                            {tournament.buyinDescription && (
                              <span className="tournament-cost-description">
                                {tournament.buyinDescription}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Buyin Chipstack</dt>
                          <dd>{tournament.startingChipstack == null ? "" : formatChipNumber(tournament.startingChipstack)}</dd>
                        </div>
                        <div>
                          <dt>Addons Allowed?</dt>
                          <dd>{tournament.addonsAllowed ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt>Addon Cost</dt>
                          <dd>
                            {tournament.addonCost == null
                              ? ""
                              : formatCurrency(tournament.addonCost)}
                            {tournament.addonDescription && (
                              <span className="tournament-cost-description">
                                {tournament.addonDescription}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Addon Chipstack</dt>
                          <dd>{tournament.addonChipstack == null ? "" : formatChipNumber(tournament.addonChipstack)}</dd>
                        </div>
                        <div>
                          <dt>Rebuys Allowed?</dt>
                          <dd>{tournament.rebuysAllowed ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt>Rebuy Cost</dt>
                          <dd>
                            {tournament.rebuyCost == null
                              ? ""
                              : formatCurrency(tournament.rebuyCost)}
                            {tournament.rebuyDescription && (
                              <span className="tournament-cost-description">
                                {tournament.rebuyDescription}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Rebuy Chipstack</dt>
                          <dd>{tournament.rebuyChipstack == null ? "" : formatChipNumber(tournament.rebuyChipstack)}</dd>
                        </div>
                      </dl>
                      <div className="tournament-chips">
                        <h4 className="tournament-card-section-title">
                          Available Chips
                        </h4>
                        {tournament.chips?.length ? (
                          <div className="tournament-chip-table-wrapper">
                            <table className="tournament-chip-table">
                              <thead>
                                <tr>
                                  <th scope="col">Color</th>
                                  <th className="numeric-column" scope="col">Denomination</th>
                                  <th className="numeric-column" scope="col">Per player</th>
                                  <th className="numeric-column" scope="col">Per-player stack</th>
                                  <th className="numeric-column" scope="col">Available</th>
                                  <th className="numeric-column" scope="col">Players supported</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tournament.chips.map((chip, index) => (
                                  <tr key={index}>
                                    <td>
                                      <span
                                        className="chip-color-swatch"
                                        style={{ backgroundColor: chip.color }}
                                        aria-label={chip.color}
                                      />
                                    </td>
                                    <td className="numeric-column">{formatChipNumber(chip.denomination)}</td>
                                    <td className="numeric-column">
                                      {chip.quantityPerPlayer == null
                                        ? "—"
                                        : formatChipNumber(chip.quantityPerPlayer)}
                                    </td>
                                    <td className="numeric-column">
                                      {chip.quantityPerPlayer == null
                                        ? "—"
                                        : formatChipNumber(
                                            Number(chip.denomination) *
                                              Number(chip.quantityPerPlayer),
                                          )}
                                    </td>
                                    <td className="numeric-column">
                                      {chip.availableQuantity == null
                                        ? "—"
                                        : formatChipNumber(chip.availableQuantity)}
                                    </td>
                                    <td className="numeric-column">
                                      {getChipSupportedPlayers(chip) != null
                                        ? formatChipNumber(
                                            getChipSupportedPlayers(chip),
                                          )
                                        :
                                        "∞"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <th colSpan="3" scope="row" />
                                  <td className="numeric-column">
                                    {formatChipStackTotal(tournament.chips)}
                                  </td>
                                  <td />
                                  <td className="numeric-column">
                                    {getMaxChipSupportedPlayers(tournament.chips) != null
                                      ? formatChipNumber(
                                          getMaxChipSupportedPlayers(
                                            tournament.chips,
                                          ),
                                        )
                                      : "∞"}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        ) : (
                          <p className="empty-state">No chips defined.</p>
                        )}
                      </div>
                      <div className="tournament-level-table-wrapper">
                        <h4 className="tournament-card-section-title">
                          Blinds Schedule
                        </h4>
                        <table className="tournament-level-table">
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
                              <th className="numeric-column" scope="col">
                                Ante
                              </th>
                              <th scope="col">Color up</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tournament.levels.map((level, index) => (
                              <tr key={index}>
                                <th scope="row">
                                  {level.isBreak
                                    ? "Break"
                                    : tournament.levels
                                        .slice(0, index + 1)
                                        .filter((item) => !item.isBreak)
                                        .length}
                                </th>
                                <td className="numeric-column level-numeric-value">
                                  {formatChipNumber(level.duration ?? 0)}
                                </td>
                                <td className="numeric-column level-numeric-value">
                                  {level.isBreak
                                    ? "—"
                                    : formatChipNumber(level.smallBlind ?? 0)}
                                </td>
                                <td className="numeric-column level-numeric-value">
                                  {level.isBreak
                                    ? "—"
                                    : formatChipNumber(level.bigBlind ?? 0)}
                                </td>
                                <td className="numeric-column level-numeric-value">
                                  {level.isBreak
                                    ? "—"
                                    : formatChipNumber(level.ante ?? 0)}
                                </td>
                                <td>
                                  {(colorUpsByLevel.get(index) ?? []).map(
                                    (chip, chipIndex) => (
                                      <span
                                        className="chip-color-up"
                                        key={`${chip.color}-${chipIndex}`}
                                      >
                                        <span
                                          className="chip-color-swatch"
                                          style={{
                                            backgroundColor: chip.color,
                                          }}
                                          aria-hidden="true"
                                        />
                                        Color up{" "}
                                        {formatChipNumber(chip.denomination)}{" "}
                                        chips
                                      </span>
                                    ),
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                        </div>
                      )}
                    </li>
                    );
                  })}
                </ul>
              ) : null)}
    </>
  );
}
