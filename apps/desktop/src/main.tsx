import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { TooltipProvider } from "./components/ui/InfoTip";

createRoot(document.getElementById("root")!).render(
  <StrictMode><TooltipProvider delayDuration={250}><App /></TooltipProvider></StrictMode>,
);
