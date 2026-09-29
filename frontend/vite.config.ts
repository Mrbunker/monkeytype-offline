import { defineConfig } from "vite";
import path from "node:path";
import { execFileSync } from "node:child_process";
import injectHTML from "vite-plugin-html-inject";
import autoprefixer from "autoprefixer";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import { Fonts } from "./src/ts/constants/fonts";
import { fontawesomeSubset } from "./vite-plugins/fontawesome-subset";
import { fontPreview } from "./vite-plugins/font-preview";
import { envConfig } from "./vite-plugins/env-config";
import { languageHashes } from "./vite-plugins/language-hashes";
import { minifyJson } from "./vite-plugins/minify-json";
import { oxlintChecker } from "./vite-plugins/oxlint-checker";
import { injectPreload } from "./vite-plugins/inject-preload";

export default defineConfig(({ mode }) => {
  const isDevelopment = mode !== "production";
  let revision = "source";
  try {
    revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    /* source archive */
  }
  const fonts = Object.entries(Fonts)
    .filter(([, font]) => font.systemFont !== true)
    .map(
      ([name, font]) =>
        `"${name.replaceAll("_", " ")}": ("src": "${font.fileName}", "weight": ${font.weight ?? 400}),`,
    )
    .join("\n");
  return {
    base: process.env["BASE_PATH"] ?? "/",
    root: "src",
    publicDir: "../static",
    clearScreen: false,
    plugins: [
      envConfig({
        isDevelopment,
        clientVersion: `offline-${revision}`,
        env: {},
      }),
      languageHashes({ skip: isDevelopment }),
      injectHTML(),
      tailwindcss(),
      solidPlugin(),
      ...(isDevelopment
        ? [
            oxlintChecker({
              debounceDelay: 125,
              typeAware: true,
              overlay: true,
            }),
          ]
        : [
            fontPreview(),
            fontawesomeSubset(),
            ViteMinifyPlugin(),
            injectPreload(),
            minifyJson(),
          ]),
    ],
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      assetsInlineLimit: 0,
      rolldownOptions: {
        input: {
          monkeytype: path.resolve(import.meta.dirname, "src/index.html"),
        },
      },
    },
    css: {
      postcss: { plugins: [autoprefixer()] },
      preprocessorOptions: {
        scss: {
          additionalData(source: string, filename: string): string {
            if (!isDevelopment && !filename.endsWith("index.scss")) {
              return source;
            }
            const developmentFonts = isDevelopment
              ? '$fontAwesomeOverride:"@fortawesome/fontawesome-free/webfonts"; $previewFontsPath:"webfonts";'
              : "";
            return `${developmentFonts}\n$fonts: (${fonts});\n${source}`;
          },
        },
      },
    },
    server: { host: "127.0.0.1", port: 3000, open: false },
    preview: { host: "127.0.0.1", port: 3000 },
    optimizeDeps: { exclude: ["@fortawesome/fontawesome-free"] },
  };
});
