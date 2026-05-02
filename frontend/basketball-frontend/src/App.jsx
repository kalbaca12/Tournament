import { Navigate, Route, Routes } from "react-router-dom";
import Nav from "./components/Nav";
import { useAuth } from "./auth/useAuth";
import TournamentsList from "./pages/TournamentsList";
import TournamentCreate from "./pages/TournamentCreate";
import TournamentView from "./pages/TournamentView";
import TeamsList from "./pages/TeamsList";
import TeamCreate from "./pages/TeamCreate";
import TeamView from "./pages/TeamView";
import MatchView from "./pages/MatchView";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import "./App.css";

function AccessDenied({ requiredRole }) {
  return (
    <div className="panel mx-auto max-w-2xl p-6">
      <p className="page-kicker">Restricted</p>
      <h1 className="page-title mt-2 text-2xl">Access denied</h1>
      <p className="page-copy mt-2">This action requires role: {requiredRole}.</p>
    </div>
  );
}

export default function App() {
  const { loading, isAdmin, isManager, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-shell__backdrop" />
        <div className="app-shell__grid" />
        <div className="app-loading">
          <div className="app-loading__label">Basketball Control Center</div>
          <div className="app-loading__text">Loading workspace...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-shell__backdrop" />
      <div className="app-shell__grid" />
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/tournaments"} />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />

          <Route path="/tournaments" element={<TournamentsList />} />
          <Route
            path="/tournaments/new"
            element={isAdmin ? <TournamentCreate /> : <AccessDenied requiredRole="admin" />}
          />
          <Route path="/tournaments/:id" element={<TournamentView />} />

          <Route path="/teams" element={<TeamsList />} />
          <Route
            path="/teams/new"
            element={isManager ? <TeamCreate /> : <AccessDenied requiredRole="manager" />}
          />
          <Route path="/teams/:id" element={<TeamView />} />
          <Route path="/matches/:id" element={<MatchView />} />
        </Routes>
      </main>
    </div>
  );
}



