import React from "react";

import { ROWS } from "../shared/properties";
import { SUSPEND_TEXT } from "../shared/protocol";
import { buildReference } from "../shared/reference";
import { isManagerFramed } from "./channel";
import { ChangesList } from "./components/ChangesList";
import { PropertyRow } from "./components/PropertyRow";
import { useStore } from "./store";
import { Banner, Body, HeaderBox, Message, Meta, SectionTitle, SmallButton, Title, Wrap } from "./styles";

const SECTIONS = ["填色", "外觀", "文字", "間距與尺寸"] as const;

export type ApplyControls = { enabled: boolean; hint: string; onApply: () => void; applying: boolean; report: React.ReactNode };

export function Panel({ apply }: { apply: ApplyControls }) {
  const status = useStore((s) => s.status);
  const trace = useStore((s) => s.selection);
  const index = useStore((s) => s.index);
  const indexError = useStore((s) => s.indexError);
  const [copied, setCopied] = React.useState(false);
  const effective = status?.effective;
  const active = effective?.state === "active";
  const readOnly = Boolean(status?.serverReadOnly);

  let content: React.ReactNode;
  if (isManagerFramed()) content = <Message>{SUSPEND_TEXT["manager-framed"]}</Message>;
  else if (!effective || effective.state === "off") {
    content = <Message>打開工具列的「Code Layer」開關，再點選畫面上的元件，就能在這裡看到它的樣式並換成其他 token。</Message>;
  } else if (effective.state === "suspended") content = <Message>{SUSPEND_TEXT[effective.reason]}</Message>;
  else if (!index) content = <Message>{indexError ? `讀不到 Code Layer 索引：${indexError}` : "載入索引中…"}</Message>;
  else if (!trace) content = <Message>點選畫面上的元件。按 Esc 可取消選取。</Message>;
  else {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(buildReference(trace));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        setCopied(false);
      }
    };
    content = (
      <>
        <HeaderBox>
          <Title>
            <span data-code-layer-title>{trace.label}</span>
            <SmallButton type="button" onClick={copy} title="複製物件參照，貼給 AI 就知道你指的是哪個元件">
              {copied ? "已複製" : "複製參照"}
            </SmallButton>
          </Title>
          <Meta>
            {trace.componentId ?? "（非元件）"}
            {trace.variant ? ` · variant ${trace.variant}` : ""} · {trace.size.width} × {trace.size.height}
          </Meta>
          <Meta>路徑：{trace.pathText}</Meta>
        </HeaderBox>
        {readOnly ? <Banner>Code Layer 伺服器處於唯讀模式，只能檢視。</Banner> : null}
        {SECTIONS.map((section) => {
          const rows = ROWS.filter((r) => r.section === section)
            .map((def) => trace.rows.find((r) => r.id === def.id))
            .filter((r): r is NonNullable<typeof r> => Boolean(r));
          if (rows.length === 0) return null;
          return (
            <div key={section}>
              <SectionTitle>{section}</SectionTitle>
              {rows.map((row) => (
                <PropertyRow key={row.id} trace={trace} row={row} index={index} editable={active && !readOnly} />
              ))}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <Wrap data-code-layer-panel onKeyDown={(event) => event.stopPropagation()}>
      <Body>{content}</Body>
      <ChangesList prefix={index?.tokens.prefix ?? "md"} applyEnabled={apply.enabled && active && !readOnly} applyHint={apply.hint} onApply={apply.onApply} applying={apply.applying}>
        {apply.report}
      </ChangesList>
    </Wrap>
  );
}
