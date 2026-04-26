import { spawnSync } from "node:child_process";
import { definePluginEntry, type OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

type RtkRewritePluginConfig = {
  enabled?: boolean;
  verbose?: boolean;
};

const SUPPORTED_TOOL_NAMES = new Set(["exec", "bash"]);
let rtkAvailable: boolean | undefined;

function isRtkAvailable(): boolean {
  if (rtkAvailable !== undefined) {
    return rtkAvailable;
  }
  const result = spawnSync("rtk", ["--version"], { encoding: "utf8", stdio: "ignore" });
  rtkAvailable = result.status === 0 && !result.error;
  return rtkAvailable;
}

function rewriteCommand(command: string): string | undefined {
  const result = spawnSync("rtk", ["rewrite", command], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    return undefined;
  }
  const rewritten = result.stdout?.trim();
  if (!rewritten || rewritten === command) {
    return undefined;
  }
  return rewritten;
}

const plugin = definePluginEntry({
  id: "rtk-rewrite",
  name: "RTK Rewrite",
  description: "Rewrites exec-style tool commands through RTK before the shell tool runs.",
  register(api: OpenClawPluginApi) {
    const config = (api.pluginConfig ?? {}) as RtkRewritePluginConfig;
    if (config.enabled === false) {
      return;
    }
    if (!isRtkAvailable()) {
      api.logger.warn("rtk-rewrite: rtk not found on PATH; leaving exec commands unchanged.");
      return;
    }
    api.on("before_tool_call", (event) => {
      if (!SUPPORTED_TOOL_NAMES.has(event.toolName)) {
        return;
      }
      const command = event.params.command;
      if (typeof command !== "string" || command.trim().length === 0) {
        return;
      }
      const rewritten = rewriteCommand(command);
      if (!rewritten) {
        return;
      }
      if (config.verbose) {
        api.logger.info(`rtk-rewrite: ${event.toolName} command rewritten`);
      }
      return {
        params: {
          ...event.params,
          command: rewritten,
        },
      };
    });
  },
});

export default plugin;

export const __testing = {
  resetRtkCache() {
    rtkAvailable = undefined;
  },
};
