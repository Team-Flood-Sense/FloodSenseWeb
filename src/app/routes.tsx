import { createBrowserRouter, Navigate } from 'react-router';
import { Root } from './Root';
import { SignIn } from './pages/SignIn';
import { ForgotPassword } from './pages/ForgotPassword';
import { ChangePassword } from './pages/ChangePassword';
import { Unauthorized } from './pages/Unauthorized';
import { TwoFactorAuth } from './pages/TwoFactorAuth';
import { SetupAdmin } from './pages/SetupAdmin';
import { ProtectedRoute } from './components/ProtectedRoute';
import { loadDashboard, loadSensorStatus, loadAnalytics, loadUserManagement, loadSMSBlastLogs, loadResidents } from './pages/loaders';

export const router = createBrowserRouter([
  // Public & Auth routes
  {
    path: '/signin',
    Component: SignIn,
  },
  {
    path: '/2fa',
    Component: TwoFactorAuth,
  },
  {
    path: '/setup',
    Component: SetupAdmin,
  },
  {
    path: '/forgot-password',
    Component: ForgotPassword,
  },
  {
    path: '/change-password',
    Component: ChangePassword,
  },
  {
    path: '/unauthorized',
    Component: Unauthorized,
  },

  // Protected routes (pages are code-split and loaded on demand)
  {
    path: '/',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'operator', 'viewer']}>
        <Root />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        lazy: loadDashboard,
      },
      {
        path: 'sensors',
        lazy: loadSensorStatus,
      },
      {
        path: 'analytics',
        lazy: loadAnalytics,
      },
      {
        element: <ProtectedRoute allowedRoles={['admin']} />,
        children: [
          {
            path: 'users',
            lazy: loadUserManagement,
          },
        ],
      },
      {
        element: <ProtectedRoute allowedRoles={['admin', 'operator']} />,
        children: [
          {
            path: 'sms-logs',
            lazy: loadSMSBlastLogs,
          },
          {
            path: 'residents',
            lazy: loadResidents,
          },
        ],
      },
    ],
  },

  // Unknown URLs
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
