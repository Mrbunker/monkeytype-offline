import { createSignal, Show } from "solid-js";

import { exportBackup, importBackup } from "../../../offline/backup";
import {
  getLocalResults,
  getStorageError,
  isLocalDataReady,
  notifyLocalChange,
  refreshLocalResults,
  setLocalResults,
  setStorageError,
} from "../../../offline/state";
import { showPbTablesModal } from "../../../states/pb-tables-modal";
import { Button } from "../../common/Button";

export function LocalDataControls() {
  let input: HTMLInputElement | undefined;
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete this operation.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="grid gap-3">
      <h1 class="text-xl text-main">Local history</h1>
      <p class="text-sm text-sub">
        {getLocalResults().length} saved results in this browser. Export a
        backup before clearing browser data or moving to another device. Import
        merges results and restores saved settings, themes and favorite quotes.
        Local image and font files are not included.
      </p>
      <Show when={!isLocalDataReady()}>
        <p role="status">Loading local results…</p>
      </Show>
      <Show when={getStorageError()}>
        <div role="alert" class="text-error">
          {getStorageError()}
          <Button
            text="retry storage"
            variant="text"
            onClick={() => void refreshLocalResults()}
          />
        </div>
      </Show>
      <div class="flex flex-wrap gap-2">
        <Button
          text="time personal bests"
          fa={{ icon: "fa-crown" }}
          onClick={() => showPbTablesModal("time")}
        />
        <Button
          text="word personal bests"
          fa={{ icon: "fa-crown" }}
          onClick={() => showPbTablesModal("words")}
        />
        <Button
          text="export JSON"
          fa={{ icon: "fa-download" }}
          disabled={busy() || !isLocalDataReady() || getStorageError() !== null}
          onClick={() =>
            void run(async () => {
              const content = await exportBackup();
              const url = URL.createObjectURL(
                new Blob([content], { type: "application/json" }),
              );
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `monkeytype-local-${new Date().toISOString().slice(0, 10)}.json`;
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setMessage(
                "Backup exported: results, settings, custom themes and favorite quotes.",
              );
            })
          }
        />
        <Button
          text="import JSON"
          fa={{ icon: "fa-upload" }}
          disabled={busy()}
          onClick={() => input?.click()}
        />
        <input
          ref={(element) => {
            input = element;
          }}
          type="file"
          accept="application/json,.json"
          class="hidden"
          aria-label="Import local practice backup"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            void run(async () => {
              if (file.size > 50 * 1024 * 1024) {
                throw new Error("Backup exceeds 50 MB.");
              }
              const outcome = await importBackup(await file.text());
              setLocalResults(outcome.results);
              setStorageError(null);
              notifyLocalChange();
              setMessage(
                `Imported ${outcome.imported} new results; skipped ${outcome.skipped} repeated IDs. ${outcome.preferencesError === undefined ? "Backup restored." : `Results saved, but some preferences could not be restored: ${outcome.preferencesError} You can retry this import.`}`,
              );
            });
          }}
        />
      </div>
      <Show when={message()}>
        <p role="status" class="text-sm">
          {message()}
        </p>
      </Show>
    </div>
  );
}
