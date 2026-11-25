import type { ReactNode } from "react";

import "./Title.css";

export type TitleProps = {
  text: string;
  /** An inner component hosted by the title, usually a Seal. */
  slot?: ReactNode;
  plate?: string;
};

export function Title({ text, slot, plate }: TitleProps) {
  return (
    <h2 className="fx-title" data-component="title">
      <span className="fx-title__text">
        {[...text].map((glyph, index) => (
          <span className="fx-title__glyph" key={index}>
            {glyph}
          </span>
        ))}
      </span>
      {slot ? <span className="fx-title__slot">{slot}</span> : null}
      {plate ? <span className="fx-title__plate">{plate}</span> : null}
    </h2>
  );
}
