import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { teamsApi } from "../api/teams";
import { useAuth } from "../auth/useAuth";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useToast } from "../components/useToast";

export default function TeamsList() {
  const { isManager } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const listRes = await teamsApi.list();
        setItems(listRes.data);
      } catch (e) {
        const message = e?.response?.data?.message || e.message || "Failed to load teams.";
        setErr(message);
        showToast(message, "error");
      }

      if (isManager) {
        try {
          const myRes = await teamsApi.mine();
          setMyTeam(myRes.data || null);
        } catch {
          setMyTeam(null);
        }
      }
      setLoading(false);
    };

    load();
  }, [isManager, showToast]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((team) => [
      team.name,
      team.city,
      team.id,
    ].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [items, query]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const updateQuery = (value) => {
    setQuery(value);
    setPage(1);
  };

  return (
    <div className="page-stack">
      <section className="panel page-hero">
        <div className="section-heading">
          <div>
            <p className="section-heading__eyebrow">Club Hub</p>
            <h1 className="section-heading__title">Teams Directory</h1>
            <p className="section-heading__copy">
              Browse every registered roster, jump into team pages, and keep manager-owned clubs updated for tournament registration.
            </p>
          </div>

          <div className="page-actions">
            {isManager ? (
              myTeam ? (
                <Link to={`/teams/${myTeam.id}`} className="btn-secondary">Edit my team</Link>
              ) : (
                <Link to="/teams/new" className="btn-primary">Create team</Link>
              )
            ) : (
              <div className="status-pill">Manager access needed to edit</div>
            )}
          </div>
        </div>

        <div className="page-metrics mt-6">
          <div className="hero-stat">
            <div className="hero-stat__label">Registered Teams</div>
            <div className="hero-stat__value">{loading ? "..." : items.length}</div>
            <div className="hero-stat__meta">All clubs visible across the platform.</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__label">Your Status</div>
            <div className="hero-stat__value">{isManager ? "Manager" : "Viewer"}</div>
            <div className="hero-stat__meta">Create and maintain a roster when you have manager access.</div>
          </div>
        </div>
      </section>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="panel p-4">
        <input
          className="input w-full"
          placeholder="Search teams by name, city, or ID..."
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
        />
      </div>

      <section className="list-grid">
        {loading ? (
          <Skeleton rows={3} />
        ) : items.length === 0 && !err ? (
          <EmptyState
            title="No teams available yet"
            description={isManager ? "Create your team and start adding players." : "Managers can create teams after signing in."}
            action={isManager ? <Link to="/teams/new" className="btn-primary">Create team</Link> : null}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title="No matching teams"
            description="Try a different search term or clear the search field."
            action={<button type="button" onClick={() => setQuery("")} className="btn-secondary">Clear search</button>}
          />
        ) : (
          visibleItems.map((team) => (
            <Link key={team.id} to={`/teams/${team.id}`} className="panel list-card transition hover:-translate-y-0.5 hover:shadow-2xl">
              <div className="list-card__header">
                <div>
                  <h2 className="list-card__title">{team.name}</h2>
                  <p className="list-card__copy">{team.city || "City not set yet."}</p>
                </div>
                <span className="list-tag">Team #{team.id}</span>
              </div>
            </Link>
          ))
        )}
      </section>

      {!loading && filteredItems.length > pageSize && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm font-semibold text-slate-500">
            Page {currentPage} of {totalPages} · {filteredItems.length} teams
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              Previous
            </button>
            <button type="button" className="btn-secondary" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
