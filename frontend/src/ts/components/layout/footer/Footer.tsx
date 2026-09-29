import { JSXElement, Show } from "solid-js";

import { getStorageError } from "../../../offline/state";
import { getIsScreenshotting } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { Keytips } from "./Keytips";
import { ThemeIndicator } from "./ThemeIndicator";

export function Footer(): JSXElement {
  return (
    <footer
      class={cn("relative text-xs text-sub", {
        "opacity-0": getIsScreenshotting(),
      })}
    >
      <Show when={getStorageError()}>
        <p role="alert" class="mb-2 text-error">
          {getStorageError()}
        </p>
      </Show>
      <Keytips />
      <div
        class={cn(
          "flex items-center justify-between gap-8 transition-opacity",
          { "opacity-0": getFocus() },
        )}
      >
        <span>offline · data stays in this browser</span>
        <ThemeIndicator />
      </div>
    </footer>
  );
}
