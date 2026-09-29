import * as Misc from "./utils/misc";
import * as MonkeyPower from "./elements/monkey-power";
import { configLoadPromise } from "./config/lifecycle";
import { refreshLocalResults } from "./offline/state";
import { animate } from "animejs";
import { onDOMReady, qs } from "./utils/dom";
import { navigate } from "./controllers/route-controller";
import {
  loadCustomThemeFromUrl,
  loadTestSettingsFromUrl,
  loadChallengeFromUrl,
} from "./controllers/url-handler";

onDOMReady(async () => {
  await configLoadPromise;
  await refreshLocalResults();
  loadCustomThemeFromUrl();
  loadTestSettingsFromUrl();
  await loadChallengeFromUrl();
  document.body.classList.remove("loading");
  qs("body")?.setStyle({ transition: "background .25s, transform .05s" });
  const app = document.querySelector<HTMLElement>("#app");
  if (app !== null) {
    // The typing layout measures word rows during navigation. Keep the app in
    // layout while fading in; display:none would produce zero-sized words.
    app.style.opacity = "0";
    app.classList.remove("hidden");
  }
  await navigate(undefined, { force: true });
  if (app !== null) {
    animate(app, { opacity: [0, 1], duration: Misc.applyReducedMotion(250) });
  }
  MonkeyPower.init();
});
