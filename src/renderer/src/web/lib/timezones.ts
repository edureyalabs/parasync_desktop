// lib/timezones.ts
// IANA timezone names for pickers. Uses the runtime's full list when it has one, otherwise a short
// list of the common ones, so a picker is never empty.
const COMMON_ZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Jakarta',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Africa/Johannesburg', 'Africa/Lagos', 'Australia/Sydney',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'UTC',
];

export function allTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const supported = intl.supportedValuesOf?.('timeZone');
  return supported && supported.length > 0 ? supported : COMMON_ZONES;
}

export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
