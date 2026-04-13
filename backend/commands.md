

tive connect,
in tank table add tive id
and setup alert config 

-------------------------------

tanks -
capacity_liters | empty_weight_kg(tank_min_capacity_reading should be sync) | full_weight_kg(tank_max_capacity_reading should be sync) | static_evap_rate_l_per_day in tank

ln2_iot_device - 
 id | tank_id (SCHANGE) | device_id (SCHANGE) | tank_max_capacity_reading (SCHANGE)| tank_min_capacity_reading (SCHANGE)| closed_noise_margin_kg_per_h | open_rate_min_kg_per_h | refill_threshold_kg | window_minutes | window_min_points | consecutive_windows_for_state | spike_tolerance_kg | spike_max_duration_s | lid_weight_min_kg | lid_weight_max_kg | lid_confirm_stable_points | low_level_threshold_kg | low_level_consecutive_readings | canister_weight_kg | canister_tolerance_kg | product_change_max_kg | precaution_level_pct 



INSERT INTO devices (
    branch_id,
    device_code,
    created_at,
    updated_at
)
VALUES (
    23,                -- use correct branch_id
    'IOTPRADELT1',
    NOW(),
    NOW()
)
RETURNING id;


INSERT INTO ln2_iot_devices (
    tank_id,
    device_id,
    tank_max_capacity_reading,
    tank_min_capacity_reading,
    created_at,
    updated_at,
    closed_noise_margin_kg_per_h,
    open_rate_min_kg_per_h,
    refill_threshold_kg,
    window_minutes,
    window_min_points,
    consecutive_windows_for_state,
    spike_tolerance_kg,
    spike_max_duration_s,
    lid_weight_min_kg,
    lid_weight_max_kg,
    lid_confirm_stable_points,
    low_level_threshold_kg,
    low_level_consecutive_readings,
    canister_weight_kg,
    canister_tolerance_kg,
    product_change_max_kg,
    precaution_level_pct
)
SELECT
    91 AS tank_id,
    11 AS device_id,   -- 👈 use returned ID here
    tank_max_capacity_reading,
    tank_min_capacity_reading,
    NOW(),
    NOW(),
    closed_noise_margin_kg_per_h,
    open_rate_min_kg_per_h,
    refill_threshold_kg,
    window_minutes,
    window_min_points,
    consecutive_windows_for_state,
    spike_tolerance_kg,
    spike_max_duration_s,
    lid_weight_min_kg,
    lid_weight_max_kg,
    lid_confirm_stable_points,
    low_level_threshold_kg,
    low_level_consecutive_readings,
    canister_weight_kg,
    canister_tolerance_kg,
    product_change_max_kg,
    precaution_level_pct
FROM ln2_iot_devices
WHERE tank_id = 60;
-------------------------------

to check live for iot
SELECT * FROM ln2_iot_raw_data WHERE payload->>'deviceid' = 'IOTYELDELT1' ORDER BY created_at DESC LIMIT 1;

to check live for tive
SELECT * FROM ivf_telemetry_data where device_id = 'K1130549' ORDER BY created_at DESC LIMIT 1;





Calibration Command

UPDATE tanks
SET 
    full_weight_kg = 64.0000,
    updated_at = NOW()
WHERE tank_id = 92;

UPDATE ln2_iot_devices
SET 
    tank_max_capacity_reading = 64.0000,
    updated_at = NOW()
WHERE tank_id = 92;






to fix-conflict

1. backend % poetry run python fix-conflict/add_reservoir_weights_and_seed.py   