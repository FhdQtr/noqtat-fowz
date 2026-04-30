import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import ArenaCreate from "./ArenaCreate.jsx";
import ArenaPlayer from "./ArenaPlayer.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/arena/create" element={<ArenaCreate />} />
        <Route path="/arena/join" element={<ArenaPlayer />} />
        <Route path="/arena/join/:code" element={<ArenaPlayer />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
