import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { teamsApi } from "../api/teams";
import { tournamentsApi } from "../api/tournaments";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useToast } from "../components/useToast";

function statusClass(status) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function ManagerProfile() {
  const { showToast } = useToast();
  const [team, setTeam] = useState(null);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ name: "", city: "", logo_url: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr("");
      try {
        const [teamRes, requestsRes] = await Promise.all([
          teamsApi.mine().catch(() => ({ data: null })),
          tournamentsApi.myAllParticipationRequests().catch(() => ({ data: [] })),
        ]);
        setTeam(teamRes.data || null);
        setRequests(requestsRes.data || []);
        setForm({
          name: teamRes.data?.name || "",
          city: teamRes.data?.city || "",
          logo_url: teamRes.data?.logo_url || "",
        });
      } catch (error) {
        setErr(error?.response?.data?.message || error.message || "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const saveTeam = async () => {
    if (!team) return;
    setSaving(true);
    setErr("");
    try {
      const res = await teamsApi.update(team.id, {
        name: form.name,
        city: form.city,
        logo_url: form.logo_url.trim() || null,
      });
      setTeam(res.data);
      showToast("Team profile saved.");
    } catch (error) {
      const message = error?.response?.data?.message || JSON.stringify(error?.response?.data) || error.message;
      setErr(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton rows={4} />;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="panel page-hero">
        <p className="page-kicker">Manager Profile</p>
        <h1 className="page-title mt-3">My Team</h1>
        <p className="page-copy mt-4">Manage your club identity and track tournament participation requests.</p>
      </section>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      {!team ? (
        <EmptyState
          title="No team yet"
          description="Create your team before requesting tournament participation."
          action={<Link to="/teams/new" className="btn-primary">Create team</Link>}
        />
      ) : (
        <section className="panel space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Team profile</h2>
              <p className="text-sm text-slate-500">Team ID: {team.id}</p>
            </div>
            <Link to={`/teams/${team.id}`} className="btn-secondary">Open full roster</Link>
          </div>

          {form.logo_url ? (
            <img className="team-detail-logo" src={form.logo_url} alt={`${form.name || "Team"} logo`} />
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <input className="input" placeholder="Team name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <input className="input" placeholder="City" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            <input className="input" placeholder="Logo URL" value={form.logo_url} onChange={(event) => setForm({ ...form, logo_url: event.target.value })} />
          </div>

          <button type="button" onClick={saveTeam} disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save team"}
          </button>
        </section>
      )}

      <section className="panel space-y-4 p-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Participation requests</h2>
          <p className="text-sm text-slate-500">Click a request to open its tournament.</p>
        </div>

        {requests.length === 0 ? (
          <EmptyState title="No requests yet" description="Tournament participation requests will appear here." />
        ) : (
          <div className="grid gap-2">
            {requests.map((request) => (
              <Link key={request.id} to={`/tournaments/${request.tournament_id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-sky-300 hover:bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{request.tournament?.name || `Tournament #${request.tournament_id}`}</div>
                    <div className="text-sm text-slate-500">{request.team?.name || "Your team"}</div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase ${statusClass(request.status)}`}>
                    {request.status}
                  </span>
                </div>
                {request.note ? <div className="mt-2 text-sm text-slate-600">Note: {request.note}</div> : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
