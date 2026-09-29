import { createSignal } from "solid-js";
import { LocalResult } from "./results";
import * as Storage from "./storage";

export const [getLocalResults, setLocalResults] = createSignal<LocalResult[]>(
  [],
);
export const [getStorageError, setStorageError] = createSignal<string | null>(
  null,
);
export const [isLocalDataReady, setLocalDataReady] = createSignal(false);

export async function refreshLocalResults(): Promise<void> {
  try {
    setLocalResults(await Storage.readResults());
    setStorageError(null);
  } catch (error) {
    setStorageError(
      error instanceof Error ? error.message : "Unable to read local results.",
    );
  } finally {
    setLocalDataReady(true);
  }
}

export async function persistLocalResult(
  result: LocalResult,
): Promise<LocalResult> {
  try {
    const results = await Storage.saveResult(result);
    setLocalResults(results);
    setStorageError(null);
    notifyLocalChange();
    return results.find((item) => item._id === result._id) as LocalResult;
  } catch (error) {
    setStorageError(
      "Result could not be saved. Check browser storage permissions and available space.",
    );
    throw error;
  }
}

export async function removeLocalResult(id: string): Promise<void> {
  try {
    setLocalResults(await Storage.deleteResult(id));
    setStorageError(null);
    notifyLocalChange();
  } catch (error) {
    setStorageError(
      "Result could not be deleted. Your saved results have been kept.",
    );
    throw error;
  }
}

const changes =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("monkeytype-local-results");
if (changes) {
  changes.onmessage = () => {
    void refreshLocalResults();
  };
}

export function notifyLocalChange(): void {
  changes?.postMessage("changed");
}
