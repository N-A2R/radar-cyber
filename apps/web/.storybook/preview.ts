import "../src/styles.css";
import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    backgrounds: {
      default: "Radar",
      values: [
        { name: "Radar", value: "#0c111b" },
        { name: "Light", value: "#ffffff" },
      ],
    },
    docs: { story: { inline: true } },
  },
};

export default preview;
