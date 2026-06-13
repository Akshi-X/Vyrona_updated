from collections import defaultdict
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional
import logging

from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.orm import Session

from ...models.kpi_config_model import KpiConfig
from ...models.readings_model import Readings

from ...constants.enums import CanisterStatus
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.hospital_model import Hospital
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.ivf_shipment_model import IVFShipment
from ...models.IVF.patient_crylock_info_model import PatientCrylockInfo
from ...models.IVF.tank_model import Tank
from ...models.IVF.incubator_model import Incubator
from ...models.IVF.refrigerator_model import Refrigerator
from ...utils.ivf_helpers import decrypt_sensitive_ivf_value, encrypt_sensitive_ivf_value

logger = logging.getLogger(__name__)

class IVFService:
    """Service for IVF control tower operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_control_tower_map_locations(
        self,
        hospital_id: Optional[int] = None,
        branch_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get IVF control tower map locations with hospital and branch information.
        Returns data organized by states.
        
        Args:
            hospital_id: Optional hospital ID to filter by. If provided, only returns
                         data for branches under that hospital.
            branch_id: Optional branch ID to filter by. If provided, only returns data
                       for that branch.
        
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

            # Apply hospital scope first (required for tenant isolation)
            if hospital_id is not None:
                query = query.filter(HospitalBranch.hospital_id == hospital_id)
            
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
    
    def get_active_tanks(
        self,
        hospital_id: Optional[int] = None,
        branch_id: Optional[int] = None,
        branch_name: Optional[str] = None,
        status: Optional[CanisterStatus] = None
    ) -> Dict[str, Any]:
        """
        Get active tanks grouped by branch for the current logged-in user's branch.
        
        Args:
            hospital_id: Optional hospital ID to scope results. If provided, only returns tanks
                         for branches under that hospital.
            branch_id: Optional branch ID to filter by. If provided, only returns tanks for that branch.
            branch_name: Optional branch name filter (additional compatibility filter).
            status: Optional tank status to filter by (safe, risk, critical). If provided, only returns tanks with that status.
        
        Returns:
            Dictionary containing:
            - branches: List of branches with their tanks:
                - branch_id: Branch ID
                - branch_name: Branch name
                - tanks: List of active tanks with:
                    - tank_code: Tank code (e.g., 'T1')
                    - updated_at: Latest refill log datetime (refill_date/refill_time); null if no refill logs exist
                    - status: Tank status (safe, risk, critical)
            - total: Total number of active tanks across all branches
        """
        try:
            
            
            # Subquery: latest deviation per (tank_id, kpi_config_id)
            readings_subq = (
                select(
                    Readings.tank_id,
                    Readings.kpi_config_id,
                    Readings.deviation
                )
                .distinct(Readings.tank_id, Readings.kpi_config_id)
                .order_by(Readings.tank_id, Readings.kpi_config_id, desc(Readings.timestamp))
                .subquery()
            )

            # Aggregate deviations per tank
            deviations_subq = (
                select(
                    readings_subq.c.tank_id,
                    func.count()
                    .filter(readings_subq.c.deviation == True)
                    .label("total_deviations")
                )
                .group_by(readings_subq.c.tank_id)
                .subquery()
            )

            # Latest refill log (date/time) per tank
            latest_refill_subq = (
                select(
                    CanisterLn2Log.tank_id,
                    CanisterLn2Log.refill_date,
                    CanisterLn2Log.refill_time
                )
                .where(CanisterLn2Log.refill_date.isnot(None))
                .distinct(CanisterLn2Log.tank_id)
                .order_by(
                    CanisterLn2Log.tank_id,
                    desc(CanisterLn2Log.refill_date),
                    desc(CanisterLn2Log.refill_time),
                    desc(CanisterLn2Log.created_at)
                )
                .subquery()
            )

            # Main query
            stmt = (
                select(
                    Tank,
                    HospitalBranch.branch_id,
                    HospitalBranch.branch_name,
                    func.coalesce(deviations_subq.c.total_deviations, 0).label("total_deviations"),
                    latest_refill_subq.c.refill_date.label("latest_refill_date"),
                    latest_refill_subq.c.refill_time.label("latest_refill_time")
                )
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .outerjoin(deviations_subq, deviations_subq.c.tank_id == Tank.tank_id)
                .outerjoin(latest_refill_subq, latest_refill_subq.c.tank_id == Tank.tank_id)
                .where(Tank.is_active == True)
            )

            # Optional filters
            if hospital_id is not None:
                stmt = stmt.where(HospitalBranch.hospital_id == hospital_id)

            if branch_id is not None:
                stmt = stmt.where(Tank.branch_id == branch_id)

            if branch_name is not None:
                stmt = stmt.where(HospitalBranch.branch_name == branch_name)

            # Execute
            results = self.db.execute(stmt).fetchall()

            # Group by branch
            branches_dict = defaultdict(lambda: {"branch_id": None, "branch_name": None, "tanks": []})
            total_tanks = 0

            for tank, branch_id_val, branch_name_val, total_deviations, latest_refill_date, latest_refill_time in results:
                calculated_status = "critical" if total_deviations > 0 else "safe"
                latest_activity_at = None
                if latest_refill_date:
                    latest_activity_at = datetime.combine(
                        latest_refill_date,
                        latest_refill_time or time.min
                    )

                # Apply status filter post-query (since it's computed)
                if status is not None and calculated_status != status.value:
                    continue

                if branches_dict[branch_id_val]["branch_id"] is None:
                    branches_dict[branch_id_val]["branch_id"] = branch_id_val
                    branches_dict[branch_id_val]["branch_name"] = branch_name_val or "Unknown"

                branches_dict[branch_id_val]["tanks"].append({
                    "tank_id": tank.tank_id,
                    "tank_code": tank.tank_code or "",
                    "updated_at": latest_activity_at,
                    "status": calculated_status,
                    "deviations": total_deviations,
                })
                total_tanks += 1

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
    
    def get_active_incubators(
        self,
        hospital_id: Optional[int] = None,
        branch_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Get active incubators grouped by branch."""
        try:
            stmt = (
                select(Incubator, HospitalBranch.branch_id, HospitalBranch.branch_name)
                .join(HospitalBranch, Incubator.branch_id == HospitalBranch.branch_id)
                .where(Incubator.is_active == True)
            )
            if hospital_id is not None:
                stmt = stmt.where(Incubator.hospital_id == hospital_id)
            if branch_id is not None:
                stmt = stmt.where(Incubator.branch_id == branch_id)

            results = self.db.execute(stmt).fetchall()

            branches_dict: Dict[int, Any] = {}
            total = 0
            for incubator, b_id, b_name in results:
                if b_id not in branches_dict:
                    branches_dict[b_id] = {"branch_id": b_id, "branch_name": b_name or "Unknown", "incubators": []}
                branches_dict[b_id]["incubators"].append({
                    "incubator_id": incubator.incubator_id,
                    "incubator_code": incubator.incubator_code,
                    "external_id": incubator.external_id,
                    "type": incubator.type,
                    "chamber_r": incubator.chamber_r,
                    "chamber_c": incubator.chamber_c,
                    "updated_at": incubator.updated_at,
                })
                total += 1

            branches_list = sorted(branches_dict.values(), key=lambda x: x["branch_name"])
            return {"branches": branches_list, "total": total}
        except Exception as e:
            raise Exception(f"Error fetching active incubators: {str(e)}")

    def get_active_refrigerators(
        self,
        hospital_id: Optional[int] = None,
        branch_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Get active refrigerators grouped by branch."""
        try:
            stmt = (
                select(Refrigerator, HospitalBranch.branch_id, HospitalBranch.branch_name)
                .join(HospitalBranch, Refrigerator.branch_id == HospitalBranch.branch_id)
                .where(Refrigerator.is_active == True)
            )
            if hospital_id is not None:
                stmt = stmt.where(Refrigerator.hospital_id == hospital_id)
            if branch_id is not None:
                stmt = stmt.where(Refrigerator.branch_id == branch_id)

            results = self.db.execute(stmt).fetchall()

            branches_dict: Dict[int, Any] = {}
            total = 0
            for refrigerator, b_id, b_name in results:
                if b_id not in branches_dict:
                    branches_dict[b_id] = {"branch_id": b_id, "branch_name": b_name or "Unknown", "refrigerators": []}
                branches_dict[b_id]["refrigerators"].append({
                    "refrigerator_id": refrigerator.refrigerator_id,
                    "refrigerator_code": refrigerator.refrigerator_code,
                    "external_id": refrigerator.external_id,
                    "type": refrigerator.type,
                    "updated_at": refrigerator.updated_at,
                })
                total += 1

            branches_list = sorted(branches_dict.values(), key=lambda x: x["branch_name"])
            return {"branches": branches_list, "total": total}
        except Exception as e:
            raise Exception(f"Error fetching active refrigerators: {str(e)}")

    def get_embryo_transfer_crylocks(self, branch_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get all crylocks where embryo_transfer is True.
        
        Args:
            branch_id: Optional branch ID to filter by. If provided, only returns crylocks for that branch.
                      If None, returns crylocks for all branches (Manager/Admin roles).
        
        Returns:
            Dictionary containing:
            - data: List of crylock details with:
                - his_number: Patient HIS Number
                - cryolock_number: Cryolock number
                - canister_number: Canister number
                - tank_code: Tank code
                - cane_code: Cane code
                - goblet_color: Goblet color
                - cryolock_color: Cryolock color
                - date_of_vitrification: Date of vitrification
                - branch_name: Branch name
                - tank_id: Tank ID
            - total: Total number of embryo transfer crylocks
            - message: Meaningful response message
        """
        try:
            # Query patient crylocks where embryo_transfer is True
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
                    PatientCrylockInfo.tank_id,
                    PatientCrylockInfo.branch_id,
                    HospitalBranch.branch_name
                )
                .join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                .filter(PatientCrylockInfo.embryo_transfer == True)
            )
            
            # Apply branch filter if provided (User role only)
            if branch_id is not None:
                query = query.filter(PatientCrylockInfo.branch_id == branch_id)
            
            # Order by branch name, then HIS number, then cryolock number
            query = query.order_by(
                HospitalBranch.branch_name,
                PatientCrylockInfo.his_number,
                PatientCrylockInfo.crylock_number
            )
            
            results = query.all()
            
            # Build response list
            crylock_list = []
            for row in results:
                crylock_data = {
                    "his_number": decrypt_sensitive_ivf_value(row.his_number) or "",
                    "cryolock_number": decrypt_sensitive_ivf_value(row.crylock_number) or "",
                    "canister_number": row.canister_number or "",
                    "tank_code": row.tank_code or "",
                    "cane_code": row.cane_code or "",
                    "goblet_color": row.goblet_color or "",
                    "cryolock_color": row.crylock_color or "",
                    "date_of_vitrification": row.date_of_vitrification,
                    "branch_name": row.branch_name or "",
                    "tank_id": row.tank_id
                }
                crylock_list.append(crylock_data)
            
            total_count = len(crylock_list)
            return {
                "data": crylock_list,
                "total": total_count,
                "message": "No embryo-transfer crylocks found" if total_count == 0 else "Embryo-transfer crylocks fetched successfully"
            }
            
        except Exception as e:
            logger.error(f"Error fetching embryo transfer crylocks: {str(e)}", exc_info=True)
            raise Exception(f"Error fetching embryo transfer crylocks: {str(e)}")

    def check_tank_in_transit_status(
        self,
        user_role: str,
        user_branch_id: Optional[int] = None,
        hospital_id: Optional[int] = None,
        his_number: Optional[str] = None,
        cryolock_number: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Check whether a HIS/Cryolock identifier has any shipment records.

        Access rules:
        - User: Always restricted to own branch.
        - Manager: Can check all branches in their hospital.
        - Admin: Can check any branch.
        """
        try:
            normalized_his_number = (his_number or "").strip()
            normalized_cryolock_number = (cryolock_number or "").strip()

            if not normalized_his_number and not normalized_cryolock_number:
                raise ValueError("Either his_number or cryolock_number is required")

            role_normalized = (user_role or "").title()

            query = (
                self.db.query(
                    PatientCrylockInfo.id,
                    PatientCrylockInfo.tank_code,
                    PatientCrylockInfo.his_number,
                    PatientCrylockInfo.crylock_number
                )
                .join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
            )

            identifier_filters = []
            if normalized_his_number:
                encrypted_his_number = encrypt_sensitive_ivf_value(normalized_his_number)
                identifier_filters.append(
                    PatientCrylockInfo.his_number.in_([
                        normalized_his_number,
                        encrypted_his_number
                    ])
                )

            if normalized_cryolock_number:
                encrypted_cryolock_number = encrypt_sensitive_ivf_value(normalized_cryolock_number)
                identifier_filters.append(
                    PatientCrylockInfo.crylock_number.in_([
                        normalized_cryolock_number,
                        encrypted_cryolock_number
                    ])
                )

            query = query.filter(or_(*identifier_filters))

            if role_normalized == "User":
                if not user_branch_id:
                    raise Exception("User account is not associated with any branch")
                query = query.filter(PatientCrylockInfo.branch_id == user_branch_id)
            elif role_normalized == "Manager":
                if hospital_id is not None:
                    query = query.filter(HospitalBranch.hospital_id == hospital_id)
            else:
                if role_normalized == "Admin" and hospital_id is not None:
                    query = query.filter(HospitalBranch.hospital_id == hospital_id)

            matching_cryolocks = query.all()

            if not matching_cryolocks:
                return {
                    "exists": False,
                    "tank_code": None,
                    "his_number": normalized_his_number or None,
                    "cryolock_number": normalized_cryolock_number or None,
                    "has_in_transit_shipments": False,
                    "in_transit_count": 0,
                    "message": "Invalid HIS/Crylock number"
                }

            cryolock_ids = [row.id for row in matching_cryolocks]
            cryolocks_with_shipments_count = (
                self.db.query(func.count(func.distinct(IVFShipment.patient_crylock_info_id)))
                .filter(IVFShipment.patient_crylock_info_id.in_(cryolock_ids))
                .scalar()
            ) or 0

            unique_his_numbers = {
                decrypt_sensitive_ivf_value(row.his_number)
                for row in matching_cryolocks
                if row.his_number
            }
            unique_tank_codes = {
                row.tank_code for row in matching_cryolocks if row.tank_code
            }
            unique_cryolock_numbers = {
                decrypt_sensitive_ivf_value(row.crylock_number)
                for row in matching_cryolocks
                if row.crylock_number
            }

            has_shipments = cryolocks_with_shipments_count > 0
            return {
                "exists": True,
                "tank_code": next(iter(unique_tank_codes)) if len(unique_tank_codes) == 1 else None,
                "his_number": (
                    next(iter(unique_his_numbers))
                    if len(unique_his_numbers) == 1
                    else (normalized_his_number or None)
                ),
                "cryolock_number": (
                    next(iter(unique_cryolock_numbers))
                    if len(unique_cryolock_numbers) == 1
                    else (normalized_cryolock_number or None)
                ),
                "has_in_transit_shipments": has_shipments,
                "in_transit_count": cryolocks_with_shipments_count,
                "message": (
                    f"Found shipment records for {cryolocks_with_shipments_count} cryolock(s)"
                    if has_shipments
                    else "No shipment records found for the given HIS/Cryolock number"
                )
            }
        except ValueError:
            raise
        except Exception as e:
            logger.error(
                f"Error checking in-transit status for identifiers (his_number={his_number}, cryolock_number={cryolock_number}): {str(e)}",
                exc_info=True
            )
            raise Exception(f"Error checking in-transit status for identifier: {str(e)}")
    
    def get_in_transit_crylocks(
        self,
        branch_id: Optional[int] = None,
        role: Optional[str] = None,
        hospital_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get all crylocks where in_transit is True.
        
        Args:
            branch_id: Optional branch ID to filter by. If provided, only returns crylocks for that branch.
            role: Optional user role ("User", "Manager", "Admin") for role-based scope.
            hospital_id: Optional hospital ID. Used to scope Manager role to their own hospital.
        
        Returns:
            Dictionary containing:
            - data: List of crylock details with:
                - his_number: Patient HIS Number
                - cryolock_number: Cryolock number
                - canister_number: Canister number
                - tank_code: Tank code
                - cane_code: Cane code
                - goblet_color: Goblet color
                - cryolock_color: Cryolock color
                - date_of_vitrification: Date of vitrification
                - branch_name: Branch name
                - tank_id: Tank ID
                - shipment_details: Full shipment details object if available (from ivf_shipment table)
            - total: Total number of in-transit crylocks
            - message: Meaningful response message
        """
        try:
            # Query patient crylocks where in_transit is True
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
                    PatientCrylockInfo.tank_id,
                    PatientCrylockInfo.branch_id,
                    PatientCrylockInfo.id,
                    HospitalBranch.branch_name
                )
                .join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                .filter(PatientCrylockInfo.in_transit == True)
            )
            
            # Apply branch filter if provided (User role)
            if branch_id is not None:
                query = query.filter(PatientCrylockInfo.branch_id == branch_id)

            # Manager should only see branches from their own hospital.
            # Admin can see all branches, so hospital filter is not applied for Admin.
            role_normalized = role.title() if role else None
            if role_normalized == "Manager" and hospital_id is not None:
                query = query.filter(HospitalBranch.hospital_id == hospital_id)
            
            # Order by branch name, then HIS number, then cryolock number
            query = query.order_by(
                HospitalBranch.branch_name,
                PatientCrylockInfo.his_number,
                PatientCrylockInfo.crylock_number
            )
            
            results = query.all()
            
            # Get patient crylock info IDs to fetch shipment details
            patient_crylock_info_ids = [row.id for row in results]
            
            # Fetch shipment details from ivf_shipment table for patient crylocks
            # Get the most recent shipment for each patient crylock
            shipment_details_map = {}
            if patient_crylock_info_ids:
                # Use a subquery to get the latest shipment per patient crylock
                latest_shipments = (
                    self.db.query(
                        IVFShipment.patient_crylock_info_id,
                        func.max(IVFShipment.id).label('latest_shipment_id')
                    )
                    .filter(
                        IVFShipment.patient_crylock_info_id.in_(patient_crylock_info_ids)
                    )
                    .group_by(IVFShipment.patient_crylock_info_id)
                    .subquery()
                )
                
                # Fetch full shipment records
                shipment_records = (
                    self.db.query(IVFShipment)
                    .join(
                        latest_shipments,
                        IVFShipment.id == latest_shipments.c.latest_shipment_id
                    )
                    .all()
                )
                
                # Map shipment details by patient_crylock_info_id
                for shipment in shipment_records:
                    shipment_details_map[shipment.patient_crylock_info_id] = {
                        "shipment_id": shipment.shipment_id,
                        "iot_shipment_id": shipment.iot_shipment_id,
                        "source_branch_id": shipment.source_branch_id,
                        "destination_branch_id": shipment.destination_branch_id,
                        "source_location": shipment.source_location,
                        "destination_location": shipment.destination_location,
                        "source_latitude": shipment.source_latitude,
                        "source_longitude": shipment.source_longitude,
                        "destination_latitude": shipment.destination_latitude,
                        "destination_longitude": shipment.destination_longitude,
                        "description": shipment.description,
                        "device_id": shipment.device_id,
                        "shipment_status": shipment.shipment_status,
                        "departure_time": shipment.departure_time,
                        "arrival_time": shipment.arrival_time,
                        "scheduled_departure_time": shipment.scheduled_departure_time
                    }
            
            # Build response list
            crylock_list = []
            for row in results:
                # Get shipment details for this patient crylock if they exist
                shipment_details = shipment_details_map.get(row.id)
                
                crylock_data = {
                    "his_number": decrypt_sensitive_ivf_value(row.his_number) or "",
                    "cryolock_number": decrypt_sensitive_ivf_value(row.crylock_number) or "",
                    "canister_number": row.canister_number or "",
                    "tank_code": row.tank_code or "",
                    "cane_code": row.cane_code or "",
                    "goblet_color": row.goblet_color or "",
                    "cryolock_color": row.crylock_color or "",
                    "date_of_vitrification": row.date_of_vitrification,
                    "branch_name": row.branch_name or "",
                    "tank_id": row.tank_id,
                    "shipment_details": shipment_details
                }
                crylock_list.append(crylock_data)
            
            total_count = len(crylock_list)
            return {
                "data": crylock_list,
                "total": total_count,
                "message": "No in-transit crylocks found" if total_count == 0 else "In-transit crylocks fetched successfully"
            }
            
        except Exception as e:
            logger.error(f"Error fetching in-transit crylocks: {str(e)}", exc_info=True)
            raise Exception(f"Error fetching in-transit crylocks: {str(e)}")
    
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
    
    def get_embryo_tracking(
        self,
        branch_id: Optional[int] = None,
        hospital_id: Optional[int] = None,
        user_role: Optional[str] = None,
        branch_name: Optional[str] = None,
        status: Optional[str] = None,
        cryolock_color: Optional[str] = None,
        goblet_color: Optional[str] = None,
        offset: int = 0,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Get embryo tracking data grouped by cryolock.
        Returns data in the format matching the table structure.
        
        Args:
            branch_id: Optional branch ID to filter by. 
                      - User role: Filter by their assigned branch (branch_id provided)
                      - Manager/Admin roles: No filtering (branch_id is None) - see all branches
            user_role: User's role ("User", "Manager", "Admin") to determine field visibility.
            branch_name: Optional branch/site name filter.
            status: Optional tracking status filter (derived from cryolock flags and shipment status).
            cryolock_color: Optional cryolock color filter.
            goblet_color: Optional goblet color filter.
            offset: Number of records to skip (for lazy loading / infinite scroll).
            limit: Number of records to fetch.
        
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
                - status: Embryo tracking status (Manager/Admin roles only)
            - total: Total number of records
        """
        try:
            # Determine which fields to include based on role
            is_user_role = user_role and user_role.title() == "User"
            
            # Status priority for embryo tracking:
            # 1) in_transit flag -> "in transit"
            # 2) embryo_transfer flag -> "internal"
            # 3) fallback to latest shipment_status
            tracking_status_expr = case(
                (PatientCrylockInfo.in_transit == True, "in transit"),
                (PatientCrylockInfo.embryo_transfer == True, "internal"),
                else_=func.coalesce(IVFShipment.shipment_status, "")
            ).label("tracking_status")

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
            
            # Query PatientCrylockInfo with all related data and latest shipment in one query
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
                    IVFShipment.description.label('shipment_description'),
                    IVFShipment.shipment_status.label('shipment_status'),
                    tracking_status_expr
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
            # When branch_id is None, scope by hospital_id so Manager/Admin see only their hospital
            if branch_id is not None:
                query = query.filter(PatientCrylockInfo.branch_id == branch_id)
            elif hospital_id is not None:
                query = query.filter(HospitalBranch.hospital_id == hospital_id)
            
            # Apply optional branch/site name filter
            normalized_branch_name = branch_name.strip() if branch_name else None
            if normalized_branch_name:
                query = query.filter(
                    func.lower(HospitalBranch.branch_name) == func.lower(normalized_branch_name)
                )

            # Apply optional status filter
            normalized_status = status.strip() if status else None
            if normalized_status:
                normalized_status = normalized_status.replace("_", " ")
                query = query.filter(
                    func.lower(tracking_status_expr) == func.lower(normalized_status)
                )

            # Apply optional cryolock color filter
            normalized_cryolock_color = cryolock_color.strip() if cryolock_color else None
            if normalized_cryolock_color:
                query = query.filter(
                    func.lower(func.coalesce(PatientCrylockInfo.crylock_color, "")) == func.lower(normalized_cryolock_color)
                )

            # Apply optional goblet color filter
            normalized_goblet_color = goblet_color.strip() if goblet_color else None
            if normalized_goblet_color:
                query = query.filter(
                    func.lower(func.coalesce(PatientCrylockInfo.goblet_color, "")) == func.lower(normalized_goblet_color)
                )
            
            # Count total before lazy-load slice.
            total_records = int(query.count() or 0)

            # Order by HIS number and cryolock number
            query = query.order_by(PatientCrylockInfo.his_number, PatientCrylockInfo.crylock_number)

            # Apply lazy-load slice.
            safe_offset = max(0, offset)
            safe_limit = max(1, limit)
            results = query.offset(safe_offset).limit(safe_limit).all()
            
            tracking_list = []
            
            for row in results:
                # Get description from the joined query result
                description = row.shipment_description if hasattr(row, 'shipment_description') else None
                tracking_status = row.tracking_status if hasattr(row, 'tracking_status') else None
                
                tracking_data = {
                    "his_number": decrypt_sensitive_ivf_value(row.his_number) or "",
                    "cryolock_number": decrypt_sensitive_ivf_value(row.crylock_number) or "",
                    "canister_number": str(row.canister_number) if row.canister_number else None,
                    "tank_code": row.tank_code or "",
                    "cane_code": row.cane_code or "",
                    "goblet_color": row.goblet_color or "",
                    "cryolock_color": row.crylock_color or "",
                    "date_of_vitrification": row.date_of_vitrification,
                    "description": description,
                    "site_name": row.branch_name or ""
                }
                
                # Role-based field visibility
                if is_user_role:
                    # User role: Include embryo_grading (not available in current model, return empty)
                    tracking_data["embryo_grading"] = ""
                else:
                    # Manager/Admin roles: Include shipment status.
                    tracking_data["status"] = tracking_status or ""
                
                # Append the tracking data to the list
                tracking_list.append(tracking_data)
            
            has_more = (safe_offset + len(tracking_list)) < total_records
            return {
                "data": tracking_list,
                "total": total_records,
                "offset": safe_offset,
                "limit": safe_limit,
                "has_more": has_more,
                "next_offset": (safe_offset + safe_limit) if has_more else None,
                "message": "No embryo tracking data found" if total_records == 0 else "Embryo tracking data fetched successfully"
            }
            
        except Exception as e:
            raise Exception(f"Error fetching embryo tracking data: {str(e)}")

    def get_embryo_tracking_filters(
        self,
        branch_id: Optional[int] = None,
        hospital_id: Optional[int] = None,
        branch_name: Optional[str] = None,
        status: Optional[str] = None,
        crylock_color: Optional[str] = None,
        goblet_color: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get distinct filter values and counts. When current filter params are passed, counts are
        conditioned on them (e.g. status counts within selected branch_name).
        """
        try:
            latest_shipments_subq = (
                self.db.query(
                    IVFShipment.patient_crylock_info_id,
                    func.max(IVFShipment.id).label("latest_shipment_id"),
                )
                .filter(IVFShipment.description.isnot(None))
                .group_by(IVFShipment.patient_crylock_info_id)
                .subquery()
            )
            tracking_status_expr = case(
                (PatientCrylockInfo.in_transit == True, "in transit"),
                (PatientCrylockInfo.embryo_transfer == True, "internal"),
                else_=func.coalesce(IVFShipment.shipment_status, ""),
            )
            need_status_join = bool(status and status.strip())

            def _apply_filters(q, apply_branch_name: bool, apply_status: bool, apply_goblet: bool, apply_crylock: bool):
                if branch_id is not None:
                    q = q.filter(PatientCrylockInfo.branch_id == branch_id)
                elif hospital_id is not None:
                    q = q.filter(HospitalBranch.hospital_id == hospital_id)
                if apply_branch_name and branch_name and branch_name.strip():
                    q = q.filter(func.lower(HospitalBranch.branch_name) == func.lower(branch_name.strip()))
                if apply_crylock and crylock_color and crylock_color.strip():
                    q = q.filter(
                        func.lower(func.coalesce(PatientCrylockInfo.crylock_color, ""))
                        == func.lower(crylock_color.strip())
                    )
                if apply_goblet and goblet_color and goblet_color.strip():
                    q = q.filter(
                        func.lower(func.coalesce(PatientCrylockInfo.goblet_color, ""))
                        == func.lower(goblet_color.strip())
                    )
                if apply_status and need_status_join:
                    norm = (status or "").strip().replace("_", " ")
                    q = q.filter(func.lower(tracking_status_expr) == func.lower(norm))
                return q

            # Base for queries that don't need status join
            def _base_query():
                return (
                    self.db.query(PatientCrylockInfo.id)
                    .join(Tank, PatientCrylockInfo.tank_id == Tank.tank_id)
                    .join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                )

            # Base with status join (for total and when filtering by status)
            def _base_with_status():
                q = (
                    self.db.query(PatientCrylockInfo.id)
                    .join(Tank, PatientCrylockInfo.tank_id == Tank.tank_id)
                    .join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                    .outerjoin(
                        latest_shipments_subq,
                        PatientCrylockInfo.id == latest_shipments_subq.c.patient_crylock_info_id,
                    )
                    .outerjoin(
                        IVFShipment,
                        and_(
                            IVFShipment.id == latest_shipments_subq.c.latest_shipment_id,
                            IVFShipment.patient_crylock_info_id == PatientCrylockInfo.id,
                        ),
                    )
                )
                return q

            # Total: all filters applied
            total_q = _base_with_status() if need_status_join else _base_query()
            total_q = _apply_filters(total_q, True, True, True, True)
            total = int(total_q.count() or 0)

            # Site names: filter by status, goblet, crylock (not branch_name)
            site_q = (
                self.db.query(HospitalBranch.branch_name, func.count(PatientCrylockInfo.id).label("cnt"))
                .join(PatientCrylockInfo, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                .join(Tank, PatientCrylockInfo.tank_id == Tank.tank_id)
                .filter(HospitalBranch.branch_name.isnot(None), HospitalBranch.branch_name != "")
            )
            if need_status_join:
                site_q = (
                    site_q.outerjoin(
                        latest_shipments_subq,
                        PatientCrylockInfo.id == latest_shipments_subq.c.patient_crylock_info_id,
                    )
                    .outerjoin(
                        IVFShipment,
                        and_(
                            IVFShipment.id == latest_shipments_subq.c.latest_shipment_id,
                            IVFShipment.patient_crylock_info_id == PatientCrylockInfo.id,
                        ),
                    )
                )
            site_q = _apply_filters(site_q, False, True, True, True)
            if branch_id is not None:
                site_q = site_q.filter(PatientCrylockInfo.branch_id == branch_id)
            elif hospital_id is not None:
                site_q = site_q.filter(HospitalBranch.hospital_id == hospital_id)
            site_rows = site_q.group_by(HospitalBranch.branch_name).all()
            site_names = sorted([r[0] for r in site_rows if r[0]])
            site_name_counts = {r[0]: r[1] for r in site_rows if r[0]}

            # Goblet colors: filter by branch_name, status, crylock
            goblet_q = (
                self.db.query(PatientCrylockInfo.goblet_color, func.count(PatientCrylockInfo.id).label("cnt"))
                .join(Tank, PatientCrylockInfo.tank_id == Tank.tank_id)
                .join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                .filter(PatientCrylockInfo.goblet_color.isnot(None), PatientCrylockInfo.goblet_color != "")
            )
            if need_status_join:
                goblet_q = (
                    goblet_q.outerjoin(
                        latest_shipments_subq,
                        PatientCrylockInfo.id == latest_shipments_subq.c.patient_crylock_info_id,
                    )
                    .outerjoin(
                        IVFShipment,
                        and_(
                            IVFShipment.id == latest_shipments_subq.c.latest_shipment_id,
                            IVFShipment.patient_crylock_info_id == PatientCrylockInfo.id,
                        ),
                    )
                )
            goblet_q = _apply_filters(goblet_q, True, True, False, True)
            if branch_id is not None:
                goblet_q = goblet_q.filter(PatientCrylockInfo.branch_id == branch_id)
            goblet_rows = goblet_q.group_by(PatientCrylockInfo.goblet_color).all()
            goblet_colors = sorted([r[0] for r in goblet_rows if r[0]])
            goblet_color_counts = {r[0]: r[1] for r in goblet_rows if r[0]}            # Cryolock colors: filter by branch_name, status, goblet
            crylock_q = (
                self.db.query(PatientCrylockInfo.crylock_color, func.count(PatientCrylockInfo.id).label("cnt"))
                .join(Tank, PatientCrylockInfo.tank_id == Tank.tank_id)
                .join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                .filter(PatientCrylockInfo.crylock_color.isnot(None), PatientCrylockInfo.crylock_color != "")
            )
            if need_status_join:
                crylock_q = (
                    crylock_q.outerjoin(
                        latest_shipments_subq,
                        PatientCrylockInfo.id == latest_shipments_subq.c.patient_crylock_info_id,
                    )
                    .outerjoin(
                        IVFShipment,
                        and_(
                            IVFShipment.id == latest_shipments_subq.c.latest_shipment_id,
                            IVFShipment.patient_crylock_info_id == PatientCrylockInfo.id,
                        ),
                    )
                )
            crylock_q = _apply_filters(crylock_q, True, True, True, False)
            if branch_id is not None:
                crylock_q = crylock_q.filter(PatientCrylockInfo.branch_id == branch_id)
            crylock_rows = crylock_q.group_by(PatientCrylockInfo.crylock_color).all()
            crylock_colors = sorted([r[0] for r in crylock_rows if r[0]])
            crylock_color_counts = {r[0]: r[1] for r in crylock_rows if r[0]}

            # Status: filter by branch_name, goblet, crylock
            status_q = (
                self.db.query(tracking_status_expr.label("status"), func.count(PatientCrylockInfo.id).label("cnt"))
                .select_from(PatientCrylockInfo)
                .join(Tank, PatientCrylockInfo.tank_id == Tank.tank_id)
                .join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                .outerjoin(
                    latest_shipments_subq,
                    PatientCrylockInfo.id == latest_shipments_subq.c.patient_crylock_info_id,
                )
                .outerjoin(
                    IVFShipment,
                    and_(
                        IVFShipment.id == latest_shipments_subq.c.latest_shipment_id,
                        IVFShipment.patient_crylock_info_id == PatientCrylockInfo.id,
                    ),
                )
            )
            status_q = _apply_filters(status_q, True, False, True, True)
            if branch_id is not None:
                status_q = status_q.filter(PatientCrylockInfo.branch_id == branch_id)
            status_rows = status_q.group_by(tracking_status_expr).all()
            statuses = sorted([(r[0] or "").strip() for r in status_rows if (r[0] or "").strip()])
            status_counts = {(r[0] or "").strip(): r[1] for r in status_rows if (r[0] or "").strip()}

            return {
                "site_names": site_names,
                "statuses": statuses,
                "goblet_colors": goblet_colors,
                "crylock_colors": crylock_colors,
                "total": total,
                "site_name_counts": site_name_counts,
                "status_counts": status_counts,
                "goblet_color_counts": goblet_color_counts,
                "crylock_color_counts": crylock_color_counts,
            }
        except Exception as e:
            logger.exception("Error fetching embryo tracking filters: %s", e)
            return {
                "site_names": [], "statuses": [], "goblet_colors": [], "crylock_colors": [],
                "total": 0,
                "site_name_counts": {}, "status_counts": {}, "goblet_color_counts": {}, "crylock_color_counts": {},
            }
