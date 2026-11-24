// Startup self-test: if PostCSS offsets or the byte proof behave unexpectedly
// in this environment, the whole tool stays read-only.
import { patchFile } from "./patcher.mjs";

export function patcherSelfTest(postcss) {
  try {
    const text = "/* ō — */\n.a {\r\n  b:  var( /*c*/ --x )  ;\n  --d: var(--x);\n}\n";
    const bytes = Buffer.from(`﻿${text}`, "utf8");
    const source = { bytes, text, hasBom: true };
    const root = postcss.parse(text);
    const decls = [];
    root.walkDecls((decl) => decls.push(decl));
    const result = patchFile(postcss, source, root, [
      { decl: decls[0], refIndex: 0, fromName: "--x", toName: "--yy", opId: "self-1" },
      { decl: decls[1], refIndex: 0, fromName: "--x", toName: "--zz", opId: "self-2" },
    ]);
    const expected = Buffer.from("﻿/* ō — */\n.a {\r\n  b:  var( /*c*/ --yy )  ;\n  --d: var(--zz);\n}\n", "utf8");
    return result.newBytes.equals(expected) ? { ok: true } : { ok: false, message: "patcher produced unexpected bytes" };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}
