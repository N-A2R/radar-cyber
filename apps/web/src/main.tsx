import "./maplibre-worker";
import { createRoot } from "react-dom/client";
import { ConfigProvider, theme as antdTheme } from "antd";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <ConfigProvider
    theme={{
      algorithm: antdTheme.darkAlgorithm,
      token: {
        colorBgBase: "#060a0c",
        colorPrimary: "#3ddbd9",
        borderRadius: 6,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      },
    }}
  >
    <App />
  </ConfigProvider>,
);