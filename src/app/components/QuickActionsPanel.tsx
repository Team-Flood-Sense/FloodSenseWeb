import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Circle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ALL_RESIDENTS, getGatewayConfigured, sendBlast, type BlastOutcome } from '@/lib/sms';
import { useEscape } from '@/app/hooks/useEscape';

const EVACUATION_MESSAGE =
  'CRITICAL ALERT: Manual evacuation alarm triggered by FloodSense Command Center. Evacuate to the nearest evacuation center immediately.';

export function QuickActionsPanel() {
  const { role } = useAuth();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [outcome, setOutcome] = useState<BlastOutcome | null>(null);
  const [gateway, setGateway] = useState<boolean | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(successTimer.current), []);

  // Is the SMS gateway set up? (only staff can send, so only they check)
  useEffect(() => {
    if (role === 'admin' || role === 'operator') getGatewayConfigured().then(setGateway);
  }, [role]);

  const closeConfirm = useCallback(() => {
    setShowConfirmModal(false);
    setTriggerError('');
  }, []);
  useEscape(showConfirmModal, closeConfirm);

  // Saves the alarm as a CRITICAL SMS blast and sends it to every active, verified resident.
  async function handleConfirm() {
    setTriggering(true);
    setTriggerError('');
    try {
      const result = await sendBlast({ message: EVACUATION_MESSAGE, level: 'CRITICAL', location: ALL_RESIDENTS });
      setOutcome(result);
      setShowConfirmModal(false);
      setShowSuccessModal(true);
      // Leave failures on screen longer so they are not missed
      successTimer.current = setTimeout(() => setShowSuccessModal(false), result.kind === 'sent' ? 6000 : 15000);
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
                    'Send a CRITICAL evacuation SMS to all active, verified residents',
                    'Record the alert in the SMS Blast Logs',
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
                <Circle className="text-gray-400 fill-gray-400" size={12} />
                <span className="text-ink text-sm" style={{ fontWeight: 600 }}>
                  Sensor feed: not connected
                </span>
              </div>
              <p className="text-ink/50 text-xs ml-5">Live sensor status will appear here</p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Circle
                  className={gateway ? 'text-green-500 fill-green-500' : gateway === false ? 'text-[#FFB84D] fill-[#FFB84D]' : 'text-gray-400 fill-gray-400'}
                  size={12}
                />
                <span className="text-ink text-sm" style={{ fontWeight: 600 }}>
                  {gateway ? 'SMS gateway: ready' : gateway === false ? 'SMS gateway: not set up' : 'SMS gateway: checking...'}
                </span>
              </div>
              <p className="text-ink/50 text-xs ml-5">
                {gateway === false ? 'Blasts are saved as Pending until the Semaphore key is added' : 'Alerts are sent through Semaphore'}
              </p>
            </div>
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
                  This immediately sends a CRITICAL evacuation SMS to every active, verified resident and records it in the SMS Blast Logs.
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
                    style={{ background: outcome?.kind === 'sent' ? 'rgba(46, 196, 182, 0.1)' : outcome?.kind === 'failed' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(255, 184, 77, 0.14)' }}
                  >
                    {outcome?.kind === 'sent'
                      ? <Circle className="text-[#2EC4B6] fill-[#2EC4B6]" size={36} />
                      : <AlertTriangle className={outcome?.kind === 'failed' ? 'text-[#DC2626]' : 'text-[#FFB84D]'} size={36} />}
                  </div>
                </motion.div>

                <h3 className="text-ink text-xl mb-2" style={{ fontWeight: 700 }}>
                  {outcome?.kind === 'sent' ? 'Alarm Sent' : outcome?.kind === 'failed' ? 'Alarm Failed' : 'Alarm Not Sent'}
                </h3>
                <p className="text-ink/60 text-sm mb-2">
                  {outcome?.kind === 'sent'
                    ? `Evacuation SMS sent to ${outcome.recipients.toLocaleString()} resident${outcome.recipients === 1 ? '' : 's'}.${outcome.warning ? ' ' + outcome.warning : ''}`
                    : outcome?.kind === 'failed'
                    ? outcome.error
                    : `${outcome?.reason ?? ''} It was saved as Pending in the SMS Blast Logs.`}
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