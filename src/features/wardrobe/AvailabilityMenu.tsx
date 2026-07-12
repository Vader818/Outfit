import { useId } from "react";
import { cx } from "../../components/ui";
import {
  GARMENT_AVAILABILITY_LABELS,
  GARMENT_AVAILABILITY_OPTIONS
} from "../../shared/presentation";
import type { GarmentAvailabilityStatus } from "../../shared/types";

export interface AvailabilityMenuProps {
  value: GarmentAvailabilityStatus;
  garmentName?: string;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  busy?: boolean;
  onChange: (status: GarmentAvailabilityStatus) => void;
}

export function AvailabilityMenu({
  value,
  garmentName,
  label,
  id,
  className,
  disabled = false,
  busy = false,
  onChange
}: AvailabilityMenuProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const accessibleLabel = label ?? (garmentName ? `${garmentName}的可用状态` : "可用状态");

  return (
    <label
      className={cx("availability-menu", className)}
      htmlFor={selectId}
      aria-busy={busy || undefined}
    >
      <span className="availability-menu__label">{accessibleLabel}</span>
      <select
        id={selectId}
        className="ui-select availability-menu__select"
        value={value}
        disabled={disabled || busy}
        onChange={(event) => onChange(event.target.value as GarmentAvailabilityStatus)}
      >
        {GARMENT_AVAILABILITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <span className="sr-only" aria-live="polite">
        当前状态：{GARMENT_AVAILABILITY_LABELS[value]}
      </span>
    </label>
  );
}
