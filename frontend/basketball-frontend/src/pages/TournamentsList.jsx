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
  const activeCount = items.filter((item) => item.status !== "finished" && item.status !== "cancelled").length;
  const finishedCount = items.filter((item) => item.status === "finished").length;

  return (
    <div className="catalog-shell">
      <aside className="catalog-rail panel">
        <p className="catalog-rail__eyebrow">Registry</p>
        <h1 className="catalog-rail__title">Tournaments</h1>
        <p className="catalog-rail__copy">Search, statuses, and quick access to tournament management.</p>

        <input
          className="input catalog-rail__search"
          placeholder="Search tournaments"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
        />

        <div className="catalog-rail__stats">
          <div><span>{loading ? "..." : items.length}</span><small>total</small></div>
          <div><span>{loading ? "..." : activeCount}</span><small>active</small></div>
          <div><span>{loading ? "..." : finishedCount}</span><small>finished</small></div>
        </div>

        {isAdmin ? (
          <Link to="/tournaments/new" className="btn-primary catalog-rail__action">
            New tournament
          </Link>
        ) : null}
      </aside>

      <main className="catalog-main">
        {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        <div className="catalog-main__bar">
          <span>{filteredItems.length} results</span>
          <span>{isAdmin ? "Admin mode" : "View mode"}</span>
        </div>

        <section className="catalog-grid">
          {loading ? (
            <Skeleton rows={3} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No tournaments yet"
              description={isAdmin ? "Create the first tournament and add teams." : "Tournaments are created by an administrator."}
              action={isAdmin ? <Link to="/tournaments/new" className="btn-primary">New tournament</Link> : null}
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="No results found"
              description="Try changing the search text."
              action={<button type="button" onClick={() => setQuery("")} className="btn-secondary">Clear</button>}
            />
          ) : (
            visibleItems.map((t) => {
              const startDate = t.start_date ? new Date(t.start_date) : null;
              const endDate = t.end_date ? new Date(t.end_date) : null;
              const startDay = startDate && !Number.isNaN(startDate.getTime())
                ? String(startDate.getDate()).padStart(2, "0")
                : "--";
              const endDay = endDate && !Number.isNaN(endDate.getTime())
                ? String(endDate.getDate()).padStart(2, "0")
                : "--";
              const startMonth = startDate && !Number.isNaN(startDate.getTime())
                ? startDate.toLocaleString("en-US", { month: "short" }).toUpperCase()
                : "TBD";
              const endMonth = endDate && !Number.isNaN(endDate.getTime())
                ? endDate.toLocaleString("en-US", { month: "short" }).toUpperCase()
                : "TBD";

              return (
                <Link
                  key={t.id}
                  to={`/tournaments/${t.id}`}
                  className={`event-ticket ${t.banner_url ? "event-ticket--with-banner" : ""} ${t.status === "finished" ? "event-ticket--finished" : ""}`}
                  style={t.banner_url ? { "--ticket-banner-url": `url("${t.banner_url}")` } : undefined}
                >
                  <div className="event-ticket__date event-ticket__date--period">
                    <span>{startMonth}</span>
                    <strong>{startDay}</strong>
                    <em>to</em>
                    <strong>{endDay}</strong>
                    <span>{endMonth}</span>
                  </div>

                  <div className="event-ticket__body">
                    <div className="event-ticket__league">{labelize(t.format)}</div>
                    <h2>{t.name}</h2>
                    <div className="event-ticket__meta">
                      <span>{t.start_date || "not set"}</span>
                      <span>{t.end_date || "not set"}</span>
                      <span>{t.max_teams ? `${t.max_teams} teams` : "no limit"}</span>
                    </div>
                  </div>

                  <div className="event-ticket__side">
                    <span className={`list-tag tournament-status-tag tournament-status-tag--${t.status || "draft"}`}>
                      {labelize(t.status)}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </section>

        {!loading && filteredItems.length > pageSize && (
          <div className="panel catalog-pagination">
            <div className="text-sm font-semibold text-slate-500">
              Page {currentPage} of {totalPages} / {filteredItems.length} tournaments
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
