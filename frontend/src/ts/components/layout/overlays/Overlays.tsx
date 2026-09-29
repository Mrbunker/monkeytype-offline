import { JSXElement } from "solid-js";

import { getIsScreenshotting } from "../../../states/core";
import { showModal } from "../../../states/modals";
import { cn } from "../../../utils/cn";
import { Fa } from "../../common/Fa";
import { ScrollToTop } from "../footer/ScrollToTop";
import { Banners } from "./Banners";
import { FpsCounter } from "./FpsCounter";
import { LoaderBar } from "./LoaderBar";
import { MediaQueryDebugger } from "./MediaQueryDebugger";
import { Notifications } from "./Notifications";

export function Overlays(): JSXElement {
  return (
    <>
      <ScrollToTop />
      <button
        type="button"
        id="commandLineMobileButton"
        class={cn(
          "fixed bottom-8 left-8 z-99 hidden h-12 w-12 rounded-full bg-main text-center leading-12 text-bg",
          {
            "opacity-0": getIsScreenshotting(),
          },
        )}
        onClick={() => {
          showModal("Commandline");
        }}
        tabIndex="-1"
      >
        <Fa icon="fa-terminal" />
      </button>
      <Banners />
      <Notifications />
      <MediaQueryDebugger />
      <LoaderBar />
      <FpsCounter />
    </>
  );
}
