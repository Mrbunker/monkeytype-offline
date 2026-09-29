import { setConfig } from "../../config/setters";
import * as CustomThemes from "../../collections/custom-themes";
import * as ThemeController from "../../controllers/theme-controller";
import { Command, CommandsSubgroup } from "../types";

const subgroup: CommandsSubgroup = {
  title: "Custom themes list...",
  // configKey: "customThemeId",
  beforeList: (): void => update(),
  list: [],
};

const commands: Command[] = [
  {
    id: "setCustomThemeId",
    display: "Custom themes...",
    icon: "fa-palette",
    subgroup,
  },
];

export function update(): void {
  subgroup.list = [];

  const customThemes = CustomThemes.__nonReactive.getCustomThemes();
  for (const theme of customThemes) {
    subgroup.list.push({
      id: `setCustomThemeId${theme._id}`,
      display: theme.name.replace(/_/gi, " "),
      configValue: theme._id,
      hover: (): void => {
        ThemeController.preview("custom", theme.colors);
      },
      exec: (): void => {
        setConfig("customTheme", true);
        setConfig("customThemeColors", theme.colors);
      },
    });
  }
}

export default commands;
