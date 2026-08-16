import { describe, test, expect } from "vitest";
import {
  maskPlaceholders,
  restorePlaceholders,
} from "../../src/services/placeholders";

/** Mask a string, then restore whatever the model "returned". */
function roundTrip(source: string, modelOutput: (masked: string) => string) {
  const { text, map } = maskPlaceholders(source);
  return restorePlaceholders(modelOutput(text), map);
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

  test("repairs extra closing braces", () => {
    const result = roundTrip("{{value1}} cells", () => "{{__PH0__}}} celle");
    expect(result.text).toBe("{{value1}} celle");
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
