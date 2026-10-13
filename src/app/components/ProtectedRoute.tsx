import { Navigate, Outlet } from 'react-router';
import { useAuth, type Role } from '@/context/AuthContext';

interface Props {
  children?: React.ReactNode;
  allowedRoles?: Role[];
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, role, aal, loading } = useAuth();

  // Still checking auth state
  if (loading) return null;

  // Not logged in → redirect to signin
  if (!user) return <Navigate to="/signin" replace />;

  // Logged in but the 2FA challenge hasn't been completed for this session
  if (aal !== 'aal2') return <Navigate to="/2fa" replace />;

  // No profile/role, or role not allowed → redirect to unauthorized
  if (!role || (allowedRoles && !allowedRoles.includes(role))) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
