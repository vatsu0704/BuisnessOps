import { describe, expect, it } from 'vitest';
import {
  SEARCH_FROM,
  filterByQuery,
  foldForSearch,
  isSearchable,
  searchRank,
} from '@shared/utils/optionSearch';

/**
 * The matcher behind every picker in both apps. It is shared because a cashier
 * is assigned from a phone in the shop and from a desktop in the office, and the
 * same keystrokes must offer the same branch first in both.
 */
describe('option search', () => {
  describe('the threshold', () => {
    it('keeps six options visible and offers search at seven', () => {
      expect(isSearchable(6)).toBe(false);
      expect(isSearchable(SEARCH_FROM)).toBe(true);
      expect(isSearchable(200)).toBe(true);
    });

    it('lets one caller raise it — the counter is used one-handed, at speed', () => {
      expect(isSearchable(8, 12)).toBe(false);
      expect(isSearchable(12, 12)).toBe(true);
    });
  });

  describe('folding', () => {
    it('lower-cases and folds accents', () => {
      expect(foldForSearch('Café')).toBe('cafe');
      expect(foldForSearch('MAÑANA')).toBe('manana');
    });

    it('flattens the separators that hide inside an identifier', () => {
      expect(foldForSearch('Asia/Kolkata')).toBe('asia kolkata');
      expect(foldForSearch('SG-Highway')).toBe('sg highway');
    });

    it('collapses runs and trims', () => {
      expect(foldForSearch('  SG   Highway  ')).toBe('sg highway');
    });

    it('leaves Gujarati as typed — nothing in it folds the way Latin does', () => {
      expect(foldForSearch('એસજી હાઇવે')).toBe('એસજી હાઇવે');
    });
  });

  describe('ranking', () => {
    const branch = { primary: 'SG Highway', secondary: ['SG', 'Ahmedabad'] };

    it('puts an exact code first, then a name, then a mention', () => {
      expect(searchRank('sg', branch)).toBe(0);
      expect(searchRank('sg h', branch)).toBe(1);
      expect(searchRank('ahme', branch)).toBe(2);
      expect(searchRank('bad', branch)).toBe(4);
    });

    it('counts a prefix at the start of any word, not just the first', () => {
      // People type the distinctive word. "Highway" naming this branch is a
      // stronger answer than "bad" appearing inside Ahmedabad.
      expect(searchRank('highway', branch)).toBe(1);
      expect(searchRank('highway', branch)).toBeLessThan(searchRank('bad', branch)!);
    });

    it('says no when a token matches nothing', () => {
      expect(searchRank('surat', branch)).toBeNull();
    });

    it('needs every token to match, and is ranked by its worst', () => {
      // "sg" is an exact code (0) and "high" only starts the name (1).
      expect(searchRank('sg high', branch)).toBe(1);
      expect(searchRank('sg surat', branch)).toBeNull();
    });

    it('finds a timezone by its city, with or without the region', () => {
      const zone = { primary: 'Asia/Kolkata', secondary: ['UTC+05:30', 'India'] };
      expect(searchRank('kolkata', zone)).toBe(1);
      expect(searchRank('asia kolkata', zone)).toBe(1);
      expect(searchRank('india', zone)).toBe(0);
    });

    it('ignores a null or empty keyword, so optional fields pass straight in', () => {
      expect(searchRank('x', { primary: 'Name', secondary: [null, undefined, ''] })).toBeNull();
      // Typed in full, so it is the exact match, not merely a prefix.
      expect(searchRank('name', { primary: 'Name', secondary: [null] })).toBe(0);
    });

    it('matches everything on an empty query', () => {
      expect(searchRank('', branch)).toBe(0);
      expect(searchRank('   ', branch)).toBe(0);
    });
  });

  describe('filtering a list', () => {
    const branches = [
      { id: 'sg', primary: 'SG Highway', secondary: ['SG', 'Ahmedabad'] },
      { id: 'pr', primary: 'Prahlad Nagar', secondary: ['PR', 'Ahmedabad'] },
      { id: 'srt', primary: 'Surat Adajan', secondary: ['SRT', 'Surat'] },
    ];
    const read = (b: (typeof branches)[number]) => b;
    const ids = (query: string) => filterByQuery(branches, query, read).map((b) => b.id);

    it('returns the same array for an empty query, so nothing re-renders', () => {
      expect(filterByQuery(branches, '', read)).toBe(branches);
      expect(filterByQuery(branches, '  ', read)).toBe(branches);
    });

    it('drops what does not match', () => {
      expect(ids('surat')).toEqual(['srt']);
      expect(ids('zzz')).toEqual([]);
    });

    it('keeps the given order among equal matches, so a list does not shuffle', () => {
      // Both are in Ahmedabad and rank the same; the server's order stands.
      expect(ids('ahmedabad')).toEqual(['sg', 'pr']);
    });

    it('puts a better match above an earlier one', () => {
      // "sr" starts Surat's code (2); it only appears inside nothing else.
      expect(ids('sr')).toEqual(['srt']);
      // Prahlad is named for it; Surat only mentions it in a city.
      expect(ids('pr')[0]).toBe('pr');
    });
  });
});
