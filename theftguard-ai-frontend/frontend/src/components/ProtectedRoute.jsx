/**
 * TheftGuard AI — Protected Route Guard
 *
 * Enforces session authentication for workspace routes under /app/*.
 * - Displays a loading state during initial session verification to prevent UI flash.
 * - Redirects unauthenticated visitors to /signin, recording the intended destination.
 * - Allows access if the user has an active authenticated session OR is in synthetic demo mode.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
import { Spinner } from './ui'

export default function ProtectedRoute() {
  const { isAuthenticated, isDemoMode, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist px-4">
        <div className="rounded border border-line bg-white p-6 shadow-xs text-center">
          <Spinner label="Verifying authentication..." />
        </div>
      </div>
    )
  }

  if (!isAuthenticated && !isDemoMode) {
    return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  }

  return <Outlet />
}
