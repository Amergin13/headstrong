const PRESERVED_PROPER_WORDS = new Set([
  'Romanian',
  'Bulgarian',
  'Russian',
  'Arnold',
  'Pendlay',
  'Zercher',
  'Jefferson',
  'Hack',
  'Smith',
  'Zottman',
  'Nordic',
  'Whoop',
  'Fitbit',
  'Strava',
  'Google',
]);

function lowercaseWordPart(part: string): string {
  const clean = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!clean) return part;
  // Keep single uppercase letters (e.g. "Full body A") and all-caps acronyms (e.g. "RDL", "TRX", "DB", "EZ", "HRV", "PR", "BW").
  if (/^[A-Z]$/.test(clean) || (/^[A-Z0-9]{2,}$/.test(clean) && /[A-Z]/.test(clean))) {
    return part;
  }
  if (PRESERVED_PROPER_WORDS.has(clean)) {
    return part;
  }
  return part.toLowerCase();
}

function sentenceCaseClause(clause: string): string {
  const trimmed = clause.trim();
  if (!trimmed) return clause;
  const tokens = trimmed.split(/(\s+)/);
  let seenFirstWord = false;
  return tokens
    .map((tok) => {
      if (/^\s+$/.test(tok) || tok === '/' || tok === '•' || tok === '—' || tok === '-') {
        return tok;
      }
      const subParts = tok.split('-');
      const formattedParts = subParts.map((part, idx) => {
        if (!seenFirstWord && idx === 0 && /[A-Za-z]/.test(part)) {
          seenFirstWord = true;
          const clean = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
          if (/^[A-Z0-9]{2,}$/.test(clean) || PRESERVED_PROPER_WORDS.has(clean)) {
            return part;
          }
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }
        if (!seenFirstWord && idx === 0 && /^\d+$/.test(part)) {
          seenFirstWord = true;
          return part;
        }
        return lowercaseWordPart(part);
      });
      return formattedParts.join('-');
    })
    .join('');
}

/**
 * Formats a title or exercise name in sentence case (e.g. "Barbell Back Squat" -> "Barbell back squat",
 * "Full Body A" -> "Full body A", "Today: Full Body A" -> "Today: Full body A") while preserving
 * single-letter identifiers ("A", "B"), acronyms ("RDL", "TRX", "DB"), and proper nouns ("Romanian", "Whoop").
 */
export function formatSentenceCase(text: string): string {
  if (!text) return text;
  return text
    .split(': ')
    .map((segment) => sentenceCaseClause(segment))
    .join(': ');
}
