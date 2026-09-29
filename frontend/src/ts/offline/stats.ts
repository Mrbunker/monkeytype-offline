import { createMemo, createSignal } from "solid-js";
import { PracticeResult } from "../offline/types";
import { getLocalResults } from "../offline/state";
import { buildPersonalBests } from "../offline/results";

export const getPracticeStats = createMemo(() => ({
  personalBests: buildPersonalBests(getLocalResults()),
}));

export const [getLastResult, setLastResult] = createSignal<
  PracticeResult | undefined
>(undefined);
