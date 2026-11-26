// Pretends to be several sensors reporting at the same moment, to check that none of the readings
// are lost or slowed down. It calls the same database function as the real firmware.
//
//   node --env-file=.env scripts/sensor-load-test.mjs --key=<ingest_key>
//
// Options: --sensors=3  --rounds=30  --interval=2000 (ms between rounds)  --peak=25 (cm)
// Get the key in the Supabase SQL Editor:  select ingest_key from public.sensor_settings;
//
// The readings are saved like real ones: the test sensors (loadtest_01, ...) show up on the
// website and in Analytics. Remove them afterwards in the SQL Editor:
//   delete from public.sensors where id like 'loadtest\_%';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const url = process.env.VITE_SUPABASE_URL;
const apikey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const key = args.key ?? process.env.DEVICE_KEY;
const sensors = Number(args.sensors ?? 3);
const rounds = Number(args.rounds ?? 30);
const interval = Number(args.interval ?? 2000);
// Below the 1 ft (30.48 cm) warning level by default, so the dashboard doesn't show a flood
const peak = Number(args.peak ?? 25);

if (!url || !apikey || !key) {
  console.error('Need VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (--env-file=.env) and --key=<ingest_key>.');
  process.exit(1);
}
if (![sensors, rounds, interval, peak].every(Number.isFinite) || sensors < 1 || rounds < 1) {
  console.error('--sensors, --rounds, --interval and --peak must be numbers.');
  process.exit(1);
}

const ids = Array.from({ length: sensors }, (_, i) => `loadtest_${String(i + 1).padStart(2, '0')}`);
const times = [];
const failures = [];

async function send(id, value) {
  const started = performance.now();
  try {
    const res = await fetch(`${url}/rest/v1/rpc/report_sensor_reading`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey },
      body: JSON.stringify({ p_key: key, p_sensor_id: id, p_value: value }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) failures.push(`${id}: HTTP ${res.status} ${await res.text()}`);
    else times.push(performance.now() - started);
  } catch (err) {
    failures.push(`${id}: ${err.message}`);
  }
}

console.log(`${sensors} sensors, ${rounds} rounds, ${interval} ms apart`);
for (let r = 0; r < rounds; r++) {
  const value = Number(((peak * (r + 1)) / rounds).toFixed(1));
  const before = failures.length;
  await Promise.all(ids.map((id) => send(id, value))); // all at the same moment
  console.log(`round ${r + 1}/${rounds}: ${sensors - (failures.length - before)}/${sensors} accepted`);
  if (r < rounds - 1) await new Promise((resolve) => setTimeout(resolve, interval));
}

times.sort((a, b) => a - b);
const at = (p) => (times.length ? Math.round(times[Math.min(times.length - 1, Math.floor(p * times.length))]) : 0);
console.log(`\nSent ${sensors * rounds}, accepted ${times.length}, failed ${failures.length}`);
console.log(`Response time (ms): median ${at(0.5)}, 95% under ${at(0.95)}, slowest ${at(1)}`);
if (failures.length) {
  console.log('First failures:');
  failures.slice(0, 5).forEach((f) => console.log('  ' + f));
  process.exitCode = 1;
}
