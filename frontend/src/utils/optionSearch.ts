/**
 * Finding one option among many — the rule, and the matching, for both apps.
 *
 * Every list in this product was laid out for a business with two or three
 * branches: chips that divide a row, tiles in a grid, a stack of radio rows. An
 * owner with two hundred branches gets all two hundred, every time they pick
 * one. Past a handful, a control has to let somebody type instead.
 *
 * ## Why the matching is shared rather than written twice
 *
 * A cashier is assigned to a branch from a phone standing in the shop and from a
 * desktop in the back office. If "sg" puts SG Highway first in one and second in
 * the other, two people pick different branches from the same keystrokes. The
 * ranking below is therefore pure, deterministic and tested once — the same
 * fence as `counterQueue.ts`, `teamRules.ts` and `supplyActions.ts`.
 *
 * It imports nothing at all, so both toolchains can compile it.
 */

/**
 * At or above this many options, a picker stops showing them all and offers a
 * search box instead.
 *
 * Six is the most a wrapping row of chips holds on a 320dp phone before the
 * labels start breaking, and it is also about as many as anybody scans without
 * reading. Below it, the options stay visible and cost one tap; at it, they cost
 * two taps and a few letters, which is the better trade only once scanning has
 * stopped working.
 *
 * This governs **choosing one of many**. It is not a rule about every list: a
 * fixed, enumerated, universally-known set stays as chips however long it is —
 * the seven weekdays of a weekly off are read as a row and set by eye, and a
 * dropdown with a search box over "Monday…Sunday" would be absurd.
 */
export const SEARCH_FROM = 7;

export function isSearchable(count: number, from: number = SEARCH_FROM): boolean {
  return count >= from;
}

/**
 * Latin-1 letters folded to their plain form, so "Café" is found by "cafe".
 *
 * Written out rather than done with `String.prototype.normalize('NFD')`: that
 * method's behaviour differs between Hermes and V8, and a ranking that differs
 * between the phone and the browser is the one thing this module exists to
 * prevent. Indic scripts are not folded — they are compared as typed, which is
 * right, because nothing in them folds the way accented Latin does.
 */
const FOLD: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c', ý: 'y', ÿ: 'y',
};

/**
 * Lower-cased, accents folded, separators flattened to spaces and runs
 * collapsed. Flattening the separators is what lets "kolkata" find
 * `Asia/Kolkata` and "sg high" find "SG-Highway".
 */
export function foldForSearch(value: string): string {
  let out = '';
  for (const character of value.toLowerCase()) {
    const folded = FOLD[character] ?? character;
    out += folded === '/' || folded === '_' || folded === '-' || folded === '·' ? ' ' : folded;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** What one option offers the search. Nulls in `secondary` are ignored. */
export interface Searchable {
  /** What the person reads — a branch's name, a business's name. */
  primary: string;
  /** Matched but not necessarily shown: a code, a city, an alias. */
  secondary?: readonly (string | null | undefined)[];
}

/** True when the token begins the text or begins any word in it. */
function beginsAWord(token: string, text: string): boolean {
  if (text.startsWith(token)) return true;
  return text.split(' ').some((word) => word.startsWith(token));
}

/**
 * How well one option answers one token. Lower is better; `null` is no match.
 *
 * The tiers exist so a code beats an accident: typing "IN" offers India before
 * Indonesia, and both before every branch with "in" buried in its address.
 *
 * A prefix counts at the start of **any word**, not only of the whole string.
 * People type the distinctive word, not the first one: "highway" should find SG
 * Highway and "kolkata" should find Asia/Kolkata, and ranking those as mere
 * mentions would bury them under anything that happens to contain the letters.
 */
function rankToken(token: string, primary: string, secondary: readonly string[]): number | null {
  if (primary === token || secondary.some((value) => value === token)) return 0;
  if (beginsAWord(token, primary)) return 1;
  if (secondary.some((value) => beginsAWord(token, value))) return 2;
  if (primary.includes(token)) return 3;
  if (secondary.some((value) => value.includes(token))) return 4;
  return null;
}

/**
 * How well one option answers a whole query. Lower is better; `null` is no match.
 *
 * Every token has to match something — "sg high" finds SG Highway and not every
 * branch with an "sg" — and the option is ranked by its *worst* token, so one
 * lucky exact match cannot carry a query that otherwise barely fits.
 */
export function searchRank(query: string, of: Searchable): number | null {
  const folded = foldForSearch(query);
  if (folded === '') return 0;

  const primary = foldForSearch(of.primary);
  const secondary = (of.secondary ?? [])
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .map(foldForSearch);

  let worst = 0;
  for (const token of folded.split(' ')) {
    const rank = rankToken(token, primary, secondary);
    if (rank === null) return null;
    worst = Math.max(worst, rank);
  }
  return worst;
}

/**
 * The options a query matches, best first.
 *
 * Stable: options of equal rank keep the order they were given in, so a branch
 * list stays in the order the server sent it rather than shuffling as somebody
 * types. An empty query returns the **same array**, so a list that is not being
 * searched re-renders for nothing.
 */
export function filterByQuery<T>(
  items: readonly T[],
  query: string,
  read: (item: T) => Searchable
): readonly T[] {
  if (foldForSearch(query) === '') return items;

  const ranked: { item: T; rank: number; at: number }[] = [];
  items.forEach((item, at) => {
    const rank = searchRank(query, read(item));
    if (rank !== null) ranked.push({ item, rank, at });
  });

  return ranked.sort((a, b) => a.rank - b.rank || a.at - b.at).map((entry) => entry.item);
}
