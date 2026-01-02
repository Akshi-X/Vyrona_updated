from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Dict, Any
from decimal import Decimal
from collections import defaultdict

from ...models.IVF.hospital_model import Hospital
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.tank_model import Tank
from ...models.IVF.canister_model import Canister
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.cane_model import Cane
from ...models.IVF.cryolock_model import Cryolock
from ...models.IVF.patient_model import IVFPatient
from ...models.IVF.embryo_model import Embryo
from ...constants.enums import CanisterStatus


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
                    "states": {},
                    "highest_branch_count_country": None
                }
            
            # Get hospital info from first branch (assuming all branches belong to same hospital)
            hospital = branches[0].hospital
            
            # Group branches by state
            states_dict = defaultdict(list)
            # Track branch counts by country
            country_branch_counts = defaultdict(int)
            
            for branch in branches:
                # Convert Decimal to float for JSON serialization
                latitude = float(branch.latitude) if branch.latitude is not None else None
                longitude = float(branch.longitude) if branch.longitude is not None else None
                
                # Calculate branch status based on canister statuses
                # Get all active canisters for this branch through tanks
                branch_status = self._calculate_branch_status(branch.branch_id)
                
                branch_data = {
                    "branch_name": branch.branch_name,
                    "branch_status": branch_status,
                    "country_name": branch.country_name,
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
                
                # Count branches by country using country_name from model
                country = branch.country_name or "Unknown"
                country_branch_counts[country] += 1
            
            # Convert defaultdict to regular dict for JSON serialization
            states_dict = dict(states_dict)
            
            # Find country with highest branch count
            highest_branch_count_country = None
            if country_branch_counts:
                highest_branch_count_country = max(
                    country_branch_counts.items(),
                    key=lambda x: x[1]
                )[0]
            
            return {
                "hospitalName": hospital.hospital_name,
                "hospital_type": hospital.hospital_type,
                "states": states_dict,
                "highest_branch_count_country": highest_branch_count_country
            }
            
        except Exception as e:
            raise Exception(f"Error fetching IVF control tower map locations: {str(e)}")
    
    def get_active_canisters(self) -> Dict[str, Any]:
        """
        Get active canisters grouped by branch with their status and last updated time.
        
        Returns:
            Dictionary containing:
            - branches: List of branches with their canisters:
                - branch_id: Branch ID
                - branch_name: Branch name
                - canisters: List of active canisters with:
                    - canister_id: Canister ID
                    - canister_status: Status (safe, risk, critical)
                    - updated_at: Last updated date and time from canister log opened_at (if available),
                                  otherwise from canisters table created_at
            - total: Total number of active canisters across all branches
        """
        try:
            # Query active canisters with branch information
            active_canisters = (
                self.db.query(Canister)
                .join(Tank)
                .join(HospitalBranch)
                .filter(Canister.is_active == True)
                .all()
            )
            
            # Group canisters by branch
            branches_dict = defaultdict(lambda: {
                "branch_id": None,
                "branch_name": None,
                "canisters": []
            })
            
            total_canisters = 0
            
            for canister in active_canisters:
                # Get branch information from tank
                branch = canister.tank.branch
                branch_id = branch.branch_id
                branch_name = branch.branch_name or "Unknown"
                
                # Initialize branch if not already in dict
                if branches_dict[branch_id]["branch_id"] is None:
                    branches_dict[branch_id]["branch_id"] = branch_id
                    branches_dict[branch_id]["branch_name"] = branch_name
                
                # Get the most recent log entry with opened_at for this canister
                # If opened_at exists in log, use it; otherwise use created_at from canisters table
                latest_log_with_opened = (
                    self.db.query(CanisterLn2Log)
                    .filter(
                        CanisterLn2Log.canister_id == canister.canister_id,
                        CanisterLn2Log.opened_at.isnot(None)
                    )
                    .order_by(desc(CanisterLn2Log.opened_at))
                    .first()
                )
                
                # Use opened_at from log if available, otherwise use created_at from canisters table
                if latest_log_with_opened:
                    updated_at = latest_log_with_opened.opened_at
                else:
                    # Fallback to created_at from the canisters table (not from log table)
                    updated_at = canister.created_at
                
                canister_data = {
                    "canister_id": canister.canister_id,
                    "canister_status": canister.canister_status.value if canister.canister_status else "safe",
                    "updated_at": updated_at
                }
                
                branches_dict[branch_id]["canisters"].append(canister_data)
                total_canisters += 1
            
            # Convert to list and sort by branch name
            branches_list = sorted(
                list(branches_dict.values()),
                key=lambda x: x["branch_name"]
            )
            
            return {
                "branches": branches_list,
                "total": total_canisters
            }
            
        except Exception as e:
            raise Exception(f"Error fetching active canisters: {str(e)}")
    
    def _calculate_branch_status(self, branch_id: int) -> str:
        """
        Calculate branch status based on canister statuses.
        
        Logic:
        - If any active canister is "critical" -> branch status = "critical"
        - Else if any active canister is "risk" -> branch status = "risk"
        - Else -> branch status = "safe"
        - If no active canisters -> default to "safe"
        
        Args:
            branch_id: The branch ID to calculate status for
            
        Returns:
            Branch status string: "critical", "risk", or "safe"
        """
        try:
            # Get all active canisters for this branch through tanks
            active_canisters = self.db.query(Canister).join(Tank).filter(
                Tank.branch_id == branch_id,
                Canister.is_active == True
            ).all()
            
            # If no active canisters, default to safe
            if not active_canisters:
                return "safe"
            
            # Check for critical status (highest priority)
            for canister in active_canisters:
                if canister.canister_status == CanisterStatus.CRITICAL:
                    return "critical"
            
            # Check for risk status
            for canister in active_canisters:
                if canister.canister_status == CanisterStatus.RISK:
                    return "risk"
            
            # All canisters are safe
            return "safe"
            
        except Exception as e:
            # If there's an error calculating status, default to safe
            return "safe"
    
    def get_embryo_tracking(self) -> Dict[str, Any]:
        """
        Get embryo tracking data grouped by cryolock.
        Returns data in the format matching the table structure.
        
        Returns:
            Dictionary containing:
            - data: List of tracking records with:
                - his_number: Patient HIS Number
                - cryolock_number: Cryolock Number
                - canister_number: Canister Number
                - tank_id: Tank ID (formatted as "Tank {tank_id}" or tank_code)
                - cane_id: Cane ID (formatted as cane_code or "Cane-{cane_id}")
                - goblet_color: Goblet Color
                - cryolock_color: Cryolock Color
                - date_of_vitrification: Date of Vitrification
                - embryo_grading: Comma-separated embryo gradings
            - total: Total number of records
        """
        try:
            # Query embryos with all related data
            # Join: Embryo -> Patient, Cryolock -> Cane -> Canister -> Tank
            query = (
                self.db.query(
                    IVFPatient.his_number,
                    Cryolock.cryolock_number,
                    Canister.canister_number,
                    Tank.tank_id,
                    Tank.tank_code,
                    Cane.cane_id,
                    Cane.cane_code,
                    Cane.goblet_color,
                    Cryolock.cryolock_color,
                    Embryo.date_of_vitrification,
                    func.string_agg(
                        func.coalesce(Embryo.embryo_grading, ''), 
                        ', '
                    ).label('embryo_grading')
                )
                .join(Cryolock, Embryo.cryolock_id == Cryolock.cryolock_id)
                .join(IVFPatient, Embryo.patient_id == IVFPatient.patient_id)
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .filter(Embryo.is_active == True)
                .group_by(
                    IVFPatient.his_number,
                    Cryolock.cryolock_id,
                    Cryolock.cryolock_number,
                    Canister.canister_number,
                    Tank.tank_id,
                    Tank.tank_code,
                    Cane.cane_id,
                    Cane.cane_code,
                    Cane.goblet_color,
                    Cryolock.cryolock_color,
                    Embryo.date_of_vitrification
                )
                .order_by(IVFPatient.his_number, Cryolock.cryolock_number)
            )
            
            results = query.all()
            
            tracking_list = []
            
            for row in results:
                # Format tank_id: use tank_code if available, otherwise "Tank {tank_id}"
                tank_display = row.tank_code if row.tank_code else f"Tank {row.tank_id}"
                
                # Format cane_id: use cane_code if available, otherwise format as "Cane-{cane_id}"
                cane_display = row.cane_code if row.cane_code else f"Cane-{row.cane_id}"
                
                tracking_data = {
                    "his_number": row.his_number or "",
                    "cryolock_number": row.cryolock_number or "",
                    "canister_number": row.canister_number,
                    "tank_id": tank_display,
                    "cane_id": cane_display,
                    "goblet_color": row.goblet_color or "",
                    "cryolock_color": row.cryolock_color or "",
                    "date_of_vitrification": row.date_of_vitrification,
                    "embryo_grading": row.embryo_grading or ""
                }
                
                tracking_list.append(tracking_data)
            
            return {
                "data": tracking_list,
                "total": len(tracking_list)
            }
            
        except Exception as e:
            raise Exception(f"Error fetching embryo tracking data: {str(e)}")

