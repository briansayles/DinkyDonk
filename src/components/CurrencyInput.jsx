import { useState } from "react";
import { formatCurrency } from "../domain/tournament";

const locale = Intl.NumberFormat().resolvedOptions().locale;
const numberParts = new Intl.NumberFormat(locale).formatToParts(12_345.6);
const groupSeparator = numberParts.find((part) => part.type === "group")?.value;
const decimalSeparator =
  numberParts.find((part) => part.type === "decimal")?.value ?? ".";
const localizedDigits = Array.from({ length: 10 }, (_, digit) => [
  new Intl.NumberFormat(locale, { useGrouping: false }).format(digit),
  String(digit),
]);

function normalizeCurrencyInput(value) {
  let normalized = value;
  for (const [localizedDigit, digit] of localizedDigits) {
    normalized = normalized.replaceAll(localizedDigit, digit);
  }
  if (groupSeparator) {
    normalized = normalized.replaceAll(groupSeparator, "");
  }

  return normalized
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(decimalSeparator, ".")
    .replace("\u2212", "-");
}

export default function CurrencyInput({
  value,
  onChange,
  onBlur,
  min,
  max,
  step,
  ...props
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [editingValue, setEditingValue] = useState("");

  return (
    <input
      {...props}
      type={isFocused ? "number" : "text"}
      min={min}
      max={max}
      step={step ?? "any"}
      value={
        isFocused
          ? editingValue
          : value === "" || value == null
            ? ""
            : formatCurrency(value)
      }
      onFocus={() => {
        setEditingValue(value == null ? "" : String(value));
        setIsFocused(true);
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setEditingValue(nextValue);
        onChange(normalizeCurrencyInput(nextValue));
      }}
      onKeyDown={(event) => {
        if (!isFocused || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
          return;
        }

        event.preventDefault();
        const currentValue = Number(normalizeCurrencyInput(editingValue));
        const amount = Number.isFinite(currentValue)
          ? currentValue
          : Number(value ?? 0);
        const increment = step === "any" ? 0.01 : Number(step ?? 1);
        const nextAmount =
          amount + (event.key === "ArrowUp" ? increment : -increment);
        const minimum = min == null ? Number.NEGATIVE_INFINITY : Number(min);
        const maximum = max == null ? Number.POSITIVE_INFINITY : Number(max);
        const nextValue = String(Math.min(maximum, Math.max(minimum, nextAmount)));

        setEditingValue(nextValue);
        onChange(nextValue);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        onBlur?.(event);
      }}
    />
  );
}
