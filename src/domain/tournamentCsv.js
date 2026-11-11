const structureColumns = [
  "Section",
  "Index",
  "Field",
  "Value",
  "Description",
  "Enabled",
  "Color",
  "Text Color",
  "Edge Spot Color",
  "Edge Spot Quantity",
  "Denomination",
  "Available Quantity",
  "Quantity Per Player",
  "Per-Player Stack",
  "Duration (minutes)",
  "Small Blind",
  "Big Blind",
  "Ante",
  "Is Break",
];

const resultsColumns = [
  "Record Type",
  "Index",
  "Player Name",
  "Timestamp (UTC)",
  "Place",
  "Elapsed Seconds",
  "Small Blind",
  "Big Blind",
  "Ante",
  "Points Earned",
  "Payout",
  "Amount",
  "Chipstack",
  "Field",
  "Value",
];

function csvCell(value) {
  if (value == null) {
    return '""';
  }

  const text = String(value);
  const safeText =
    typeof value === "string" && /^[\s]*[=+\-@]/.test(text)
      ? `'${text}`
      : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function serializeCsv(columns, rows) {
  const header = columns.map(csvCell).join(",");
  const records = rows.map((row) =>
    columns.map((column) => csvCell(row[column])).join(","),
  );
  return `\uFEFF${[header, ...records].join("\r\n")}\r\n`;
}

function timestampForCsv(timestamp) {
  if (timestamp == null || !Number.isFinite(Number(timestamp))) {
    return timestamp ?? "";
  }
  const date = new Date(Number(timestamp));
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
}

function settingRow(field, value, description = "") {
  return {
    Section: "Tournament",
    Field: field,
    Value: value,
    Description: description,
  };
}

function summaryRow(field, value) {
  return {
    "Record Type": "Summary",
    Field: field,
    Value: value,
  };
}

function entryRows(type, records, amount, chipstack) {
  return (records ?? []).map((record, index) => ({
    "Record Type": type,
    Index: index + 1,
    "Player Name": record.name,
    "Timestamp (UTC)": timestampForCsv(record.timestamp),
    Amount: amount,
    Chipstack: chipstack,
  }));
}

export function createTournamentCsvExports(tournament) {
  const chips = tournament.chips ?? [];
  const levels = tournament.levels ?? [];
  const buyins = tournament.buyins ?? [];
  const rebuys = tournament.rebuys ?? [];
  const addons = tournament.addons ?? [];
  const bustouts = tournament.bustouts ?? [];

  const structureRows = [
    settingRow("ID", tournament.id),
    settingRow("Name", tournament.name),
    settingRow("Starting Chipstack", tournament.startingChipstack),
    settingRow("Buy-in Cost", tournament.buyinCost, tournament.buyinDescription),
    settingRow("Rebuys Allowed", tournament.rebuysAllowed),
    settingRow("Rebuy Cost", tournament.rebuyCost, tournament.rebuyDescription),
    settingRow("Rebuy Chipstack", tournament.rebuyChipstack),
    settingRow("Add-ons Allowed", tournament.addonsAllowed),
    settingRow("Add-on Cost", tournament.addonCost, tournament.addonDescription),
    settingRow("Add-on Chipstack", tournament.addonChipstack),
    settingRow("Percent Paid", tournament.percentPaid),
    settingRow("Payout Model", tournament.payoutModel),
    settingRow("Allow Payout Override", tournament.allowPayoutOverride),
    settingRow("Max Players Per Table", tournament.maxPlayersPerTable),
    ...chips.map((chip, index) => ({
      Section: "Chip",
      Index: index + 1,
      Color: chip.color,
      "Text Color": chip.textColor,
      "Edge Spot Color": chip.edgeSpotColor,
      "Edge Spot Quantity": chip.edgeSpotQuantity,
      Denomination: chip.denomination,
      "Available Quantity": chip.availableQuantity,
      "Quantity Per Player": chip.quantityPerPlayer,
      "Per-Player Stack":
        chip.quantityPerPlayer == null
          ? ""
          : Number(chip.denomination) * Number(chip.quantityPerPlayer),
    })),
    ...levels.map((level, index) => ({
      Section: "Blind Level",
      Index: index + 1,
      "Duration (minutes)": level.duration,
      "Small Blind": level.smallBlind,
      "Big Blind": level.bigBlind,
      Ante: level.ante,
      "Is Break": level.isBreak ?? false,
    })),
  ];

  const resultRows = [
    summaryRow("Tournament ID", tournament.id),
    summaryRow("Tournament Name", tournament.name),
    summaryRow("Buy-ins", buyins.length),
    summaryRow("Rebuys", rebuys.length),
    summaryRow("Add-ons", addons.length),
    summaryRow("Total Entries", buyins.length + rebuys.length + addons.length),
    summaryRow("Bustouts", bustouts.length),
    summaryRow(
      "Remaining Players",
      Math.max(0, buyins.length - bustouts.length),
    ),
    summaryRow("Other Prize Pool", tournament.otherPrizePool),
    summaryRow("Other Chipstack", tournament.otherChipstack),
    ...entryRows(
      "Buy-in",
      buyins,
      tournament.buyinCost,
      tournament.startingChipstack,
    ),
    ...entryRows("Rebuy", rebuys, tournament.rebuyCost, tournament.rebuyChipstack),
    ...entryRows("Add-on", addons, tournament.addonCost, tournament.addonChipstack),
    ...bustouts.map((bustout, index) => ({
      "Record Type": "Bustout",
      Index: index + 1,
      "Player Name": bustout.name,
      "Timestamp (UTC)": timestampForCsv(bustout.timestamp),
      Place: bustout.place,
      "Elapsed Seconds": bustout.elapsedSeconds,
      "Small Blind": bustout.blinds?.smallBlind,
      "Big Blind": bustout.blinds?.bigBlind,
      Ante: bustout.blinds?.ante,
      "Points Earned": bustout.pointsEarned,
      Payout: bustout.payout,
    })),
    ...(tournament.payouts ?? []).map((payout, index) => ({
      "Record Type": "Payout",
      Index: index + 1,
      Place: index + 1,
      Payout: payout,
    })),
  ];

  return {
    structure: serializeCsv(structureColumns, structureRows),
    results: serializeCsv(resultsColumns, resultRows),
  };
}

export function sanitizeTournamentCsvFilename(name) {
  const sanitized = String(name ?? "tournament")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "");
  if (!sanitized) {
    return "tournament";
  }
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(sanitized)
    ? `_${sanitized}`
    : sanitized;
}
