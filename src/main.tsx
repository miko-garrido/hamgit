import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applySystemTheme } from "./hooks/useSystemTheme";
import "./styles.css";

applySystemTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
