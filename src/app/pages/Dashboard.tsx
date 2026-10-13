import { CloudRain, Droplets, Shield } from 'lucide-react';
import { MetricCard } from '../components/MetricCard';
import { GeospatialMonitor } from '../components/GeospatialMonitor';
import { QuickActionsPanel } from '../components/QuickActionsPanel';
import { WelcomeBanner } from '../components/WelcomeBanner';

export function Dashboard() {
  return (
    <div className="flex-1 space-y-6 pb-2">
      <WelcomeBanner />

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        <MetricCard
          icon={CloudRain}
          title="Rainfall Intensity"
          value="27.8"
          unit="mm/hr"
          accent="#3B82F6"
        />
        <MetricCard
          icon={Droplets}
          title="Water Level"
          value="0.6"
          unit="m"
          showWaveAnimation={true}
          accent="#0EA5E9"
        />
        <MetricCard
          icon={Shield}
          title="System Status"
          value="Optimal"
          showGlow={true}
          accent="#2EC4B6"
        />
      </div>

      {/* Main Monitor and Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <GeospatialMonitor />
        </div>
        <div>
          <QuickActionsPanel />
        </div>
      </div>
    </div>
  );
}
