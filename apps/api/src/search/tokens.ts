import { likeLiteral } from "../directory/query.js";

/** Same accent mapping as the generated columns in the database. */
const ACCENTED = "àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ";
const ASCII = "aaaaaaceeeeiiiinoooooouuuuyy";
/** French function words add noise and can match a large part of the corpus. */
const STOP_WORDS: Record<string, true> = {
  les: true, des: true, aux: true, une: true, dans: true, sur: true, pour: true,
  avec: true, sans: true, par: true, est: true, sont: true, cette: true,
  ces: true, son: true, ses: true, leur: true, leurs: true,
};
const MAX_TOKENS = 8;

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ]/g, (char) => {
    return ASCII[ACCENTED.indexOf(char)] ?? char;
  });
}

/**
 * Turns free text into escaped, accent-free LIKE literals.
 * Short words are dropped: two-letter fragments such as "de" match most
 * organisation names and would flood the bounded candidate sets.
 */
export function searchTokens(query: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const word of normalizeSearchText(query).split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 3 || STOP_WORDS[word] === true || seen.has(word)) continue;
    seen.add(word);
    tokens.push(likeLiteral(word));
    if (tokens.length === MAX_TOKENS) break;
  }
  return tokens;
}
