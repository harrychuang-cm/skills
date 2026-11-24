// The panel plus its Apply controls and the verification report.
import React from "react";

import { applyDrafts } from "./apply";
import { VerifyReport } from "./components/VerifyReport";
import { Panel } from "./Panel";
import { useStore } from "./store";

export function PanelHost() {
  const session = useStore((s) => s.session);
  const phase = useStore((s) => s.applyState.phase);
  const prefix = useStore((s) => s.index?.tokens.prefix ?? "md");
  const writable = Boolean(session?.capabilities.write) && !session?.readOnly;
  const applying = phase === "arming" || phase === "writing" || phase === "verifying" || phase === "undoing";
  return (
    <Panel
      apply={{
        enabled: writable,
        hint: writable ? "把變更寫入原始碼並驗證" : "Code Layer 伺服器目前不能寫入（唯讀模式）",
        onApply: () => void applyDrafts(),
        applying,
        report: <VerifyReport prefix={prefix} />,
      }}
    />
  );
}
