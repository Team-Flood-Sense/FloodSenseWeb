import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Circle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ALL_RESIDENTS, countAppDevices, getGatewayStatus, sendBlast, summarizeResult, type BlastResult } from '@/lib/alerts';
import { useEscape } from '@/app/hooks/useEscape';
import { useSensors } from '@/app/hooks/useSensors';

const EVACUATION_MESSAGE =
  'CRITICAL ALERT: Manual evacuation alarm triggered by FloodSense Command Center. Evacuate to the nearest evacuation center immediately.';

export function QuickActionsPanel() {
  const { role } = useAuth();
  const { sensors, loading: sensorsLoading } = useSensors();
  const onlineSensors = sensors.filter((s) => s.status !== 'offline').length;
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [result, setResult] = useState<BlastResult | null>(null);
  const [gateway, setGateway] = useState<{ sms: boolean | null; email: boolean | null }>({ sms: null, email: null });
  const [devices, setDevices] = useState<number | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(successTimer.current), []);

  // Are the SMS and email gateways set up? (only staff can send, so only they check)
  useEffect(() => {
    if (role === 'admin' || role === 'operator') {
      getGatewayStatus().then(setGateway);
      countAppDevices().then(setDevices);
    }
  }, [role]);

  const summary = result ? summarizeResult(result) : null;

  const closeConfirm = useCallback(() => {
    setShowConfirmModal(false);
    setTriggerError('');
  }, []);
  useEscape(showConfirmModal, closeConfirm);

  // Saves the alarm as a CRITICAL blast and sends it by SMS and email to every active, verified resident.
  async function handleConfirm() {
    setTriggering(true);
    setTriggerError('');
    try {
      const outcome = await sendBlast({
        message: EVACUATION_MESSAGE,
        level: 'CRITICAL',
        location: ALL_RESIDENTS,
        sms: true,
        email: true,
        app: true,
        subject: '[FloodSense] CRITICAL: Evacuation alarm',
      });
      setResult(outcome);
      setShowConfirmModal(false);
      setShowSuccessModal(true);
      // Leave problems on screen longer so they are not missed
      successTimer.current = setTimeout(() => setShowSuccessModal(false), summarizeResult(outcome).tone === 'success' ? 6000 : 20000);
    } catch (err) {
      setTriggerError((err as Error).message);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative bg-surface/80 p-6"
        style={{
          borderRadius: '28px',
          boxShadow: '0 8px 32px rgba(var(--shadow-rgb), 0.08)',
          border: '1px solid rgba(var(--surface-rgb), 0.6)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-surface/40 to-transparent pointer-events-none" style={{ borderRadius: '28px' }} />

        <div className="relative z-10">
          <h3 className="text-ink text-lg mb-4" style={{ fontWeight: 700 }}>
            Quick Actions
          </h3>

          {/* ✅ Only Admin and Operator can see this */}
          {(role === 'admin' || role === 'operator') && (
            <>
              {/* Primary Action Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowConfirmModal(true)}
                className="w-full mb-4 p-6 rounded-3xl relative overflow-hidden group"
                style={{
                  background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 50%, #FF6B35 100%)',
                  backgroundSize: '200% 100%',
                  boxShadow: '0 10px 30px rgba(255, 107, 53, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                {/* Animated gradient overlay */}
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%)',
                  }}
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                />
                <div className="relative flex items-center justify-center gap-3">
                  <div className="p-2 rounded-full bg-white/20">
                    <AlertTriangle className="text-white" size={24} strokeWidth={2.5} />
                  </div>
                  <span className="text-white text-lg" style={{ fontWeight: 700 }}>
                    Trigger Manual Evacuation Alarm
                  </span>
                </div>
              </motion.button>

              {/* This action will */}
              <div className="mb-6 p-4 rounded-2xl bg-ink/5 border border-ink/10">
                <p className="text-ink text-sm mb-2" style={{ fontWeight: 600 }}>
                  This action will:
                </p>
                <ul className="space-y-1.5">
                  {[
                    'Send a CRITICAL evacuation alert by SMS and email to all active, verified residents, plus an app notification',
                    'Record the alert in the Alert Logs',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-ink/70 text-sm">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-ink/40 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* ✅ Viewer sees this instead */}
          {role === 'viewer' && (
            <div className="mb-6 p-4 rounded-2xl bg-ink/5 border border-ink/10 text-center">
              <p className="text-ink/60 text-sm">
                You don't have permission to trigger alarms.
              </p>
            </div>
          )}

          {/* System Alerts — visible to everyone */}
          <h3 className="text-ink text-lg mb-3" style={{ fontWeight: 700 }}>
            System Alerts
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <Circle
                  className={
                    sensorsLoading
                      ? 'text-gray-400 fill-gray-400'
                      : onlineSensors > 0
                        ? 'text-green-500 fill-green-500'
                        : sensors.length > 0
                          ? 'text-red-500 fill-red-500'
                          : 'text-gray-400 fill-gray-400'
                  }
                  size={12}
                />
                <span className="text-ink text-sm" style={{ fontWeight: 600 }}>
                  {sensorsLoading
                    ? 'Sensor feed: checking...'
                    : sensors.length === 0
                      ? 'Sensor feed: not connected'
                      : `Sensor feed: ${onlineSensors} of ${sensors.length} online`}
                </span>
              </div>
              <p className="text-ink/50 text-xs ml-5">
                {sensors.length === 0 && !sensorsLoading
                  ? 'Live sensor status will appear here'
                  : onlineSensors === 0 && !sensorsLoading
                    ? 'No sensor has reported in the last 2 minutes'
                    : 'Sensors are reporting live'}
              </p>
            </div>
            {(['sms', 'email'] as const).map((ch) => {
              const state = gateway[ch];
              const name = ch === 'sms' ? 'SMS gateway' : 'Email service';
              return (
                <div key={ch}>
                  <div className="flex items-center gap-2">
                    <Circle
                      className={state ? 'text-green-500 fill-green-500' : state === false ? 'text-[#FFB84D] fill-[#FFB84D]' : 'text-gray-400 fill-gray-400'}
                      size={12}
                    />
                    <span className="text-ink text-sm" style={{ fontWeight: 600 }}>
                      {state ? `${name}: ready` : state === false ? `${name}: not set up` : `${name}: checking...`}
                    </span>
                  </div>
                  <p className="text-ink/50 text-xs ml-5">
                    {state === false
                      ? `${ch === 'sms' ? 'SMS' : 'Emails'} are saved as Pending until ${ch === 'sms' ? 'the Semaphore key' : 'Gmail or Brevo'} is set up`
                      : `${ch === 'sms' ? 'SMS' : 'Emails'} are sent through ${ch === 'sms' ? 'Semaphore' : 'the configured email provider'}`}
                  </p>
                </div>
              );
            })}
            {(role === 'admin' || role === 'operator') && (
              <div>
                <div className="flex items-center gap-2">
                  <Circle
                    className={devices ? 'text-green-500 fill-green-500' : devices === 0 ? 'text-[#FFB84D] fill-[#FFB84D]' : 'text-gray-400 fill-gray-400'}
                    size={12}
                  />
                  <span className="text-ink text-sm" style={{ fontWeight: 600 }}>
                    {devices === null ? 'Mobile app: checking...' : `Mobile app: ${devices} phone${devices === 1 ? '' : 's'} registered`}
                  </span>
                </div>
                <p className="text-ink/50 text-xs ml-5">
                  {devices === 0 ? 'No phones have enabled notifications yet' : 'App notifications go to every registered phone'}
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ===================== CONFIRMATION MODAL ===================== */}
      <AnimatePresence>
        {showConfirmModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeConfirm}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(var(--ink-rgb), 0.5)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="w-full max-w-sm p-8 relative"
                style={{
                  background: 'rgba(var(--surface-rgb), 0.95)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.2)',
                  border: '1px solid rgba(255, 107, 53, 0.3)',
                  pointerEvents: 'all',
                }}
              >
                {/* Close button */}
                <motion.button
                  aria-label="Close"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={closeConfirm}
                  className="absolute top-4 right-4 p-2 rounded-xl"
                  style={{ background: 'rgba(var(--ink-rgb), 0.05)' }}
                >
                  <X className="text-ink/60" size={18} />
                </motion.button>

                {/* Warning Icon */}
                <div className="flex justify-center mb-4">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="p-4 rounded-2xl"
                    style={{ background: 'rgba(255, 107, 53, 0.1)' }}
                  >
                    <AlertTriangle className="text-[#FF6B35]" size={36} strokeWidth={2} />
                  </motion.div>
                </div>

                {/* Text */}
                <h3 className="text-ink text-xl text-center mb-2" style={{ fontWeight: 700 }}>
                  Confirm Evacuation Alarm
                </h3>
                <p className="text-ink/60 text-sm text-center mb-4">
                  This immediately sends a CRITICAL evacuation alert by SMS and email to every active, verified resident, pushes it to the mobile app, and records it in the Alert Logs.
                </p>

                {/* Warning note */}
                <div
                  className="p-3 rounded-xl mb-6 text-center"
                  style={{ background: 'rgba(255, 107, 53, 0.08)', border: '1px solid rgba(255, 107, 53, 0.2)' }}
                >
                  <p className="text-[#FF6B35] text-xs" style={{ fontWeight: 600 }}>
                    ⚠️ This action cannot be undone. Proceed only in a real emergency.
                  </p>
                </div>

                {triggerError && (
                  <p className="text-center mb-4" style={{ color: '#ef4444', fontSize: '13px', fontWeight: 500 }}>⚠ {triggerError}</p>
                )}

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeConfirm}
                    className="flex-1 py-3 rounded-2xl text-sm transition-all"
                    style={{
                      background: 'rgba(var(--ink-rgb), 0.05)',
                      color: 'rgb(var(--ink-rgb))',
                      fontWeight: 600,
                      border: '1px solid rgba(var(--ink-rgb), 0.1)',
                    }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirm}
                    disabled={triggering}
                    className="flex-1 py-3 rounded-2xl text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70"
                    style={{
                      background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
                      boxShadow: '0 8px 24px rgba(255, 107, 53, 0.4)',
                      fontWeight: 600,
                    }}
                  >
                    <AlertTriangle size={16} strokeWidth={2.5} />
                    {triggering ? 'Recording...' : 'Confirm Alarm'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===================== SUCCESS MODAL ===================== */}
      <AnimatePresence>
        {showSuccessModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSuccessModal(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(var(--ink-rgb), 0.5)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="w-full max-w-sm p-8 relative text-center"
                style={{
                  background: 'rgba(var(--surface-rgb), 0.95)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.2)',
                  border: '1px solid rgba(46, 196, 182, 0.3)',
                  pointerEvents: 'all',
                }}
              >
                {/* Success Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className="flex justify-center mb-4"
                >
                  <div
                    className="p-4 rounded-2xl"
                    style={{ background: summary?.tone === 'success' ? 'rgba(46, 196, 182, 0.1)' : summary?.tone === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(255, 184, 77, 0.14)' }}
                  >
                    {summary?.tone === 'success'
                      ? <Circle className="text-[#2EC4B6] fill-[#2EC4B6]" size={36} />
                      : <AlertTriangle className={summary?.tone === 'error' ? 'text-[#DC2626]' : 'text-[#FFB84D]'} size={36} />}
                  </div>
                </motion.div>

                <h3 className="text-ink text-xl mb-2" style={{ fontWeight: 700 }}>
                  {summary?.tone === 'success' ? 'Alarm Sent' : summary?.tone === 'error' ? 'Alarm Failed' : 'Alarm Needs Attention'}
                </h3>
                <p className="text-ink/60 text-sm mb-2">
                  {summary?.text}
                </p>
                <button
                  type="button"
                  onClick={() => setShowSuccessModal(false)}
                  className="mt-3 px-5 py-2 rounded-xl text-sm text-ink"
                  style={{ background: 'rgba(var(--ink-rgb), 0.06)', border: '1px solid rgba(var(--ink-rgb), 0.12)', fontWeight: 600 }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}