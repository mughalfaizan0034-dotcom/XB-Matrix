/**
 * Curated timezone list grouped by region. Each entry is a valid IANA
 * timezone identifier — what we store in xb_core.workspaces.timezone
 * and xb_core.organizations.default_timezone.
 *
 * This is intentionally a curated subset (not the full 400+ IANA tz)
 * to keep the picker scannable. New entries can be added safely;
 * existing rows with timezones outside this list still display fine
 * (the database accepts any 64-char string), they just won't show in
 * the picker until added here.
 */

export interface TimezoneOption {
  readonly value: string;     // IANA name, e.g. "America/Los_Angeles"
  readonly label: string;     // human display, e.g. "Los Angeles (PT)"
}

export interface TimezoneGroup {
  readonly region: string;
  readonly zones: ReadonlyArray<TimezoneOption>;
}

export const TIMEZONE_GROUPS: ReadonlyArray<TimezoneGroup> = [
  {
    region: 'Universal',
    zones: [
      { value: 'UTC',                       label: 'UTC' },
    ],
  },
  {
    region: 'Americas',
    zones: [
      { value: 'America/Los_Angeles',       label: 'Los Angeles (PT)' },
      { value: 'America/Denver',            label: 'Denver (MT)' },
      { value: 'America/Chicago',           label: 'Chicago (CT)' },
      { value: 'America/New_York',          label: 'New York (ET)' },
      { value: 'America/Toronto',           label: 'Toronto (ET)' },
      { value: 'America/Vancouver',         label: 'Vancouver (PT)' },
      { value: 'America/Mexico_City',       label: 'Mexico City (CT)' },
      { value: 'America/Sao_Paulo',         label: 'São Paulo (BRT)' },
      { value: 'America/Buenos_Aires',      label: 'Buenos Aires (ART)' },
      { value: 'America/Bogota',            label: 'Bogotá (COT)' },
      { value: 'America/Lima',              label: 'Lima (PET)' },
      { value: 'America/Santiago',          label: 'Santiago (CLT)' },
      { value: 'America/Phoenix',           label: 'Phoenix (MST, no DST)' },
      { value: 'America/Anchorage',         label: 'Anchorage (AKT)' },
      { value: 'Pacific/Honolulu',          label: 'Honolulu (HT)' },
    ],
  },
  {
    region: 'Europe',
    zones: [
      { value: 'Europe/London',             label: 'London (GMT/BST)' },
      { value: 'Europe/Dublin',             label: 'Dublin (GMT/IST)' },
      { value: 'Europe/Lisbon',             label: 'Lisbon (WET)' },
      { value: 'Europe/Madrid',             label: 'Madrid (CET)' },
      { value: 'Europe/Paris',              label: 'Paris (CET)' },
      { value: 'Europe/Amsterdam',          label: 'Amsterdam (CET)' },
      { value: 'Europe/Brussels',           label: 'Brussels (CET)' },
      { value: 'Europe/Berlin',             label: 'Berlin (CET)' },
      { value: 'Europe/Zurich',             label: 'Zurich (CET)' },
      { value: 'Europe/Rome',               label: 'Rome (CET)' },
      { value: 'Europe/Stockholm',          label: 'Stockholm (CET)' },
      { value: 'Europe/Warsaw',             label: 'Warsaw (CET)' },
      { value: 'Europe/Athens',             label: 'Athens (EET)' },
      { value: 'Europe/Helsinki',           label: 'Helsinki (EET)' },
      { value: 'Europe/Istanbul',           label: 'Istanbul (TRT)' },
      { value: 'Europe/Moscow',             label: 'Moscow (MSK)' },
    ],
  },
  {
    region: 'Asia',
    zones: [
      { value: 'Asia/Dubai',                label: 'Dubai (GST)' },
      { value: 'Asia/Riyadh',               label: 'Riyadh (AST)' },
      { value: 'Asia/Tehran',               label: 'Tehran (IRST)' },
      { value: 'Asia/Karachi',              label: 'Karachi (PKT)' },
      { value: 'Asia/Kolkata',              label: 'Kolkata / Mumbai (IST)' },
      { value: 'Asia/Dhaka',                label: 'Dhaka (BST)' },
      { value: 'Asia/Bangkok',              label: 'Bangkok (ICT)' },
      { value: 'Asia/Jakarta',              label: 'Jakarta (WIB)' },
      { value: 'Asia/Singapore',            label: 'Singapore (SGT)' },
      { value: 'Asia/Manila',               label: 'Manila (PHT)' },
      { value: 'Asia/Hong_Kong',            label: 'Hong Kong (HKT)' },
      { value: 'Asia/Shanghai',             label: 'Shanghai / Beijing (CST)' },
      { value: 'Asia/Taipei',               label: 'Taipei (CST)' },
      { value: 'Asia/Seoul',                label: 'Seoul (KST)' },
      { value: 'Asia/Tokyo',                label: 'Tokyo (JST)' },
    ],
  },
  {
    region: 'Pacific',
    zones: [
      { value: 'Australia/Perth',           label: 'Perth (AWST)' },
      { value: 'Australia/Adelaide',        label: 'Adelaide (ACDT/ACST)' },
      { value: 'Australia/Sydney',          label: 'Sydney (AEDT/AEST)' },
      { value: 'Australia/Brisbane',        label: 'Brisbane (AEST)' },
      { value: 'Pacific/Auckland',          label: 'Auckland (NZDT/NZST)' },
      { value: 'Pacific/Fiji',              label: 'Fiji (FJT)' },
    ],
  },
  {
    region: 'Africa',
    zones: [
      { value: 'Africa/Casablanca',         label: 'Casablanca (WET)' },
      { value: 'Africa/Lagos',              label: 'Lagos (WAT)' },
      { value: 'Africa/Cairo',              label: 'Cairo (EET)' },
      { value: 'Africa/Nairobi',            label: 'Nairobi (EAT)' },
      { value: 'Africa/Johannesburg',       label: 'Johannesburg (SAST)' },
    ],
  },
];

/** Flat list of all curated IANA values, useful for set lookups. */
export const ALL_TIMEZONES: ReadonlySet<string> = new Set(
  TIMEZONE_GROUPS.flatMap((g) => g.zones.map((z) => z.value)),
);

export function isCuratedTimezone(value: string): boolean {
  return ALL_TIMEZONES.has(value);
}

export const DEFAULT_TIMEZONE = 'UTC';
