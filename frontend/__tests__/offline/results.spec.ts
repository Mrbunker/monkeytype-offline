import { describe, expect, it } from "vitest";
import { getAllFunboxes } from "@monkeytype/funbox";
import {
  buildPersonalBests,
  canGetPersonalBest,
  LocalResult,
  LocalResultSchema,
  recomputePersonalBests,
} from "../../src/ts/offline/results";

function result(overrides: Partial<LocalResult> = {}): LocalResult {
  return LocalResultSchema.parse({
    _id: "00000000-0000-4000-8000-000000000001",
    wpm: 60,
    rawWpm: 65,
    charStats: [150, 0, 0, 0],
    acc: 95,
    mode: "time",
    mode2: "30",
    timestamp: 1000,
    testDuration: 30,
    consistency: 80,
    keyConsistency: 80,
    chartData: { wpm: [60], burst: [65], err: [0] },
    ...overrides,
  });
}

describe("local personal bests", () => {
  it("keeps the upstream rule that only strictly faster eligible results set a PB", () => {
    const flags = recomputePersonalBests([
      result({
        _id: "00000000-0000-4000-8000-000000000003",
        timestamp: 3000,
        wpm: 65,
      }),
      result(),
      result({ _id: "00000000-0000-4000-8000-000000000002", timestamp: 2000 }),
    ]);
    expect(flags.map((item) => item.isPb)).toEqual([true, false, true]);
    expect(buildPersonalBests(flags).time["30"]?.[0]?.wpm).toBe(65);
  });

  it.each([
    { language: "spanish" },
    { difficulty: "expert" },
    { mode2: "60" },
    { punctuation: true },
    { numbers: true },
    { lazyMode: true },
    { mode: "words", mode2: "30" },
  ] as Partial<LocalResult>[])("separates PB groups by %j", (settings) => {
    const second = result({ ...settings, wpm: 40, timestamp: 2000 });
    expect(
      recomputePersonalBests([result(), second]).map((item) => item.isPb),
    ).toEqual([true, true]);
  });

  it("excludes quotes, bailouts, incompatible funboxes, and imperfect stop-on-letter tests", () => {
    expect(canGetPersonalBest(result({ mode: "quote" }))).toBe(false);
    expect(canGetPersonalBest(result({ bailedOut: true }))).toBe(false);
    expect(canGetPersonalBest(result({ stopOnLetter: true }))).toBe(false);
    expect(canGetPersonalBest(result({ stopOnLetter: true, acc: 100 }))).toBe(
      true,
    );
    const incompatible = getAllFunboxes().find((item) => !item.canGetPb);
    expect(incompatible).toBeDefined();
    if (incompatible !== undefined) {
      expect(canGetPersonalBest(result({ funbox: [incompatible.name] }))).toBe(
        false,
      );
    }
  });

  it("recomputes after deletion and never trusts imported PB flags", () => {
    const older = result({ wpm: 100 });
    const newer = result({ timestamp: 2000, wpm: 80, isPb: true });
    expect(recomputePersonalBests([older, newer])[1]?.isPb).toBe(false);
    const remaining = recomputePersonalBests([newer]);
    expect(remaining[0]?.isPb).toBe(true);
    expect(buildPersonalBests(remaining).time["30"]?.[0]?.wpm).toBe(80);
  });

  it("validates imported values and strips identity and unknown fields", () => {
    expect(() => result({ wpm: Number.NaN })).toThrow();
    expect(() => result({ acc: 101 })).toThrow();
    const parsed = LocalResultSchema.parse({
      ...result(),
      uid: "remote-user",
      name: "remote-name",
    });
    expect(parsed).not.toHaveProperty("uid");
    expect(parsed).not.toHaveProperty("name");
  });
});
