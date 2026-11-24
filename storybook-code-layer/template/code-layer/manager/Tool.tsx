import React, { useEffect, useRef } from "react";
import { PointerDefaultIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import { useGlobals, useStorybookApi, useStorybookState } from "storybook/manager-api";

import { GLOBAL_KEY, SUSPEND_TEXT, TOOL_ID } from "../shared/protocol";
import { focusPreview, isManagerFramed } from "./channel";
import { dock, undock, type LayoutApi } from "./layout";
import { useStore } from "./store";

export function Tool() {
  const [globals, updateGlobals] = useGlobals();
  const api = useStorybookApi();
  const state = useStorybookState();
  const status = useStore((s) => s.status);
  const framed = isManagerFramed();
  const on = globals[GLOBAL_KEY] === true;
  const effective = status?.effective;
  const suspended = on && effective?.state === "suspended";
  const position = (state.layout?.panelPosition ?? "bottom") as "bottom" | "right";
  const positionRef = useRef(position);
  positionRef.current = position;

  // Dock to the right while on; put the user's layout back when turned off.
  useEffect(() => {
    if (framed) return;
    const layoutApi = api as unknown as LayoutApi;
    if (on) void dock(layoutApi, positionRef.current, state.viewMode);
    else void undock(layoutApi, positionRef.current);
  }, [on, state.viewMode === "story"]);

  const title = framed
    ? `Code Layer：已停用。${SUSPEND_TEXT["manager-framed"]}`
    : !on
      ? "Code Layer：關閉（點擊開啟選取模式）"
      : suspended && effective?.state === "suspended"
        ? `Code Layer：暫停。${SUSPEND_TEXT[effective.reason]}`
        : "Code Layer：開啟（點擊關閉）";

  const toggle = () => {
    if (framed) return;
    if (on) {
      updateGlobals({ [GLOBAL_KEY]: false });
      return;
    }
    const next: Record<string, unknown> = { [GLOBAL_KEY]: true };
    if ("figmaExport" in globals) next.figmaExport = "off";
    if ("prototypeMode" in globals) next.prototypeMode = "story";
    updateGlobals(next);
    window.setTimeout(focusPreview, 0);
  };

  return (
    <ToggleButton
      key={TOOL_ID}
      ariaLabel={title}
      title={title}
      tooltip={title}
      pressed={on}
      padding="small"
      variant="ghost"
      disabled={framed}
      onClick={toggle}
      style={suspended ? { color: "#C2410C" } : undefined}
      data-code-layer-tool={on ? (suspended ? "suspended" : "on") : "off"}
    >
      <PointerDefaultIcon />
      <span>Code Layer</span>
    </ToggleButton>
  );
}
