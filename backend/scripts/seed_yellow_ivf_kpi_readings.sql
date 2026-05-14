-- Seed KPI readings for Yellow IVF tank (hospital_id=3, branch_id=5, tank_id=17).
-- KPI config ids: 154 temp_internal, 155 temp_external, 156 ln2_level, 157 ln2_evaporation_rate,
--                158 shock, 159 tive_battery_percentage, 160 ln2_lid_state.
-- Inserts 5 snapshots (every 15 min); values within config min/max where applicable.
-- Run: psql ... -f scripts/seed_yellow_ivf_kpi_readings.sql

-- Snapshot 1 (base time)
INSERT INTO readings (hospital_id, branch_id, device_id, tank_id, kpi_config_id, kpi_value, timestamp, deviation, deviation_alert_sent)
VALUES
  (3, 5, NULL, 17, 154, -195.5, NOW() - INTERVAL '1 hour', false, false),
  (3, 5, NULL, 17, 155, 25.2,  NOW() - INTERVAL '1 hour', false, false),
  (3, 5, NULL, 17, 156, 62.0, NOW() - INTERVAL '1 hour', false, false),
  (3, 5, NULL, 17, 157, 0.058, NOW() - INTERVAL '1 hour', false, false),
  (3, 5, NULL, 17, 158, 0,    NOW() - INTERVAL '1 hour', false, false),
  (3, 5, NULL, 17, 159, 88,   NOW() - INTERVAL '1 hour', false, false),
  (3, 5, NULL, 17, 160, 0,    NOW() - INTERVAL '1 hour', false, false);

-- Snapshot 2 (+15 min)
INSERT INTO readings (hospital_id, branch_id, device_id, tank_id, kpi_config_id, kpi_value, timestamp, deviation, deviation_alert_sent)
VALUES
  (3, 5, NULL, 17, 154, -196.0, NOW() - INTERVAL '45 minutes', false, false),
  (3, 5, NULL, 17, 155, 25.8,  NOW() - INTERVAL '45 minutes', false, false),
  (3, 5, NULL, 17, 156, 60.0, NOW() - INTERVAL '45 minutes', false, false),
  (3, 5, NULL, 17, 157, 0.061, NOW() - INTERVAL '45 minutes', false, false),
  (3, 5, NULL, 17, 158, 0,    NOW() - INTERVAL '45 minutes', false, false),
  (3, 5, NULL, 17, 159, 86,   NOW() - INTERVAL '45 minutes', false, false),
  (3, 5, NULL, 17, 160, 0,    NOW() - INTERVAL '45 minutes', false, false);

-- Snapshot 3 (+30 min)
INSERT INTO readings (hospital_id, branch_id, device_id, tank_id, kpi_config_id, kpi_value, timestamp, deviation, deviation_alert_sent)
VALUES
  (3, 5, NULL, 17, 154, -194.8, NOW() - INTERVAL '30 minutes', false, false),
  (3, 5, NULL, 17, 155, 26.1,  NOW() - INTERVAL '30 minutes', false, false),
  (3, 5, NULL, 17, 156, 58.5, NOW() - INTERVAL '30 minutes', false, false),
  (3, 5, NULL, 17, 157, 0.062, NOW() - INTERVAL '30 minutes', false, false),
  (3, 5, NULL, 17, 158, 0,    NOW() - INTERVAL '30 minutes', false, false),
  (3, 5, NULL, 17, 159, 84,   NOW() - INTERVAL '30 minutes', false, false),
  (3, 5, NULL, 17, 160, 0,    NOW() - INTERVAL '30 minutes', false, false);

-- Snapshot 4 (+45 min)
INSERT INTO readings (hospital_id, branch_id, device_id, tank_id, kpi_config_id, kpi_value, timestamp, deviation, deviation_alert_sent)
VALUES
  (3, 5, NULL, 17, 154, -195.2, NOW() - INTERVAL '15 minutes', false, false),
  (3, 5, NULL, 17, 155, 26.4,  NOW() - INTERVAL '15 minutes', false, false),
  (3, 5, NULL, 17, 156, 56.0, NOW() - INTERVAL '15 minutes', false, false),
  (3, 5, NULL, 17, 157, 0.055, NOW() - INTERVAL '15 minutes', false, false),
  (3, 5, NULL, 17, 158, 0,    NOW() - INTERVAL '15 minutes', false, false),
  (3, 5, NULL, 17, 159, 82,   NOW() - INTERVAL '15 minutes', false, false),
  (3, 5, NULL, 17, 160, 0,    NOW() - INTERVAL '15 minutes', false, false);

-- Snapshot 5 (current)
INSERT INTO readings (hospital_id, branch_id, device_id, tank_id, kpi_config_id, kpi_value, timestamp, deviation, deviation_alert_sent)
VALUES
  (3, 5, NULL, 17, 154, -195.0, NOW(), false, false),
  (3, 5, NULL, 17, 155, 26.0,  NOW(), false, false),
  (3, 5, NULL, 17, 156, 55.0, NOW(), false, false),
  (3, 5, NULL, 17, 157, 0.059, NOW(), false, false),
  (3, 5, NULL, 17, 158, 0,    NOW(), false, false),
  (3, 5, NULL, 17, 159, 80,   NOW(), false, false),
  (3, 5, NULL, 17, 160, 0,    NOW(), false, false);
