import { JSXElement } from "solid-js";

import { openDictionary } from "../../../dictionary/state";
import { restartTestEvent } from "../../../events/test";
import { getActivePage } from "../../../states/core";
import {
  isTestActive,
  isResultCalculating,
  getFocus,
} from "../../../states/test";
import { cn } from "../../../utils/cn";
import { Button } from "../../common/Button";

export function Nav(): JSXElement {
  const buttonClass = (): string =>
    cn("aspect-square", { "opacity-(--nav-focus-opacity)": getFocus() });
  return (
    <nav
      class="z-5 flex w-full items-center gap-1 md:gap-2"
      aria-label="Main navigation"
    >
      <Button
        variant="text"
        fa={{ icon: "fa-keyboard", fixedWidth: true }}
        router-link
        href={`${import.meta.env.BASE_URL}#/`}
        class={buttonClass()}
        aria-label="Typing test"
        dataset={{ "data-nav-item": "test" }}
        onClick={() => {
          if (getActivePage() === "test") restartTestEvent.dispatch();
        }}
      />
      <Button
        variant="text"
        fa={{ icon: "fa-chart-line", fixedWidth: true }}
        router-link
        href={`${import.meta.env.BASE_URL}#/account`}
        class={buttonClass()}
        aria-label="Local history"
        dataset={{ "data-nav-item": "account" }}
      />
      <Button
        variant="text"
        fa={{ icon: "fa-cog", fixedWidth: true }}
        router-link
        href={`${import.meta.env.BASE_URL}#/settings`}
        class={buttonClass()}
        aria-label="Settings"
        dataset={{ "data-nav-item": "settings" }}
      />
      <div class="grow"></div>
      <Button
        variant="text"
        fa={{ icon: "fa-book", fixedWidth: true }}
        class={buttonClass()}
        aria-label="Dictionary / 查词"
        disabled={isTestActive() || isResultCalculating()}
        onClick={() => openDictionary()}
      />
      <Button
        variant="text"
        fa={{ icon: "fa-info", fixedWidth: true }}
        router-link
        href={`${import.meta.env.BASE_URL}#/about`}
        class={buttonClass()}
        aria-label="About this offline fork"
        dataset={{ "data-nav-item": "about" }}
      />
    </nav>
  );
}
