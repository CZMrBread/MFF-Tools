import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { isPageId } from "./shared/pages";
import "./styles/global.css";

// Každá stránka (/, /kalkulačka/, /specializace/) má vlastní vstupní HTML v app/,
// které přes data-page říká, který nástroj se má vykreslit.
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Chybí element #root");

const page = rootElement.dataset.page;

createRoot(rootElement).render(
  <StrictMode>
    <App page={isPageId(page) ? page : "guide"} />
  </StrictMode>,
);
