import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";
import { useAuth } from "../auth/useAuth";
import { useToast } from "./useToast";

const linkClass = ({ isActive }) =>
  ["app-nav__link", isActive ? "is-active" : ""].join(" ");

export default function Nav() {
  const nav = useNavigate();
  const { user, isAuthenticated, isAdmin, isManager, logout } = useAuth();
  const { showToast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const menuRef = useRef(null);

  useEffect(() => {
    const closeMenu = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, []);

  useEffect(() => {
    const loadNotifications = async () => {
      if (!isAuthenticated || (!isAdmin && !isManager)) {
        setNotificationCount(0);
        return;
      }

      try {
        const tournamentsRes = await tournamentsApi.list();
        const tournaments = (tournamentsRes.data || []).slice(0, 8);
        const results = await Promise.allSettled(
          tournaments.map((tournament) => (
            isAdmin
              ? tournamentsApi.participationRequests(tournament.id)
              : tournamentsApi.myParticipationRequests(tournament.id)
          )),
        );
        const count = results.reduce((total, result) => {
          if (result.status !== "fulfilled") return total;
          return total + (result.value.data || []).filter((request) => request.status === "pending").length;
        }, 0);
        setNotificationCount(count);
      } catch {
        setNotificationCount(0);
      }
    };

    loadNotifications();
  }, [isAdmin, isAuthenticated, isManager]);

  const onLogout = async () => {
    await logout();
    showToast("Signed out.");
    setIsMenuOpen(false);
    nav("/tournaments");
  };

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-brand">
          <div className="app-brand__mark">
            <span>BB</span>
          </div>
          <div className="app-brand__copy">
            <div className="app-brand__title">Basketball System</div>
            <div className="app-brand__subtitle">Tournament Management Desk</div>
          </div>
        </div>

        <nav className="app-nav">
          {isAuthenticated && (
            <NavLink to="/dashboard" className={linkClass}>
              Dashboard
            </NavLink>
          )}
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
            <div ref={menuRef} className="profile-menu">
              <button type="button" className="profile-menu__trigger" onClick={() => setIsMenuOpen((current) => !current)}>
                <span className="profile-menu__avatar">{(user?.name || user?.role || "U").slice(0, 1).toUpperCase()}</span>
                <span className="profile-menu__copy">
                  <span className="profile-menu__name">{user?.name || user?.role}</span>
                  <span className="profile-menu__role">{user?.role}</span>
                </span>
                {notificationCount > 0 ? <span className="profile-menu__badge-dot">{notificationCount}</span> : null}
              </button>
              {isMenuOpen && (
                <div className="profile-menu__panel">
                  <div className="profile-menu__email">{user?.email}</div>
                  <div className="profile-menu__badge">{notificationCount > 0 ? `${notificationCount} pending request${notificationCount === 1 ? "" : "s"}` : user?.role}</div>
                  <NavLink to="/dashboard" className="profile-menu__item" onClick={() => setIsMenuOpen(false)}>
                    Dashboard
                  </NavLink>
                  <button type="button" onClick={onLogout} className="profile-menu__item profile-menu__item--danger">
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
