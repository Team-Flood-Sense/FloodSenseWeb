import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  valueColor?: string;
  iconColor?: string;
  iconBg?: string;
}

export function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  valueColor = '#0B3C5D',
  iconColor = '#0B3C5D',
  iconBg = 'rgba(11, 60, 93, 0.1)'
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative bg-white/80 backdrop-blur-xl p-6 overflow-hidden"
      style={{
        borderRadius: '28px',
        boxShadow: '0 8px 32px rgba(11, 60, 93, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.6)',
      }}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10">
        <div 
          className="inline-flex p-3 rounded-2xl mb-4"
          style={{
            background: iconBg,
            boxShadow: '0 2px 8px rgba(11, 60, 93, 0.1), inset 0 1px 2px rgba(255, 255, 255, 0.5)',
          }}
        >
          <Icon 
            style={{ color: iconColor }}
            size={24} 
            strokeWidth={2.5}
          />
        </div>
        
        <div className="mb-2">
          <div className="text-4xl mb-1" style={{ fontWeight: 700, color: valueColor }}>
            {value}
          </div>
        </div>
        
        <div className="text-sm text-[#0B3C5D]/60" style={{ fontWeight: 500 }}>
          {label}
        </div>
      </div>
    </motion.div>
  );
}
