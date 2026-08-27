import { createBrowserRouter } from 'react-router';
import { Root } from './Root';
import { Dashboard } from './pages/Dashboard';
import { SensorStatus } from './pages/SensorStatus';
import { UserManagement } from './pages/UserManagement';
import { SMSBlastLogs } from './pages/SMSBlastLogs';
import { SignIn } from './pages/SignIn';
import { ForgotPassword } from './pages/ForgotPassword';
import { ChangePassword } from './pages/ChangePassword';
import { Unauthorized } from './pages/Unauthorized';
import { TwoFactorAuth } from './pages/TwoFactorAuth'; 
import { ProtectedRoute } from './components/ProtectedRoute';

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

  // Protected routes
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
        element: (
          <ProtectedRoute allowedRoles={['admin', 'operator', 'viewer']}>
            <Dashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: 'sensors',
        element: (
          <ProtectedRoute allowedRoles={['admin', 'operator', 'viewer']}>
            <SensorStatus />
          </ProtectedRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <UserManagement />
          </ProtectedRoute>
        ),
      },
      {
        path: 'sms-logs',
        element: (
          <ProtectedRoute allowedRoles={['admin', 'operator']}>
            <SMSBlastLogs />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);