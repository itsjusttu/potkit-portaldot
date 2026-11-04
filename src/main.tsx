import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { docRoute, isAppRoute, migrateHashRoute } from "./routes";
import { privyOn } from "./lib/privyBus";
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
import "./styles/night-app.css";
import "./styles/night-light.css";
import "./styles/brand.css";
import "./styles/clean.css";

migrateHashRoute();
const app = isAppRoute();
document.documentElement.dataset.route = app ? "app" : "landing";
// the app is light by default; dark is an optional switch remembered per browser, and the landing ignores it
if (app) { try { if (localStorage.getItem("potkit-theme") !== "dark") document.documentElement.dataset.theme = "light"; } catch { document.documentElement.dataset.theme = "light"; } }

// each route is its own chunk: the landing never downloads viem, the app never downloads lenis/landing code
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));
// Privy (connect only) is its own chunk and is loaded only when VITE_PRIVY_APP_ID is set
const PrivyRoot = lazy(() => import("./lib/privy").then((m) => ({ default: m.PrivyRoot })));
const Docs = lazy(() => import("./docs/Docs").then((m) => ({ default: m.Docs })));
const doc = app ? null : docRoute();
const Help = lazy(() => import("./Help").then((m) => ({ default: m.Help })));
const Landing = lazy(() => import("./Landing").then((m) => ({ default: m.Landing })));
// The animated intro (src/Intro.tsx) is no longer mounted: its dark globe and fake progress bar do not belong to the calm light look.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {app ? <Suspense fallback={<div className="route-loading" aria-busy="true" />}>{privyOn() ? <PrivyRoot><App /></PrivyRoot> : <App />}</Suspense>
      : <Suspense fallback={<div className="route-loading" aria-busy="true" />}>{doc === "/help" ? <Help /> : doc ? <Docs path={doc} /> : <Landing />}</Suspense>}
  </StrictMode>,
);
