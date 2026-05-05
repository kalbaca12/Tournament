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

const TIME_SLOT_COUNTS = [2, 4, 6, 8];
const GROUPS_PLAYOFFS_TEAM_COUNTS = [4, 8, 16];
const SINGLE_ELIMINATION_TEAM_COUNTS = [4, 8, 16, 32];
const RULE_LABEL_CLASS = "flex min-h-[2.75rem] items-end text-sm font-medium text-slate-700";
const DEFAULT_TIME_SLOTS = ["12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "09:00", "11:00"];

function normalizeTimeSlots(value) {
  const slots = Array.isArray(value) ? value : String(value || "").split(",");
  return slots.map((slot) => String(slot || "").trim()).filter(Boolean);
}

function resizeTimeSlots(slots, count) {
  const current = normalizeTimeSlots(slots);
  return Array.from({ length: count }, (_, index) => current[index] || DEFAULT_TIME_SLOTS[index] || "12:00");
}

function normalizeGroupPlayoffTeamCount(value) {
  const count = Number(value) || 8;
  return GROUPS_PLAYOFFS_TEAM_COUNTS.includes(count) ? count : 8;
}

function normalizeSingleEliminationTeamCount(value) {
  const count = Number(value) || 8;
  return SINGLE_ELIMINATION_TEAM_COUNTS.includes(count) ? count : 8;
}

export default function TournamentCreate() {
  const nav = useNavigate();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    name: "",
    banner_url: "",
    format: "round_robin",
    max_teams: 8,
    end_date: "",
    venue_name: "",
    time_slots: ["12:00", "14:00", "16:00", "18:00"],
    playoff_round_gap_days: 1,
    groups_to_playoffs_gap_days: 1,
    stage_day_gap_days: 0,
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
      banner_url: String(formData.get("banner_url") || form.banner_url),
      format: String(formData.get("format") || form.format),
      max_teams: String(formData.get("max_teams") || form.max_teams),
      end_date: String(formData.get("end_date") || form.end_date),
      venue_name: String(formData.get("venue_name") || form.venue_name),
      time_slots: form.time_slots,
      playoff_round_gap_days: String(formData.get("playoff_round_gap_days") || form.playoff_round_gap_days),
      groups_to_playoffs_gap_days: String(formData.get("groups_to_playoffs_gap_days") || form.groups_to_playoffs_gap_days),
      stage_day_gap_days: String(formData.get("stage_day_gap_days") || form.stage_day_gap_days),
      group_games_per_day: String(formData.get("group_games_per_day") || form.group_games_per_day),
    };
    const liveUsesStagePlanning = liveForm.format !== "single_elimination";

    const nextErrors = {};
    if (!liveForm.name.trim()) nextErrors.name = "Tournament name is required.";
    if (!liveForm.end_date) nextErrors.end_date = "Please select the final day.";
    if (!liveForm.max_teams || Number(liveForm.max_teams) < 2) nextErrors.max_teams = "At least 2 teams are required.";
    if (liveForm.format === "groups_playoffs" && !GROUPS_PLAYOFFS_TEAM_COUNTS.includes(Number(liveForm.max_teams))) {
      nextErrors.max_teams = "Groups + playoffs supports 4, 8, or 16 teams.";
    }
    if (liveForm.format === "single_elimination" && !SINGLE_ELIMINATION_TEAM_COUNTS.includes(Number(liveForm.max_teams))) {
      nextErrors.max_teams = "Single elimination supports 4, 8, 16, or 32 teams.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: liveForm.name.trim(),
        banner_url: liveForm.banner_url.trim() || null,
        format: liveForm.format,
        max_teams: Number(liveForm.max_teams),
        end_date: liveForm.end_date,
        venue_name: liveForm.venue_name.trim() || null,
        time_slots: resizeTimeSlots(liveForm.time_slots, Number(liveForm.group_games_per_day) || 4),
        playoff_round_gap_days: Math.max(0, Number(liveForm.playoff_round_gap_days) || 0),
        groups_to_playoffs_gap_days: liveUsesStagePlanning ? Math.max(0, Number(liveForm.groups_to_playoffs_gap_days) || 0) : 0,
        stage_day_gap_days: liveUsesStagePlanning ? Math.max(0, Number(liveForm.stage_day_gap_days) || 0) : 0,
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
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Banner URL</label>
          <input
            className="input"
            name="banner_url"
            placeholder="https://..."
            value={form.banner_url}
            onChange={(e) => setForm({ ...form, banner_url: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Tournament format</label>
            <select
              className="input"
              name="format"
              value={form.format}
              onChange={(e) => {
                const nextFormat = e.target.value;
                setForm({
                  ...form,
                  format: nextFormat,
                  max_teams: nextFormat === "groups_playoffs"
                    ? normalizeGroupPlayoffTeamCount(form.max_teams)
                    : nextFormat === "single_elimination"
                      ? normalizeSingleEliminationTeamCount(form.max_teams)
                      : form.max_teams,
                });
              }}
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
            {form.format === "groups_playoffs" || form.format === "single_elimination" ? (
              <div key={`${form.format}-max-teams`} className={`grid gap-2 ${form.format === "groups_playoffs" ? "grid-cols-3" : "grid-cols-4"}`}>
                <input
                  type="hidden"
                  name="max_teams"
                  value={form.format === "groups_playoffs"
                    ? normalizeGroupPlayoffTeamCount(form.max_teams)
                    : normalizeSingleEliminationTeamCount(form.max_teams)}
                />
                {(form.format === "groups_playoffs" ? GROUPS_PLAYOFFS_TEAM_COUNTS : SINGLE_ELIMINATION_TEAM_COUNTS).map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={Number(form.max_teams) === count ? "btn-primary" : "btn-secondary"}
                    onClick={() => setForm({ ...form, max_teams: count })}
                  >
                    {count}
                  </button>
                ))}
              </div>
            ) : (
              <input
                key="open-max-teams"
                className="input"
                type="number"
                name="max_teams"
                min={2}
                max={512}
                placeholder="Max teams"
                value={form.max_teams}
                onChange={(e) => setForm({ ...form, max_teams: e.target.value })}
              />
            )}
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

          <div className={`grid grid-cols-1 gap-3 ${usesStagePlanning ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
            <div className="space-y-1">
              <label className={RULE_LABEL_CLASS}>Days between playoff rounds</label>
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
                <label className={RULE_LABEL_CLASS}>{stageDetails.gapLabel}</label>
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
                <label className={RULE_LABEL_CLASS}>Days between {stageDetails.stageName} match days</label>
                <input
                  className="input"
                  type="number"
                  name="stage_day_gap_days"
                  min={0}
                  max={30}
                  value={form.stage_day_gap_days}
                  onChange={(e) => setForm({ ...form, stage_day_gap_days: e.target.value })}
                />
              </div>
            )}
            {usesStagePlanning && (
              <div className="space-y-1">
                <label className={RULE_LABEL_CLASS}>{stageDetails.capLabel}</label>
                <select
                  className="input"
                  name="group_games_per_day"
                  value={form.group_games_per_day}
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    setForm({
                      ...form,
                      group_games_per_day: count,
                      time_slots: resizeTimeSlots(form.time_slots, count),
                    });
                  }}
                >
                  {TIME_SLOT_COUNTS.map((count) => (
                    <option key={count} value={count}>{count} games per day</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Default venue</label>
          <input
            className="input"
            name="venue_name"
            placeholder="Main Arena"
            value={form.venue_name}
            onChange={(e) => setForm({ ...form, venue_name: e.target.value })}
          />
          <div className="text-xs text-slate-500">Generated matches use this venue unless a match-specific venue override is entered later.</div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Daily time slots</label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {resizeTimeSlots(form.time_slots, Number(form.group_games_per_day) || 4).map((slot, index) => (
              <input
                key={index}
                className="input"
                type="time"
                value={slot}
                onChange={(e) => {
                  const nextSlots = [...normalizeTimeSlots(form.time_slots)];
                  nextSlots[index] = e.target.value;
                  setForm({ ...form, time_slots: nextSlots });
                }}
              />
            ))}
          </div>
          <div className="text-xs text-slate-500">Set one start time for each match allowed on a generated match day.</div>
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
