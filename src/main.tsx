import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { docRoute, isAppRoute, migrateHashRoute } from "./routes";
import "./theme-tokens.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/app-shell.css";
import "./styles/app-xero.css";
import { Intro } from "./Intro";

migrateHashRoute();
const app = isAppRoute();
document.documentElement.dataset.route = app ? "app" : "landing";

// each route is its own chunk: the landing never downloads viem, the app never downloads lenis/landing code
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));
const Docs = lazy(() => import("./docs/Docs").then((m) => ({ default: m.Docs })));
const doc = app ? null : docRoute();
const Landing = lazy(() => import("./Landing").then((m) => ({ default: m.Landing })));
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {app ? <><Intro /><Suspense fallback={<div className="route-loading" aria-busy="true" />}><App /></Suspense></>
      : <Suspense fallback={<div className="route-loading" aria-busy="true" />}>{doc ? <Docs path={doc} /> : <Landing />}</Suspense>}
  </StrictMode>,
);
