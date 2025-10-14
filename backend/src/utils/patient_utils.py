from sqlalchemy.orm import Session
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models.patient_model import Patient


def generate_patient_id(db: Session) -> str:
    """
    Generate patient ID in format PT-ddmmyy001
    
    Args:
        db: Database session
        
    Returns:
        str: Generated patient ID in format PT-ddmmyy001
    """
    # Get current date
    now = datetime.now()
    date_prefix = now.strftime("%d%m%y")  # ddmmyy format
    
    # Find the highest sequence number for today
    today_prefix = f"PT{date_prefix}-"
    
    # Import here to avoid circular imports
    from ..models.patient_model import Patient
    
    # Query for existing patients with today's prefix
    existing_patients = db.query(Patient).filter(
        Patient.id.like(f"{today_prefix}%")
    ).all()
    
    # Extract sequence numbers and find the highest
    sequence_numbers = []
    for patient in existing_patients:
        try:
            # Extract the sequence part (last 3 digits)
            sequence_part = patient.id[-3:]
            sequence_numbers.append(int(sequence_part))
        except (ValueError, IndexError):
            # Skip invalid IDs
            continue
    
    # Get next sequence number
    if sequence_numbers:
        next_sequence = max(sequence_numbers) + 1
    else:
        next_sequence = 1
    
    # Format sequence number with leading zeros
    sequence_str = f"{next_sequence:03d}"
    
    # Generate final ID
    patient_id = f"{today_prefix}{sequence_str}"
    
    return patient_id
