import {
  formatChipNumber,
  formatChipStackTotal,
  formatCurrency,
  getChipColorUpsByLevel,
  getChipSupportedPlayers,
  getMaxChipSupportedPlayers,
} from "../../domain/tournament";

export default function TournamentList({
  activeTournamentId,
  copyTournament,
  draft,
  editTournament,
  expandedTournaments,
  loadingTournaments,
  persistTournamentData,
  saving,
  setExpandedTournaments,
  tournaments,
}) {
  return (
    <>
            {!draft &&
              (!loadingTournaments && tournaments.length === 0 ? (
                <p className="empty-state">No tournament structures yet.</p>
              ) : tournaments.length > 0 ? (
                <ul className="tournament-list">
                  {tournaments.map((tournament) => {
                    const colorUpsByLevel = getChipColorUpsByLevel(
                      tournament.chips ?? [],
                      tournament.levels,
                    );

                    return (
                    <li className="tournament-card" key={tournament.id}>
                      <div className="tournament-card-heading">
                        <h3>{tournament.name}</h3>
                        <button
                          className={
                            activeTournamentId === tournament.id
                              ? "active-tournament-button"
                              : ""
                          }
                          type="button"
                          disabled={
                            saving || activeTournamentId === tournament.id
                          }
                          aria-pressed={activeTournamentId === tournament.id}
                          onClick={() =>
                            persistTournamentData(tournaments, tournament.id)
                          }
                        >
                          {activeTournamentId === tournament.id
                            ? "Active structure"
                            : "Set as active"}
                        </button>
                        <div className="tournament-card-heading-spacer" />
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => editTournament(tournament)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => copyTournament(tournament.id)}
                        >
                          Copy
                        </button>
                        <button
                          className="tournament-card-toggle"
                          type="button"
                          aria-label={`${
                            (expandedTournaments[tournament.id] ??
                              activeTournamentId === tournament.id)
                              ? "Collapse"
                              : "Expand"
                          } ${tournament.name}`}
                          aria-expanded={
                            expandedTournaments[tournament.id] ??
                            activeTournamentId === tournament.id
                          }
                          onClick={() =>
                            setExpandedTournaments((current) => ({
                              ...current,
                              [tournament.id]: !(
                                current[tournament.id] ??
                                activeTournamentId === tournament.id
                              ),
                            }))
                          }
                        >
                          <span
                            className={`tournament-card-chevron${
                              (expandedTournaments[tournament.id] ??
                                activeTournamentId === tournament.id)
                                ? " expanded"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      {(expandedTournaments[tournament.id] ??
                        activeTournamentId === tournament.id) && (
                        <div className="tournament-card-content">
                      <h4 className="tournament-card-section-title">Costs</h4>
                      <dl className="tournament-details">
                        <div>
                          <dt>Starting Chipstack</dt>
                          <dd>{tournament.startingChipstack ?? "Not set"}</dd>
                        </div>
                        <div>
                          <dt>Rebuy Chipstack</dt>
                          <dd>{tournament.rebuyChipstack ?? "Not set"}</dd>
                        </div>
                        <div>
                          <dt>Addon Chipstack</dt>
                          <dd>{tournament.addonChipstack ?? "Not set"}</dd>
                        </div>
                        <div>
                          <dt>Rebuys Allowed?</dt>
                          <dd>{tournament.rebuysAllowed ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt>Addons Allowed?</dt>
                          <dd>{tournament.addonsAllowed ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt>Buyin Cost</dt>
                          <dd>
                            {tournament.buyinCost == null
                              ? "Not set"
                              : formatCurrency(tournament.buyinCost)}
                            {tournament.buyinDescription && (
                              <span className="tournament-cost-description">
                                {tournament.buyinDescription}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Rebuy Cost</dt>
                          <dd>
                            {tournament.rebuyCost == null
                              ? "Not set"
                              : formatCurrency(tournament.rebuyCost)}
                            {tournament.rebuyDescription && (
                              <span className="tournament-cost-description">
                                {tournament.rebuyDescription}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Addon Cost</dt>
                          <dd>
                            {tournament.addonCost == null
                              ? "Not set"
                              : formatCurrency(tournament.addonCost)}
                            {tournament.addonDescription && (
                              <span className="tournament-cost-description">
                                {tournament.addonDescription}
                              </span>
                            )}
                          </dd>
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
                                  <th className="numeric-column" scope="col">Available</th>
                                  <th className="numeric-column" scope="col">Per player</th>
                                  <th className="numeric-column" scope="col">Per-player stack</th>
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
                                      {chip.availableQuantity == null
                                        ? "—"
                                        : formatChipNumber(chip.availableQuantity)}
                                    </td>
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
                                  <th colSpan="4" scope="row">
                                    Totals
                                  </th>
                                  <td className="numeric-column">
                                    {formatChipStackTotal(tournament.chips)}
                                  </td>
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
