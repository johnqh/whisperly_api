import { describe, test, expect, vi } from "vitest";
import { restoreWithIntegrity } from "../../src/services/placeholderRepair";
import { maskPlaceholders } from "../../src/services/placeholders";

/** Build the inputs the route assembles, from source strings. */
function setup(sourceStrings: string[]) {
  const placeholderMaps: Map<string, string>[] = [];
  const maskedStrings = sourceStrings.map(s => {
    const { text, map } = maskPlaceholders(s);
    placeholderMaps.push(map);
    return text;
  });
  return { sourceStrings, maskedStrings, placeholderMaps };
}

describe("restoreWithIntegrity", () => {
  test("passes clean output straight through", async () => {
    const base = setup(["Remove {{value1}} from {{value2}}."]);
    const retranslate = vi.fn();

    const { translations, summary } = await restoreWithIntegrity(
      {
        ...base,
        translationsByLanguage: {
          de: ["Entfernen {{__PH0__}} aus {{__PH1__}}."],
        },
      },
      retranslate
    );

    expect(translations.de![0]).toBe("Entfernen {{value1}} aus {{value2}}.");
    expect(summary).toMatchObject({ retried: 0, recovered: 0, fellBack: 0 });
    expect(retranslate).not.toHaveBeenCalled();
  });

  test("repairs bracket damage without spending a retry", async () => {
    const base = setup(["Remove {{value1}} from {{value2}}."]);
    const retranslate = vi.fn();

    const { translations, summary } = await restoreWithIntegrity(
      {
        ...base,
        translationsByLanguage: {
          de: ["Entfernen {{__PH0__}} aus {{__PH1__]]."],
        },
      },
      retranslate
    );

    expect(translations.de![0]).toBe("Entfernen {{value1}} aus {{value2}}.");
    expect(summary.repaired).toBe(1);
    expect(summary.retried).toBe(0);
    expect(retranslate).not.toHaveBeenCalled();
  });

  test("retries a dropped token and keeps the clean retry", async () => {
    const base = setup(["Remove {{value1}} from {{value2}}."]);
    const retranslate = vi
      .fn()
      .mockResolvedValue(["Entfernen {{__PH0__}} aus {{__PH1__}}."]);

    const { translations, summary } = await restoreWithIntegrity(
      { ...base, translationsByLanguage: { de: ["Entfernen {{__PH0__}}."] } },
      retranslate
    );

    expect(retranslate).toHaveBeenCalledTimes(1);
    expect(retranslate.mock.calls[0]![1]).toBe("de");
    expect(retranslate.mock.calls[0]![2]).toContain("dropped __PH1__");
    expect(translations.de![0]).toBe("Entfernen {{value1}} aus {{value2}}.");
    expect(summary).toMatchObject({ retried: 1, recovered: 1, fellBack: 0 });
  });

  test("falls back to source text when the retry is also damaged", async () => {
    const base = setup(["Remove {{value1}} from {{value2}}."]);
    const retranslate = vi.fn().mockResolvedValue(["Entfernen {{__PH0__}}."]);

    const { translations, summary } = await restoreWithIntegrity(
      { ...base, translationsByLanguage: { de: ["Entfernen {{__PH0__}}."] } },
      retranslate
    );

    expect(translations.de![0]).toBe("Remove {{value1}} from {{value2}}.");
    expect(summary).toMatchObject({ retried: 1, recovered: 0, fellBack: 1 });
  });

  test("falls back when the retry call throws", async () => {
    const base = setup(["Remove {{value1}} from {{value2}}."]);
    const retranslate = vi.fn().mockRejectedValue(new Error("503"));
    const warnings: string[] = [];

    const { translations, summary } = await restoreWithIntegrity(
      {
        ...base,
        translationsByLanguage: { de: ["Entfernen {{__PH0__}}."] },
        onWarn: m => warnings.push(m),
      },
      retranslate
    );

    expect(translations.de![0]).toBe("Remove {{value1}} from {{value2}}.");
    expect(summary.fellBack).toBe(1);
    expect(warnings.some(w => w.includes("503"))).toBe(true);
  });

  test("catches a duplicated token too", async () => {
    const base = setup(["Digit {{value1}}."]);
    const retranslate = vi.fn().mockResolvedValue(["Ziffer {{__PH0__}}."]);

    const { translations, summary } = await restoreWithIntegrity(
      {
        ...base,
        translationsByLanguage: { de: ["Ziffer {{__PH0__}} {{__PH0__}}."] },
      },
      retranslate
    );

    expect(retranslate.mock.calls[0]![2]).toContain("duplicated __PH0__");
    expect(translations.de![0]).toBe("Ziffer {{value1}}.");
    expect(summary.recovered).toBe(1);
  });

  test("groups damaged strings of one language into a single retry call", async () => {
    const base = setup(["A {{v1}}", "B {{v2}}", "C {{v3}}"]);
    const retranslate = vi
      .fn()
      .mockResolvedValue(["A {{__PH0__}}", "C {{__PH0__}}"]);

    await restoreWithIntegrity(
      {
        ...base,
        translationsByLanguage: {
          de: ["A", "B {{__PH0__}}", "C"], // indices 0 and 2 damaged
        },
      },
      retranslate
    );

    expect(retranslate).toHaveBeenCalledTimes(1);
    expect(retranslate.mock.calls[0]![0]).toEqual([
      "A {{__PH0__}}",
      "C {{__PH0__}}",
    ]);
  });

  test("retries each language separately", async () => {
    const base = setup(["A {{v1}}"]);
    const retranslate = vi.fn().mockResolvedValue(["A {{__PH0__}}"]);

    await restoreWithIntegrity(
      { ...base, translationsByLanguage: { de: ["A"], fr: ["A"] } },
      retranslate
    );

    expect(retranslate).toHaveBeenCalledTimes(2);
    expect(retranslate.mock.calls.map(c => c[1]).sort()).toEqual(["de", "fr"]);
  });

  test("honours a larger retry budget", async () => {
    const base = setup(["A {{v1}}"]);
    const retranslate = vi
      .fn()
      .mockResolvedValueOnce(["A"]) // still damaged
      .mockResolvedValueOnce(["A {{__PH0__}}"]); // clean on second try

    const { translations, summary } = await restoreWithIntegrity(
      {
        ...base,
        translationsByLanguage: { de: ["A"] },
        maxAttempts: 2,
      },
      retranslate
    );

    expect(retranslate).toHaveBeenCalledTimes(2);
    expect(translations.de![0]).toBe("A {{v1}}");
    expect(summary.fellBack).toBe(0);
  });

  test("never emits a token marker, whatever the model does", async () => {
    const base = setup(["A {{v1}} B", "no placeholders here"]);
    const retranslate = vi.fn().mockResolvedValue(["garbage {{__PH7__}}"]);

    const { translations } = await restoreWithIntegrity(
      {
        ...base,
        translationsByLanguage: {
          de: ["A B", "Müll {{__PH9__}} hier"],
        },
      },
      retranslate
    );

    for (const text of translations.de!) {
      expect(text).not.toMatch(/__PH\d+__/);
    }
  });
});
