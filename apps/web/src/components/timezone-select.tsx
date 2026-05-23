'use client';

import { Select } from '@xb/ui';
import { TIMEZONE_GROUPS } from '@xb/types/timezones';

/**
 * Reusable timezone picker built on the shared TIMEZONE_GROUPS list.
 * Uses native <optgroup> for region grouping, accessible, no extra deps.
 *
 * If `value` is a timezone NOT in the curated list (e.g. legacy data),
 * we render it as a leading "Other" option so the user sees their current
 * choice instead of a silent fallback.
 */
export function TimezoneSelect({
  id,
  value,
  onChange,
  required,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const isCurated = TIMEZONE_GROUPS.some((g) => g.zones.some((z) => z.value === value));
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedby}
    >
      {!isCurated && value ? (
        <optgroup label="Current">
          <option value={value}>{value} (legacy)</option>
        </optgroup>
      ) : null}
      {TIMEZONE_GROUPS.map((group) => (
        <optgroup key={group.region} label={group.region}>
          {group.zones.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
