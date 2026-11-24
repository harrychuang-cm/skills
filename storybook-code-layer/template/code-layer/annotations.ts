// Code Layer preview annotations: declares the global and boots the runtime.
// Named "annotations.ts" (not preview*) because files under .storybook/ whose
// name starts with "preview" invalidate the whole story index when they change.
import { bootRuntime, disposeRuntime } from "./runtime/index";

export const initialGlobals = { codeLayer: false };

bootRuntime();

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposeRuntime());
}
