/**
 * @fileoverview Placeholder masking and restoration
 * @description Before a string is handed to the translation service, every
 * `{{...}}` placeholder is replaced with an opaque token (`{{__PH0__}}`,
 * `{{__PH1__}}`, ...) so the model cannot translate or transliterate the
 * placeholder's contents. After the model answers, the tokens are swapped back
 * for the originals.
 *
 * Models do not always echo the tokens back verbatim: observed failures include
 * mismatched closing brackets (`{{__PH5__]]`), full-width brackets, dropped
 * brackets, case changes, dropped tokens, and tokens invented for strings that
 * never had one. A strict `{{__PHn__}}` string match leaks all of those into
 * user-visible output, so restoration matches the token core and tolerates the
 * bracket damage around it.
 */

/** Matches a placeholder in source text: `{{anything but a closing brace}}`. */
const SOURCE_PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

/**
 * Matches a `__PHn__` token plus whatever bracket-like characters the model
 * wrapped it in — including none at all. Covers ASCII `{}[]()<>` and the
 * full-width/CJK forms models reach for when the target language is CJK.
 * Padding is only absorbed when it sits inside brackets, so a bare `__PH0__`
 * does not swallow the space that separates it from the preceding word.
 *
 * At most two closing brackets are absorbed. Every corruption seen in practice
 * is two characters or fewer (`]]`, `｝｝`, a lone `}`, or none), and stopping
 * at two keeps a third bracket that belongs to surrounding text from being
 * eaten along with the token.
 */
const TOKEN_RE =
  /(?:[{[(<｛【〔]{1,3}[ \t]*)?_{1,3}PH(\d+)_{1,3}(?:[ \t]*[}\])>｝】〕]{1,2})?/gi;

/** The exact form a well-behaved model returns. */
function canonicalToken(index: string): string {
  return `{{__PH${index}__}}`;
}

export interface MaskResult {
  /** The string with every placeholder replaced by an opaque token. */
  text: string;
  /** token (`__PH0__`) -> original placeholder contents. */
  map: Map<string, string>;
}

export interface RestoreResult {
  /** The string with tokens swapped back for their originals. */
  text: string;
  /** How many token occurrences were restored. */
  restored: number;
  /** How many of those needed bracket/case repair rather than an exact match. */
  repaired: number;
  /** Tokens the model dropped entirely. */
  missing: string[];
  /** Tokens the model emitted more than once. */
  duplicated: string[];
  /** Tokens the model invented; these have no original and are removed. */
  unknown: string[];
}

/**
 * Replace every `{{...}}` placeholder with an opaque `{{__PHn__}}` token.
 */
export function maskPlaceholders(str: string): MaskResult {
  const map = new Map<string, string>();
  let counter = 0;
  const text = str.replace(SOURCE_PLACEHOLDER_RE, (_match, content: string) => {
    const token = `__PH${counter++}__`;
    map.set(token, content);
    return `{{${token}}}`;
  });
  return { text, map };
}

/**
 * Swap opaque tokens back for their original placeholder contents, repairing
 * the bracket damage models introduce. Tokens with no entry in `map` were
 * invented by the model and are stripped rather than leaked.
 */
export function restorePlaceholders(
  text: string,
  map: Map<string, string>
): RestoreResult {
  if (map.size === 0 && !TOKEN_RE.test(text)) {
    TOKEN_RE.lastIndex = 0;
    return {
      text,
      restored: 0,
      repaired: 0,
      missing: [],
      duplicated: [],
      unknown: [],
    };
  }
  TOKEN_RE.lastIndex = 0;

  const counts = new Map<string, number>();
  const unknown: string[] = [];
  let restored = 0;
  let repaired = 0;
  let removedAny = false;

  let result = text.replace(TOKEN_RE, (match, index: string) => {
    const token = `__PH${index}__`;
    const original = map.get(token);

    if (original === undefined) {
      // The model invented a token for a placeholder that never existed.
      // There is nothing to restore it to, so drop it instead of shipping it.
      unknown.push(token);
      removedAny = true;
      return "";
    }

    counts.set(token, (counts.get(token) ?? 0) + 1);
    restored += 1;
    if (match !== canonicalToken(index)) repaired += 1;
    return `{{${original}}}`;
  });

  if (removedAny) {
    // Removing a token can leave doubled spaces or a space before punctuation.
    result = result
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .trim();
  }

  const missing = [...map.keys()].filter(token => !counts.has(token));
  const duplicated = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([token]) => token);

  return { text: result, restored, repaired, missing, duplicated, unknown };
}
