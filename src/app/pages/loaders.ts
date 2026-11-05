// Lazy page loaders, shared by the router and the idle-time preloader so that
// switching tabs doesn't wait on a network request for the page's code.
export const loadDashboard = () => import('./Dashboard').then((m) => ({ Component: m.Dashboard }));
export const loadSensorStatus = () => import('./SensorStatus').then((m) => ({ Component: m.SensorStatus }));
export const loadAnalytics = () => import('./Analytics').then((m) => ({ Component: m.Analytics }));
export const loadUserManagement = () => import('./UserManagement').then((m) => ({ Component: m.UserManagement }));
export const loadResidents = () => import('./Residents').then((m) => ({ Component: m.Residents }));
export const loadSMSBlastLogs = () => import('./SMSBlastLogs').then((m) => ({ Component: m.SMSBlastLogs }));

/** Fetches every page's code in the background once the app is idle. */
export function preloadPages() {
  const run = () => {
    loadDashboard();
    loadSensorStatus();
    loadAnalytics();
    loadUserManagement();
    loadSMSBlastLogs();
    loadResidents();
  };
  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(run);
  } else {
    setTimeout(run, 500);
  }
}
