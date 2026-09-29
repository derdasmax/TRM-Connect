/** Minimal subsequence-based fuzzy match: every character of `query` (in
 *  order, case-insensitive) must appear in `text`, not necessarily
 *  contiguous. Returns a score (higher = better match; consecutive and
 *  early matches score higher) or null when it doesn't match at all. */
export function fuzzyScore(query: string, text: string): number | null {
  if (query === "") return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === ti - 1 ? 3 : 1; // reward consecutive matches
      if (ti === qi) score += 1; // reward matches at the very start
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : null;
}
