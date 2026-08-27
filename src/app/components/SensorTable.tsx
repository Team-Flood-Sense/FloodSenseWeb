import { motion } from 'motion/react';
import { Droplets, Waves, Wind, Thermometer, Battery, BatteryLow, BatteryMedium, BatteryFull } from 'lucide-react';

interface Sensor {
  id: string;
  name: string;
  type: 'water' | 'rainfall' | 'wind' | 'temperature';
  location: string;
  status: 'online' | 'warning' | 'offline';
  reading: string;
  battery: number;
  lastSync: string;
}

const sensorData: Sensor[] = [
  {
    id: '001',
    name: 'Water Level Sensor 001',
    type: 'water',
    location: 'District A - River Bridge',
    status: 'online',
    reading: '0.6m',
    battery: 95,
    lastSync: '2 min ago',
  },
  {
    id: '002',
    name: 'Rainfall Monitor 045',
    type: 'rainfall',
    location: 'District B - Central Park',
    status: 'online',
    reading: '27.8 mm/hr',
    battery: 78,
    lastSync: '1 min ago',
  },
  {
    id: '003',
    name: 'Water Level Sensor 012',
    type: 'water',
    location: 'District C - Dam Site',
    status: 'warning',
    reading: '1.2m',
    battery: 45,
    lastSync: '5 min ago',
  },
  {
    id: '004',
    name: 'Wind Speed Monitor 028',
    type: 'wind',
    location: 'District A - Hilltop',
    status: 'online',
    reading: '12 km/h',
    battery: 88,
    lastSync: '3 min ago',
  },
  {
    id: '005',
    name: 'Temperature Sensor 056',
    type: 'temperature',
    location: 'District D - Industrial Zone',
    status: 'offline',
    reading: '--',
    battery: 12,
    lastSync: '2 hours ago',
  },
  {
    id: '006',
    name: 'Rainfall Monitor 067',
    type: 'rainfall',
    location: 'District B - Airport',
    status: 'online',
    reading: '18.4 mm/hr',
    battery: 92,
    lastSync: '1 min ago',
  },
];

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

export function SensorTable() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="relative bg-white/80 backdrop-blur-xl overflow-hidden"
      style={{
        borderRadius: '28px',
        boxShadow: '0 8px 32px rgba(11, 60, 93, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.6)',
      }}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" style={{ borderRadius: '28px' }} />
      
      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="p-6 border-b border-[#0B3C5D]/10">
          <h3 className="text-[#0B3C5D] text-xl" style={{ fontWeight: 700 }}>
            Sensor Network
          </h3>
          <p className="text-[#0B3C5D]/60 text-sm mt-1">
            Real-time monitoring across all stations
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '480px' }}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0B3C5D]/10">
                <th className="text-left px-6 py-4 text-[#0B3C5D]/70 text-sm" style={{ fontWeight: 600 }}>
                  Sensor Name
                </th>
                <th className="text-left px-6 py-4 text-[#0B3C5D]/70 text-sm" style={{ fontWeight: 600 }}>
                  Location
                </th>
                <th className="text-left px-6 py-4 text-[#0B3C5D]/70 text-sm" style={{ fontWeight: 600 }}>
                  Status
                </th>
                <th className="text-left px-6 py-4 text-[#0B3C5D]/70 text-sm" style={{ fontWeight: 600 }}>
                  Current Reading
                </th>
                <th className="text-left px-6 py-4 text-[#0B3C5D]/70 text-sm" style={{ fontWeight: 600 }}>
                  Battery Health
                </th>
                <th className="text-left px-6 py-4 text-[#0B3C5D]/70 text-sm" style={{ fontWeight: 600 }}>
                  Last Sync
                </th>
              </tr>
            </thead>
            <tbody>
              {sensorData.map((sensor, index) => {
                const SensorIcon = getSensorIcon(sensor.type);
                const BatteryIcon = getBatteryIcon(sensor.battery);
                const batteryColor = getBatteryColor(sensor.battery);
                
                return (
                  <motion.tr
                    key={sensor.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                    className="border-b border-[#0B3C5D]/5 hover-row group"
                    style={{
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="p-2 rounded-xl"
                          style={{
                            background: 'linear-gradient(135deg, rgba(11, 60, 93, 0.08) 0%, rgba(11, 60, 93, 0.04) 100%)',
                            boxShadow: '0 2px 8px rgba(11, 60, 93, 0.05), inset 0 1px 2px rgba(255, 255, 255, 0.8)',
                          }}
                        >
                          <SensorIcon className="text-[#0B3C5D]" size={18} strokeWidth={2.5} />
                        </div>
                        <span className="text-[#0B3C5D] text-sm" style={{ fontWeight: 600 }}>
                          {sensor.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#0B3C5D]/70 text-sm">
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
                            : 'rgba(255, 107, 53, 0.1)',
                          border: sensor.status === 'online'
                            ? '1px solid rgba(46, 196, 182, 0.3)'
                            : sensor.status === 'warning'
                            ? '1px solid rgba(255, 184, 77, 0.3)'
                            : '1px solid rgba(255, 107, 53, 0.3)',
                          boxShadow: sensor.status === 'online'
                            ? '0 0 12px rgba(46, 196, 182, 0.2)'
                            : sensor.status === 'warning'
                            ? '0 0 12px rgba(255, 184, 77, 0.2)'
                            : '0 0 12px rgba(255, 107, 53, 0.2)',
                        }}
                      >
                        <div 
                          className="w-2 h-2 rounded-full animate-pulse"
                          style={{
                            background: sensor.status === 'online'
                              ? '#2EC4B6'
                              : sensor.status === 'warning'
                              ? '#FFB84D'
                              : '#FF6B35',
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
                              : '#FF6B35',
                          }}
                        >
                          {sensor.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#0B3C5D] text-sm" style={{ fontWeight: 600 }}>
                        {sensor.reading}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="relative p-1.5 rounded-lg"
                          style={{
                            background: `linear-gradient(135deg, ${batteryColor}15 0%, ${batteryColor}08 100%)`,
                            boxShadow: `0 2px 8px ${batteryColor}20, inset 0 1px 2px rgba(255, 255, 255, 0.8)`,
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
                            {sensor.battery}%
                          </span>
                          <div 
                            className="w-16 h-1 rounded-full overflow-hidden"
                            style={{ background: 'rgba(11, 60, 93, 0.1)' }}
                          >
                            <div 
                              className="h-full rounded-full"
                              style={{ 
                                width: `${sensor.battery}%`,
                                background: batteryColor,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#0B3C5D]/60 text-sm">
                        {sensor.lastSync}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .hover-row {
          cursor: pointer;
        }
        .hover-row:hover {
          background: linear-gradient(90deg, rgba(29, 112, 162, 0.04) 0%, rgba(29, 112, 162, 0.08) 50%, rgba(29, 112, 162, 0.04) 100%);
          box-shadow: inset 0 1px 2px rgba(29, 112, 162, 0.1);
        }
      `}</style>
    </motion.div>
  );
}
