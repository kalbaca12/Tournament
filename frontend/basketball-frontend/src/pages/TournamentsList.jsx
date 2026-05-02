import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";
import { useAuth } from "../auth/useAuth";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useToast } from "../components/useToast";

export default function TournamentsList() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    tournamentsApi
      .list()
      .then((res) => setItems(res.data))
      .catch((e) => {
        const message = e?.response?.data?.message || e.message || "Failed to load tournaments.";
        setErr(message);
        showToast(message, "error");
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => [
      item.name,
      item.format,
      item.status,
      item.start_date,
      item.end_date,
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

  const labelize = (value) => String(value || "").replaceAll("_", " ");

  return (
    <div className="page-stack">
      <section className="panel page-hero">
        <div className="section-heading">
          <div>
            <p className="section-heading__eyebrow">Match Desk</p>
            <h1 className="section-heading__title">Tournament Center</h1>
            <p className="section-heading__copy">
              Track formats, lock participants, launch schedules, and jump straight into brackets, standings, and simulation tools.
            </p>
          </div>

          <div className="page-actions">
            {isAdmin ? (
              <Link to="/tournaments/new" className="btn-primary">
                Create tournament
              </Link>
            ) : (
              <div className="status-pill">Admin access needed to create</div>
            )}
          </div>
        </div>

        <div className="page-metrics mt-6">
          <div className="hero-stat">
            <div className="hero-stat__label">Live Database</div>
            <div className="hero-stat__value">{loading ? "..." : items.length}</div>
            <div className="hero-stat__meta">Tournaments currently tracked in the system.</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__label">Control Access</div>
            <div className="hero-stat__value">{isAdmin ? "Admin" : "Viewer"}</div>
            <div className="hero-stat__meta">Your current tournament management permissions.</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__label">Focus</div>
            <div className="hero-stat__value">Schedules</div>
            <div className="hero-stat__meta">Open any event to manage teams, matches, and playoff projections.</div>
          </div>
        </div>
      </section>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="panel p-4">
        <input
          className="input w-full"
          placeholder="Search tournaments by name, format, status, or date..."
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
        />
      </div>

      <section className="list-grid">
        {loading ? (
          <Skeleton rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No tournaments yet"
            description={isAdmin ? "Create the first tournament to start registering teams." : "Ask an admin to create the first tournament."}
            action={isAdmin ? <Link to="/tournaments/new" className="btn-primary">Create tournament</Link> : null}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title="No matching tournaments"
            description="Try a different search term or clear the search field."
            action={<button type="button" onClick={() => setQuery("")} className="btn-secondary">Clear search</button>}
          />
        ) : (
          visibleItems.map((t) => (
            <article
              key={t.id}
              className={`panel list-card transition hover:-translate-y-0.5 hover:shadow-2xl ${
                t.status === "finished" ? "list-card--finished" : ""
              }`}
            >
              <div className="list-card__header">
                <div>
                  <h2 className="list-card__title">{t.name}</h2>
                  <p className="list-card__copy">
                    Runs from {t.start_date} to {t.end_date}.
                  </p>
                </div>

                <Link to={`/tournaments/${t.id}`} className={t.status === "finished" ? "btn-secondary tournament-card__action tournament-card__action--finished" : "btn-secondary tournament-card__action"}>
                  Open desk
                </Link>
              </div>

              <div className="list-card__meta">
                <span className="list-tag">{labelize(t.format)}</span>
                <span className={`list-tag tournament-status-tag tournament-status-tag--${t.status || "draft"}`}>
                  {t.status === "finished" ? "Finished tournament" : labelize(t.status)}
                </span>
                {t.max_teams ? <span className="list-tag">{t.max_teams} team cap</span> : null}
              </div>
            </article>
          ))
        )}
      </section>

      {!loading && filteredItems.length > pageSize && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm font-semibold text-slate-500">
            Page {currentPage} of {totalPages} · {filteredItems.length} tournaments
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
