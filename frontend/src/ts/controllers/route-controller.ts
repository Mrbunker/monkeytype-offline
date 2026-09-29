import * as PageController from "./page-controller";
import * as PageTransition from "../legacy-states/page-transition";
import { isFunboxActive } from "../test/funbox/list";
import { showNoticeNotification } from "../states/notifications";
import { navigationEvent, type NavigateOptions } from "../events/navigation";
import {
  isTestRestarting,
  isResultCalculating,
  isTestActive,
} from "../states/test";

//source: https://www.youtube.com/watch?v=OstALBk-jTc
// https://www.youtube.com/watch?v=OstALBk-jTc

function pathToRegex(path: string): RegExp {
  return new RegExp(`^${path.replace(/\//g, "\\/").replace(/:\w+/g, "(.+)")}$`);
}

function getParams(match: {
  route: Route;
  result: RegExpMatchArray;
}): Record<string, string> {
  const values = match.result.slice(1);
  const keys = Array.from(match.route.path.matchAll(/:(\w+)/g)).map(
    (result) => result[1],
  );

  const a = keys.map((key, index) => [key, values[index]]);
  return Object.fromEntries(a) as Record<string, string>;
}

type Route = {
  path: string;
  load: (
    params: Record<string, string>,
    navigateOptions: NavigateOptions,
  ) => Promise<void>;
};

const route404: Route = {
  path: "404",
  load: async (_params, options) => {
    await PageController.change("404", options);
  },
};

const routes: Route[] = [
  {
    path: "/",
    load: async (_, options) => {
      await PageController.change("test", options);
    },
  },
  {
    path: "/settings",
    load: async (_, options) => {
      await PageController.change("settings", options);
    },
  },
  {
    path: "/account",
    load: async (_, options) => {
      await PageController.change("account", options);
    },
  },
  {
    path: "/about",
    load: async (_, options) => {
      await PageController.change("about", options);
    },
  },
];

let pendingNavigation: ReturnType<typeof setTimeout> | undefined;

export async function navigate(
  url = window.location.pathname +
    window.location.search +
    window.location.hash,
  options = {} as NavigateOptions,
): Promise<void> {
  if (
    !options.force &&
    (isTestRestarting() || isResultCalculating() || PageTransition.get())
  ) {
    // Finish the current transition, then honor the most recent navigation.
    clearTimeout(pendingNavigation);
    pendingNavigation = setTimeout(() => {
      void navigate(url, options);
    }, 100);
    return;
  }

  clearTimeout(pendingNavigation);
  pendingNavigation = undefined;
  const noQuit = isFunboxActive("no_quit");
  if (isTestActive() && noQuit) {
    showNoticeNotification(
      "No quit funbox is active. Please finish the test.",
      {
        important: true,
      },
    );
    //todo: figure out if this was ever used
    // event?.preventDefault();
    return;
  }

  const target = new URL(url, window.location.origin);
  const base = import.meta.env.BASE_URL;
  const route = target.hash.startsWith("#/")
    ? target.hash.slice(1)
    : target.pathname.startsWith(base)
      ? `/${target.pathname.slice(base.length)}`
      : target.pathname;
  const destination = `${base}${target.search}#${route.replace(/\/$/, "") || "/"}`;
  if (
    window.location.pathname + window.location.search + window.location.hash !==
    destination
  ) {
    history.pushState(null, "", destination);
  }

  await router(options);
}

async function router(options = {} as NavigateOptions): Promise<void> {
  const matches = routes.map((r) => {
    return {
      route: r,
      result: (location.hash.slice(1) || "/").match(pathToRegex(r.path)),
    };
  });

  const match = matches.find((m) => m.result !== null) as {
    route: Route;
    result: RegExpMatchArray;
  };

  if (match === undefined) {
    await route404.load(
      {},
      {
        force: true,
      },
    );
    return;
  }

  await match.route.load(getParams(match), options);
}

window.addEventListener("popstate", () => {
  void router();
});

window.addEventListener("hashchange", () => {
  void router();
});

document.addEventListener("click", (event) => {
  const anchor =
    event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>("a")
      : null;
  if (
    !anchor ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const href = anchor.getAttribute("href");
  if (href?.startsWith("#") && !href.startsWith("#/")) {
    const section = document.getElementById(href.slice(1));
    if (section) {
      event.preventDefault();
      section.scrollIntoView({ block: "start" });
    }
    return;
  }
  if (!anchor.hasAttribute("router-link")) return;
  event.preventDefault();
  void navigate(anchor.href);
});

navigationEvent.subscribe(({ url, options }) => {
  void navigate(url, options);
});
