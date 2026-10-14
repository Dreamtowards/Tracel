import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Explorer } from "@tracel/timeline";
import { demoProvider } from "@tracel/timeline/mock";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><Explorer provider={demoProvider} homeHref="/" /></StrictMode>,
);
