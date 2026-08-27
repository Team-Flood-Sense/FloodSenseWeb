import { motion, AnimatePresence } from 'motion/react';
import { Search, Calendar, Send, Cpu, User, AlertCircle, Info, AlertTriangle, X, MapPin, Clock, Users } from 'lucide-react';
import { useState } from 'react';

interface SMSBlast {
  id: string;
  timestamp: string;
  message: string;
  recipients: number;
  status: 'Delivered' | 'Pending' | 'Failed';
  level: 'CRITICAL' | 'WARNING' | 'INFO';
  triggerSource: 'System' | 'Manual';
  triggeredBy: string;
  location: string;
}

const blastData: SMSBlast[] = [
  {
    id: 'BL-2026-0847',
    timestamp: '2026-02-26 14:35:22',
    message: 'CRITICAL ALERT: Flood Level at 2.1m - Immediate evacuation required for District A residents',
    recipients: 1248,
    status: 'Delivered',
    level: 'CRITICAL',
    triggerSource: 'System',
    triggeredBy: 'Auto-Detection',
    location: 'District A - River Bridge',
  },
  {
    id: 'BL-2026-0846',
    timestamp: '2026-02-26 13:22:15',
    message: 'WARNING: Rising water levels detected. Monitor conditions and prepare evacuation kits.',
    recipients: 856,
    status: 'Delivered',
    level: 'WARNING',
    triggerSource: 'Manual',
    triggeredBy: 'Maria Santos',
    location: 'District B - Central Park',
  },
  {
    id: 'BL-2026-0845',
    timestamp: '2026-02-26 12:10:08',
    message: 'INFO: System maintenance scheduled for tonight 22:00-23:00. Brief service interruption expected.',
    recipients: 2341,
    status: 'Delivered',
    level: 'INFO',
    triggerSource: 'Manual',
    triggeredBy: 'Juan Dela Cruz',
    location: 'All Districts',
  },
  {
    id: 'BL-2026-0844',
    timestamp: '2026-02-26 11:45:33',
    message: 'WARNING: Heavy rainfall forecast for next 6 hours. Stay alert and avoid low-lying areas.',
    recipients: 1567,
    status: 'Delivered',
    level: 'WARNING',
    triggerSource: 'System',
    triggeredBy: 'Auto-Detection',
    location: 'District C - Dam Site',
  },
  {
    id: 'BL-2026-0843',
    timestamp: '2026-02-26 10:18:47',
    message: 'CRITICAL ALERT: Dam gates opening at 11:00. Evacuate downstream areas immediately.',
    recipients: 2089,
    status: 'Delivered',
    level: 'CRITICAL',
    triggerSource: 'Manual',
    triggeredBy: 'Ana Reyes',
    location: 'District C - Dam Site',
  },
  {
    id: 'BL-2026-0842',
    timestamp: '2026-02-26 09:05:12',
    message: 'INFO: Water level stable. All clear for District D morning activities.',
    recipients: 743,
    status: 'Delivered',
    level: 'INFO',
    triggerSource: 'System',
    triggeredBy: 'Auto-Detection',
    location: 'District D - Industrial Zone',
  },
  {
    id: 'BL-2026-0841',
    timestamp: '2026-02-26 07:42:55',
    message: 'WARNING: Sensor maintenance in progress. Temporary monitoring gaps possible.',
    recipients: 312,
    status: 'Pending',
    level: 'WARNING',
    triggerSource: 'Manual',
    triggeredBy: 'Carlos Mendoza',
    location: 'District A - Station 12',
  },
];

const getLevelStyle = (level: string) => {
  switch (level) {
    case 'CRITICAL':
      return {
        background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.15) 0%, rgba(220, 38, 38, 0.08) 100%)',
        border: '1px solid rgba(220, 38, 38, 0.3)',
        color: '#DC2626',
        icon: AlertCircle,
        glow: '0 0 16px rgba(220, 38, 38, 0.3)',
      };
    case 'WARNING':
      return {
        background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.15) 0%, rgba(255, 107, 53, 0.08) 100%)',
        border: '1px solid rgba(255, 107, 53, 0.3)',
        color: '#FF6B35',
        icon: AlertTriangle,
        glow: '0 0 16px rgba(255, 107, 53, 0.3)',
      };
    case 'INFO':
      return {
        background: 'linear-gradient(135deg, rgba(46, 196, 182, 0.15) 0%, rgba(46, 196, 182, 0.08) 100%)',
        border: '1px solid rgba(46, 196, 182, 0.3)',
        color: '#2EC4B6',
        icon: Info,
        glow: '0 0 16px rgba(46, 196, 182, 0.3)',
      };
    default:
      return {
        background: 'linear-gradient(135deg, rgba(11, 60, 93, 0.15) 0%, rgba(11, 60, 93, 0.08) 100%)',
        border: '1px solid rgba(11, 60, 93, 0.3)',
        color: '#0B3C5D',
        icon: Info,
        glow: '0 0 16px rgba(11, 60, 93, 0.3)',
      };
  }
};

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'Delivered':
      return { background: 'rgba(46, 196, 182, 0.1)', border: '1px solid rgba(46, 196, 182, 0.3)', color: '#2EC4B6' };
    case 'Pending':
      return { background: 'rgba(255, 184, 77, 0.1)', border: '1px solid rgba(255, 184, 77, 0.3)', color: '#FFB84D' };
    case 'Failed':
      return { background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)', color: '#DC2626' };
    default:
      return { background: 'rgba(11, 60, 93, 0.1)', border: '1px solid rgba(11, 60, 93, 0.3)', color: '#0B3C5D' };
  }
};

export function SMSBlastTable() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('2026-02-26');

  // Compose modal
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [newBlast, setNewBlast] = useState({ level: 'INFO', location: '', message: '' });

  // View Details modal
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedBlast, setSelectedBlast] = useState<SMSBlast | null>(null);

  // ADD this line after all the useState lines
  const currentUser = JSON.parse(localStorage.getItem('floodsense_user') || '{}');

  const filteredBlasts = blastData.filter(blast =>
    blast.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
    blast.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    blast.triggeredBy.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const inputStyle = {
    background: 'rgba(255, 255, 255, 0.6)',
    border: '1px solid rgba(46, 196, 182, 0.2)',
    borderRadius: '12px',
    padding: '10px 14px',
    width: '100%',
    color: '#0B3C5D',
    fontSize: '14px',
    outline: 'none',
  };

  const MAX_CHARS = 160;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative bg-white/80 backdrop-blur-xl overflow-hidden"
        style={{
          borderRadius: '28px',
          boxShadow: '0 20px 60px rgba(11, 60, 93, 0.12), 0 8px 32px rgba(11, 60, 93, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent pointer-events-none" style={{ borderRadius: '28px' }} />

        <div className="relative z-10">
          {/* Header */}
          <div className="p-8 border-b border-[#0B3C5D]/10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[#0B3C5D] text-2xl mb-1" style={{ fontWeight: 700 }}>SMS Blast Logs</h3>
                <p className="text-[#0B3C5D]/60 text-sm">Complete audit trail of emergency communications</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowComposeModal(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)',
                  boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                <Send className="text-white" size={20} strokeWidth={2.5} />
                <span className="text-white text-sm" style={{ fontWeight: 600 }}>Compose New Blast</span>
              </motion.button>
            </div>

            {/* Control Bar */}
            <div className="flex items-center gap-4">
              <div
                className="relative flex-1"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '20px',
                  boxShadow: 'inset 0 0 1px 1px rgba(46, 196, 182, 0.2), 0 4px 16px rgba(11, 60, 93, 0.05)',
                  border: '1px solid rgba(46, 196, 182, 0.15)',
                }}
              >
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#0B3C5D]/40" size={20} />
                <input
                  type="text"
                  placeholder="Search by message, location, or user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-transparent text-[#0B3C5D] placeholder-[#0B3C5D]/40 text-sm outline-none"
                  style={{ fontWeight: 500 }}
                />
              </div>
              <div
                className="relative"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '20px',
                  boxShadow: 'inset 0 0 1px 1px rgba(46, 196, 182, 0.2), 0 4px 16px rgba(11, 60, 93, 0.05)',
                  border: '1px solid rgba(46, 196, 182, 0.15)',
                }}
              >
                <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#0B3C5D]/40" size={20} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="pl-12 pr-4 py-3 bg-transparent text-[#0B3C5D] text-sm outline-none"
                  style={{ fontWeight: 500, minWidth: '200px' }}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '480px' }}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0B3C5D]/10">
                  <th className="text-left px-8 py-4 text-[#0B3C5D]/70 text-xs" style={{ fontWeight: 600 }}>BLAST ID</th>
                  <th className="text-left px-8 py-4 text-[#0B3C5D]/70 text-xs" style={{ fontWeight: 600 }}>TIMESTAMP</th>
                  <th className="text-left px-8 py-4 text-[#0B3C5D]/70 text-xs" style={{ fontWeight: 600 }}>MESSAGE</th>
                  <th className="text-left px-8 py-4 text-[#0B3C5D]/70 text-xs" style={{ fontWeight: 600 }}>RECIPIENTS</th>
                  <th className="text-left px-8 py-4 text-[#0B3C5D]/70 text-xs" style={{ fontWeight: 600 }}>LEVEL</th>
                  <th className="text-left px-8 py-4 text-[#0B3C5D]/70 text-xs" style={{ fontWeight: 600 }}>TRIGGER</th>
                  <th className="text-left px-8 py-4 text-[#0B3C5D]/70 text-xs" style={{ fontWeight: 600 }}>STATUS</th>
                  <th className="text-left px-8 py-4 text-[#0B3C5D]/70 text-xs" style={{ fontWeight: 600 }}>LOCATION</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlasts.map((blast, index) => {
                  const levelStyle = getLevelStyle(blast.level);
                  const statusStyle = getStatusStyle(blast.status);
                  const LevelIcon = levelStyle.icon;
                  return (
                    <motion.tr
                      key={blast.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + index * 0.05 }}
                      className="border-b border-[#0B3C5D]/5 hover-row group"
                      style={{ transition: 'all 0.3s ease' }}
                      onClick={() => {
                        setSelectedBlast(blast);
                        setShowDetailsModal(true);
                      }}
                    >
                      <td className="px-8 py-4">
                        <span className="text-[#0B3C5D] text-xs" style={{ fontWeight: 700, fontFamily: 'monospace' }}>{blast.id}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-[#0B3C5D]/70 text-xs" style={{ fontFamily: 'monospace' }}>{blast.timestamp}</span>
                      </td>
                      <td className="px-8 py-4" style={{ maxWidth: '300px' }}>
                        <div className="text-[#0B3C5D] text-xs line-clamp-2" style={{ fontWeight: 500 }}>{blast.message}</div>
                        <span className="text-[#2EC4B6] text-xs mt-0.5 block" style={{ fontWeight: 600 }}>Click to view full message</span>
                      </td>
                      <td className="px-8 py-4">
                        <div className="px-3 py-1.5 rounded-full inline-block" style={{ background: 'rgba(11, 60, 93, 0.08)', border: '1px solid rgba(11, 60, 93, 0.15)' }}>
                          <span className="text-[#0B3C5D] text-xs" style={{ fontWeight: 700 }}>{blast.recipients.toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ ...levelStyle, boxShadow: levelStyle.glow, fontWeight: 700 }}>
                          <LevelIcon size={14} strokeWidth={3} />
                          <span className="text-xs">{blast.level}</span>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="p-2 rounded-xl"
                            style={{
                              background: blast.triggerSource === 'System'
                                ? 'linear-gradient(135deg, rgba(46, 196, 182, 0.1) 0%, rgba(46, 196, 182, 0.05) 100%)'
                                : 'linear-gradient(135deg, rgba(29, 112, 162, 0.1) 0%, rgba(29, 112, 162, 0.05) 100%)',
                              boxShadow: blast.triggerSource === 'System'
                                ? '0 2px 8px rgba(46, 196, 182, 0.15), inset 0 1px 2px rgba(255, 255, 255, 0.8)'
                                : '0 2px 8px rgba(29, 112, 162, 0.15), inset 0 1px 2px rgba(255, 255, 255, 0.8)',
                            }}
                          >
                            {blast.triggerSource === 'System'
                              ? <Cpu className="text-[#2EC4B6]" size={16} strokeWidth={2.5} />
                              : <User className="text-[#1D70A2]" size={16} strokeWidth={2.5} />
                            }
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[#0B3C5D] text-xs" style={{ fontWeight: 600 }}>{blast.triggerSource}</span>
                            <span className="text-[#0B3C5D]/60 text-xs">{blast.triggeredBy}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={statusStyle}>
                          <div className="w-2 h-2 rounded-full" style={{ background: statusStyle.color, animation: blast.status === 'Pending' ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none' }} />
                          <span className="text-xs" style={{ fontWeight: 600 }}>{blast.status}</span>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-[#0B3C5D]/70 text-xs">{blast.location}</span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Stats */}
          <div className="px-8 py-5 border-t border-[#0B3C5D]/10 bg-white/40">
            <div className="flex items-center justify-between">
              <span className="text-[#0B3C5D]/60 text-sm">
                Showing {filteredBlasts.length} of {blastData.length} blast logs
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(220, 38, 38, 0.1)' }}>
                  <div className="w-2 h-2 rounded-full bg-[#DC2626]" />
                  <span className="text-xs text-[#DC2626]" style={{ fontWeight: 600 }}>{blastData.filter(b => b.level === 'CRITICAL').length} Critical</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255, 107, 53, 0.1)' }}>
                  <div className="w-2 h-2 rounded-full bg-[#FF6B35]" />
                  <span className="text-xs text-[#FF6B35]" style={{ fontWeight: 600 }}>{blastData.filter(b => b.level === 'WARNING').length} Warning</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(46, 196, 182, 0.1)' }}>
                  <div className="w-2 h-2 rounded-full bg-[#2EC4B6]" />
                  <span className="text-xs text-[#2EC4B6]" style={{ fontWeight: 600 }}>{blastData.filter(b => b.level === 'INFO').length} Info</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          .hover-row { cursor: pointer; }
          .hover-row:hover {
            background: linear-gradient(90deg, rgba(29, 112, 162, 0.04) 0%, rgba(29, 112, 162, 0.08) 50%, rgba(29, 112, 162, 0.04) 100%);
            box-shadow: inset 0 1px 2px rgba(29, 112, 162, 0.15);
          }
          .line-clamp-2 {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
        `}</style>
      </motion.div>

      {/* ===================== VIEW DETAILS MODAL ===================== */}
      <AnimatePresence>
        {showDetailsModal && selectedBlast && (() => {
          const levelStyle = getLevelStyle(selectedBlast.level);
          const statusStyle = getStatusStyle(selectedBlast.status);
          const LevelIcon = levelStyle.icon;
          return (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowDetailsModal(false)}
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
                  className="w-full max-w-lg p-8 relative"
                  style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '28px',
                    boxShadow: '0 20px 60px rgba(11, 60, 93, 0.2)',
                    border: `1px solid ${levelStyle.color}33`,
                    pointerEvents: 'all',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl" style={{ background: levelStyle.background, border: levelStyle.border }}>
                        <LevelIcon style={{ color: levelStyle.color }} size={20} strokeWidth={2.5} />
                      </div>
                      <div>
                        <h3 className="text-[#0B3C5D] text-xl" style={{ fontWeight: 700 }}>Blast Details</h3>
                        <p className="text-[#0B3C5D]/50 text-xs mt-0.5" style={{ fontFamily: 'monospace' }}>{selectedBlast.id}</p>
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowDetailsModal(false)}
                      className="p-2 rounded-xl"
                      style={{ background: 'rgba(11, 60, 93, 0.05)' }}
                    >
                      <X className="text-[#0B3C5D]/60" size={20} />
                    </motion.button>
                  </div>

                  {/* Full Message */}
                  <div
                    className="p-4 rounded-2xl mb-5"
                    style={{ background: levelStyle.background, border: levelStyle.border }}
                  >
                    <p className="text-xs mb-2" style={{ color: levelStyle.color, fontWeight: 700 }}>
                      FULL MESSAGE
                    </p>
                    <p className="text-[#0B3C5D] text-sm leading-relaxed">
                      {selectedBlast.message}
                    </p>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-3">

                    {/* Timestamp */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(11, 60, 93, 0.03)', border: '1px solid rgba(11, 60, 93, 0.08)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock size={14} className="text-[#0B3C5D]/40" />
                        <span className="text-[#0B3C5D]/50 text-xs" style={{ fontWeight: 600 }}>TIMESTAMP</span>
                      </div>
                      <p className="text-[#0B3C5D] text-xs" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {selectedBlast.timestamp}
                      </p>
                    </div>

                    {/* Recipients */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(11, 60, 93, 0.03)', border: '1px solid rgba(11, 60, 93, 0.08)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Users size={14} className="text-[#0B3C5D]/40" />
                        <span className="text-[#0B3C5D]/50 text-xs" style={{ fontWeight: 600 }}>RECIPIENTS</span>
                      </div>
                      <p className="text-[#0B3C5D] text-sm" style={{ fontWeight: 700 }}>
                        {selectedBlast.recipients.toLocaleString()} residents
                      </p>
                    </div>

                    {/* Location */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(11, 60, 93, 0.03)', border: '1px solid rgba(11, 60, 93, 0.08)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin size={14} className="text-[#0B3C5D]/40" />
                        <span className="text-[#0B3C5D]/50 text-xs" style={{ fontWeight: 600 }}>LOCATION</span>
                      </div>
                      <p className="text-[#0B3C5D] text-xs" style={{ fontWeight: 600 }}>
                        {selectedBlast.location}
                      </p>
                    </div>

                    {/* Triggered By */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(11, 60, 93, 0.03)', border: '1px solid rgba(11, 60, 93, 0.08)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        {selectedBlast.triggerSource === 'System'
                          ? <Cpu size={14} className="text-[#0B3C5D]/40" />
                          : <User size={14} className="text-[#0B3C5D]/40" />
                        }
                        <span className="text-[#0B3C5D]/50 text-xs" style={{ fontWeight: 600 }}>TRIGGERED BY</span>
                      </div>
                      <p className="text-[#0B3C5D] text-xs" style={{ fontWeight: 600 }}>
                        {selectedBlast.triggeredBy}
                      </p>
                      <p className="text-[#0B3C5D]/50 text-xs">{selectedBlast.triggerSource}</p>
                    </div>

                    {/* Level */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(11, 60, 93, 0.03)', border: '1px solid rgba(11, 60, 93, 0.08)' }}>
                      <span className="text-[#0B3C5D]/50 text-xs block mb-2" style={{ fontWeight: 600 }}>ALERT LEVEL</span>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ ...levelStyle, boxShadow: levelStyle.glow, fontWeight: 700 }}>
                        <LevelIcon size={12} strokeWidth={3} />
                        <span className="text-xs">{selectedBlast.level}</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(11, 60, 93, 0.03)', border: '1px solid rgba(11, 60, 93, 0.08)' }}>
                      <span className="text-[#0B3C5D]/50 text-xs block mb-2" style={{ fontWeight: 600 }}>DELIVERY STATUS</span>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={statusStyle}>
                        <div className="w-2 h-2 rounded-full" style={{ background: statusStyle.color }} />
                        <span className="text-xs" style={{ fontWeight: 600 }}>{selectedBlast.status}</span>
                      </div>
                    </div>

                  </div>

                  {/* Close Button */}
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="w-full mt-6 py-3 rounded-2xl text-sm transition-all"
                    style={{
                      background: 'rgba(11, 60, 93, 0.05)',
                      color: '#0B3C5D',
                      fontWeight: 600,
                      border: '1px solid rgba(11, 60, 93, 0.1)',
                    }}
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* ===================== COMPOSE NEW BLAST MODAL ===================== */}
      <AnimatePresence>
        {showComposeModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowComposeModal(false)}
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
                className="w-full max-w-lg p-8 relative"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(11, 60, 93, 0.2)',
                  border: '1px solid rgba(46, 196, 182, 0.2)',
                  pointerEvents: 'all',
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-[#0B3C5D] text-xl" style={{ fontWeight: 700 }}>Compose New Blast</h3>
                    <p className="text-[#0B3C5D]/50 text-sm mt-0.5">Send a manual SMS alert to all registered residents</p>
                  </div>
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={() => setShowComposeModal(false)} className="p-2 rounded-xl" style={{ background: 'rgba(11, 60, 93, 0.05)' }}>
                    <X className="text-[#0B3C5D]/60" size={20} />
                  </motion.button>
                </div>

                <div className="space-y-4">
                  {/* Alert Level */}
                  <div>
                    <label className="block text-[#0B3C5D] text-sm mb-1.5" style={{ fontWeight: 600 }}>Alert Level</label>
                    <div className="flex gap-3">
                      {(['INFO', 'WARNING', 'CRITICAL'] as const).map((level) => {
                        const style = getLevelStyle(level);
                        const Icon = style.icon;
                        const isSelected = newBlast.level === level;
                        return (
                          <button
                            key={level}
                            onClick={() => setNewBlast({ ...newBlast, level })}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs transition-all"
                            style={{
                              background: isSelected ? style.background : 'rgba(11, 60, 93, 0.03)',
                              border: isSelected ? style.border : '1px solid rgba(11, 60, 93, 0.1)',
                              color: isSelected ? style.color : '#0B3C5D',
                              fontWeight: 700,
                              boxShadow: isSelected ? style.glow : 'none',
                            }}
                          >
                            <Icon size={14} strokeWidth={3} />
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block text-[#0B3C5D] text-sm mb-1.5" style={{ fontWeight: 600 }}>Target Location</label>
                    <select value={newBlast.location} onChange={(e) => setNewBlast({ ...newBlast, location: e.target.value })} style={inputStyle}>
                      <option value="">Select location...</option>
                      <option value="All Districts">All Districts</option>
                      <option value="District A - River Bridge">District A - River Bridge</option>
                      <option value="District B - Central Park">District B - Central Park</option>
                      <option value="District C - Dam Site">District C - Dam Site</option>
                      <option value="District D - Industrial Zone">District D - Industrial Zone</option>
                      <option value="Barangay 659">Barangay 659</option>
                    </select>
                  </div>

                  {/* Message */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[#0B3C5D] text-sm" style={{ fontWeight: 600 }}>Message</label>
                      <span className="text-xs" style={{ color: newBlast.message.length > MAX_CHARS ? '#DC2626' : '#0B3C5D', opacity: 0.5, fontWeight: 600 }}>
                        {newBlast.message.length}/{MAX_CHARS}
                      </span>
                    </div>
                    <textarea
                      placeholder="Type your emergency message here..."
                      value={newBlast.message}
                      onChange={(e) => setNewBlast({ ...newBlast, message: e.target.value })}
                      rows={4}
                      style={{ ...inputStyle, resize: 'none', lineHeight: '1.5' }}
                    />
                    <p className="text-[#0B3C5D]/40 text-xs mt-1">Standard SMS is 160 characters. Longer messages may be split into multiple SMS.</p>
                  </div>

                  {/* Preview */}
                  {newBlast.message && (
                    <div className="p-4 rounded-2xl" style={{ background: 'rgba(11, 60, 93, 0.03)', border: '1px solid rgba(11, 60, 93, 0.08)' }}>
                      <p className="text-[#0B3C5D]/50 text-xs mb-1" style={{ fontWeight: 600 }}>SMS PREVIEW</p>
                      <p className="text-[#0B3C5D] text-sm">[FloodSense] {newBlast.message}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowComposeModal(false)}
                    className="flex-1 py-3 rounded-2xl text-sm transition-all"
                    style={{ background: 'rgba(11, 60, 93, 0.05)', color: '#0B3C5D', fontWeight: 600, border: '1px solid rgba(11, 60, 93, 0.1)' }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      // TODO: backend developer connects this to Semaphore API
                      // triggeredBy: currentUser.name will be passed to the backend
                      console.log('Blast triggered by:', currentUser.name || 'Admin');
                      setShowComposeModal(false);
                      setNewBlast({ level: 'INFO', location: '', message: '' });
                    }}
                    className="flex-1 py-3 rounded-2xl text-sm text-white flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)', boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4)', fontWeight: 600 }}
                  >
                    <Send size={16} strokeWidth={2.5} />
                    Send Blast
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}