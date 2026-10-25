import { motion } from 'motion/react';
import { Droplets, Waves, Wind, Thermometer, Radio, BatteryLow, BatteryMedium, BatteryFull } from 'lucide-react';
import type { Sensor } from '../hooks/useSensors';

const getSensorIcon = (type: string) => {
  switch (type) {
    case 'water':
      return Droplets;
    case 'rainfall':
      return Waves;
    case 'wind':
      return Wind;
    case 'temperature':
      return Thermometer;
    default:
      return Droplets;
  }
};

const getBatteryIcon = (level: number) => {
  if (level >= 80) return BatteryFull;
  if (level >= 40) return BatteryMedium;
  return BatteryLow;
};

const getBatteryColor = (level: number) => {
  if (level >= 80) return '#2EC4B6';
  if (level >= 40) return '#FFB84D';
  return '#FF6B35';
};

export function SensorTable({ sensors: sensorData, error }: { sensors: Sensor[]; error?: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative bg-surface/80 overflow-hidden"
      style={{
        borderRadius: '28px',
        boxShadow: '0 8px 32px rgba(var(--shadow-rgb), 0.08)',
        border: '1px solid rgba(var(--surface-rgb), 0.6)',
      }}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface/40 to-transparent pointer-events-none" style={{ borderRadius: '28px' }} />
      
      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="p-6 border-b border-ink/10">
          <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>
            Sensor Network
          </h3>
          <p className="text-ink/60 text-sm mt-1">
            Real-time monitoring across all stations
          </p>
        </div>

        {sensorData.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center px-6 py-16">
            <div
              className="p-5 rounded-3xl mb-5"
              style={{ background: 'rgba(var(--ink-rgb), 0.05)', border: '1px dashed rgba(var(--ink-rgb), 0.22)' }}
            >
              <Radio className="text-ink/40" size={40} strokeWidth={1.8} />
            </div>
            <h4 className="text-ink text-lg" style={{ fontWeight: 700 }}>No sensors connected yet</h4>
            <p className="text-ink/55 text-sm mt-2 max-w-md">
              {error
                ? `Couldn't load sensors: ${error}`
                : 'Water level and rainfall sensors will appear here once they start sending readings. Nothing is shown until real data arrives.'}
            </p>
          </div>
        ) : (
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '480px' }}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.04]">
                <th className="text-left px-6 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>
                  Sensor Name
                </th>
                <th className="text-left px-6 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>
                  Location
                </th>
                <th className="text-left px-6 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>
                  Status
                </th>
                <th className="text-left px-6 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>
                  Current Reading
                </th>
                <th className="text-left px-6 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>
                  Battery Health
                </th>
                <th className="text-left px-6 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>
                  Last Sync
                </th>
              </tr>
            </thead>
            <tbody>
              {sensorData.map((sensor, index) => {
                const SensorIcon = getSensorIcon(sensor.type);
                const battery = sensor.battery ?? 0;
                const BatteryIcon = getBatteryIcon(battery);
                const batteryColor = sensor.battery === null ? '#94A3B8' : getBatteryColor(battery);
                
                return (
                  <motion.tr
                    key={sensor.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
                    className="border-b border-ink/5 sensor-row group"
                    style={{
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="p-2 rounded-xl"
                          style={{
                            background: 'linear-gradient(135deg, rgba(var(--ink-rgb), 0.08) 0%, rgba(var(--ink-rgb), 0.04) 100%)',
                            boxShadow: '0 2px 8px rgba(var(--shadow-rgb), 0.05), inset 0 1px 2px rgba(var(--surface-rgb), 0.8)',
                          }}
                        >
                          <SensorIcon className="text-ink" size={18} strokeWidth={2.5} />
                        </div>
                        <span className="text-ink text-sm" style={{ fontWeight: 600 }}>
                          {sensor.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-ink/70 text-sm">
                        {sensor.location}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                        style={{
                          background: sensor.status === 'online' 
                            ? 'rgba(46, 196, 182, 0.1)' 
                            : sensor.status === 'warning'
                            ? 'rgba(255, 184, 77, 0.1)'
                            : 'rgba(220, 38, 38, 0.1)',
                          border: sensor.status === 'online'
                            ? '1px solid rgba(46, 196, 182, 0.3)'
                            : sensor.status === 'warning'
                            ? '1px solid rgba(255, 184, 77, 0.3)'
                            : '1px solid rgba(220, 38, 38, 0.3)',
                          boxShadow: sensor.status === 'online'
                            ? '0 0 12px rgba(46, 196, 182, 0.2)'
                            : sensor.status === 'warning'
                            ? '0 0 12px rgba(255, 184, 77, 0.2)'
                            : '0 0 12px rgba(220, 38, 38, 0.2)',
                        }}
                      >
                        <div 
                          className="w-2 h-2 rounded-full animate-pulse"
                          style={{
                            background: sensor.status === 'online'
                              ? '#2EC4B6'
                              : sensor.status === 'warning'
                              ? '#FFB84D'
                              : '#DC2626',
                          }}
                        />
                        <span 
                          className="text-xs capitalize"
                          style={{ 
                            fontWeight: 600,
                            color: sensor.status === 'online'
                              ? '#2EC4B6'
                              : sensor.status === 'warning'
                              ? '#FFB84D'
                              : '#DC2626',
                          }}
                        >
                          {sensor.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-ink text-sm" style={{ fontWeight: 600 }}>
                        {sensor.reading}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="relative p-1.5 rounded-lg"
                          style={{
                            background: `linear-gradient(135deg, ${batteryColor}15 0%, ${batteryColor}08 100%)`,
                            boxShadow: `0 2px 8px ${batteryColor}20, inset 0 1px 2px rgba(var(--surface-rgb), 0.8)`,
                          }}
                        >
                          <BatteryIcon 
                            style={{ color: batteryColor }}
                            size={18} 
                            strokeWidth={2.5}
                          />
                        </div>
                        <div className="flex flex-col">
                          <span 
                            className="text-sm"
                            style={{ 
                              fontWeight: 600,
                              color: batteryColor,
                            }}
                          >
                            {sensor.battery === null ? '—' : `${sensor.battery}%`}
                          </span>
                          <div 
                            className="w-16 h-1 rounded-full overflow-hidden"
                            style={{ background: 'rgba(var(--ink-rgb), 0.1)' }}
                          >
                            <div 
                              className="h-full rounded-full"
                              style={{ 
                                width: `${battery}%`,
                                background: batteryColor,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-ink/60 text-sm">
                        {sensor.lastSync}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <style>{`
        .sensor-row:hover {
          background: linear-gradient(90deg, rgba(29, 112, 162, 0.04) 0%, rgba(29, 112, 162, 0.08) 50%, rgba(29, 112, 162, 0.04) 100%);
          box-shadow: inset 0 1px 2px rgba(29, 112, 162, 0.1);
        }
      `}</style>
    </motion.div>
  );
}
