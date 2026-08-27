import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Circle, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export function QuickActionsPanel() {
  const { role } = useAuth();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  function handleConfirm() {
    // TODO: backend developer connects this to Semaphore API
    setShowConfirmModal(false);
    setShowSuccessModal(true);
    // Auto-close success after 3 seconds
    setTimeout(() => setShowSuccessModal(false), 3000);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="relative bg-white/80 backdrop-blur-xl p-6"
        style={{
          borderRadius: '28px',
          boxShadow: '0 8px 32px rgba(11, 60, 93, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" style={{ borderRadius: '28px' }} />

        <div className="relative z-10">
          <h3 className="text-[#0B3C5D] text-lg mb-4" style={{ fontWeight: 700 }}>
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
              <div className="mb-6 p-4 rounded-2xl bg-[#0B3C5D]/5 border border-[#0B3C5D]/10">
                <p className="text-[#0B3C5D] text-sm mb-2" style={{ fontWeight: 600 }}>
                  This action will:
                </p>
                <ul className="space-y-1.5">
                  {[
                    'Send SMS alerts to all registered residents',
                    'Activate emergency sirens',
                    'Notify emergency response teams',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[#0B3C5D]/70 text-sm">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#0B3C5D]/40 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* ✅ Viewer sees this instead */}
          {role === 'viewer' && (
            <div className="mb-6 p-4 rounded-2xl bg-[#0B3C5D]/5 border border-[#0B3C5D]/10 text-center">
              <p className="text-[#0B3C5D]/60 text-sm">
                You don't have permission to trigger alarms.
              </p>
            </div>
          )}

          {/* System Alerts — visible to everyone */}
          <h3 className="text-[#0B3C5D] text-lg mb-3" style={{ fontWeight: 700 }}>
            System Alerts
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <Circle className="text-green-500 fill-green-500" size={12} />
                <span className="text-[#0B3C5D] text-sm" style={{ fontWeight: 600 }}>
                  All sensors operational
                </span>
              </div>
              <p className="text-[#0B3C5D]/50 text-xs ml-5">Last check: 2 min ago</p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Circle className="text-green-500 fill-green-500" size={12} />
                <span className="text-[#0B3C5D] text-sm" style={{ fontWeight: 600 }}>
                  Communication network: Active
                </span>
              </div>
              <p className="text-[#0B3C5D]/50 text-xs ml-5">Signal strength: Excellent</p>
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
              onClick={() => setShowConfirmModal(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(11, 60, 93, 0.5)', backdropFilter: 'blur(4px)' }}
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
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(11, 60, 93, 0.2)',
                  border: '1px solid rgba(255, 107, 53, 0.3)',
                  pointerEvents: 'all',
                }}
              >
                {/* Close button */}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowConfirmModal(false)}
                  className="absolute top-4 right-4 p-2 rounded-xl"
                  style={{ background: 'rgba(11, 60, 93, 0.05)' }}
                >
                  <X className="text-[#0B3C5D]/60" size={18} />
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
                <h3 className="text-[#0B3C5D] text-xl text-center mb-2" style={{ fontWeight: 700 }}>
                  Confirm Evacuation Alarm
                </h3>
                <p className="text-[#0B3C5D]/60 text-sm text-center mb-4">
                  This will immediately send SMS alerts to all registered residents and activate emergency protocols.
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

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 py-3 rounded-2xl text-sm transition-all"
                    style={{
                      background: 'rgba(11, 60, 93, 0.05)',
                      color: '#0B3C5D',
                      fontWeight: 600,
                      border: '1px solid rgba(11, 60, 93, 0.1)',
                    }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirm}
                    className="flex-1 py-3 rounded-2xl text-sm text-white flex items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)',
                      boxShadow: '0 8px 24px rgba(255, 107, 53, 0.4)',
                      fontWeight: 600,
                    }}
                  >
                    <AlertTriangle size={16} strokeWidth={2.5} />
                    Confirm Alarm
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
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(11, 60, 93, 0.5)', backdropFilter: 'blur(4px)' }}
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
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(11, 60, 93, 0.2)',
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
                    style={{ background: 'rgba(46, 196, 182, 0.1)' }}
                  >
                    <Circle className="text-[#2EC4B6] fill-[#2EC4B6]" size={36} />
                  </div>
                </motion.div>

                <h3 className="text-[#0B3C5D] text-xl mb-2" style={{ fontWeight: 700 }}>
                  Alarm Triggered!
                </h3>
                <p className="text-[#0B3C5D]/60 text-sm mb-2">
                  Emergency SMS alerts have been sent to all registered residents.
                </p>
                <p className="text-[#0B3C5D]/40 text-xs">
                  This dialog will close automatically...
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}