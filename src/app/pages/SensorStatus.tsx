import { Radio, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { SensorTable } from '../components/SensorTable';
import { useSensors } from '../hooks/useSensors';

export function SensorStatus() {
  const { sensors: sensorData, error } = useSensors();
  // Counts come from the same data as the table so they always agree
  const count = (status: string) => sensorData.filter((s) => s.status === status).length;

  return (
    <div className="flex-1 space-y-6">
      {/* Top Stats Row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          icon={Radio}
          label="Total Sensors"
          value={sensorData.length}
          iconColor="#0B3C5D"
          iconBg="rgba(11, 60, 93, 0.1)"
        />
        <StatCard
          icon={CheckCircle}
          label="Online"
          value={count('online')}
          valueColor="#2EC4B6"
          iconColor="#2EC4B6"
          iconBg="rgba(46, 196, 182, 0.1)"
        />
        <StatCard
          icon={AlertTriangle}
          label="Warning"
          value={count('warning')}
          valueColor="#FF6B35"
          iconColor="#FF6B35"
          iconBg="rgba(255, 107, 53, 0.1)"
        />
        <StatCard
          icon={XCircle}
          label="Offline"
          value={count('offline')}
          valueColor="#DC2626"
          iconColor="#DC2626"
          iconBg="rgba(220, 38, 38, 0.1)"
        />
      </div>

      {/* Main Table */}
      <SensorTable sensors={sensorData} error={error} />
    </div>
  );
}
