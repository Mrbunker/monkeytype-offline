import { Plugin } from "vite";

const virtualModuleId = "virtual:env-config";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

export function envConfig(options: {
  isDevelopment: boolean;
  clientVersion: string;
  env: Record<string, string>;
}): Plugin {
  return {
    name: "virtual-env-config",
    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : undefined;
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return;
      return `export const envConfig = ${JSON.stringify({
        isDevelopment: options.isDevelopment,
        clientVersion: options.clientVersion,
      })};`;
    },
  };
}
