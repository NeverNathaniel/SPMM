import { describe, expect, it } from 'vitest';
import {
  classifyFile,
  classifyFolderName,
  isHiddenFile,
  isHiddenOrSystemDir,
  reasonDetail,
} from '../src/shared/classify';

describe('classifyFile', () => {
  it('flags the characters SharePoint Online actually rejects', () => {
    expect(classifyFile('a:b.txt')).toBe('invalid-chars');
    expect(classifyFile('pipe|name.txt')).toBe('invalid-chars');
    expect(classifyFile('star*.txt')).toBe('invalid-chars');
    expect(classifyFile('what?.txt')).toBe('invalid-chars');
    expect(classifyFile('quote".txt')).toBe('invalid-chars');
    expect(classifyFile('less<more>.txt')).toBe('invalid-chars');
  });

  it('accepts characters that are valid in SharePoint Online (& { } ~ # %)', () => {
    // These were rejected by SharePoint's legacy rules but are valid today —
    // over-flagging them hard-blocked exports for common names like "R&D".
    expect(classifyFile('Budget & Forecast.xlsx')).toBeNull();
    expect(classifyFile('Report #Final.docx')).toBeNull();
    expect(classifyFile('50%.txt')).toBeNull();
    expect(classifyFile('Q1 {draft}.docx')).toBeNull();
    expect(classifyFile('approx~value.txt')).toBeNull();
  });

  it('flags reserved device names', () => {
    expect(classifyFile('CON.txt')).toBe('reserved-name');
    expect(classifyFile('con')).toBe('reserved-name');
    expect(classifyFile('LPT1.doc')).toBe('reserved-name');
    expect(classifyFile('COM9')).toBe('reserved-name');
    expect(classifyFile('COM0')).toBe('reserved-name'); // COM0/LPT0 are reserved too
    expect(classifyFile('LPT0.txt')).toBe('reserved-name');
    expect(classifyFile('CONSOLE.txt')).toBeNull(); // only exact device names
  });

  it('flags _vti_ anywhere in a name', () => {
    expect(classifyFile('report_vti_backup.docx')).toBe('reserved-name');
    expect(classifyFolderName('_vti_cnf')).toBe('reserved-name');
  });

  it('flags leading/trailing space or period', () => {
    expect(classifyFile(' leading.txt')).toBe('leading-trailing');
    expect(classifyFile('trailing.txt ')).toBe('leading-trailing');
    expect(classifyFile('ends-with-period.')).toBe('leading-trailing');
  });

  it('flags temp/lock files before other rules', () => {
    expect(classifyFile('~$Report Final.docx')).toBe('temp-lock-file');
    expect(classifyFile('build.tmp')).toBe('temp-lock-file');
    expect(classifyFile('.DS_Store')).toBe('temp-lock-file');
    expect(classifyFile('Thumbs.db')).toBe('temp-lock-file');
    expect(classifyFile('.lock')).toBe('temp-lock-file');
  });

  it('passes clean names', () => {
    expect(classifyFile('Quarterly Report 2024.docx')).toBeNull();
    expect(classifyFile('photo (1).jpg')).toBeNull();
  });
});

describe('classifyFolderName', () => {
  it('applies the same character rules', () => {
    expect(classifyFolderName('A|B')).toBe('invalid-chars');
    expect(classifyFolderName('Archive ')).toBe('leading-trailing');
    expect(classifyFolderName('Payroll')).toBeNull();
    expect(classifyFolderName('R&D')).toBeNull(); // & is valid in SharePoint Online
  });
});

describe('hidden/system filtering', () => {
  it('filters hidden and Windows system dirs', () => {
    expect(isHiddenOrSystemDir('.git')).toBe(true);
    expect(isHiddenOrSystemDir('$RECYCLE.BIN')).toBe(true);
    expect(isHiddenOrSystemDir('System Volume Information')).toBe(true);
    expect(isHiddenOrSystemDir('Accounting')).toBe(false);
  });

  it('filters dotfiles but keeps .DS_Store classifiable', () => {
    expect(isHiddenFile('.gitignore')).toBe(true);
    expect(isHiddenFile('.DS_Store')).toBe(false); // surfaces as temp-lock instead
    expect(isHiddenFile('notes.txt')).toBe(false);
  });
});

describe('reasonDetail', () => {
  it('lists the offending characters', () => {
    expect(reasonDetail('a:b.txt', 'invalid-chars')).toBe('contains :');
    expect(reasonDetail('a:b|c.txt', 'invalid-chars')).toBe('contains : |');
  });
});
