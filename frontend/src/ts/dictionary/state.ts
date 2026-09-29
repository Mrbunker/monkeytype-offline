import { createSignal } from "solid-js";
import { showModal } from "../states/modals";
import { isTestActive, isResultCalculating } from "../states/test";

export type LookupContext = {
  word: string;
  input?: string;
  burst?: number;
  language?: string;
};
export const [getLookupContext, setLookupContext] = createSignal<LookupContext>(
  { word: "" },
);
export function openDictionary(context: LookupContext = { word: "" }): void {
  if (isTestActive() || isResultCalculating()) return;
  setLookupContext(context);
  showModal("Dictionary");
}
