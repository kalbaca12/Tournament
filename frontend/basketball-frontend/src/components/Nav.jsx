import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

const linkClass = ({ isActive }) =>
  [
    "rounded-lg px-3 py-2 text-sm font-medium transition",
    isActive ? "bg-slate-900 !text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");

export default function Nav() {
  const nav = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const onLogout = async () => {
    await logout();
    nav("/tournaments");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-xs font-bold text-white">
            BB
          </div>
          <div>
            <div className="font-semibold leading-tight">Basketball System</div>
            <div className="text-xs text-slate-500">Tournament management</div>
          </div>
        </div>

        <nav className="flex items-center gap-2">
          <NavLink to="/tournaments" className={linkClass}>
            Tournaments
          </NavLink>
          <NavLink to="/teams" className={linkClass}>
            Teams
          </NavLink>
          {!isAuthenticated ? (
            <NavLink to="/login" className="btn-primary">
              Login
            </NavLink>
          ) : (
            <>
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
                {user?.role}
              </span>
              <button onClick={onLogout} className="btn-secondary">
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

