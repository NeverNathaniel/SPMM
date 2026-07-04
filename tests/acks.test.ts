import { describe, expect, it } from 'vitest';
import { ackKey, ackPath, migrateAckList } from '../src/shared/acks';

describe('ack keys', () => {
  it('round-trips kind and path', () => {
    expect(ackKey('split', 'C:\\HR')).toBe('split:C:\\HR');
    expect(ackPath('split:C:\\HR')).toBe('C:\\HR');
    expect(ackPath('path:C:\\HR')).toBe('C:\\HR');
  });

  it('passes bare legacy entries through ackPath unchanged', () => {
    expect(ackPath('C:\\HR')).toBe('C:\\HR');
    // Drive letters aren't kinds — only the known prefixes strip.
    expect(ackPath('D:\\data')).toBe('D:\\data');
  });

  it('migrates bare legacy entries to path+inelig acks, never split', () => {
    expect(migrateAckList(['C:\\HR', 'split:C:\\Old'])).toEqual([
      'path:C:\\HR',
      'inelig:C:\\HR',
      'split:C:\\Old',
    ]);
  });
});
