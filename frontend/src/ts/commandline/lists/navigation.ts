import { navigate } from "../../controllers/route-controller";
import { toggleFullscreen } from "../../utils/misc";
import { Command } from "../types";

const commands: Command[] = [
  {
    id: "viewTypingPage",
    display: "View Typing Page",
    alias: "navigate go to start begin type test",
    icon: "fa-keyboard",
    exec: () => {
      void navigate("/");
    },
  },
  {
    id: "viewAccount",
    display: "View Local History",
    alias: "navigate go to stats results",
    icon: "fa-chart-line",
    exec: () => {
      void navigate("/account");
    },
  },
  {
    id: "viewSettings",
    display: "View Settings Page",
    alias: "navigate go to",
    icon: "fa-cog",
    exec: () => {
      void navigate("/settings");
    },
  },
  {
    id: "viewAbout",
    display: "About This Offline Fork",
    alias: "navigate go to",
    icon: "fa-info",
    exec: () => {
      void navigate("/about");
    },
  },
  {
    id: "toggleFullscreen",
    display: "Toggle Fullscreen",
    icon: "fa-expand",
    exec: () => {
      toggleFullscreen();
    },
  },
];
export default commands;
