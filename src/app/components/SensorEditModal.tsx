import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEscape } from '@/app/hooks/useEscape';
import type { Sensor } from '../hooks/useSensors';

const inputClass = 'w-full bg-ink/5 border border-ink/10 rounded-xl px-3 py-2.5 text-ink text-sm outline-none focus:border-ink/30';

/** Rename a sensor and set where it is. The device ID the hardware sends never changes. */
export function SensorEditModal({ sensor, onClose }: { sensor: Sensor; onClose: () => void }) {
  const [name, setName] = useState(sensor.name);
  const [location, setLocation] = useState(sensor.location);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEscape(true, onClose);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !location.trim()) {
      setError('Enter both a name and a location.');
      return;
    }
    setSaving(true);
    // select() returns the changed rows, so a blocked update isn't reported as saved
    const { data, error: err } = await supabase
      .from('sensors')
      .update({ name: name.trim(), location: location.trim() })
      .eq('id', sensor.id)
      .select('id');
    setSaving(false);
    if (err || !data?.length) {
      setError('Could not save the changes. Please try again.');
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={save}
        role="dialog" aria-modal="true" aria-label="Edit sensor"
        className="relative w-full max-w-md p-5 sm:p-8 space-y-4"
        style={{ background: 'rgb(var(--surface-rgb))', borderRadius: '28px', boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.25)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>Edit sensor</h3>
            <p className="text-ink/50 text-sm">Device ID: {sensor.id}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 rounded-xl bg-ink/5">
            <X className="text-ink/60" size={18} />
          </button>
        </div>
        <label className="block text-ink text-sm space-y-1.5" style={{ fontWeight: 600 }}>
          <span>Sensor name</span>
          <input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zapote Creek Sensor 1" />
        </label>
        <label className="block text-ink text-sm space-y-1.5" style={{ fontWeight: 600 }}>
          <span>Location</span>
          <input className={inputClass} value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} />
        </label>
        {error && <p className="text-sm" style={{ color: '#ef4444' }}>⚠ {error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm text-ink bg-ink/5" style={{ fontWeight: 600 }}>Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-3 rounded-2xl text-sm text-white disabled:opacity-60" style={{ fontWeight: 600, background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
