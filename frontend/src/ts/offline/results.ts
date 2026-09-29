import { getFunbox } from "@monkeytype/funbox";
import { ResultSchema } from "@monkeytype/schemas/results";
import { PersonalBest, PersonalBests } from "@monkeytype/schemas/shared";
import { z } from "zod";

/** Persist practice data, never an authenticated identity or a server verdict. */
export const LocalResultSchema = ResultSchema.omit({
  uid: true,
  name: true,
})
  .extend({
    _id: z.string().uuid(),
    quoteLength: z.number().int().min(-1).max(3).default(-1),
    restartCount: z.number().int().nonnegative().default(0),
    incompleteTestSeconds: z.number().nonnegative().default(0),
    afkDuration: z.number().nonnegative().default(0),
    bailedOut: z.boolean().default(false),
    blindMode: z.boolean().default(false),
    lazyMode: z.boolean().default(false),
    funbox: ResultSchema.shape.funbox.default([]),
    language: ResultSchema.shape.language.default("english"),
    difficulty: ResultSchema.shape.difficulty.default("normal"),
    numbers: z.boolean().default(false),
    punctuation: z.boolean().default(false),
    stopOnLetter: z.boolean().default(false),
    tags: z.array(z.string()).max(0).default([]),
    isPb: z.boolean().default(false),
  })
  .strip();

export type LocalResult = z.infer<typeof LocalResultSchema>;

/** Same eligibility as upstream result controller / UserDAL.checkIfPb. */
export function canGetPersonalBest(result: LocalResult): boolean {
  return (
    !result.bailedOut &&
    result.mode !== "quote" &&
    !(result.stopOnLetter && result.acc < 100) &&
    getFunbox(result.funbox).every((funbox) => funbox.canGetPb)
  );
}

export function personalBestKey(result: LocalResult): string {
  return JSON.stringify([
    result.mode,
    result.mode2,
    result.language,
    result.difficulty,
    result.punctuation,
    result.numbers,
    result.lazyMode,
  ]);
}

/** Rebuild record-breaking flags chronologically, including after import/delete. */
export function recomputePersonalBests(results: LocalResult[]): LocalResult[] {
  const bests = new Map<string, number>();
  return [...results]
    .sort((a, b) => a.timestamp - b.timestamp || a._id.localeCompare(b._id))
    .map((result) => {
      const key = personalBestKey(result);
      const previous = bests.get(key);
      const isPb =
        canGetPersonalBest(result) &&
        (previous === undefined || result.wpm > previous);
      if (isPb) bests.set(key, result.wpm);
      return { ...result, isPb };
    });
}

export function buildPersonalBests(results: LocalResult[]): PersonalBests {
  const bests = new Map<string, LocalResult>();
  for (const result of results) {
    if (!canGetPersonalBest(result)) continue;
    const key = personalBestKey(result);
    const previous = bests.get(key);
    if (previous === undefined || result.wpm > previous.wpm) {
      bests.set(key, result);
    }
  }
  const output: PersonalBests = {
    time: {},
    words: {},
    quote: {},
    zen: {},
    custom: {},
  };
  for (const result of bests.values()) {
    const modes = output[result.mode] as Record<string, PersonalBest[]>;
    modes[result.mode2] ??= [];
    modes[result.mode2]?.push({
      wpm: result.wpm,
      raw: result.rawWpm,
      acc: result.acc,
      consistency: result.consistency,
      timestamp: result.timestamp,
      language: result.language,
      difficulty: result.difficulty,
      punctuation: result.punctuation,
      numbers: result.numbers,
      lazyMode: result.lazyMode,
    });
  }
  return output;
}
