import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";
import { useToast } from "../components/useToast";

function stageCopy(format) {
  if (format === "groups_playoffs") {
    return {
      stageName: "group stage",
      gapLabel: "Days between groups and playoffs",
      capLabel: "Group-stage games per day",
    };
  }

  if (format === "round_robin") {
    return {
      stageName: "regular season",
      gapLabel: "Days between regular season and playoffs",
      capLabel: "Regular-season games per day",
    };
  }

  return {
    stageName: "playoffs",
    gapLabel: "",
    capLabel: "",
  };
}

export default function TournamentCreate() {
  const nav = useNavigate();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    name: "",
    format: "round_robin",
    max_teams: 8,
    end_date: "",
    venues_count: 1,
    venue_names: "Main Court",
    time_slots: "12:00,14:00,16:00,18:00",
    playoff_round_gap_days: 1,
    groups_to_playoffs_gap_days: 1,
    group_games_per_day: 4,
  });
  const [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const stageDetails = useMemo(() => stageCopy(form.format), [form.format]);
  const usesStagePlanning = form.format !== "single_elimination";

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setFieldErrors({});
    const formData = new FormData(e.currentTarget);
    const liveForm = {
      ...form,
      name: String(formData.get("name") || form.name),
      format: String(formData.get("format") || form.format),
      max_teams: String(formData.get("max_teams") || form.max_teams),
      end_date: String(formData.get("end_date") || form.end_date),
      venues_count: String(formData.get("venues_count") || form.venues_count),
      venue_names: String(formData.get("venue_names") || form.venue_names),
      time_slots: String(formData.get("time_slots") || form.time_slots),
      playoff_round_gap_days: String(formData.get("playoff_round_gap_days") || form.playoff_round_gap_days),
      groups_to_playoffs_gap_days: String(formData.get("groups_to_playoffs_gap_days") || form.groups_to_playoffs_gap_days),
      group_games_per_day: String(formData.get("group_games_per_day") || form.group_games_per_day),
    };
    const liveUsesStagePlanning = liveForm.format !== "single_elimination";

    const nextErrors = {};
    if (!liveForm.name.trim()) nextErrors.name = "Tournament name is required.";
    if (!liveForm.end_date) nextErrors.end_date = "Please select the final day.";
    if (!liveForm.max_teams || Number(liveForm.max_teams) < 2) nextErrors.max_teams = "At least 2 teams are required.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: liveForm.name.trim(),
        format: liveForm.format,
        max_teams: Number(liveForm.max_teams),
        end_date: liveForm.end_date,
        venues_count: Math.max(1, Number(liveForm.venues_count) || 1),
        venue_names: String(liveForm.venue_names || "").split(",").map((name) => name.trim()).filter(Boolean),
        time_slots: String(liveForm.time_slots || "").split(",").map((slot) => slot.trim()).filter(Boolean),
        playoff_round_gap_days: Math.max(0, Number(liveForm.playoff_round_gap_days) || 0),
        groups_to_playoffs_gap_days: liveUsesStagePlanning ? Math.max(0, Number(liveForm.groups_to_playoffs_gap_days) || 0) : 0,
        group_games_per_day: liveUsesStagePlanning ? Math.max(1, Number(liveForm.group_games_per_day) || 1) : null,
      };

      const r = await tournamentsApi.create(payload);
      showToast("Tournament created.");
      nav(`/tournaments/${r.data.id}`);
    } catch (e2) {
      const message = e2?.response?.status === 401
        ? "Your session expired. Please login again as admin."
        : e2?.response?.data?.message || JSON.stringify(e2?.response?.data) || e2.message;
      setErr(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="panel page-hero">
        <p className="page-kicker">Admin Desk</p>
        <h1 className="page-title mt-3">Create Tournament</h1>
        <p className="page-copy mt-4">
          Set the final day first, then let the generator build the tournament backwards with fair rest gaps and playoff spacing.
        </p>
      </section>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <form onSubmit={submit} className="panel space-y-5 p-6" noValidate>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Tournament name</label>
          <input
            className="input"
            name="name"
            placeholder="Tournament name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {fieldErrors.name ? <div className="text-sm text-red-600">{fieldErrors.name}</div> : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Tournament format</label>
            <select
              className="input"
              name="format"
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
            >
              <option value="round_robin">round_robin</option>
              <option value="groups_playoffs">groups_playoffs</option>
              <option value="single_elimination">single_elimination</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Final day</label>
            <input
              className="input"
              type="date"
              name="end_date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
            {fieldErrors.end_date ? <div className="text-sm text-red-600">{fieldErrors.end_date}</div> : null}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Max teams</label>
            <input
              className="input"
              type="number"
              name="max_teams"
              min={2}
              max={512}
              placeholder="Max teams"
              value={form.max_teams}
              onChange={(e) => setForm({ ...form, max_teams: e.target.value })}
            />
            {fieldErrors.max_teams ? <div className="text-sm text-red-600">{fieldErrors.max_teams}</div> : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-900">Schedule generation rules</h2>
            <p className="text-sm text-slate-500">
              The scheduler builds backwards from the final day and spreads earlier matches out as evenly as possible.
            </p>
          </div>

          <div className={`grid grid-cols-1 gap-3 ${usesStagePlanning ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Days between playoff rounds</label>
              <input
                className="input"
                type="number"
                name="playoff_round_gap_days"
                min={0}
                max={30}
                value={form.playoff_round_gap_days}
                onChange={(e) => setForm({ ...form, playoff_round_gap_days: e.target.value })}
              />
            </div>
            {usesStagePlanning && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{stageDetails.gapLabel}</label>
                <input
                  className="input"
                  type="number"
                  name="groups_to_playoffs_gap_days"
                  min={0}
                  max={30}
                  value={form.groups_to_playoffs_gap_days}
                  onChange={(e) => setForm({ ...form, groups_to_playoffs_gap_days: e.target.value })}
                />
              </div>
            )}
            {usesStagePlanning && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{stageDetails.capLabel}</label>
                <input
                  className="input"
                  type="number"
                  name="group_games_per_day"
                  min={1}
                  max={100}
                  value={form.group_games_per_day}
                  onChange={(e) => setForm({ ...form, group_games_per_day: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Venue setup</label>
            <input
              className="input"
              type="number"
              name="venues_count"
              min={1}
              max={20}
              value={form.venues_count}
              onChange={(e) => setForm({ ...form, venues_count: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Court names</label>
            <input
              className="input"
              name="venue_names"
              placeholder="Main Court,Court 2,Court 3"
              value={form.venue_names}
              onChange={(e) => setForm({ ...form, venue_names: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Daily time slots</label>
          <input
            className="input"
            name="time_slots"
            placeholder="12:00,14:00,16:00,18:00"
            value={form.time_slots}
            onChange={(e) => setForm({ ...form, time_slots: e.target.value })}
          />
          <div className="text-xs text-slate-500">Separate slot start times with commas. Example: 12:00,14:00,16:00,18:00.</div>
        </div>

        {form.end_date && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Final day is set to <span className="font-semibold">{form.end_date}</span>. The opening day will be generated automatically based on the format, rest gaps, and daily match limits.
          </div>
        )}

        <button className="btn-primary" disabled={saving}>{saving ? "Saving..." : "Save tournament"}</button>
      </form>
    </div>
  );
}
