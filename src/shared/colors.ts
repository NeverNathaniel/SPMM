/**
 * Fixed accessible palette for SharePoint site color assignment.
 * Colors are assigned sequentially as sites are added; the palette wraps.
 * Chosen for distinguishability against the app's light panel background
 * and for adequate contrast as 10px dots and card accents.
 */
export const SITE_PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#ea580c', // orange
  '#9333ea', // purple
  '#0d9488', // teal
  '#dc2626', // red
  '#ca8a04', // gold
  '#db2777', // pink
] as const;

export function nextSiteColor(usedColors: string[]): string {
  for (const c of SITE_PALETTE) {
    if (!usedColors.includes(c)) return c;
  }
  return SITE_PALETTE[usedColors.length % SITE_PALETTE.length];
}
