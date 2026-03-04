import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function isoWeekToMonday(weekValue) {
  const [yearPart, weekPart] = weekValue.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);

  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  const monday = new Date(simple);

  if (day <= 4) {
    monday.setUTCDate(simple.getUTCDate() - day + 1);
  } else {
    monday.setUTCDate(simple.getUTCDate() + 8 - day);
  }

  return monday;
}

function dateToIsoWeek(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";

  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  const week = String(weekNo).padStart(2, "0");
  return `${target.getUTCFullYear()}-W${week}`;
}

export default function TournamentCreate() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: "",
    format: "round_robin",
    max_teams: 8,
  });
  const [startWeek, setStartWeek] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("1");
  const [err, setErr] = useState("");

  const monday = startWeek ? isoWeekToMonday(startWeek) : null;
  const endSunday = monday ? new Date(monday) : null;
  const endWeekMonday = monday ? new Date(monday) : null;
  if (endSunday) {
    endSunday.setUTCDate(monday.getUTCDate() + Number(durationWeeks) * 7 - 1);
  }
  if (endWeekMonday) {
    endWeekMonday.setUTCDate(monday.getUTCDate() + (Number(durationWeeks) - 1) * 7);
  }
  const endWeek = endWeekMonday ? dateToIsoWeek(formatUtcDate(endWeekMonday)) : "";

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!startWeek) {
      setErr("Please select a start week.");
      return;
    }

    const calcMonday = isoWeekToMonday(startWeek);
    const calcEndSunday = new Date(calcMonday);
    calcEndSunday.setUTCDate(calcMonday.getUTCDate() + Number(durationWeeks) * 7 - 1);

    try {
      const payload = {
        ...form,
        max_teams: Number(form.max_teams),
        duration_weeks: Number(durationWeeks),
        start_date: formatUtcDate(calcMonday),
        end_date: formatUtcDate(calcEndSunday),
        registration_deadline: formatUtcDate(calcMonday),
      };

      const r = await tournamentsApi.create(payload);
      nav(`/tournaments/${r.data.id}`);
    } catch (e2) {
      if (e2?.response?.status === 401) {
        setErr("Your session expired. Please login again as admin.");
        return;
      }
      setErr(e2?.response?.data?.message || JSON.stringify(e2?.response?.data) || e2.message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Create tournament</h1>
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <form onSubmit={submit} className="panel space-y-4 p-5">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Tournament name</label>
          <input
            className="input"
            placeholder="Tournament name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Start week</label>
            <input
              className="input"
              type="week"
              value={startWeek}
              onChange={(e) => setStartWeek(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Duration</label>
            <select
              className="input"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(e.target.value)}
            >
              <option value="1">1 week</option>
              <option value="2">2 weeks</option>
              <option value="3">3 weeks</option>
              <option value="4">4 weeks</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">End week (auto)</label>
            <input className="input" type="week" value={endWeek} disabled />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Max teams</label>
            <input
              className="input"
              type="number"
              min={2}
              max={512}
              placeholder="Max teams"
              value={form.max_teams}
              onChange={(e) => setForm({ ...form, max_teams: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Venue setup</label>
            <input className="input" value="Single venue (fixed for now)" disabled />
          </div>
        </div>

        {monday && endSunday && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Week range: <span className="font-semibold">{startWeek}</span> to <span className="font-semibold">{endWeek}</span>. Date range: from <span className="font-semibold">{formatUtcDate(monday)}</span> to{" "}
            <span className="font-semibold">{formatUtcDate(endSunday)}</span>.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Tournament format</label>
            <select
              className="input"
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
            >
              <option value="round_robin">round_robin</option>
              <option value="single_elimination">single_elimination</option>
              <option value="groups_playoffs">groups_playoffs</option>
            </select>
          </div>
        </div>

        <button className="btn-primary">Save tournament</button>
      </form>
    </div>
  );
}
