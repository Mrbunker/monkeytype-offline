import { Mode } from "@monkeytype/schemas/shared";
import { LocalResult } from "../offline/results";

/** Local result with derived fields used by history tables and charts. */
export type PracticeResult<M extends Mode = Mode> = Omit<
  LocalResult,
  "mode"
> & {
  mode: M;
  words: number;
  timeTyping: number;
  dayTimestamp: number;
};
