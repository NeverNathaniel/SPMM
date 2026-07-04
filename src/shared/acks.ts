/**
 * Acknowledgment keys.
 *
 * Acknowledgments are per-warning-KIND, not just per-folder: an ack of a
 * path-length warning on C:\HR must not silently satisfy a later split-file
 * ("these files will not migrate") warning on the same path. Keys are stored
 * in the session's acknowledgedFolders list as `<kind>:<localPath>`.
 */

export type AckKind = 'path' | 'inelig' | 'split';

const KEY_RE = /^(path|inelig|split):/;

export function ackKey(kind: AckKind, localPath: string): string {
  return `${kind}:${localPath}`;
}

/** The folder path inside an ack key (bare legacy entries pass through). */
export function ackPath(key: string): string {
  return key.replace(KEY_RE, '');
}

/**
 * Migrate a persisted ack list: bare legacy paths become path+inelig acks
 * (the kinds that existed when they were written) — never split acks, which
 * postdate them and must always be re-acknowledged explicitly.
 */
export function migrateAckList(list: string[]): string[] {
  const out: string[] = [];
  for (const entry of list) {
    if (KEY_RE.test(entry)) out.push(entry);
    else out.push(ackKey('path', entry), ackKey('inelig', entry));
  }
  return out;
}
