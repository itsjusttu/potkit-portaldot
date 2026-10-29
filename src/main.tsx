import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { docRoute, isAppRoute, migrateHashRoute } from "./routes";
import "./theme-tokens.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/app-shell.css";
import "./styles/app-xero.css";
import "./styles/receivable-workspace.css";
import "./styles/receivable-trade-issue.css";
import "./styles/receivable-portfolio-verify.css";
import "./styles/usability-pass.css";
import "./styles/workspace-composition.css";
import "./styles/ledger.css";
import "./styles/night.css";
import "./styles/night-features.css";
import "./styles/night-dashboard.css";
import "./styles/night-nivo.css";
import "./styles/night-profile.css";
import "./styles/night-motion.css";
import "./styles/night-mobile.css";
import "./styles/night-ledger.css";
import "./styles/night-grid.css";
import "./styles/night-light.css";
import { Intro } from "./Intro";

migrateHashRoute();
const app = isAppRoute();
document.documentElement.dataset.route = app ? "app" : "landing";
// the app has an optional light theme, remembered per browser; dark stays the default and the landing ignores it
if (app) { try { if (localStorage.getItem("potkit-theme") === "light") document.documentElement.dataset.theme = "light"; } catch { /* storage blocked: stay dark */ } }

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
