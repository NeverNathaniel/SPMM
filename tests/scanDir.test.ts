import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanDir } from '../electron/scanDir';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spmm-scan-'));
  // tmp/
  //   folder1/        10 .txt files + 1 ineligible + 1 temp + 1 hidden
  //   folder2/sub1/   5 .doc files (one is the longest filename)
  //   empty/
  //   .hidden/        must be filtered
  //   $RECYCLE.BIN/   must be filtered
  const f1 = path.join(tmp, 'folder1');
  const sub1 = path.join(tmp, 'folder2', 'sub1');
  fs.mkdirSync(f1, { recursive: true });
  fs.mkdirSync(sub1, { recursive: true });
  fs.mkdirSync(path.join(tmp, 'empty'));
  fs.mkdirSync(path.join(tmp, '.hidden'));
  fs.mkdirSync(path.join(tmp, '$RECYCLE.BIN'));

  for (let i = 0; i < 10; i++) fs.writeFileSync(path.join(f1, `file${i}.txt`), 'x');
  fs.writeFileSync(path.join(f1, 'Report #Final.docx'), 'x');
  fs.writeFileSync(path.join(f1, '~$Report.docx'), 'x');
  fs.writeFileSync(path.join(f1, '.dotfile'), 'x');

  for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(sub1, `doc${i}.doc`), 'x');
  fs.writeFileSync(path.join(sub1, 'a-very-long-filename-for-path-tests.doc'), 'x');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('scanDir', () => {
  it('builds the tree, filtering hidden/system entries', () => {
    const tree = scanDir(tmp);
    const names = tree.children.map((c) => c.name);
    expect(names).toEqual(['empty', 'folder1', 'folder2']);
  });

  it('counts direct files only and skips hidden files', () => {
    const tree = scanDir(tmp);
    const folder1 = tree.children.find((c) => c.name === 'folder1')!;
    // 10 txt + ineligible + temp = 12; .dotfile filtered out
    expect(folder1.fileCount).toBe(12);
    expect(folder1.files).not.toContain('.dotfile');
  });

  it('classifies ineligible files during the scan', () => {
    const tree = scanDir(tmp);
    const folder1 = tree.children.find((c) => c.name === 'folder1')!;
    const reasons = Object.fromEntries(folder1.ineligibleFiles.map((f) => [f.filename, f.reason]));
    expect(reasons['Report #Final.docx']).toBe('invalid-chars');
    expect(reasons['~$Report.docx']).toBe('temp-lock-file');
  });

  it('captures the longest filename per folder', () => {
    const tree = scanDir(tmp);
    const sub1 = tree.children.find((c) => c.name === 'folder2')!.children[0];
    expect(sub1.longestFilename).toBe('a-very-long-filename-for-path-tests.doc');
  });

  it('reports progress per folder', () => {
    let count = 0;
    scanDir(tmp, () => count++);
    expect(count).toBe(5); // root + empty + folder1 + folder2 + sub1
  });
});
