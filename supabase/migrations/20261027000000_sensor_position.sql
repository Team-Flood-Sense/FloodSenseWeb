-- FloodSense: map position for each sensor
-- Staff (admin/operator) place a sensor by dragging its marker on the Dashboard map;
-- that saves lat/lng here (allowed by the existing "sensors: staff update" policy).
-- Safe to run more than once. Run after 20261024000000_sensors.sql.

alter table public.sensors
  add column if not exists lat double precision,
  add column if not exists lng double precision;
