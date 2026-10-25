import { Droplets, Shield, TrendingUp } from 'lucide-react';
import { MetricCard } from '../components/MetricCard';
import { GeospatialMonitor } from '../components/GeospatialMonitor';
import { QuickActionsPanel } from '../components/QuickActionsPanel';
import { WelcomeBanner } from '../components/WelcomeBanner';
import { useSensors } from '../hooks/useSensors';
import { useFloodForecast } from '../hooks/useFloodForecast';

export function Dashboard() {
  const { sensors, loading } = useSensors();

  // Overall status from the sensors: any warning wins, then all-offline, otherwise optimal
  const system =
    loading || sensors.length === 0
      ? { label: 'No sensors', accent: '#94A3B8' }
      : sensors.some((s) => s.status === 'warning')
        ? { label: 'Warning', accent: '#FF6B35' }
        : sensors.every((s) => s.status === 'offline')
          ? { label: 'Offline', accent: '#DC2626' }
          : { label: 'Optimal', accent: '#2EC4B6' };
  // Highest reading among water-level sensors that are currently reporting
  const live = sensors.filter((s) => s.type === 'water' && s.status !== 'offline' && s.value !== null);
  const water = live.length ? live.reduce((a, b) => ((b.value ?? 0) > (a.value ?? 0) ? b : a)) : null;
  const forecast = useFloodForecast(water);
  const forecastAccent = { ok: '#2EC4B6', warn: '#FFB84D', danger: '#FF6B35', none: '#94A3B8' };

  return (
    <div className="flex-1 space-y-6 pb-2">
      <WelcomeBanner />

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        <MetricCard
          icon={TrendingUp}
          title="Flood Forecast"
          value={forecast.value}
          unit={forecast.unit}
          accent={forecastAccent[forecast.tone]}
        />
        <MetricCard
          icon={Droplets}
          title="Water Level"
          value={water ? String(water.value) : '—'}
          unit={water ? water.unit : undefined}
          showWaveAnimation={true}
          accent="#0EA5E9"
        />
        <MetricCard
          icon={Shield}
          title="System Status"
          value={system.label}
          showGlow={system.label === 'Optimal'}
          accent={system.accent}
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
