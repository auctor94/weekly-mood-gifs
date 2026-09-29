import { Navigate, Route, Routes } from "react-router-dom";
import HostPage from "./pages/HostPage.jsx";
import JoinPage from "./pages/JoinPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<JoinPage />} />
      <Route path="/j/:code" element={<JoinPage />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
