import { describe, expect, it, vi, beforeEach } from "vitest";
import plugin, { __testing } from "./index.js";

const spawnSync = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawnSync,
}));

describe("rtk-rewrite plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testing.resetRtkCache();
  });

  it("rewrites exec and bash tool commands through rtk", async () => {
    spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === "rtk" && args[0] === "--version") {
        return { status: 0, error: undefined, stdout: "rtk 0.37.2\n" };
      }
      if (command === "rtk" && args[0] === "rewrite") {
        const input = args.slice(1).join(" ");
        return { status: 0, error: undefined, stdout: `rtk:${input.toUpperCase()}\n` };
      }
      return { status: 1, error: new Error("unexpected call"), stdout: "" };
    });

    const hooks: Record<string, Function> = {};
    const api = {
      pluginConfig: { enabled: true, verbose: true },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      on: vi.fn((hookName: string, handler: Function) => {
        hooks[hookName] = handler;
      }),
    };

    plugin.register(api as any);

    expect(api.on).toHaveBeenCalledWith("before_tool_call", expect.any(Function), {
      priority: 10,
    });

    const execResult = await hooks.before_tool_call?.({
      toolName: "exec",
      params: { command: "git status", workdir: "." },
    });
    expect(execResult).toEqual({
      params: { command: "rtk:GIT STATUS", workdir: "." },
    });

    const bashResult = await hooks.before_tool_call?.({
      toolName: "bash",
      params: { command: "pnpm test" },
    });
    expect(bashResult).toEqual({
      params: { command: "rtk:PNPM TEST" },
    });

    const otherResult = await hooks.before_tool_call?.({
      toolName: "read",
      params: { path: "README.md" },
    });
    expect(otherResult).toBeUndefined();
  });

  it("no-ops when rtk is missing", () => {
    spawnSync.mockReturnValueOnce({ status: 1, error: undefined, stdout: "" });

    const api = {
      pluginConfig: { enabled: true },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      on: vi.fn(),
    };

    plugin.register(api as any);

    expect(api.logger.warn).toHaveBeenCalledWith(
      "rtk-rewrite: rtk not found on PATH; leaving exec commands unchanged.",
    );
    expect(api.on).not.toHaveBeenCalled();
  });

  it("uses a bounded rewrite timeout", async () => {
    spawnSync.mockImplementation(
      (command: string, args: string[], options?: Record<string, unknown>) => {
        if (command === "rtk" && args[0] === "--version") {
          return { status: 0, error: undefined, stdout: "rtk 0.37.2\n" };
        }
        if (command === "rtk" && args[0] === "rewrite") {
          expect(options).toMatchObject({
            encoding: "utf8",
            maxBuffer: 1024 * 1024,
            timeout: 2_000,
          });
          return { status: 0, error: undefined, stdout: "rtk:pwd\n" };
        }
        return { status: 1, error: new Error("unexpected call"), stdout: "" };
      },
    );

    const hooks: Record<string, Function> = {};
    const api = {
      pluginConfig: { enabled: true },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      on: vi.fn((hookName: string, handler: Function) => {
        hooks[hookName] = handler;
      }),
    };

    plugin.register(api as any);

    await hooks.before_tool_call?.({
      toolName: "exec",
      params: { command: "pwd" },
    });
  });
});
