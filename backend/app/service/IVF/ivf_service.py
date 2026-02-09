from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_
from typing import Dict, Any, Optional
from collections import defaultdict
from datetime import date
import logging

from ...models.IVF.hospital_model import Hospital
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.tank_model import Tank
from ...models.IVF.patient_crylock_info_model import PatientCrylockInfo
from ...models.IVF.ivf_shipment_model import IVFShipment
from ...constants.enums import CanisterStatus

logger = logging.getLogger(__name__)

class IVFService:
    """Service for IVF control tower operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_control_tower_map_locations(self, branch_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get IVF control tower map locations with hospital and branch information.
        Returns data organized by states.
        
        Args:
            branch_id: Optional branch ID to filter by. If provided, only returns data for that branch.
                      If None, returns data for all branches (Admin role).
        
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
            # Query hospital branches with optional branch filtering
            query = self.db.query(HospitalBranch).join(Hospital)
            
            # Apply branch filter if provided (User role only)
            if branch_id is not None:
                query = query.filter(HospitalBranch.branch_id == branch_id)
            
            branches = query.all()
            
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
    
    def get_active_tanks(self, branch_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get active tanks grouped by branch for the current logged-in user's branch.
        
        Args:
            branch_id: Optional branch ID to filter by. If provided, only returns tanks for that branch (User role).
                      If None, returns tanks for all branches (Manager/Admin roles).
        
        Returns:
            Dictionary containing:
            - branches: List of branches with their tanks:
                - branch_id: Branch ID
                - branch_name: Branch name
                - tanks: List of active tanks with:
                    - tank_code: Tank code (e.g., 'T1')
                    - updated_at: Last updated date and time from tanks table updated_at
            - total: Total number of active tanks across all branches
        """
        try:
            # Query active tanks with branch information
            query = (
                self.db.query(
                    Tank,
                    HospitalBranch.branch_id,
                    HospitalBranch.branch_name
                )
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(Tank.is_active == True)
            )
            
            # Apply branch filter if provided (User role only)
            if branch_id is not None:
                query = query.filter(HospitalBranch.branch_id == branch_id)
            
            results = query.all()
            
            # Group tanks by branch
            branches_dict = defaultdict(lambda: {
                "branch_id": None,
                "branch_name": None,
                "tanks": []
            })
            
            total_tanks = 0
            
            for tank, branch_id_val, branch_name in results:
                # Initialize branch if not already in dict
                if branches_dict[branch_id_val]["branch_id"] is None:
                    branches_dict[branch_id_val]["branch_id"] = branch_id_val
                    branches_dict[branch_id_val]["branch_name"] = branch_name or "Unknown"
                
                tank_data = {
                    "tank_code": tank.tank_code or "",
                    "updated_at": tank.updated_at or tank.created_at
                }
                
                branches_dict[branch_id_val]["tanks"].append(tank_data)
                total_tanks += 1
            
            # Convert to list and sort by branch name
            branches_list = sorted(
                list(branches_dict.values()),
                key=lambda x: x["branch_name"]
            )
            
            return {
                "branches": branches_list,
                "total": total_tanks
            }
            
        except Exception as e:
            raise Exception(f"Error fetching active tanks: {str(e)}")
    
    def get_branches_by_hospital(self, hospital_id: int) -> Dict[str, Any]:
        """
        Get list of branches for a specific hospital.
        
        Args:
            hospital_id: Hospital ID to filter branches by
            
        Returns:
            Dictionary containing:
            - branches: List of branches with branch_id and branch_name
            - total: Total number of branches
        """
        try:
            # Query all branches for this hospital, ordered by branch name
            branches = (
                self.db.query(HospitalBranch)
                .filter(HospitalBranch.hospital_id == hospital_id)
                .order_by(HospitalBranch.branch_name)
                .all()
            )
            
            # Build response list
            branch_list = [
                {
                    "branch_id": branch.branch_id,
                    "branch_name": branch.branch_name or f"Branch {branch.branch_id}"
                }
                for branch in branches
            ]
            
            return {
                "branches": branch_list,
                "total": len(branch_list)
            }
        except Exception as e:
            logger.error(f"Error fetching branches for hospital {hospital_id}: {str(e)}", exc_info=True)
            raise Exception(f"Error fetching branches: {str(e)}")
    
    def _calculate_branch_status(self, branch_id: int) -> str:
        """
        Calculate branch status based on tank statuses.
        
        Logic:
        - If any active tank is "critical" -> branch status = "critical"
        - Else if any active tank is "risk" -> branch status = "risk"
        - Else -> branch status = "safe"
        - If no active tanks -> default to "safe"
        
        Args:
            branch_id: The branch ID to calculate status for
            
        Returns:
            Branch status string: "critical", "risk", or "safe"
        """
        try:
            # Get all active tanks for this branch
            active_tanks = self.db.query(Tank).filter(
                Tank.branch_id == branch_id,
                Tank.is_active == True
            ).all()
            
            # If no active tanks, default to safe
            if not active_tanks:
                return "safe"
            
            # Check for critical status (highest priority)
            for tank in active_tanks:
                if tank.status == CanisterStatus.CRITICAL:
                    return "critical"
            
            # Check for risk status
            for tank in active_tanks:
                if tank.status == CanisterStatus.RISK:
                    return "risk"
            
            # All tanks are safe
            return "safe"
            
        except Exception as e:
            # If there's an error calculating status, default to safe
            return "safe"
    
    def get_embryo_tracking(self, branch_id: Optional[int] = None, user_role: Optional[str] = None) -> Dict[str, Any]:
        """
        Get embryo tracking data grouped by cryolock.
        Returns data in the format matching the table structure.
        
        Args:
            branch_id: Optional branch ID to filter by. 
                      - User role: Filter by their assigned branch (branch_id provided)
                      - Manager/Admin roles: No filtering (branch_id is None) - see all branches
            user_role: User's role ("User", "Manager", "Admin") to determine field visibility.
        
        Returns:
            Dictionary containing:
            - data: List of tracking records with:
                - his_number: Patient HIS Number
                - cryolock_number: Cryolock Number
                - canister_number: Canister Number
                - tank_code: Tank Code
                - cane_code: Cane Code
                - goblet_color: Goblet Color
                - cryolock_color: Cryolock Color
                - date_of_vitrification: Date of Vitrification
                - embryo_grading: Comma-separated embryo gradings (User role only)
                - site_name: Branch name (Manager/Admin roles only)
                - status: Embryo status (Manager/Admin roles only)
            - total: Total number of records
        """
        try:
            # Determine which fields to include based on role
            is_user_role = user_role and user_role.title() == "User"
            
            # Optimized query with LEFT JOIN for shipment descriptions to avoid N+1 query
            # Use subquery to get latest shipment per patient crylock
            latest_shipments_subq = (
                self.db.query(
                    IVFShipment.patient_crylock_info_id,
                    func.max(IVFShipment.id).label('latest_shipment_id')
                )
                .filter(IVFShipment.description.isnot(None))
                .group_by(IVFShipment.patient_crylock_info_id)
                .subquery()
            )
            
            # Query PatientCrylockInfo with all related data and shipment descriptions in one query
            # Join: PatientCrylockInfo -> Tank -> Branch -> (LEFT JOIN) Latest Shipment
            query = (
                self.db.query(
                    PatientCrylockInfo.his_number,
                    PatientCrylockInfo.crylock_number,
                    PatientCrylockInfo.canister_number,
                    PatientCrylockInfo.tank_code,
                    PatientCrylockInfo.cane_code,
                    PatientCrylockInfo.goblet_color,
                    PatientCrylockInfo.crylock_color,
                    PatientCrylockInfo.date_of_vitrification,
                    PatientCrylockInfo.id,
                    HospitalBranch.branch_name,
                    IVFShipment.description.label('shipment_description')
                )
                .join(Tank, PatientCrylockInfo.tank_id == Tank.tank_id)
                .join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                .outerjoin(
                    latest_shipments_subq,
                    PatientCrylockInfo.id == latest_shipments_subq.c.patient_crylock_info_id
                )
                .outerjoin(
                    IVFShipment,
                    and_(
                        IVFShipment.id == latest_shipments_subq.c.latest_shipment_id,
                        IVFShipment.patient_crylock_info_id == PatientCrylockInfo.id
                    )
                )
            )
            
            # Apply branch filter only for User role (Manager and Admin see all branches)
            # branch_id is None for Manager/Admin roles, so they see all branches
            if branch_id is not None:
                query = query.filter(PatientCrylockInfo.branch_id == branch_id)
            
            # Exclude cryolocks that have been moved to embryo transfer
            query = query.filter(PatientCrylockInfo.embryo_transfer != True)
            
            # Order by HIS number and cryolock number
            query = query.order_by(PatientCrylockInfo.his_number, PatientCrylockInfo.crylock_number)
            
            results = query.all()
            
            tracking_list = []
            
            for row in results:
                # Get description from the joined query result
                description = row.shipment_description if hasattr(row, 'shipment_description') else None
                
                tracking_data = {
                    "his_number": row.his_number or "",
                    "cryolock_number": row.crylock_number or "",
                    "canister_number": str(row.canister_number) if row.canister_number else None,
                    "tank_code": row.tank_code or "",
                    "cane_code": row.cane_code or "",
                    "goblet_color": row.goblet_color or "",
                    "cryolock_color": row.crylock_color or "",
                    "date_of_vitrification": row.date_of_vitrification,
                    "description": description
                }
                
                # Role-based field visibility
                if is_user_role:
                    # User role: Include embryo_grading (not available in current model, return empty)
                    tracking_data["embryo_grading"] = ""
                else:
                    # Manager/Admin roles: Include site_name and status (status not available in current model)
                    tracking_data["site_name"] = row.branch_name or ""
                    tracking_data["status"] = ""  # Status field not available in PatientCrylockInfo model
                
                # Append the tracking data to the list
                tracking_list.append(tracking_data)
            
            return {
                "data": tracking_list,
                "total": len(tracking_list)
            }
            
        except Exception as e:
            raise Exception(f"Error fetching embryo tracking data: {str(e)}")

