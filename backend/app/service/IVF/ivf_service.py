from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_
from typing import List, Dict, Any, Optional
from decimal import Decimal
from collections import defaultdict
from datetime import datetime as dt, date, time
import logging

from ...models.IVF.hospital_model import Hospital
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.tank_model import Tank
from ...models.IVF.canister_model import Canister
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.ivf_quality_log_model import IVFQualityLog
from ...models.IVF.cane_model import Cane
from ...models.IVF.cryolock_model import Cryolock
from ...models.IVF.patient_model import IVFPatient
from ...models.IVF.embryo_model import Embryo
from ...models.IVF.ivf_shipment_model import IVFShipment
from ...models.shipment_model import Shipment
from ...constants.enums import CanisterStatus

logger = logging.getLogger(__name__)

# Roles that should be filtered by branch (User and Manager)
ROLES_WITH_BRANCH_FILTER = ["User", "Manager"]


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
            
            # Apply branch filter if provided (User/Manager roles)
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
    
    def get_active_canisters(self, branch_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get active canisters grouped by branch with their status and last updated time.
        
        Args:
            branch_id: Optional branch ID to filter by. If provided, only returns canisters for that branch.
                      If None, returns canisters for all branches (Admin role).
        
        Returns:
            Dictionary containing:
            - branches: List of branches with their canisters:
                - branch_id: Branch ID
                - branch_name: Branch name
                - canisters: List of active canisters with:
                    - canister_id: Canister ID
                    - canister_status: Status (safe, risk, critical)
                    - updated_at: Last updated date and time from canister log refill_date+refill_time (if available),
                                  otherwise from canisters table created_at
            - total: Total number of active canisters across all branches
        """
        try:
            # Optimized query: Use subquery to get latest log per canister in one query
            # This eliminates N+1 query problem
            # Get latest refill_date and refill_time separately, then combine in Python
            latest_logs_subquery = (
                self.db.query(
                    CanisterLn2Log.canister_id,
                    func.max(CanisterLn2Log.refill_date).label('latest_refill_date'),
                    func.max(CanisterLn2Log.refill_time).label('latest_refill_time')
                )
                .filter(CanisterLn2Log.refill_date.isnot(None))
                .group_by(CanisterLn2Log.canister_id)
                .subquery()
            )
            
            # Query active canisters with branch information and latest log
            query = (
                self.db.query(
                    Canister,
                    HospitalBranch.branch_id,
                    HospitalBranch.branch_name,
                    latest_logs_subquery.c.latest_refill_date,
                    latest_logs_subquery.c.latest_refill_time
                )
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .outerjoin(
                    latest_logs_subquery,
                    Canister.canister_id == latest_logs_subquery.c.canister_id
                )
                .filter(Canister.is_active == True)
            )
            
            # Apply branch filter if provided (User/Manager roles)
            if branch_id is not None:
                query = query.filter(HospitalBranch.branch_id == branch_id)
            
            results = query.all()
            
            # Group canisters by branch
            branches_dict = defaultdict(lambda: {
                "branch_id": None,
                "branch_name": None,
                "canisters": []
            })
            
            total_canisters = 0
            
            for canister, branch_id_val, branch_name, latest_refill_date, latest_refill_time in results:
                # Initialize branch if not already in dict
                if branches_dict[branch_id_val]["branch_id"] is None:
                    branches_dict[branch_id_val]["branch_id"] = branch_id_val
                    branches_dict[branch_id_val]["branch_name"] = branch_name or "Unknown"
                
                # Combine refill_date and refill_time if both are available, otherwise use created_at from canisters table
                if latest_refill_date and latest_refill_time:
                    updated_at = dt.combine(latest_refill_date, latest_refill_time)
                else:
                    updated_at = canister.created_at
                
                canister_data = {
                    "canister_number": canister.canister_number or "",
                    "canister_status": canister.canister_status.value if canister.canister_status else "safe",
                    "updated_at": updated_at
                }
                
                branches_dict[branch_id_val]["canisters"].append(canister_data)
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
    
    def get_embryo_tracking(self, branch_id: Optional[int] = None, user_role: Optional[str] = None) -> Dict[str, Any]:
        """
        Get embryo tracking data grouped by cryolock.
        Returns data in the format matching the table structure.
        
        Args:
            branch_id: Optional branch ID to filter by. If provided, only returns embryos for that branch.
                      If None, returns embryos for all branches (Admin role).
            user_role: User's role ("User", "Manager", "Admin") to determine field visibility.
        
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
                - embryo_grading: Comma-separated embryo gradings (User role only)
                - site_name: Branch name (Manager/Admin roles only)
                - status: Embryo status (Manager/Admin roles only)
            - total: Total number of records
        """
        try:
            # Determine which fields to include based on role
            is_user_role = user_role and user_role.title() == "User"
            
            # Query embryos with all related data
            # Join: Embryo -> Patient, Cryolock -> Cane -> Canister -> Tank -> Branch
            if is_user_role:
                # User role: Aggregate embryo_grading by cryolock
                query = (
                    self.db.query(
                        IVFPatient.his_number,
                        Cryolock.cryolock_number,
                        Canister.canister_number,
                        Tank.tank_code,
                        Cane.cane_code,
                        Cryolock.goblet_color,
                        Cryolock.cryolock_color,
                        Embryo.date_of_vitrification,
                        HospitalBranch.branch_name,
                        Cryolock.cryolock_id,
                        # Aggregate embryo_grading for grouping by cryolock
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
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(Embryo.is_active == True)
                )
                
                # Apply branch filter if provided (User role)
                if branch_id is not None:
                    query = query.filter(HospitalBranch.branch_id == branch_id)
                
                # Group by cryolock to aggregate embryo_grading
                query = query.group_by(
                    IVFPatient.his_number,
                    Cryolock.cryolock_number,
                    Canister.canister_number,
                    Tank.tank_code,
                    Cane.cane_code,
                    Cryolock.goblet_color,
                    Cryolock.cryolock_color,
                    Embryo.date_of_vitrification,
                    HospitalBranch.branch_name,
                    Cryolock.cryolock_id
                ).order_by(IVFPatient.his_number, Cryolock.cryolock_number)
            else:
                # Manager/Admin roles: Show individual embryos with status (no aggregation)
                query = (
                    self.db.query(
                        IVFPatient.his_number,
                        Cryolock.cryolock_number,
                        Canister.canister_number,
                        Tank.tank_code,
                        Cane.cane_code,
                        Cryolock.goblet_color,
                        Cryolock.cryolock_color,
                        Embryo.date_of_vitrification,
                        Embryo.status,
                        HospitalBranch.branch_name,
                        Cryolock.cryolock_id,
                        Embryo.embryo_grading  # Individual grading, not aggregated
                    )
                    .join(Cryolock, Embryo.cryolock_id == Cryolock.cryolock_id)
                    .join(IVFPatient, Embryo.patient_id == IVFPatient.patient_id)
                    .join(Cane, Cryolock.cane_id == Cane.cane_id)
                    .join(Canister, Cane.canister_id == Canister.canister_id)
                    .join(Tank, Canister.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(Embryo.is_active == True)
                )
                
                # Apply branch filter if provided (Manager role)
                if branch_id is not None:
                    query = query.filter(HospitalBranch.branch_id == branch_id)
                
                # No grouping - show individual embryos
                query = query.order_by(IVFPatient.his_number, Cryolock.cryolock_number)
            
            results = query.all()
            
            # Get cryolock IDs to fetch shipment descriptions
            cryolock_ids = [row.cryolock_id for row in results]
            
            # Fetch descriptions from ivf_shipment table for cryolocks
            # Get the most recent shipment description for each cryolock
            shipment_descriptions = {}
            if cryolock_ids:
                # Use a subquery to get the latest shipment per cryolock
                latest_shipments = (
                    self.db.query(
                        IVFShipment.cryolock_id,
                        func.max(IVFShipment.id).label('latest_shipment_id')
                    )
                    .filter(
                        IVFShipment.cryolock_id.in_(cryolock_ids),
                        IVFShipment.description.isnot(None)
                    )
                    .group_by(IVFShipment.cryolock_id)
                    .subquery()
                )
                
                shipment_descriptions_query = (
                    self.db.query(
                        IVFShipment.cryolock_id,
                        IVFShipment.description
                    )
                    .join(
                        latest_shipments,
                        IVFShipment.id == latest_shipments.c.latest_shipment_id
                    )
                )
                
                for shipment_row in shipment_descriptions_query.all():
                    shipment_descriptions[shipment_row.cryolock_id] = shipment_row.description
            
            tracking_list = []
            
            for row in results:
                # Get description for this cryolock if it exists
                description = shipment_descriptions.get(row.cryolock_id)
                
                tracking_data = {
                    "his_number": row.his_number or "",
                    "cryolock_number": row.cryolock_number or "",
                    "canister_number": str(row.canister_number) if row.canister_number else None,
                    "tank_code": row.tank_code or "",
                    "cane_code": row.cane_code or "",
                    "goblet_color": row.goblet_color or "",
                    "cryolock_color": row.cryolock_color or "",
                    "date_of_vitrification": row.date_of_vitrification,
                    "description": description
                }
                
                # Role-based field visibility
                if is_user_role:
                    # User role: Include embryo_grading (aggregated), exclude site_name and status
                    tracking_data["embryo_grading"] = row.embryo_grading or ""
                else:
                    # Manager/Admin roles: Include site_name and status, exclude embryo_grading
                    tracking_data["site_name"] = row.branch_name or ""
                    # Status is selected in the query for Manager/Admin roles
                    tracking_data["status"] = getattr(row, 'status', None) or ""
                
                # Append the tracking data to the list
                tracking_list.append(tracking_data)
            
            return {
                "data": tracking_list,
                "total": len(tracking_list)
            }
            
        except Exception as e:
            raise Exception(f"Error fetching embryo tracking data: {str(e)}")

