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
  valueColor = 'rgb(var(--ink-rgb))',
  iconColor = 'rgb(var(--ink-rgb))',
  iconBg = 'rgba(var(--ink-rgb), 0.1)'
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-lift relative bg-surface/80 p-6 overflow-hidden"
      style={{
        borderRadius: '28px',
        boxShadow: '0 8px 32px rgba(var(--shadow-rgb), 0.08)',
        border: '1px solid rgba(var(--surface-rgb), 0.6)',
      }}
    >
      {/* Background gradient + accent line */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface/40 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${iconColor}, transparent 70%)`, opacity: 0.85 }} />
      
      {/* Content */}
      <div className="relative z-10">
        <div 
          className="inline-flex p-3 rounded-2xl mb-4"
          style={{
            background: iconBg,
            boxShadow: '0 2px 8px rgba(var(--shadow-rgb), 0.1), inset 0 1px 2px rgba(var(--surface-rgb), 0.5)',
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
        
        <div className="text-sm text-ink/60" style={{ fontWeight: 500 }}>
          {label}
        </div>
      </div>
    </motion.div>
  );
}
