import { describe, expect, it } from 'vitest';
import { branchPriceAction, groupByCategory, matchesQuery } from './catalog';

const product = (name: string, category: string | null, sku: string | null = null) => ({ name, category, sku });

describe('groupByCategory', () => {
  it('groups by category in alphabetical order, with no category collected under one heading', () => {
    const groups = groupByCategory(
      [product('Samosa', 'Snacks'), product('Chai', 'Beverages'), product('Soda', null), product('Vada Pav', ' Snacks ')],
      'Uncategorised'
    );
    expect(groups.map(([name, items]) => [name, items.map((p) => p.name)])).toEqual([
      ['Beverages', ['Chai']],
      ['Snacks', ['Samosa', 'Vada Pav']],
      ['Uncategorised', ['Soda']],
    ]);
  });
});

describe('matchesQuery', () => {
  it('finds a product by its name, code or category, ignoring case', () => {
    const chai = product('Masala Chai', 'Beverages', 'CHAI-01');
    expect(matchesQuery(chai, 'masala')).toBe(true);
    expect(matchesQuery(chai, 'chai-0')).toBe(true);
    expect(matchesQuery(chai, 'BEVER')).toBe(true);
    expect(matchesQuery(chai, 'samosa')).toBe(false);
    expect(matchesQuery(chai, '   ')).toBe(true);
  });
});

describe('branchPriceAction', () => {
  it('saves only when both prices are numbers', () => {
    expect(branchPriceAction('130', '40', false)).toEqual({ kind: 'save', sellPrice: 130, costPrice: 40 });
    expect(branchPriceAction('130', '', true)).toEqual({ kind: 'none' });
    expect(branchPriceAction('130', 'forty', true)).toEqual({ kind: 'none' });
  });

  it('clears when both are emptied and the branch has a price of its own', () => {
    expect(branchPriceAction(' ', '', true)).toEqual({ kind: 'clear' });
    expect(branchPriceAction('', '', false)).toEqual({ kind: 'none' });
  });
});
