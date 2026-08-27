import { Radio, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { SensorTable } from '../components/SensorTable';

export function SensorStatus() {
  return (
    <div className="flex-1 space-y-6">
      {/* Top Stats Row */}
      <div className="grid grid-cols-4 gap-6">
        <StatCard
          icon={Radio}
          label="Total Sensors"
          value={48}
          iconColor="#0B3C5D"
          iconBg="rgba(11, 60, 93, 0.1)"
        />
        <StatCard
          icon={CheckCircle}
          label="Online"
          value={42}
          valueColor="#2EC4B6"
          iconColor="#2EC4B6"
          iconBg="rgba(46, 196, 182, 0.1)"
        />
        <StatCard
          icon={AlertTriangle}
          label="Warning"
          value={4}
          valueColor="#FF6B35"
          iconColor="#FF6B35"
          iconBg="rgba(255, 107, 53, 0.1)"
        />
        <StatCard
          icon={XCircle}
          label="Offline"
          value={2}
          valueColor="#FF6B35"
          iconColor="#FF6B35"
          iconBg="rgba(255, 107, 53, 0.1)"
        />
      </div>

      {/* Main Table */}
      <SensorTable />
    </div>
  );
}
