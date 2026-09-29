import { JSXElement } from "solid-js";

import { Page } from "../common/Page";

export function AboutPage(): JSXElement {
  return (
    <Page id="about">
      <div class="grid gap-6 text-sub">
        <h2 class="text-2xl text-text">Monkeytype Offline</h2>
        <p>
          An unofficial local practice edition of Monkeytype, created by Miodec
          and the Monkeytype contributors.
        </p>
        <p>
          Typing modes, settings, words, quotes, themes, fonts, and sounds run
          locally. Your results stay in this browser. No account is needed.
        </p>
        <p>
          Use Local History to review results and export a backup. Clearing
          browser site data removes local results and settings.
        </p>
        <p>
          Based on monkeytypegame/monkeytype, revision 4bd46c6 (26.32.0).
          Distributed under GPL-3.0. See the source repository for the license
          and modification details.
        </p>
        <p>
          English dictionary data: ECDICT, revision
          bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b. Distributed with its{" "}
          <a href={`${import.meta.env.BASE_URL}dictionaries/en/LICENSE.txt`}>
            MIT license
          </a>
          . Dictionary lookup runs from the same static site. Vocabulary is
          stored in this browser and included in JSON backups.
        </p>
      </div>
    </Page>
  );
}
