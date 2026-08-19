import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router";
import SoundToggle from "./components/SoundToggle";

const Home = lazy(() => import("./pages/Home"));
const HostSetup = lazy(() => import("./pages/HostSetup"));
const HostRoom = lazy(() => import("./pages/HostRoom"));
const TvScreen = lazy(() => import("./pages/TvScreen"));
const Play = lazy(() => import("./pages/Play"));
const ActView = lazy(() => import("./pages/ActView"));
const Challenge = lazy(() => import("./pages/Challenge"));
const Admin = lazy(() => import("./pages/admin/Admin"));

export default function App() {
  const { pathname } = useLocation();
  const route = pathname === "/"
    ? "home"
    : pathname.startsWith("/host/")
      ? "host-room"
      : pathname === "/host"
        ? "host-setup"
        : pathname.startsWith("/play/")
          ? "player"
          : pathname.startsWith("/tv/")
            ? "audience"
            : pathname.startsWith("/act/")
              ? "acting"
              : pathname === "/challenge"
                ? "challenge"
                : pathname === "/admin"
                  ? "admin"
                  : "unknown";

  return (
    <div className="midan-app" data-route={route}>
      <SoundToggle />
      <Suspense fallback={<div className="midan-loading"><div className="brand-loader" aria-label="جاري فتح الميدان" /></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host" element={<HostSetup />} />
          <Route path="/host/:code" element={<HostRoom />} />
          <Route path="/tv/:code" element={<TvScreen />} />
          <Route path="/play/:teamCode" element={<Play />} />
          <Route path="/act/:code" element={<ActView />} />
          <Route path="/challenge" element={<Challenge />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
