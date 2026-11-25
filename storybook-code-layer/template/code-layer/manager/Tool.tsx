import React from "react";
import { PointerDefaultIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import { useGlobals } from "storybook/manager-api";

import { t } from "../shared/i18n";
import { suspendText } from "../shared/labels";
import { GLOBAL_KEY, TOOL_ID } from "../shared/protocol";
import { focusPreview, isManagerFramed } from "./channel";
import { FallbackInspector } from "./Inspector";
import { useLocale, useStore } from "./store";

/** The toolbar toggle. It only flips the global: the inspector floats on the canvas and Storybook's layout is left alone. */
export function Tool() {
  useLocale();
  const [globals, updateGlobals] = useGlobals();
  const status = useStore((s) => s.status);
  const framed = isManagerFramed();
  const on = globals[GLOBAL_KEY] === true;
  const effective = status?.effective;
  const suspended = on && effective?.state === "suspended";

  const title = framed
    ? t("tool.framed", { reason: t("suspend.manager-framed") })
    : !on
      ? t("tool.off")
      : suspended && effective?.state === "suspended"
        ? t("tool.suspended", { reason: suspendText(effective) })
        : t("tool.on");

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
    <>
      <FallbackInspector on={on} />
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
      data-code-layer-reason={suspended && effective?.state === "suspended" ? effective.reason : ""}
    >
      <PointerDefaultIcon />
      <span>Code Layer</span>
      </ToggleButton>
    </>
  );
}
