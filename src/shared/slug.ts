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

/**
 * Validate a tenant domain as a bare SharePoint host name.
 * Returns a human-readable problem, or null when the domain is usable.
 */
export function validateTenantDomain(domain: string): string | null {
  const d = domain.trim();
  if (!d) return 'No tenant domain is set — enter it in Settings.';
  if (/^https?:\/\//i.test(d) || /[/\\ ]/.test(d)) {
    return `"${d}" is not a bare host name — use the form contoso.sharepoint.com (no https:// or path).`;
  }
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(d)) {
    return `"${d}" is not a valid host name.`;
  }
  return null;
}

/**
 * Full URL of a destination folder. spFolderPath '' = Documents root.
 *
 * The default library's display name is "Documents" but its real URL segment
 * is "Shared Documents" — using the real segment keeps displayed URLs
 * truthful and the worst-case path-length math accurate (the decoded form
 * with a literal space is what SharePoint's ~400-char limit measures).
 */
export function destinationUrl(tenantDomain: string, slug: string, spFolderPath: string): string {
  const base = `${siteUrl(tenantDomain, slug)}/Shared Documents`;
  return spFolderPath ? `${base}/${spFolderPath}` : base;
}
