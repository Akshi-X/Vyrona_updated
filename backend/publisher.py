import time
import json
import random
import redis
import sys
import os

# Add the backend directory to the path to import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config.database import SessionLocal
from app.models.patient_model import Patient

# Connect to Redis
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

# Get patient IDs from the database
def get_patient_ids_from_db():
    """Fetch all patient IDs from the patient table"""
    db = SessionLocal()
    try:
        patients = db.query(Patient.id).all()
        patient_ids = [patient[0] for patient in patients]
        return patient_ids
    except Exception as e:
        print(f"Error fetching patients from database: {e}")
        return []
    finally:
        db.close()

# Fetch patient IDs from database
PATIENTS = get_patient_ids_from_db()

if not PATIENTS:
    print("Warning: No patients found in the database. Publisher will not publish any data.")
    print("Please ensure there are patients in the patient table before running the publisher.")

# Parameter thresholds based on acceptable values from the dashboard
# Format: (min, max) or (min, None) for minimum only, or (None, max) for maximum only
PARAMETER_THRESHOLDS = {
    "temperature": {"min": 2, "max": 8, "unit": "°C"},  # acceptable range: 2°C - 8°C
    "humidity": {"min": None, "max": 90, "unit": "%"},  # acceptable range: ≤ 90%
    "ph_level": {"min": 6.5, "max": 8.5, "unit": ""},  # acceptable range: 6.5 - 8.5
    "o2_level": {"min": 19, "max": None, "unit": "%"},  # acceptable range: ≥ 19%
    "co2_level": {"min": None, "max": 5, "unit": "%"},  # acceptable range: ≤ 5%
    "agitation": {"min": 45, "max": 65, "unit": "%"},  # acceptable range: 45% - 65%
}

# Probability of generating a threshold violation (10% chance)
THRESHOLD_VIOLATION_PROBABILITY = 0.1

print("Starting quality data publisher for multiple patients...")
if PATIENTS:
    print(f"Publishing data for {len(PATIENTS)} patient(s): {', '.join(PATIENTS)}")
else:
    print("No patients found in database. Exiting...")
    sys.exit(1)
print("Press Ctrl+C to stop\n")

def check_threshold(parameter_name: str, value: float) -> bool:
    """Check if a parameter value is within threshold"""
    threshold = PARAMETER_THRESHOLDS[parameter_name]
    min_val = threshold["min"]
    max_val = threshold["max"]
    
    if min_val is not None and value < min_val:
        return False
    if max_val is not None and value > max_val:
        return False
    return True

def generate_value_with_violation(parameter_name: str, violation_type: str = None) -> float:
    """Generate a parameter value, optionally with threshold violation"""
    threshold = PARAMETER_THRESHOLDS[parameter_name]
    min_val = threshold["min"]
    max_val = threshold["max"]
    
    # Generate value outside threshold if violation requested
    if violation_type == "below_min" and min_val is not None:
        # Generate value below minimum (10% to 50% below)
        return round(random.uniform(min_val * 0.5, min_val * 0.9), 1)
    elif violation_type == "above_max" and max_val is not None:
        # Generate value above maximum (10% to 50% above)
        return round(random.uniform(max_val * 1.1, max_val * 1.5), 1)
    else:
        # Generate normal value within range
        if min_val is not None and max_val is not None:
            return round(random.uniform(min_val, max_val), 1)
        elif min_val is not None:
            # Only minimum, generate slightly above min
            return round(random.uniform(min_val, min_val * 1.5), 1)
        elif max_val is not None:
            # Only maximum, generate slightly below max
            return round(random.uniform(max_val * 0.5, max_val), 1)
        else:
            # No threshold, generate random value
            return round(random.uniform(0, 100), 1)

try:
    while True:
        # Generate data for each patient
        for patient_id in PATIENTS:
            # Decide if we should generate a threshold violation
            should_violate = random.random() < THRESHOLD_VIOLATION_PROBABILITY
            violation_param = None
            violation_type = None
            
            if should_violate:
                # Randomly select a parameter to violate
                violation_param = random.choice(list(PARAMETER_THRESHOLDS.keys()))
                threshold = PARAMETER_THRESHOLDS[violation_param]
                # Randomly choose to violate min or max (if both exist)
                if threshold["min"] is not None and threshold["max"] is not None:
                    violation_type = random.choice(["below_min", "above_max"])
                elif threshold["min"] is not None:
                    violation_type = "below_min"
                elif threshold["max"] is not None:
                    violation_type = "above_max"
            
            # Generate parameter values
            parameters = {}
            threshold_violations = {}
            violated_parameters = []
            
            for param_name in PARAMETER_THRESHOLDS.keys():
                if param_name == violation_param:
                    value = generate_value_with_violation(param_name, violation_type)
                else:
                    value = generate_value_with_violation(param_name)
                
                parameters[param_name] = value
                
                # Check if value is within threshold
                is_within_threshold = check_threshold(param_name, value)
                threshold_violations[param_name] = not is_within_threshold
                
                if not is_within_threshold:
                    violated_parameters.append(param_name)
            
            # Build threshold information
            thresholds = {}
            for param_name, threshold_config in PARAMETER_THRESHOLDS.items():
                thresholds[param_name] = {
                    "min": threshold_config["min"],
                    "max": threshold_config["max"],
                    "unit": threshold_config["unit"]
                }
            
            # Build complete data structure
            data = {
                "patient_id": patient_id,
                "temperature": parameters["temperature"],
                "humidity": parameters["humidity"],
                "ph_level": parameters["ph_level"],
                "o2_level": parameters["o2_level"],
                "co2_level": parameters["co2_level"],
                "agitation": parameters["agitation"],
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "thresholds": thresholds,
                "threshold_violations": threshold_violations,
                "violated_parameters": violated_parameters
            }
            
            # Publish to Redis Pub/Sub channel
            r.publish('quality_channel', json.dumps(data))
            
            # Store in patient-specific history list
            history_key = f'quality_history:{patient_id}'
            r.lpush(history_key, json.dumps(data))
            r.ltrim(history_key, 0, 9)  # Keep only last 10 values
            
            # Store patient ID in a set to track all patients
            r.sadd('patients', patient_id)
        
        time.sleep(1)  # Update every 1 second
        
except KeyboardInterrupt:
    print("\nPublisher stopped.")

