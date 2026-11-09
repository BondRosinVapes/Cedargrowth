// Fixed shell copy and the values that are deliberately unresolved. Anything
// listed as UNKNOWN here renders through the Unknown atom, never as an invented
// number or name (see the non negotiable rails).

export const ANNOUNCEMENT =
  'Every batch published, with a full Certificate of Analysis';

export const FACILITY_ADDRESS = '998 Broadway, Buffalo, NY 14212';

// Deployment domain, used to build absolute canonical and Open Graph URLs.
export const SITE_URL = 'https://cedargrowth-dxxt.vercel.app';

export const AGE_LINE =
  'You must be 21 or older to purchase. Keep out of the reach of children and pets.';

// Open items that stay UNKNOWN until confirmed. The caption explains why.
export const UNKNOWNS = {
  license: 'NYSOCM processor license identifier, pending confirmation.',
  stateWarnings: 'Required state warnings, pending counsel review.',
} as const;

export const BRAND = {
  name: 'CedarGrowth',
  full: 'CedarGrowth Organics',
} as const;
