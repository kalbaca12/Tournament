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
    <div className="catalog-shell">
      <aside className="catalog-rail panel catalog-rail--teams">
        <p className="catalog-rail__eyebrow">Team list</p>
        <h1 className="catalog-rail__title">Teams</h1>
        <p className="catalog-rail__copy">Team cards, cities, and roster access.</p>

        <input
          className="input catalog-rail__search"
          placeholder="Search teams"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
        />

        <div className="catalog-rail__stats">
          <div><span>{loading ? "..." : items.length}</span><small>teams</small></div>
          <div><span>{myTeam ? "1" : "0"}</span><small>mine</small></div>
        </div>

        {isManager ? (
          myTeam ? (
            <Link to={`/teams/${myTeam.id}`} className="btn-secondary catalog-rail__action">My team</Link>
          ) : (
            <Link to="/teams/new" className="btn-primary catalog-rail__action">New team</Link>
          )
        ) : null}
      </aside>

      <main className="catalog-main">
        {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        <div className="catalog-main__bar">
          <span>{filteredItems.length} results</span>
          <span>{isManager ? "Manager access" : "View only"}</span>
        </div>

        <section className="team-tile-grid">
          {loading ? (
            <Skeleton rows={3} />
          ) : items.length === 0 && !err ? (
            <EmptyState
              title="No teams yet"
              description={isManager ? "Create a team and add players." : "Teams are created by logged-in managers."}
              action={isManager ? <Link to="/teams/new" className="btn-primary">New team</Link> : null}
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="No results found"
              description="Try changing the search text."
              action={<button type="button" onClick={() => setQuery("")} className="btn-secondary">Clear</button>}
            />
          ) : (
            visibleItems.map((team) => {
              const initials = String(team.name || "K")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase();

              return (
                <Link key={team.id} to={`/teams/${team.id}`} className="club-card">
                  {team.logo_url ? (
                    <div className="club-card__logo-wrap">
                      <img className="club-card__logo" src={team.logo_url} alt={`${team.name} logo`} />
                    </div>
                  ) : (
                    <div className="club-card__crest">{initials}</div>
                  )}
                  <div className="club-card__body">
                    <span className="club-card__id">Team #{team.id}</span>
                    <h2>{team.name}</h2>
                    <p>{team.city || "City not set"}</p>
                  </div>
                  <div className="club-card__footer">
                    <span>Roster</span>
                    <span>Open</span>
                  </div>
                </Link>
              );
            })
          )}
        </section>

        {!loading && filteredItems.length > pageSize && (
          <div className="panel catalog-pagination">
            <div className="text-sm font-semibold text-slate-500">
              Page {currentPage} of {totalPages} / {filteredItems.length} teams
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
      </main>
    </div>
  );
}
