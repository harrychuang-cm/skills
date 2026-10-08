// Code update notifications for the UI Flow: Vite's vite:afterUpdate while
// Storybook runs in dev mode, nothing in a static build. This is the only
// browser-side Prototype Inspector file that reads import.meta (preset.js runs
// in Node), so preview.js and flow-canvas.js stay loadable in the vm test
// harnesses (node loads this module natively, where import.meta.hot is
// undefined).
//
// Counting starts when the module loads, with the preview, so an update the
// document applies while the UI Flow is not mounted still counts.

let codeUpdateCount = 0;
const subscribers = new Set();
const hot = import.meta.hot;

if (hot) {
  hot.on("vite:afterUpdate", () => {
    codeUpdateCount += 1;
    subscribers.forEach((callback) => callback(codeUpdateCount));
  });
}

// Hot updates the Inspector's own document has applied since it loaded.
export function getCodeUpdateCount() {
  return codeUpdateCount;
}

// Calls callback, with the new count, after each hot update the document
// applies; returns the unsubscribe function.
export function subscribeToCodeUpdates(callback) {
  if (!hot) {
    return () => {};
  }

  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}
