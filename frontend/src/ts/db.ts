import { Mode, Mode2, PersonalBest } from "@monkeytype/schemas/shared";
import { Difficulty } from "@monkeytype/schemas/configs";
import { FunboxMetadata } from "@monkeytype/funbox";
import { getPracticeStats } from "./offline/stats";

export { getPracticeStats };

export function getLocalPB<M extends Mode>(
  mode: M,
  mode2: Mode2<M>,
  punctuation: boolean,
  numbers: boolean,
  language: string,
  difficulty: Difficulty,
  lazyMode: boolean,
  funboxes: FunboxMetadata[],
): PersonalBest | undefined {
  if (!funboxes.every((funbox) => funbox.canGetPb)) return undefined;
  const bests = getPracticeStats().personalBests?.[mode]?.[mode2] as
    | PersonalBest[]
    | undefined;
  return bests?.find(
    (best) =>
      (best.punctuation ?? false) === punctuation &&
      (best.numbers ?? false) === numbers &&
      best.language === language &&
      best.difficulty === difficulty &&
      (best.lazyMode ?? false) === lazyMode,
  );
}
