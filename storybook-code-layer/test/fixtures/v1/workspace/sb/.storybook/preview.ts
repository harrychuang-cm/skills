import type { Preview } from "@storybook/react-vite";

import "../tokens/tokens.css";
import "../src/styles/chrome.css";

const preview: Preview = {
  parameters: { layout: "centered" },
};

export default preview;
