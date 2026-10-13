import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  unit?: string;
  showWaveAnimation?: boolean;
  showGlow?: boolean;
  accent?: string;
}

export function MetricCard({ 
  icon: Icon, 
  title, 
  value, 
  unit, 
  showWaveAnimation = false,
  showGlow = false,
  accent = '#2EC4B6',
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-lift relative bg-surface/80 p-6 overflow-hidden h-full"
      style={{
        borderRadius: '28px',
        boxShadow: '0 8px 32px rgba(var(--shadow-rgb), 0.08)',
        border: '1px solid rgba(var(--surface-rgb), 0.6)',
      }}
    >
      {/* Background gradient + accent line */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface/40 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${accent}, transparent 75%)` }} />
      
      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div 
            className={`p-3 rounded-2xl ${showGlow ? 'glow-effect' : ''}`}
            style={{
              background: showGlow 
                ? 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)'
                : 'linear-gradient(135deg, rgba(var(--ink-rgb), 0.1) 0%, rgba(var(--ink-rgb), 0.05) 100%)',
              boxShadow: showGlow 
                ? '0 4px 24px rgba(46, 196, 182, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.3)'
                : '0 2px 8px rgba(var(--shadow-rgb), 0.1), inset 0 1px 2px rgba(var(--surface-rgb), 0.5)',
            }}
          >
            <Icon 
              className={showGlow ? 'text-white' : 'text-ink'} 
              size={28} 
              strokeWidth={2.5}
            />
          </div>
          <span className="text-sm text-ink/60">{title}</span>
        </div>
        
        <div className="relative">
          {showWaveAnimation && (
            <div className="absolute -inset-x-6 bottom-0 h-16 overflow-hidden">
              <motion.div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.3) 100%)',
                  borderRadius: '28px',
                }}
                animate={{
                  y: [0, -5, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <svg className="absolute bottom-0 w-full" viewBox="0 0 1440 100" preserveAspectRatio="none">
                  <motion.path
                    d="M0,50 Q360,20 720,50 T1440,50 L1440,100 L0,100 Z"
                    fill="rgba(59, 130, 246, 0.4)"
                    animate={{
                      d: [
                        "M0,50 Q360,20 720,50 T1440,50 L1440,100 L0,100 Z",
                        "M0,50 Q360,80 720,50 T1440,50 L1440,100 L0,100 Z",
                        "M0,50 Q360,20 720,50 T1440,50 L1440,100 L0,100 Z",
                      ],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                </svg>
              </motion.div>
            </div>
          )}
          
          <div className="relative flex items-baseline gap-2">
            <span className="text-4xl text-ink" style={{ fontWeight: 700 }}>
              {value}
            </span>
            {unit && (
              <span className="text-lg text-ink/70" style={{ fontWeight: 500 }}>
                {unit}
              </span>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes glow-pulse {
          0%, 100% { 
            box-shadow: 0 4px 24px rgba(46, 196, 182, 0.5), 
                        inset 0 1px 2px rgba(255, 255, 255, 0.3),
                        0 0 20px rgba(46, 196, 182, 0.3);
          }
          50% { 
            box-shadow: 0 4px 32px rgba(46, 196, 182, 0.7), 
                        inset 0 1px 2px rgba(255, 255, 255, 0.3),
                        0 0 30px rgba(46, 196, 182, 0.5);
          }
        }
        .glow-effect {
          animation: glow-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </motion.div>
  );
}
