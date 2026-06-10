/** SharePoint site URL helpers. */

/**
 * Auto-generate a /sites/ slug from a display name: "Contoso HR" -> "ContosoHR".
 * The user can still edit the slug manually in the Add Site modal.
 */
export function slugFromSiteName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export function siteUrl(tenantDomain: string, slug: string): string {
  return `https://${tenantDomain}/sites/${slug}`;
}

/** Full URL of a destination folder. spFolderPath '' = Documents root. */
export function destinationUrl(tenantDomain: string, slug: string, spFolderPath: string): string {
  const base = `${siteUrl(tenantDomain, slug)}/Documents`;
  return spFolderPath ? `${base}/${spFolderPath}` : base;
}
