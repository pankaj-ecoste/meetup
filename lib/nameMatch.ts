// Match a name as heard in a meeting to the canonical employee name, so the
// sheet spelling is consistent (plan.md §12.2i). Conservative by design: it
// only rewrites a name when exactly ONE employee fits; otherwise the name is
// kept as heard and the reviewer fixes it before Save.

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchName(spoken: string | null | undefined, directory: string[]): string {
  const raw = (spoken ?? '').trim()
  if (!raw) return ''
  const q = norm(raw)
  if (!q) return raw

  const entries = directory.map((name) => ({ name, n: norm(name) }))

  // 1) exact full-name match
  const exact = entries.filter((e) => e.n === q)
  if (exact.length === 1) return exact[0].name
  if (exact.length > 1) return raw // two people with the same name — don't guess

  // 2) spoken name is a whole-word prefix/subset of exactly one full name
  //    ("Rahul" → "Rahul Sharma"; "Rahul Sharma" ← "Rahul")
  const qTokens = q.split(' ')
  const partial = entries.filter((e) => {
    const t = e.n.split(' ')
    return qTokens.every((x) => t.includes(x))
  })
  if (partial.length === 1) return partial[0].name

  return raw
}
