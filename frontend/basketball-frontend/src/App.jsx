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

function AccessDenied({ requiredRole }) {
  return (
    <div className="panel mx-auto max-w-2xl p-5">
      <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
      <p className="mt-1 text-slate-600">This action requires role: {requiredRole}.</p>
    </div>
  );
}

export default function App() {
  const { loading, isAdmin, isManager } = useAuth();

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-slate-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen text-slate-900">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/tournaments" />} />
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

