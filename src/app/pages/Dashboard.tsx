import { CloudRain, Droplets, Shield } from 'lucide-react';
import { MetricCard } from '../components/MetricCard';
import { GeospatialMonitor } from '../components/GeospatialMonitor';
import { QuickActionsPanel } from '../components/QuickActionsPanel';

export function Dashboard() {
  return (
    <div className="flex-1 space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-3 gap-6 items-stretch">
        <MetricCard
          icon={CloudRain}
          title="Rainfall Intensity"
          value="27.8"
          unit="mm/hr"
        />
        <MetricCard
          icon={Droplets}
          title="Water Level"
          value="0.6"
          unit="m"
          showWaveAnimation={true}
        />
        <MetricCard
          icon={Shield}
          title="System Status"
          value="Optimal"
          showGlow={true}
        />
      </div>

      {/* Main Monitor and Actions */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <GeospatialMonitor />
        </div>
        <div>
          <QuickActionsPanel />
        </div>
      </div>
    </div>
  );
}
