import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingState } from '@/components/ui/Feedback';

/**
 * Route guards.
 *
 * These hide pages a member cannot use, but they are a convenience only. Every
 * protected operation is enforced again on the server, which never trusts the
 * client for identity or role.
 */

export function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label="Checking your session" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

export function RequireStaff() {
  const { isStaff, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label="Checking permissions" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isStaff) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}

export function RequireAdmin() {
  const { isAdmin, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label="Checking permissions" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}

/** Sends already-signed-in members away from the auth pages. */
export function RedirectIfAuthenticated() {
  const { isAuthenticated, loading, completion } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label="Checking your session" />
      </div>
    );
  }

  if (isAuthenticated) {
    // Members who have not finished onboarding are sent back to it.
    if (completion && completion.percent < 100) return <Navigate to="/onboarding" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
