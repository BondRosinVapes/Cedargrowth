// Site map from Section 5.1, typed for the shell. Every href here is a real
// route in the public map. Items with columns open the mega panel, items
// without are direct links.

export type NavLink = { label: string; href: string };

export type NavColumn = { heading: string; links: NavLink[] };

export type ImageFamily =
  | 'raw material macro'
  | 'specimen plate'
  | 'process documentary'
  | 'facility';

export type NavItem = {
  label: string;
  href: string;
};

// Primary row order per Section 5.2. Every item is a plain link to its route:
// the mega panel was removed in Prompt 11 because each destination is a real
// page that fits on one screen, so there is nothing a dropdown would save.
export const PRIMARY_NAV: NavItem[] = [
  { label: 'Method', href: '/method' },
  { label: 'Wellness', href: '/wellness' },
  { label: 'Products', href: '/products' },
  { label: 'DNA Test', href: '/dna' },
  { label: 'Research', href: '/research' },
  { label: 'Transparency', href: '/transparency' },
  { label: 'Find', href: '/find' },
];

// Utility, left and right edges (Section 5.2).
export const UTILITY_LEFT: NavLink[] = [
  { label: 'Sales', href: '/sales/signin' },
  { label: 'Access', href: '/practice' },
];

export const UTILITY_RIGHT: NavLink[] = [
  { label: 'Manufacturing', href: '/manufacturing' },
];

// Footer, four columns (Block 9).
export const FOOTER_COLUMNS: NavColumn[] = [
  {
    heading: 'Shop',
    links: [
      { label: 'Wellness', href: '/wellness' },
      { label: 'Products', href: '/products' },
      { label: 'Find a dispensary', href: '/find' },
    ],
  },
  {
    heading: 'The company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Method', href: '/method' },
      { label: 'Manufacturing', href: '/manufacturing' },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { label: 'The DNA Test', href: '/dna' },
      { label: 'Research', href: '/research' },
      { label: 'Transparency', href: '/transparency' },
      { label: 'Journal', href: '/journal' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms', href: '/legal/terms' },
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Accessibility', href: '/legal/accessibility' },
      { label: 'Compliance', href: '/legal/compliance' },
      { label: 'Contact', href: '/contact' },
    ],
  },
];
