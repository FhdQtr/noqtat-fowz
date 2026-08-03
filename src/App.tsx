import { Routes, Route, Navigate } from "react-router";
import Home from "./pages/Home";
import HostSetup from "./pages/HostSetup";
import HostRoom from "./pages/HostRoom";
import TvScreen from "./pages/TvScreen";
import Play from "./pages/Play";
import Challenge from "./pages/Challenge";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/host" element={<HostSetup />} />
      <Route path="/host/:code" element={<HostRoom />} />
      <Route path="/tv/:code" element={<TvScreen />} />
      <Route path="/play/:teamCode" element={<Play />} />
      <Route path="/challenge" element={<Challenge />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
