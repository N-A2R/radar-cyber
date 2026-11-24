import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-gothic/fonts.css";
import "@astryxdesign/theme-gothic/theme.css";
import "../src/styles.css";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import type { Preview } from "@storybook/react";

const preview: Preview = {
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
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
