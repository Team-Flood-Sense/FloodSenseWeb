import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/context/AuthContext';

interface Props {
  children: React.ReactNode;
  allowedRoles?: ("admin" | "operator" | "viewer")[];
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  // Still checking auth state
  if (loading) return null;

  // Not logged in → redirect to signin
  if (!user) return <Navigate to="/signin" replace />;

  // Check if they passed the 2FA screen
  const is2faVerified = sessionStorage.getItem('2fa_verified') === 'true';

  // If they are logged in but haven't verified 2FA, force them back to the 2FA page
  if (!is2faVerified) {
    return <Navigate to="/2fa" replace />;
  }

  // Role not allowed → redirect to unauthorized
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}