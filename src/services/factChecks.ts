/**
 * Checks shared by the AI-written texts. A small model keeps the right numbers but sometimes hangs
 * the wrong thing on them ("11 of 21 lifts" becomes "21 repetitions"), which a number check alone
 * can't see.
 */

const COUNTED = '(lifts?|sets?|reps?|repetitions?|sessions?|workouts?|personal bests?|exercises?|days?|weeks?)';
const stem = (noun: string) =>
  noun
    .toLowerCase()
    .replace(/^repetitions?$/, 'rep')
    .replace(/s$/, '');

/**
 * The first figure the text counts in a unit the facts don't use for that figure, e.g. "21
 * repetitions" when the facts say "21 lifts". Undefined when every counted figure matches a fact.
 */
export function mislabelledFigure(text: string, facts: string[]): string | undefined {
  const pattern = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s+(?:working\\s+|hard\\s+|repeated\\s+|planned\\s+|training\\s+)?${COUNTED}\\b`, 'gi');
  for (const match of text.matchAll(pattern)) {
    const [whole, number, noun] = match;
    const unit = stem(noun);
    const supported = facts.some((fact) => {
      const lower = fact.toLowerCase();
      return new RegExp(`(?<![\\d.])${number.replace('.', '\\.')}(?!\\d|\\.\\d)`).test(lower) && new RegExp(`\\b${unit}`).test(lower.replace(/repetitions?/g, 'rep'));
    });
    if (!supported) return whole;
  }
  return undefined;
}

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/**
 * The first number written as a word ("four", "twenty-four") that isn't a figure in the facts.
 * "One" is skipped: it is usually a pronoun ("this one"). Undefined when every spelled number matches.
 */
export function spelledNumberNotInFacts(text: string, facts: string[]): string | undefined {
  const known = new Set((facts.join(' ').match(/\d+(?:\.\d+)?/g) || []).map(Number));
  const words = `(${TENS.filter(Boolean).join('|')})(?:[\\s-](${UNITS.slice(1, 10).join('|')}))?|(${UNITS.slice(2).join('|')})`;
  for (const match of text.toLowerCase().matchAll(new RegExp(`\\b(?:${words})\\b`, 'g'))) {
    const [whole, tens, unit, small] = match;
    const value = small ? UNITS.indexOf(small) : TENS.indexOf(tens) * 10 + (unit ? UNITS.indexOf(unit) : 0);
    if (!known.has(value)) return whole;
  }
  return undefined;
}
