import { describe, test, expect } from "vitest";
import {
  maskPlaceholders,
  restorePlaceholders,
} from "../../src/services/placeholders";
import {
  findDictionaryTerms,
  wrapTermsWithBrackets,
  unwrapAndTranslate,
  type ProjectDictionaryCache,
} from "../../src/services/dictionaryCache";

/** Mask a string, then restore whatever the model "returned". */
function roundTrip(source: string, modelOutput: (masked: string) => string) {
  const { text, map } = maskPlaceholders(source);
  return restorePlaceholders(modelOutput(text), map);
}

/** Minimal cache: term -> per-language translation. */
function buildCache(
  entries: Array<[string, Record<string, string>]>
): ProjectDictionaryCache {
  const dictionary_map = new Map<string, Map<string, string>>();
  const text_map = new Map<string, string>();
  for (const [dictId, langMap] of entries) {
    const langEntries = new Map<string, string>();
    for (const [lang, text] of Object.entries(langMap)) {
      langEntries.set(lang, text);
      const lowerText = text.toLowerCase();
      if (!text_map.has(lowerText)) text_map.set(lowerText, dictId);
    }
    dictionary_map.set(dictId, langEntries);
  }
  const terms_sorted = Array.from(text_map.keys()).sort(
    (a, b) => b.length - a.length
  );
  return { dictionary_map, text_map, terms_sorted, loaded_at: Date.now() };
}

/**
 * Run a string through the full translate pipeline the route performs:
 * dictionary wrap -> placeholder mask -> model -> restore -> dictionary unwrap.
 */
function fullPipeline(
  source: string,
  cache: ProjectDictionaryCache,
  lang: string,
  model: (masked: string) => string
): string {
  const matches = findDictionaryTerms(source, cache);
  const wrapped = wrapTermsWithBrackets(source, matches);
  const { text, map } = maskPlaceholders(wrapped);
  const restored = restorePlaceholders(model(text), map).text;
  return matches.length > 0
    ? unwrapAndTranslate(restored, matches, lang, cache)
    : restored;
}

describe("maskPlaceholders", () => {
  test("replaces each placeholder with a numbered token", () => {
    const { text, map } = maskPlaceholders(
      "{{levelTitle}} {{sudoku}} Coach - {{techniques}}"
    );
    expect(text).toBe("{{__PH0__}} {{__PH1__}} Coach - {{__PH2__}}");
    expect(map.get("__PH0__")).toBe("levelTitle");
    expect(map.get("__PH1__")).toBe("sudoku");
    expect(map.get("__PH2__")).toBe("techniques");
  });

  test("leaves strings without placeholders untouched", () => {
    const { text, map } = maskPlaceholders("Play sudoku puzzles");
    expect(text).toBe("Play sudoku puzzles");
    expect(map.size).toBe(0);
  });

  test("numbers repeated placeholders independently", () => {
    const { text, map } = maskPlaceholders("{{a}} then {{a}}");
    expect(text).toBe("{{__PH0__}} then {{__PH1__}}");
    expect(map.size).toBe(2);
  });
});

describe("restorePlaceholders", () => {
  test("restores a well-behaved response", () => {
    const result = roundTrip(
      "{{levelTitle}} {{sudoku}} Coach - {{techniques}}",
      () => "{{__PH0__}} {{__PH1__}} Trainer - {{__PH2__}}"
    );
    expect(result.text).toBe(
      "{{levelTitle}} {{sudoku}} Trainer - {{techniques}}"
    );
    expect(result.restored).toBe(3);
    expect(result.repaired).toBe(0);
    expect(result.missing).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  test("repairs mismatched closing brackets", () => {
    // Observed in production: qwen closes the token with ]] instead of }}
    const result = roundTrip(
      "Remove {{value5}} from {{value6}}.",
      () => "Entfernen Sie {{__PH0__}} aus {{__PH1__]]."
    );
    expect(result.text).toBe("Entfernen Sie {{value5}} aus {{value6}}.");
    expect(result.repaired).toBe(1);
    expect(result.missing).toEqual([]);
  });

  test("repairs full-width brackets", () => {
    const result = roundTrip(
      "Digit {{value1}} here",
      () => "数字｛｛__PH0__｝｝在这里"
    );
    expect(result.text).toBe("数字{{value1}}在这里");
    expect(result.repaired).toBe(1);
  });

  test("repairs a token that lost its brackets entirely", () => {
    const result = roundTrip("Digit {{value1}}", () => "Chiffre __PH0__");
    expect(result.text).toBe("Chiffre {{value1}}");
    expect(result.repaired).toBe(1);
  });

  test("repairs lowercased tokens", () => {
    const result = roundTrip("{{value1}} cells", () => "{{__ph0__}} cellules");
    expect(result.text).toBe("{{value1}} cellules");
    expect(result.repaired).toBe(1);
  });

  test("absorbs at most two closing brackets", () => {
    // Deliberate limit: a third bracket is left alone rather than eaten, so a
    // bracket belonging to surrounding text survives restoration.
    const result = roundTrip("{{value1}} cells", () => "{{__PH0__}}} celle");
    expect(result.text).toBe("{{value1}}} celle");
  });

  test("reports a dropped token instead of silently succeeding", () => {
    const result = roundTrip(
      "{{value1}} and {{value2}} and {{value3}}",
      () => "{{__PH1__}} et {{__PH2__}}"
    );
    expect(result.missing).toEqual(["__PH0__"]);
    expect(result.restored).toBe(2);
  });

  test("strips tokens the model invented for a placeholder-free string", () => {
    // Observed in production: model emits __PH8__ for a string with no placeholders
    const result = roundTrip(
      "Explore solving strategies.",
      () => "Досліджуйте {{__PH8__}} стратегії."
    );
    expect(result.text).toBe("Досліджуйте стратегії.");
    expect(result.unknown).toEqual(["__PH8__"]);
    expect(result.text).not.toContain("__PH");
  });

  test("tidies spacing left behind by a stripped token", () => {
    const result = roundTrip(
      "Explore strategies.",
      () => "Explorez les {{__PH3__}} stratégies {{__PH4__}}."
    );
    expect(result.text).toBe("Explorez les stratégies.");
    expect(result.unknown).toEqual(["__PH3__", "__PH4__"]);
  });

  test("reports duplicated tokens and restores every occurrence", () => {
    const result = roundTrip(
      "{{value1}} cells",
      () => "{{__PH0__}} {{__PH0__}} celdas"
    );
    expect(result.text).toBe("{{value1}} {{value1}} celdas");
    expect(result.duplicated).toEqual(["__PH0__"]);
  });

  test("leaves ordinary braces in the text alone", () => {
    // Technique copy legitimately contains candidate sets like {X,Y}
    const result = roundTrip("Cells with {X,Y} and {{value1}}", masked =>
      masked.replace("Cells with", "Zellen mit")
    );
    expect(result.text).toBe("Zellen mit {X,Y} and {{value1}}");
    expect(result.unknown).toEqual([]);
  });

  test("is a no-op for a placeholder-free round trip", () => {
    const result = roundTrip("Play sudoku", () => "Jugar sudoku");
    expect(result.text).toBe("Jugar sudoku");
    expect(result.restored).toBe(0);
    expect(result.missing).toEqual([]);
  });

  test("restores placeholders whose contents contain punctuation", () => {
    const result = roundTrip(
      "Learn {{X-Cycle}} now",
      () => "Aprende {{__PH0__}} ahora"
    );
    expect(result.text).toBe("Aprende {{X-Cycle}} ahora");
  });
});

describe("full translate pipeline", () => {
  const cache = buildCache([
    ["dict-sudoku", { en: "sudoku", zh: "数独", de: "Sudoku" }],
    ["dict-sudojo", { en: "Sudojo", zh: "数道场", de: "Sudojo" }],
  ]);

  test("leaves a dictionary term that sits inside a placeholder untouched", () => {
    // Regression: "sudoku" is both a dictionary term and the contents of the
    // caller's {{sudoku}} placeholder. Wrapping it nested the brackets and
    // shipped "{{数独}}" instead of interpolating the caller's value.
    const result = fullPipeline(
      "{{levelTitle}} {{sudoku}} Coach - {{techniques}} | Sudojo",
      cache,
      "zh",
      masked => masked.replace("Coach", "教练")
    );

    expect(result).toBe(
      "{{levelTitle}} {{sudoku}} 教练 - {{techniques}} | 数道场"
    );
    expect(result).not.toContain("数独");
  });

  test("still substitutes a dictionary term outside a placeholder", () => {
    const result = fullPipeline(
      "Play {{count}} sudoku puzzles",
      cache,
      "zh",
      masked => masked.replace("Play", "玩").replace("puzzles", "谜题")
    );

    expect(result).toBe("玩 {{count}} 数独 谜题");
  });

  test("survives a model that damages the token brackets", () => {
    const result = fullPipeline(
      "{{levelTitle}} {{sudoku}} Coach",
      cache,
      "de",
      masked =>
        masked.replace("{{__PH1__}}", "{{__PH1__]]").replace("Coach", "Trainer")
    );

    expect(result).toBe("{{levelTitle}} {{sudoku}} Trainer");
  });
});
