import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { matchesApi } from "../api/matches";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useToast } from "../components/useToast";

function dateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const directDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directDate) return directDate[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return localDateKey(date);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value) {
  if (!value) return "Time not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function teamName(match, side) {
  const relation = side === "home" ? "homeTeam" : "awayTeam";
  const snake = side === "home" ? "home_team" : "away_team";
  const id = side === "home" ? match.home_team_id : match.away_team_id;
  return match?.[relation]?.name || match?.[snake]?.name || (id ? `Team ${id}` : "TBD");
}

function monthDays(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const leading = (first.getDay() + 6) % 7;
  const days = [];

  for (let i = 0; i < leading; i++) {
    days.push(null);
  }

  for (let day = 1; day <= last.getDate(); day++) {
    days.push(new Date(year, month, day));
  }

  return days;
}

export default function MatchesList() {
  const { showToast } = useToast();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  useEffect(() => {
    matchesApi
      .list()
      .then((res) => {
        const loaded = res.data || [];
        setMatches(loaded);
        const today = localDateKey(new Date());
        setSelectedDate(today);
        setCalendarMonth(new Date(`${today}T12:00:00`));
      })
      .catch((e) => showToast(e?.response?.data?.message || e.message || "Failed to load matches.", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const matchDays = useMemo(() => {
    const days = new Map();
    for (const match of matches) {
      const key = dateKey(match.scheduled_at);
      if (!key) continue;
      days.set(key, (days.get(key) || 0) + 1);
    }
    return days;
  }, [matches]);

  const visibleMatches = useMemo(
    () => matches.filter((match) => dateKey(match.scheduled_at) === selectedDate),
    [matches, selectedDate],
  );

  const groupedMatches = useMemo(() => {
    const groups = new Map();
    for (const match of visibleMatches) {
      const id = match.tournament_id || "unknown";
      if (!groups.has(id)) {
        groups.set(id, {
          id,
          name: match.tournament?.name || `Tournament #${match.tournament_id}`,
          matches: [],
        });
      }
      groups.get(id).matches.push(match);
    }
    return Array.from(groups.values());
  }, [visibleMatches]);

  const days = monthDays(calendarMonth);
  const monthLabel = calendarMonth.toLocaleString("en-US", { month: "long", year: "numeric" });

  const changeMonth = (offset) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <div className="matches-shell">
      <aside className="match-calendar panel">
        <div className="match-calendar__head">
          <button type="button" className="btn-secondary" onClick={() => changeMonth(-1)}>Prev</button>
          <h1>{monthLabel}</h1>
          <button type="button" className="btn-secondary" onClick={() => changeMonth(1)}>Next</button>
        </div>

        <div className="match-calendar__weekdays">
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
        </div>

        <div className="match-calendar__grid">
          {days.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} className="match-calendar__day is-empty" />;
            const key = localDateKey(day);
            const count = matchDays.get(key) || 0;
            return (
              <button
                key={key}
                type="button"
                className={`match-calendar__day ${count ? "has-matches" : ""} ${selectedDate === key ? "is-selected" : ""}`}
                onClick={() => setSelectedDate(key)}
              >
                <span>{day.getDate()}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="matches-main">
        <div className="catalog-main__bar">
          <span>{selectedDate}</span>
          <span>{visibleMatches.length} matches</span>
        </div>

        <section className="match-ticket-list">
          {loading ? (
            <Skeleton rows={3} />
          ) : visibleMatches.length === 0 ? (
            <EmptyState title="No matches on this day" description="Highlighted calendar days have at least one match." />
          ) : (
            groupedMatches.map((group) => (
              <section key={group.id} className="match-group">
                <div className="match-group__head">
                  <div>
                    <span>Tournament</span>
                    <h2>{group.name}</h2>
                  </div>
                  {group.id !== "unknown" ? <Link to={`/tournaments/${group.id}`} className="btn-secondary">Open tournament</Link> : null}
                </div>

                {group.matches.map((match) => {
                  const scheduled = match.scheduled_at ? new Date(match.scheduled_at) : null;
                  const month = scheduled && !Number.isNaN(scheduled.getTime())
                    ? scheduled.toLocaleString("en-US", { month: "short" }).toUpperCase()
                    : "TBD";
                  const day = scheduled && !Number.isNaN(scheduled.getTime())
                    ? String(scheduled.getDate()).padStart(2, "0")
                    : "--";

                  return (
                    <article key={match.id} className="match-ticket">
                      <div className="event-ticket__date">
                        <span>{month}</span>
                        <strong>{day}</strong>
                      </div>
                      <div className="match-ticket__body">
                        <span>{formatTime(match.scheduled_at)} / {match.stage || "stage not set"}</span>
                        <h2>{teamName(match, "home")} <b>vs</b> {teamName(match, "away")}</h2>
                        <p>Round {match.round_number || "-"} / {match.status}</p>
                      </div>
                      <div className="match-ticket__score">
                        {match.home_score !== null && match.away_score !== null ? (
                          <strong>{match.home_score}:{match.away_score}</strong>
                        ) : (
                          <strong>-:-</strong>
                        )}
                        <span>{match.status}</span>
                        <Link to={`/matches/${match.id}`} className="btn-secondary">Open</Link>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
