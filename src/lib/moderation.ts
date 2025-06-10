import { BLOCKED_TERMS } from './moderation-terms.js';

const escape = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termPattern(term: string): RegExp {
  // Allow any run of spaces/punctuation between letters so "w.h.a.t.s.a.p.p"
  // and "what sapp" are still caught.
  const letters = term.replace(/\s+/g, '').split('').map(escape);
  return new RegExp(`(^|[^a-z0-9])(${letters.join('[\\s\\W_]*')})(?=$|[^a-z0-9])`, 'gi');
}

/** True when the text contains a blocked term and should be held for review. */
export function needsModeration(text: string): boolean {
  return BLOCKED_TERMS.some((term) => termPattern(term).test(text));
}

/** Replaces blocked terms with asterisks, keeping the surrounding text. */
export function maskBlockedTerms(text: string): string {
  let result = text;
  for (const term of BLOCKED_TERMS) {
    result = result.replace(termPattern(term), (_m, lead: string, word: string) => lead + '*'.repeat(word.length));
  }
  return result;
}
