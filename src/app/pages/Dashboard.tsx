import { useState } from 'react';
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
  // The sensor shown in the Water Level and Forecast cards: the one clicked on the map, else the first
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sensors.find((s) => s.id === selectedId) ?? sensors.find((s) => s.type === 'water') ?? null;
  const water = selected && selected.status !== 'offline' && selected.value !== null ? selected : null;
  const forecast = useFloodForecast(selected);
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
          title={selected ? `Water Level · ${selected.name}` : 'Water Level'}
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
          <GeospatialMonitor sensors={sensors} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
        </div>
        <div>
          <QuickActionsPanel />
        </div>
      </div>
    </div>
  );
}
