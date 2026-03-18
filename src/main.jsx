import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.background = "#0d0d0f";
document.body.style.overflowX = "hidden";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
