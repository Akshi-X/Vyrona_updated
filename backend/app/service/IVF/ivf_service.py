from sqlalchemy.orm import Session
from typing import List, Dict, Any
from decimal import Decimal
from collections import defaultdict

from ...models.IVF.hospital_model import Hospital
from ...models.IVF.hospital_branch_model import HospitalBranch


class IVFService:
    """Service for IVF control tower operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_control_tower_map_locations(self) -> Dict[str, Any]:
        """
        Get IVF control tower map locations with hospital and branch information.
        Returns data organized by states.
        
        Returns:
            Dictionary containing:
            - hospitalName: Hospital name
            - hospital_type: Hospital type
            - states: Dictionary with state names as keys and lists of branches as values
            Each branch includes:
            - branch_name: Branch name
            - address: Dictionary with area, district, pincode
            - geoLocation: Dictionary with latitude and longitude
        """
        try:
            # Query all hospital branches with their parent hospitals
            branches = self.db.query(HospitalBranch).join(Hospital).all()
            
            if not branches:
                # Return empty structure if no branches found
                return {
                    "hospitalName": "",
                    "hospital_type": None,
                    "states": {}
                }
            
            # Get hospital info from first branch (assuming all branches belong to same hospital)
            hospital = branches[0].hospital
            
            # Group branches by state
            states_dict = defaultdict(list)
            
            for branch in branches:
                # Convert Decimal to float for JSON serialization
                latitude = float(branch.latitude) if branch.latitude is not None else None
                longitude = float(branch.longitude) if branch.longitude is not None else None
                
                branch_data = {
                    "branch_name": branch.branch_name,
                    "branch_status": "safe",
                    "address": {
                        "area": branch.area,
                        "district": branch.district_name,
                        "pincode": branch.pincode
                    },
                    "geoLocation": {
                        "latitude": latitude,
                        "longitude": longitude
                    }
                }
                
                # Group by state name
                state_name = branch.state_name or "Unknown"
                states_dict[state_name].append(branch_data)
            
            # Convert defaultdict to regular dict for JSON serialization
            states_dict = dict(states_dict)
            
            return {
                "hospitalName": hospital.hospital_name,
                "hospital_type": hospital.hospital_type,
                "states": states_dict
            }
            
        except Exception as e:
            raise Exception(f"Error fetching IVF control tower map locations: {str(e)}")

