// Copy this file to secrets.h (same folder) and fill it in. secrets.h is git-ignored.
#pragma once

#define WIFI_SSID "your-wifi-name"          // 2.4 GHz network; ESP boards can't use 5 GHz
#define WIFI_PASSWORD "your-wifi-password"

#define SUPABASE_URL "https://bgnqqjaipcckqgzzdtxy.supabase.co"
#define SUPABASE_PUBLISHABLE_KEY "sb_publishable_..."   // same key as VITE_SUPABASE_PUBLISHABLE_KEY

// Run in the Supabase SQL Editor:  select ingest_key from public.sensor_settings;
#define DEVICE_KEY "paste-the-ingest_key-here"

// Shown on the website; letters, numbers, - and _ only. Matches your existing sensor_id_01.
#define SENSOR_ID "sensor_id_01"
