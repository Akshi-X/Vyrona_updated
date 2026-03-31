"""
Quality Tracking Service
Handles business logic for quality tracking operations including LN2 refill logs
"""
# Standard library imports
import io
import logging
import re
from datetime import date, datetime, timezone
from typing import List, Optional

# Third-party imports
import pandas as pd
from fastapi import Response
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

try:
    from openpyxl.styles import Alignment, Font, PatternFill  # type: ignore
except ImportError:
    # openpyxl.styles may not be available in all environments
    Alignment = Font = PatternFill = None

# Local application imports
from ...constants.error_codes import ERROR_CODES
from ...constants.http_status import HTTPStatus
from ...constants.messages import ErrorMessages
from ...exceptions.custom_exceptions import AppException
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.ivf_geolocation_model import IVFGeolocation
from ...models.IVF.ivf_quality_log_model import IVFQualityLog
from ...models.IVF.ivf_shipment_model import IVFShipment
from ...models.IVF.patient_crylock_info_model import PatientCrylockInfo
from ...models.IVF.tank_model import Tank
from ...models.readings_model import Readings
from ...models.kpi_config_model import KpiConfig
from ...utils.ivf_helpers import (
    decrypt_sensitive_ivf_value,
    encrypt_sensitive_ivf_value,
    find_tank_by_code,
    find_crylock_by_tank_code,
)
from ...schemas.IVF.quality_tracking_schema import (
    ColorUpdateResponse,
    CryolockColorUpdate,
    CryolockFlagUpdate,
    CryolockFlagUpdateResponse,
    GobletColorUpdate,
    InTransitWithShipmentRequest,
    InTransitWithShipmentResponse,
    IVFCanisterTrackingItem,
    IVFCanisterTrackingResponse,
    RefillLogCreate,
    RefillLogListResponse,
    RefillLogResponse,
    RefillLogStatusUpdate,
    RefillLogUpdate,
)
from ...service.iot_service import IoTService

logger = logging.getLogger(__name__)


class QualityTrackingService:
    """Service for quality tracking operations"""
    
    def __init__(self, db: Session):
        self.db = db

    def resolve_tank_id(self, tank_code: str, branch_id: Optional[int] = None) -> int:
        """
        Resolve a tank identifier to the internal tank_id.
        Accepts either numeric tank_id (e.g., "91") or tank_code (e.g., "T1", "T10").

        Args:
            tank_code: Tank ID or tank code
            branch_id: Optional branch filter for authorization (when present)

        Returns:
            tank_id (int)

        Raises:
            AppException: If the tank is not found (or not accessible under branch filter)
        """
        try:
            identifier = str(tank_code).strip()
            tank = None

            # Numeric path segments are treated as tank_id.
            if identifier.isdigit():
                tank_query = self.db.query(Tank).filter(Tank.tank_id == int(identifier))
                if branch_id is not None:
                    tank_query = tank_query.filter(Tank.branch_id == branch_id)
                tank = tank_query.first()

            # Fallback to tank_code lookup.
            if not tank:
                tank = find_tank_by_code(self.db, identifier, branch_id)
            
            if not tank:
                available_tanks = []
                if branch_id is not None:
                    available_tanks_query = (
                        self.db.query(Tank.tank_code)
                        .filter(Tank.branch_id == branch_id)
                        .limit(10)
                    )
                    available_tanks = [t[0] for t in available_tanks_query.all()]
                
                error_msg = f"Tank '{identifier}' not found"
                if branch_id:
                    error_msg += f" in branch {branch_id}"
                if available_tanks:
                    error_msg += f". Available tanks in this branch: {', '.join(map(str, available_tanks))}"
                
                raise AppException(
                    message=error_msg,
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )

            return tank.tank_id
        except AppException:
            raise
        except Exception as e:
            logger.error(f"Error resolving tank_id for identifier={tank_code}: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to resolve tank: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    # Removed resolve_canister_id method - canisters are no longer used
    # All functionality now works directly with PatientCrylockInfo and Tank models
    
    # Removed _get_canister_id_from_tank and _get_canister_id_from_tank_and_cryolock methods
    # These methods referenced deleted models (Canister, Cane, Cryolock) and are no longer needed
    # All functionality now works directly with PatientCrylockInfo and Tank models
    
    def create_refill_log_for_tank(
        self,
        tank_id: int,
        canister_number: Optional[str],
        refill_log_data: RefillLogCreate,
        created_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> RefillLogResponse:
        """
        Create a new Liquid Nitrogen (LN2) refill log entry for a tank.
        
        Args:
            tank_id: Tank ID
            canister_number: Optional canister number (kept for backward compatibility, not used)
            refill_log_data: Refill log data to create
            created_by: Username of the user creating the log
            branch_id: Optional branch ID for filtering
            
        Returns:
            RefillLogResponse with created log details
        """
        return self.create_refill_log(
            tank_id=tank_id,
            refill_log_data=refill_log_data,
            created_by=created_by,
            branch_id=branch_id
            )
    
    def create_refill_log(
        self,
        tank_id: int,
        refill_log_data: RefillLogCreate,
        created_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> RefillLogResponse:
        """
        Create a new refill log entry
        
        Args:
            tank_id: Tank ID from URL path
            refill_log_data: Refill log data to create
            created_by: Username of the user creating the log
            branch_id: Optional branch ID for authorization/filtering (not stored in DB - uses tank's branch_id instead)
            
        Returns:
            Created refill log response
            
        Raises:
            AppException: If creation fails
        """
        try:
            # Get tank to retrieve its actual branch_id (not the override)
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if not tank:
                raise AppException(
                    message=f"Tank with ID {tank_id} not found",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Use tank's actual branch_id for database storage (not the override)
            # branch_id parameter is only used for authorization/filtering
            tank_branch_id = tank.branch_id
            
            # Calculate counts based on latest log for this tank
            last_log = self.db.query(CanisterLn2Log).filter(
                CanisterLn2Log.tank_id == tank_id
            ).order_by(
                desc(CanisterLn2Log.created_at)
            ).first()

            last_refilled_count = last_log.refilled_count if last_log else 0
            last_opened_count = last_log.opened_count if last_log else 0

            # Create new refill log using CanisterLn2Log model
            # Use tank's branch_id, not the override (override is only for filtering)
            refill_log = CanisterLn2Log(
                tank_id=tank_id,
                refill_date=refill_log_data.refill_date,
                refill_time=refill_log_data.refill_time,
                refilled_by=refill_log_data.refilled_by,
                description=refill_log_data.description,
                status=refill_log_data.status,
                cryoshipper=refill_log_data.cryoshipper,
                disinfected_shipper_infected_tank_description=refill_log_data.disinfected_shipper_infected_tank_description,
                reservoir_id=refill_log_data.reservoir_id,
                created_by=created_by,
                branch_id=tank_branch_id,  # Use tank's actual branch_id, not override
                refilled_count=last_refilled_count + 1,
                opened_count=last_opened_count + 1
            )
            
            self.db.add(refill_log)
            self.db.commit()
            self.db.refresh(refill_log)
            
            logger.info(f"Created refill log with ID {refill_log.log_id} for tank {tank_id}")
            
            return RefillLogResponse.model_validate(refill_log)
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating refill log: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to create refill log: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def get_refill_logs(
        self,
        tank_id: int,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> RefillLogListResponse:
        """
        Get refill logs for a specific tank with optional filtering
        
        Args:
            tank_id: Tank ID to filter by (required)
            status: Optional status to filter by
            limit: Optional limit on number of results
            
        Returns:
            List of refill logs matching the criteria
        """
        try:
            query = self.db.query(CanisterLn2Log)
            
            # Filter by tank_id
            query = query.filter(CanisterLn2Log.tank_id == tank_id)

            # Enforce branch filter when provided
            if branch_id is not None:
                query = query.filter(CanisterLn2Log.branch_id == branch_id)
            
            if status:
                query = query.filter(CanisterLn2Log.status == status)
            
            # Order by most recent first
            query = query.order_by(
                desc(CanisterLn2Log.refill_date),
                desc(CanisterLn2Log.refill_time),
                desc(CanisterLn2Log.created_at)
            )
            
            # Apply limit if provided
            if limit:
                query = query.limit(limit)
            
            refill_logs = query.all()
            
            refill_log_responses = [RefillLogResponse.model_validate(log) for log in refill_logs]
            
            return RefillLogListResponse(
                refill_logs=refill_log_responses,
                count=len(refill_log_responses)
            )
            
        except Exception as e:
            logger.error(f"Error fetching refill logs: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to fetch refill logs: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def get_refill_logs_for_tank(
        self,
        tank_id: int,
        canister_number: Optional[str] = None,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> RefillLogListResponse:
        """
        Get refill logs for a specific tank.
        
        Args:
            tank_id: Tank ID
            canister_number: Optional canister number (kept for backward compatibility, not used)
            status: Optional status to filter by
            limit: Optional limit on number of results
            branch_id: Optional branch ID for filtering
            
        Returns:
            List of refill logs matching the criteria
        """
        try:
            # Query refill logs directly by tank_id
            query = self.db.query(CanisterLn2Log).filter(
                CanisterLn2Log.tank_id == tank_id
            )
            
            if branch_id is not None:
                query = query.filter(CanisterLn2Log.branch_id == branch_id)
            
            if status:
                query = query.filter(CanisterLn2Log.status == status)
            
            # Order by most recent first
            query = query.order_by(
                desc(CanisterLn2Log.refill_date),
                desc(CanisterLn2Log.refill_time),
                desc(CanisterLn2Log.created_at)
            )
            
            # Apply limit if provided
            if limit:
                query = query.limit(limit)
            
            refill_logs = query.all()
            refill_log_responses = [RefillLogResponse.model_validate(log) for log in refill_logs]
            
            return RefillLogListResponse(
                refill_logs=refill_log_responses,
                count=len(refill_log_responses)
            )
            
        except Exception as e:
            logger.error(f"Error fetching refill logs for tank: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to fetch refill logs: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def update_refill_log_status(
        self,
        tank_id: int,
        log_id: int,
        status_update: RefillLogStatusUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> RefillLogResponse:
        """
        Update only the status of a refill log.
        """
        try:
            query = self.db.query(CanisterLn2Log).filter(
                CanisterLn2Log.log_id == log_id,
                CanisterLn2Log.tank_id == tank_id
            )

            if branch_id is not None:
                query = query.filter(CanisterLn2Log.branch_id == branch_id)

            refill_log = query.first()
            if not refill_log:
                raise AppException(
                    message=f"Refill log with ID {log_id} not found",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )

            refill_log.status = status_update.status
            refill_log.updated_by = updated_by

            self.db.commit()
            self.db.refresh(refill_log)

            logger.info(
                "Updated refill log status | log_id=%s tank_id=%s status=%s",
                log_id,
                tank_id,
                status_update.status
            )

            return RefillLogResponse.model_validate(refill_log)
        except AppException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating refill log status: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to update refill log status: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def update_refill_log_for_tank(
        self,
        tank_id: int,
        log_id: int,
        update_data: RefillLogUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> RefillLogResponse:
        """
        Update editable fields (status, reservoir, ln2_ordered_date, ln2_received_date)
        of a refill log. Only provided (non-None) fields are applied.
        Validates that the log belongs to the specified tank.
        """
        try:
            query = self.db.query(CanisterLn2Log).filter(
                CanisterLn2Log.log_id == log_id,
                CanisterLn2Log.tank_id == tank_id
            )

            if branch_id is not None:
                query = query.filter(CanisterLn2Log.branch_id == branch_id)

            refill_log = query.first()
            if not refill_log:
                raise AppException(
                    message=f"Refill log with ID {log_id} not found in tank",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )

            if 'status' in update_data.model_fields_set and update_data.status is not None:
                refill_log.status = update_data.status
            if 'reservoir' in update_data.model_fields_set:
                refill_log.reservoir = update_data.reservoir or None
            if 'ln2_ordered_date' in update_data.model_fields_set:
                refill_log.ln2_ordered_date = update_data.ln2_ordered_date
            if 'ln2_received_date' in update_data.model_fields_set:
                refill_log.ln2_received_date = update_data.ln2_received_date

            refill_log.updated_by = updated_by

            self.db.commit()
            self.db.refresh(refill_log)

            logger.info(
                "Updated refill log | log_id=%s tank_id=%s",
                log_id,
                tank_id,
            )

            return RefillLogResponse.model_validate(refill_log)
        except AppException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating refill log: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to update refill log: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def update_refill_log_status_for_tank(
        self,
        tank_id: int,
        log_id: int,
        status_update: RefillLogStatusUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> RefillLogResponse:
        """
        Update only the status of a refill log. The log_id uniquely identifies the log.
        Validates that the log belongs to the specified tank.
        """
        try:
            query = self.db.query(CanisterLn2Log).filter(
                CanisterLn2Log.log_id == log_id,
                CanisterLn2Log.tank_id == tank_id
            )
            
            if branch_id is not None:
                query = query.filter(CanisterLn2Log.branch_id == branch_id)
            
            refill_log = query.first()
            if not refill_log:
                raise AppException(
                    message=f"Refill log with ID {log_id} not found in tank",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            refill_log.status = status_update.status
            refill_log.updated_by = updated_by
            
            self.db.commit()
            self.db.refresh(refill_log)
            
            logger.info(
                "Updated refill log status | log_id=%s tank_id=%s status=%s",
                log_id,
                tank_id,
                status_update.status
            )
            
            return RefillLogResponse.model_validate(refill_log)
        except AppException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating refill log status: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to update refill log status: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def get_tank_tracking_details(
        self,
        tank_id: int,
        branch_id: Optional[int] = None,
        user_role: Optional[str] = None
    ) -> IVFCanisterTrackingResponse:
        """
        Fetch tracking details for all patient crylocks in a specific tank.

        Response includes crylock flags: embryo_transfer and in_transit.
        Also returns available_slots calculated as:
        total_slots - count(crylocks where embryo_transfer OR in_transit)
        """
        try:
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if not tank:
                raise AppException(
                    message=f"Tank with ID '{tank_id}' not found",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # For User role: branch_id is provided and must match tank's branch
            # For Admin/Manager: branch_id is None, but we still filter by tank's branch for security
            # Always filter by the user's branch_id if provided (User role), otherwise use tank's branch
            filter_branch_id = branch_id if branch_id is not None else tank.branch_id
            
            # Verify tank belongs to user's branch (for User role)
            if branch_id is not None and tank.branch_id != branch_id:
                raise AppException(
                    message=f"Tank '{tank_id}' does not belong to your branch",
                    error_code=ErrorMessages.FORBIDDEN,
                    status_code=HTTPStatus.FORBIDDEN
                )
            
            # total_slots = all patient crylock records in this tank for the user's branch
            total_slots_query = (
                self.db.query(func.count(PatientCrylockInfo.id))
                .filter(
                    PatientCrylockInfo.tank_id == tank.tank_id,
                    PatientCrylockInfo.branch_id == filter_branch_id
                )
            )
            total_slots = total_slots_query.scalar() or 0

            # available_slots = count of records where embryo_transfer OR in_transit is True
            moved_count_query = (
                self.db.query(func.count(PatientCrylockInfo.id))
                .filter(
                    PatientCrylockInfo.tank_id == tank.tank_id,
                    PatientCrylockInfo.branch_id == filter_branch_id,
                    or_(
                        PatientCrylockInfo.embryo_transfer == True,
                        PatientCrylockInfo.in_transit == True
                    )
                )
            )
            moved_count = moved_count_query.scalar() or 0
            available_slots = moved_count

            # Data rows - return patient crylocks in the specified tank for the user's branch.
            # Exclude embryo_transfer=True always.
            # Exclude in_transit=True only when the latest shipment's current coordinates
            # match the destination coordinates (shipment reached destination).
            latest_shipments_subquery = (
                self.db.query(
                    IVFShipment.patient_crylock_info_id.label("patient_crylock_info_id"),
                    func.max(IVFShipment.id).label("latest_shipment_id")
                )
                .group_by(IVFShipment.patient_crylock_info_id)
                .subquery()
            )

            latest_geolocation_subquery = (
                self.db.query(
                    IVFGeolocation.shipment_id.label("shipment_id"),
                    func.max(IVFGeolocation.reading_timestamp).label("latest_reading_timestamp")
                )
                .filter(IVFGeolocation.shipment_id.isnot(None))
                .group_by(IVFGeolocation.shipment_id)
                .subquery()
            )

            # Small tolerance to avoid float precision issues in GPS comparisons.
            coordinate_match_tolerance = 0.0001
            arrived_cryolock_ids_query = (
                self.db.query(IVFShipment.patient_crylock_info_id)
                .join(
                    latest_shipments_subquery,
                    IVFShipment.id == latest_shipments_subquery.c.latest_shipment_id
                )
                .join(
                    latest_geolocation_subquery,
                    IVFShipment.shipment_id == latest_geolocation_subquery.c.shipment_id
                )
                .join(
                    IVFGeolocation,
                    and_(
                        IVFGeolocation.shipment_id == latest_geolocation_subquery.c.shipment_id,
                        IVFGeolocation.reading_timestamp == latest_geolocation_subquery.c.latest_reading_timestamp
                    )
                )
                .filter(
                    IVFGeolocation.current_latitude.isnot(None),
                    IVFGeolocation.current_longitude.isnot(None),
                    IVFGeolocation.shipment_to_latitude.isnot(None),
                    IVFGeolocation.shipment_to_longitude.isnot(None),
                    func.abs(IVFGeolocation.current_latitude - IVFGeolocation.shipment_to_latitude) <= coordinate_match_tolerance,
                    func.abs(IVFGeolocation.current_longitude - IVFGeolocation.shipment_to_longitude) <= coordinate_match_tolerance
                )
            )

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
                    PatientCrylockInfo.embryo_transfer,
                    PatientCrylockInfo.in_transit,
                    PatientCrylockInfo.id
                )
                .filter(
                    PatientCrylockInfo.tank_id == tank.tank_id,
                    PatientCrylockInfo.branch_id == filter_branch_id,  # Filter by user's branch
                    # Exclude embryo_transfer crylocks
                    PatientCrylockInfo.embryo_transfer != True,
                    # Keep in_transit rows unless their latest shipment has reached destination.
                    or_(
                        PatientCrylockInfo.in_transit != True,
                        ~PatientCrylockInfo.id.in_(arrived_cryolock_ids_query)
                    )
                )
            )

            query = query.order_by(PatientCrylockInfo.his_number, PatientCrylockInfo.crylock_number)
            results = query.all()

            # Get patient crylock info IDs to fetch shipment descriptions
            patient_crylock_info_ids = [row.id for row in results]
            
            # Fetch descriptions from ivf_shipment table for patient crylocks
            # Get the most recent shipment description for each patient crylock
            shipment_descriptions = {}
            if patient_crylock_info_ids:
                # Use a subquery to get the latest shipment per patient crylock
                latest_shipments = (
                    self.db.query(
                        IVFShipment.patient_crylock_info_id,
                        func.max(IVFShipment.id).label('latest_shipment_id')
                    )
                    .filter(
                        IVFShipment.patient_crylock_info_id.in_(patient_crylock_info_ids),
                        IVFShipment.description.isnot(None)
                    )
                    .group_by(IVFShipment.patient_crylock_info_id)
                    .subquery()
                )
                
                shipment_descriptions_query = (
                    self.db.query(
                        IVFShipment.patient_crylock_info_id,
                        IVFShipment.description
                    )
                    .join(
                        latest_shipments,
                        IVFShipment.id == latest_shipments.c.latest_shipment_id
                    )
                )
                
                for shipment_row in shipment_descriptions_query.all():
                    shipment_descriptions[shipment_row.patient_crylock_info_id] = shipment_row.description

            tracking_rows: List[IVFCanisterTrackingItem] = []
            for row in results:
                # Get description for this patient crylock if it exists
                description = shipment_descriptions.get(row.id)
                
                tracking_rows.append(
                    IVFCanisterTrackingItem(
                        his_number=decrypt_sensitive_ivf_value(row.his_number) or "",
                        cryolock_number=decrypt_sensitive_ivf_value(row.crylock_number) or "",
                        canister_number=row.canister_number,
                        tank_code=row.tank_code or "",
                        cane_code=row.cane_code or "",
                        goblet_color=row.goblet_color or "",
                        cryolock_color=row.crylock_color or "",
                        date_of_vitrification=row.date_of_vitrification,
                        embryo_transfer=bool(row.embryo_transfer),
                        in_transit=bool(row.in_transit),
                        description=description
                    )
                )

            return IVFCanisterTrackingResponse(
                data=tracking_rows,
                total=total_slots,
                available_slots=available_slots
            )
        except AppException:
            # Re-raise AppException as-is to preserve status code
            raise
        except Exception as e:
            logger.error(f"Error fetching canister tracking details: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to fetch canister tracking details: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def mark_embryo_transfer_for_tank(
        self,
        tank_id: int,
        flag_update: CryolockFlagUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> CryolockFlagUpdateResponse:
        """Mark a cryolock as moved to embryo transfer (embryo_transfer = True) within a tank."""
        # Work directly with PatientCrylockInfo - no need for canister_id
        return self._set_cryolock_flag(
            canister_id=tank_id,  # Pass tank_id as canister_id for compatibility (not used in _set_cryolock_flag)
            cryolock_number=flag_update.cryolock_number,
            flag_field="embryo_transfer",
            updated_by=updated_by,
            branch_id=branch_id,
            tank_code=tank_code
        )

    def _parse_description(self, description: str) -> dict:
        """
        Parse description to extract source, destination, and device_id.
        
        Expected format: "crylock is move from <source> to <destination>-deviceid -<device_id>"
        Example: "crylock is move from egmore to thambaram-deviceid -xxxxx"
        
        Returns dict with: source_location, destination_location, device_id
        """
        # Normalize description - replace newlines and multiple spaces with single space
        # This handles frontend format with newlines: "From\nEgmore\nto\nErode\nDevice Id:\ndevice ID\n1344t3"
        description_normalized = re.sub(r'\s+', ' ', description.strip())
        desc_lower = description_normalized.lower()
        
        # Extract device ID - look for patterns like:
        # Frontend format: "Device Id: device ID 1344t3" (after normalization)
        # Standard formats: "-deviceid -xxxxx", "-deviceid-xxxxx", "deviceid -xxxxx", "deviceid: xxxxx", etc.
        device_id = None
        device_patterns = [
            # Frontend format: "Device Id:" followed by "device ID" and then the actual ID
            # Example: "Device Id: device ID 1344t3" -> captures "1344t3"
            # This pattern ensures we skip "device ID" and capture the actual ID after it
            r'device\s*id\s*:\s*device\s*id\s+([a-zA-Z0-9_-]{3,})',
            # Frontend format without "device ID" text: "Device Id: 1344t3"
            r'device\s*id\s*:\s+([a-zA-Z0-9_-]{3,})',
            # Pattern: "device ID" followed by ID (handles frontend format without colon)
            r'device\s*id\s+([a-zA-Z0-9_-]{3,})',
            # Standard formats
            r'-deviceid\s*[-:]\s*([a-zA-Z0-9_-]+)',
            r'deviceid\s*[-:]\s*([a-zA-Z0-9_-]+)',
            r'-deviceid\s+([a-zA-Z0-9_-]+)',
            r'deviceid\s+([a-zA-Z0-9_-]+)',
        ]
        
        for pattern in device_patterns:
            match = re.search(pattern, desc_lower, re.IGNORECASE)
            if match:
                device_id = match.group(1).strip()
                # Remove device_id part from description for location parsing
                description_normalized = re.sub(pattern, '', description_normalized, flags=re.IGNORECASE)
                break
        
        # Use normalized description for location parsing
        description = description_normalized
        
        # Extract source and destination - look for "from X to Y" pattern
        # Patterns: "from <source> to <destination>", "move from <source> to <destination>"
        source_location = None
        destination_location = None
        
        # Try various patterns
        patterns = [
            r'(?:move|moving|transfer|transferring)\s+from\s+([a-zA-Z0-9\s-]+?)\s+to\s+([a-zA-Z0-9\s-]+)',
            r'from\s+([a-zA-Z0-9\s-]+?)\s+to\s+([a-zA-Z0-9\s-]+)',
            r'([a-zA-Z0-9\s-]+?)\s+to\s+([a-zA-Z0-9\s-]+)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, description, re.IGNORECASE)
            if match:
                source_location = match.group(1).strip()
                destination_location = match.group(2).strip()
                # Clean up common words
                source_location = re.sub(r'\b(crylock|cryolock|is|move|moving|transfer)\b', '', source_location, flags=re.IGNORECASE).strip()
                destination_location = re.sub(r'\b(crylock|cryolock|is|move|moving|transfer)\b', '', destination_location, flags=re.IGNORECASE).strip()
                break
        
        return {
            "source_location": source_location,
            "destination_location": destination_location,
            "device_id": device_id
        }
    
    def _find_branch_by_name(self, location_name: str) -> Optional[HospitalBranch]:
        """
        Find branch by matching location name to branch_name.
        Performs case-insensitive partial matching.
        """
        if not location_name:
            return None
        
        # Try exact match first (case-insensitive)
        branch = self.db.query(HospitalBranch).filter(
            func.lower(HospitalBranch.branch_name) == location_name.lower()
        ).first()
        
        if branch:
            return branch
        
        # Try partial match (contains)
        branch = self.db.query(HospitalBranch).filter(
            func.lower(HospitalBranch.branch_name).contains(location_name.lower())
        ).first()
        
        if branch:
            return branch
        
        # Try matching against district_name or area
        branch = self.db.query(HospitalBranch).filter(
            or_(
                func.lower(HospitalBranch.district_name).contains(location_name.lower()),
                func.lower(HospitalBranch.area).contains(location_name.lower())
            )
        ).first()
        
        return branch

    def mark_in_transit_with_shipment(
        self,
        canister_id: int,
        request: InTransitWithShipmentRequest,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> InTransitWithShipmentResponse:
        """
        Mark a cryolock as in transit AND create IoT shipment.
        
        Description format: "crylock is move from <source> to <destination>-deviceid -<device_id>"
        Example: "crylock is move from egmore to thambaram-deviceid -xxxxx"
        
        Steps:
        1. Get cryolock and validate
        2. Get source branch (from canister → tank → branch)
        3. Parse description to extract destination and device_id
        4. Find destination branch by name
        5. Generate shipment ID (format: SHIP-YYYYMMDD-CANISTER_ID-CRYOLOCK_ID)
        6. Build IoT shipment payload
        7. Create IoT shipment via IoTService
        8. Mark cryolock as in_transit = True
        9. Store shipment record in DB
        10. Return response with shipment details
        """
        try:
            # Step 1 & 2: Get PatientCrylockInfo, tank, and source branch using tank_id.
            tank_query = self.db.query(Tank).filter(Tank.tank_id == canister_id)
            if branch_id is not None:
                tank_query = tank_query.filter(Tank.branch_id == branch_id)
            tank = tank_query.first()
            
            if not tank:
                raise AppException(
                    message=f"Tank with ID '{canister_id}' not found" + (f" in your branch" if branch_id else ""),
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Find PatientCrylockInfo by tank_id and crylock_number
            encrypted_cryolock_number = encrypt_sensitive_ivf_value(request.cryolock_number)
            query = (
                self.db.query(PatientCrylockInfo)
                .filter(
                    PatientCrylockInfo.tank_id == tank.tank_id,
                    PatientCrylockInfo.crylock_number.in_([
                        encrypted_cryolock_number,
                        request.cryolock_number
                    ])
                )
            )

            if branch_id is not None:
                query = query.filter(PatientCrylockInfo.branch_id == branch_id)

            cryolock = query.first()
            
            if not cryolock:
                error_msg = f"Cryolock with number '{request.cryolock_number}' not found"
                error_msg += f" in tank {tank.tank_code or canister_id}"
                if branch_id is not None:
                    error_msg += f" in your branch"
                raise AppException(
                    message=error_msg,
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Get tank and source branch from cryolock's direct references
            tank = self.db.query(Tank).filter(Tank.tank_id == cryolock.tank_id).first()
            source_branch = self.db.query(HospitalBranch).filter(
                HospitalBranch.branch_id == cryolock.branch_id
            ).first()
            
            if not tank:
                raise AppException(
                    message=f"Tank {cryolock.tank_id} not found",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            if not source_branch:
                raise AppException(
                    message=f"Source branch {cryolock.branch_id} not found",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )

            # Validate: Check in_transit column FIRST - if True, immediately return error
            # Do not proceed with any shipment creation or database changes
            if cryolock.in_transit:
                raise AppException(
                    message=ErrorMessages.CRYOLOCK_ACTIVE_SHIPMENT_EXISTS.format(cryolock_number=request.cryolock_number),
                    error_code=ERROR_CODES["CRYOLOCK_ACTIVE_SHIPMENT_EXISTS"],
                    status_code=HTTPStatus.BAD_REQUEST
                )

            # Step 3: Parse description to extract source, destination and device_id
            parsed = self._parse_description(request.description)
            source_location_name = parsed.get("source_location")
            destination_location_name = parsed.get("destination_location")
            device_id = parsed.get("device_id")
            
            if not destination_location_name:
                raise AppException(
                    message="Could not extract destination location from description. Expected format: 'crylock is move from <source> to <destination>-deviceid -<device_id>'",
                    error_code=ErrorMessages.BAD_REQUEST,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Validate source location matches canister's current branch (if provided in description)
            if source_location_name:
                source_branch_name_lower = (source_branch.branch_name or "").lower()
                source_location_lower = source_location_name.lower()
                # Check if source matches (case-insensitive, partial match)
                if source_location_lower not in source_branch_name_lower and source_branch_name_lower not in source_location_lower:
                    # Also check district_name and area
                    district_match = source_branch.district_name and source_location_lower in (source_branch.district_name.lower() or "")
                    area_match = source_branch.area and source_location_lower in (source_branch.area.lower() or "")
                    if not (district_match or area_match):
                        logger.warning(f"Source location '{source_location_name}' in description doesn't match canister's branch '{source_branch.branch_name}'. Using canister's branch as source.")
                        # Continue anyway - use canister's branch as source
            
            # Step 4: Find destination branch by name
            destination_branch = self._find_branch_by_name(destination_location_name)
            if not destination_branch:
                raise AppException(
                    message=f"Destination branch '{destination_location_name}' not found. Please check the branch name in your description. Available branches can be queried from the control tower API.",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )

            # Validate coordinates exist
            if not source_branch.latitude or not source_branch.longitude:
                raise AppException(
                    message=f"Source branch {source_branch.branch_id} missing coordinates",
                    error_code=ErrorMessages.BAD_REQUEST,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            if not destination_branch.latitude or not destination_branch.longitude:
                raise AppException(
                    message=f"Destination branch {destination_branch.branch_id} missing coordinates",
                    error_code=ErrorMessages.BAD_REQUEST,
                    status_code=HTTPStatus.BAD_REQUEST
                )

            # Step 5: Generate shipment ID (format: SHIP-YYYYMMDD-PATIENT_CRYLOCK_INFO_ID)
            shipment_id = f"SHIP-{datetime.now().strftime('%Y%m%d')}-{cryolock.id}"

            # Step 6: Build IoT shipment payload
            # Build address objects
            from_address = {
                "street": source_branch.area or "",
                "locality": source_branch.district_name or "",
                "state": source_branch.state_name or "",
                "country": source_branch.country_name or "",
                "postalCode": source_branch.pincode or ""
            }
            
            to_address = {
                "street": destination_branch.area or "",
                "locality": destination_branch.district_name or "",
                "state": destination_branch.state_name or "",
                "country": destination_branch.country_name or "",
                "postalCode": destination_branch.pincode or ""
            }

            # Build shipment leg (single leg for IVF)
            shipment_leg = {
                "mode": "Road",  # Default mode, can be made configurable
                "fromAddress": from_address,
                "toAddress": to_address,
                "fromCoordinates": {
                    "latitude": float(source_branch.latitude),
                    "longitude": float(source_branch.longitude)
                },
                "toCoordinates": {
                    "latitude": float(destination_branch.latitude),
                    "longitude": float(destination_branch.longitude)
                },
                "shipFromDate": datetime.now(timezone.utc).isoformat()
            }

            # Build IoT shipment request
            iot_shipment_payload = {
                "request": {},
                "ShipmentId": shipment_id,
                "name": request.description,
                "ShipmentLegs": [shipment_leg]
            }

            # Add device if extracted from description
            if device_id:
                iot_shipment_payload["devices"] = [device_id]

            # Step 7: Create IoT shipment
            iot_service = IoTService.get_instance()
            iot_response = None
            iot_shipment_id = None
            
            try:
                iot_response = iot_service.create_shipment(**iot_shipment_payload)
                # Extract IoT shipment ID from response (structure may vary)
                if isinstance(iot_response, dict):
                    iot_shipment_id = iot_response.get("shipmentId") or iot_response.get("id") or iot_response.get("ShipmentId")
                logger.info(f"Successfully created IoT shipment: {iot_shipment_id}")
            except Exception as iot_error:
                logger.error(f"Failed to create IoT shipment, but continuing with DB record: {str(iot_error)}", exc_info=True)
                # Continue even if IoT API fails - we'll still mark as in_transit and store shipment record

            # Step 8: Mark cryolock as in_transit
            cryolock.in_transit = True
            cryolock.updated_by = updated_by

            # Step 9: Store shipment record in DB using new table structure
            ivf_shipment = IVFShipment(
                shipment_id=shipment_id,
                iot_shipment_id=iot_shipment_id,
                patient_crylock_info_id=cryolock.id,  # Use PatientCrylockInfo.id instead of cryolock_id
                source_branch_id=source_branch.branch_id,
                destination_branch_id=destination_branch.branch_id,
                description=request.description,
                device_id=device_id,
                shipment_status="created" if iot_shipment_id else "failed",
                source_location=source_branch.branch_name or f"Branch {source_branch.branch_id}",
                source_latitude=float(source_branch.latitude),
                source_longitude=float(source_branch.longitude),
                destination_location=destination_branch.branch_name or f"Branch {destination_branch.branch_id}",
                destination_latitude=float(destination_branch.latitude),
                destination_longitude=float(destination_branch.longitude),
                scheduled_departure_time=datetime.now(timezone.utc),
                created_by=updated_by,
                updated_by=updated_by
            )
            
            self.db.add(ivf_shipment)
            self.db.commit()
            self.db.refresh(ivf_shipment)
            self.db.refresh(cryolock)
            
            # Verify in_transit was updated successfully
            if not cryolock.in_transit:
                logger.error(f"Failed to update in_transit flag for cryolock {cryolock.id}")
                raise AppException(
                    message="Failed to update cryolock in_transit status",
                    error_code=ERROR_CODES["SERVER_ERROR"],
                    status_code=HTTPStatus.INTERNAL_SERVER_ERROR
                )

            # Step 10: Build response
            shipment_response = {
                "shipment_id": shipment_id,
                "iot_shipment_id": iot_shipment_id,
                "source_branch": {
                    "branch_id": source_branch.branch_id,
                    "branch_name": source_branch.branch_name,
                    "address": f"{source_branch.area or ''}, {source_branch.district_name or ''}, {source_branch.state_name or ''}, {source_branch.country_name or ''}",
                    "latitude": float(source_branch.latitude),
                    "longitude": float(source_branch.longitude)
                },
                "destination_branch": {
                    "branch_id": destination_branch.branch_id,
                    "branch_name": destination_branch.branch_name,
                    "address": f"{destination_branch.area or ''}, {destination_branch.district_name or ''}, {destination_branch.state_name or ''}, {destination_branch.country_name or ''}",
                    "latitude": float(destination_branch.latitude),
                    "longitude": float(destination_branch.longitude)
                },
                "description": request.description,
                "device_id": device_id,
                "parsed_source": parsed.get("source_location"),
                "parsed_destination": parsed.get("destination_location"),
                "status": ivf_shipment.shipment_status
            }

            return InTransitWithShipmentResponse(
                success=True,
                message="Cryolock marked as in transit and shipment created successfully",
                cryolock_number=decrypt_sensitive_ivf_value(cryolock.crylock_number) or request.cryolock_number,
                in_transit=True,
                shipment=shipment_response
            )

        except AppException:
            self.db.rollback()
            raise
        except IntegrityError as e:
            self.db.rollback()
            error_str = str(e).lower()
            # Check if it's a unique constraint violation for shipment_id
            if 'shipment_id' in error_str or 'unique' in error_str:
                logger.error(f"Duplicate shipment detected: {str(e)}", exc_info=True)
                raise AppException(
                    message=ErrorMessages.CRYOLOCK_ACTIVE_SHIPMENT_EXISTS.format(cryolock_number=request.cryolock_number),
                    error_code=ERROR_CODES["CRYOLOCK_ACTIVE_SHIPMENT_EXISTS"],
                    status_code=HTTPStatus.BAD_REQUEST
                )
            else:
                logger.error(f"Database integrity error in mark_in_transit_with_shipment: {str(e)}", exc_info=True)
                raise AppException(
                    message=f"Failed to create shipment due to database constraint violation: {str(e)}",
                    error_code=ERROR_CODES["SERVER_ERROR"],
                    status_code=HTTPStatus.INTERNAL_SERVER_ERROR
                )
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error in mark_in_transit_with_shipment: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to create shipment: {str(e)}",
                error_code=ERROR_CODES["SERVER_ERROR"],
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def mark_in_transit_with_shipment_for_tank(
        self,
        tank_id: int,
        request: InTransitWithShipmentRequest,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> InTransitWithShipmentResponse:
        """Mark a cryolock as in transit AND create IoT shipment within a tank."""
        # Work directly with PatientCrylockInfo - pass tank_id as canister_id for compatibility
        return self.mark_in_transit_with_shipment(
            canister_id=tank_id,  # Pass tank_id as canister_id for compatibility
            request=request,
            updated_by=updated_by,
            branch_id=branch_id,
            tank_code=tank_code
            )

    def _find_cryolock_by_tank_code(
        self,
        tank_code: str,
        cryolock_number: str,
        branch_id: Optional[int] = None
    ) -> Optional[PatientCrylockInfo]:
        """
        Find cryolock by tank_code and cryolock_number, using direct tank_id/branch_id if available.
        Uses optimized helper function.
        """
        return find_crylock_by_tank_code(self.db, tank_code, cryolock_number, branch_id)
    
    def _set_cryolock_flag(
        self,
        canister_id: int,
        cryolock_number: str,
        flag_field: str,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> CryolockFlagUpdateResponse:
        if flag_field not in {"embryo_transfer", "in_transit"}:
            raise AppException(
                message=f"Invalid flag_field '{flag_field}'",
                error_code=ErrorMessages.BAD_REQUEST,
                status_code=HTTPStatus.BAD_REQUEST
            )

        try:
            # Use tank_id directly from path param; optional branch filter enforces access.
            tank_query = self.db.query(Tank).filter(Tank.tank_id == canister_id)
            if branch_id is not None:
                tank_query = tank_query.filter(Tank.branch_id == branch_id)
            tank = tank_query.first()
            encrypted_cryolock_number = encrypt_sensitive_ivf_value(cryolock_number)
            
            if not tank:
                raise AppException(
                    message=f"Tank with ID '{canister_id}' not found" + (f" in your branch" if branch_id else ""),
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Find PatientCrylockInfo by tank_id and crylock_number
            query = (
                self.db.query(PatientCrylockInfo)
                .filter(
                    PatientCrylockInfo.tank_id == tank.tank_id,
                    PatientCrylockInfo.crylock_number.in_([
                        encrypted_cryolock_number,
                        cryolock_number
                    ])
                )
            )

            if branch_id is not None:
                query = query.filter(PatientCrylockInfo.branch_id == branch_id)
            
            cryolock = query.first()
            
            if not cryolock:
                error_msg = f"Cryolock with number '{cryolock_number}' not found"
                error_msg += f" in tank {tank.tank_code or canister_id}"
                if branch_id is not None:
                    error_msg += f" in your branch"
                raise AppException(
                    message=error_msg,
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )

            # Update the flag field (embryo_transfer or in_transit) in PatientCrylockInfo table
            setattr(cryolock, flag_field, True)
            cryolock.updated_by = updated_by

            self.db.commit()
            self.db.refresh(cryolock)

            return CryolockFlagUpdateResponse(
                success=True,
                message=f"Updated {flag_field} successfully",
                cryolock_number=decrypt_sensitive_ivf_value(cryolock.crylock_number) or cryolock_number,
                embryo_transfer=bool(getattr(cryolock, "embryo_transfer", False)),
                in_transit=bool(getattr(cryolock, "in_transit", False))
            )
        except AppException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating cryolock flag {flag_field}: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to update cryolock flag: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def update_goblet_color(
        self,
        canister_id: int,
        color_update: GobletColorUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> ColorUpdateResponse:
        """
        Update goblet color for a specific cryolock within a canister.
        Note: goblet_color is stored in the cryolocks table.
        
        Args:
            canister_id: Canister ID from URL path
            color_update: Goblet color update data containing cryolock_number and goblet_color
            updated_by: Username of the user updating the color
            branch_id: Optional branch ID for filtering
            tank_code: Optional tank code for direct query
            
        Returns:
            ColorUpdateResponse with update details
            
        Raises:
            AppException: If update fails or cryolock not found
        """
        try:
            cryolock = None
            
            # Try direct query using tank_code if provided (optimized)
            if tank_code:
                cryolock = self._find_cryolock_by_tank_code(tank_code, color_update.cryolock_number, branch_id)
            
            # Fallback: Find by canister_number (canister_id is now tank_id)
            if not cryolock:
                # Find PatientCrylockInfo by crylock_number
                encrypted_cryolock_number = encrypt_sensitive_ivf_value(color_update.cryolock_number)
                query = (
                    self.db.query(PatientCrylockInfo)
                    .filter(
                        PatientCrylockInfo.tank_id == canister_id,
                        PatientCrylockInfo.crylock_number.in_([
                            encrypted_cryolock_number,
                            color_update.cryolock_number
                        ])
                    )
                )
                
                if branch_id is not None:
                    query = query.filter(PatientCrylockInfo.branch_id == branch_id)
                
                cryolock = query.first()
            
            if not cryolock:
                error_msg = f"Cryolock with number '{color_update.cryolock_number}' not found"
                if tank_code:
                    error_msg += f" in tank {tank_code}"
                else:
                    error_msg += f" in canister {canister_id}"
                raise AppException(
                    message=error_msg,
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Update goblet_color for this specific cryolock
            cryolock.goblet_color = color_update.goblet_color
            cryolock.updated_by = updated_by
            
            self.db.commit()
            self.db.refresh(cryolock)
            
            logger.info(
                "Updated goblet color | canister_id=%s cryolock_number=%s goblet_color=%s",
                canister_id,
                color_update.cryolock_number,
                color_update.goblet_color
            )
            
            return ColorUpdateResponse(
                success=True,
                message=f"Goblet color updated successfully to '{color_update.goblet_color}'",
                cryolock_number=decrypt_sensitive_ivf_value(cryolock.crylock_number) or color_update.cryolock_number,
                updated_color=color_update.goblet_color
            )
            
        except AppException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating goblet color: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to update goblet color: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def update_goblet_color_for_tank(
        self,
        tank_id: int,
        color_update: GobletColorUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> ColorUpdateResponse:
        """Update goblet color for a specific cryolock within a tank."""
        # Work directly with PatientCrylockInfo - no need for canister_id
        return self.update_goblet_color(
            canister_id=tank_id,  # Pass tank_id as canister_id for compatibility (not used in update_goblet_color)
            color_update=color_update,
            updated_by=updated_by,
            branch_id=branch_id,
            tank_code=tank_code
            )
    
    def update_cryolock_color(
        self,
        canister_id: int,
        color_update: CryolockColorUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> ColorUpdateResponse:
        """
        Update cryolock color for a specific cryolock within a canister.
        
        Args:
            canister_id: Canister ID from URL path
            color_update: Cryolock color update data containing cryolock_number and cryolock_color
            updated_by: Username of the user updating the color
            branch_id: Optional branch ID for filtering
            tank_code: Optional tank code for direct query
            
        Returns:
            ColorUpdateResponse with update details
            
        Raises:
            AppException: If update fails or cryolock not found
        """
        try:
            cryolock = None
            
            # Try direct query using tank_code if provided (optimized)
            if tank_code:
                cryolock = self._find_cryolock_by_tank_code(tank_code, color_update.cryolock_number, branch_id)
            
            # Fallback: Find by canister_number (canister_id is now tank_id)
            if not cryolock:
                # Find PatientCrylockInfo by crylock_number
                encrypted_cryolock_number = encrypt_sensitive_ivf_value(color_update.cryolock_number)
                query = (
                    self.db.query(PatientCrylockInfo)
                    .filter(
                        PatientCrylockInfo.tank_id == canister_id,
                        PatientCrylockInfo.crylock_number.in_([
                            encrypted_cryolock_number,
                            color_update.cryolock_number
                        ])
                    )
                )
                
                if branch_id is not None:
                    query = query.filter(PatientCrylockInfo.branch_id == branch_id)
                
                cryolock = query.first()
            
            if not cryolock:
                error_msg = f"Cryolock with number '{color_update.cryolock_number}' not found"
                if tank_code:
                    error_msg += f" in tank {tank_code}"
                else:
                    error_msg += f" in canister {canister_id}"
                raise AppException(
                    message=error_msg,
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Persist to DB column name used by PatientCrylockInfo model
            cryolock.crylock_color = color_update.cryolock_color
            cryolock.updated_by = updated_by
            
            self.db.commit()
            self.db.refresh(cryolock)
            
            logger.info(
                "Updated cryolock color | canister_id=%s cryolock_number=%s cryolock_color=%s",
                canister_id,
                color_update.cryolock_number,
                color_update.cryolock_color
            )
            
            return ColorUpdateResponse(
                success=True,
                message=f"Cryolock color updated successfully to '{color_update.cryolock_color}'",
                cryolock_number=decrypt_sensitive_ivf_value(cryolock.crylock_number) or color_update.cryolock_number,
                updated_color=color_update.cryolock_color
            )
            
        except AppException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating cryolock color: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to update cryolock color: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def update_cryolock_color_for_tank(
        self,
        tank_id: int,
        color_update: CryolockColorUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> ColorUpdateResponse:
        """Update cryolock color for a specific cryolock within a tank."""
        # Work directly with PatientCrylockInfo - no need for canister_id
        return self.update_cryolock_color(
            canister_id=tank_id,  # Pass tank_id as canister_id for compatibility (not used in update_cryolock_color)
            color_update=color_update,
            updated_by=updated_by,
            branch_id=branch_id,
            tank_code=tank_code
            )
    
    def export_combined_refill_logs_and_deviations_excel(
        self,
        tank_id: int,
        year: Optional[int] = None,
        month: Optional[int] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> Response:
        """
        Export combined refill logs and KPI threshold deviations to Excel format with two sheets.
        
        Args:
            tank_id: Tank ID to export logs for
            year: Year for the report (e.g., 2024). If not provided, uses current year.
            month: Month for the report (1-12). If not provided, exports entire year.
            branch_id: Optional branch ID for filtering
            tank_code: Optional tank code for display
            
        Returns:
            FastAPI Response with Excel file containing two sheets:
            - Sheet 1: Refill Logs
            - Sheet 2: KPI Threshold Deviations
            
        Raises:
            AppException: If export fails or tank not found
        """
        try:
            # Use current year if year not provided
            current_date = datetime.now()
            if year is None:
                year = current_date.year
            
            # Validate year
            if not (2000 <= year <= 2100):
                raise AppException(
                    message="Year must be between 2000 and 2100",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Validate month if provided
            if month is not None:
                if not (1 <= month <= 12):
                    raise AppException(
                        message="Month must be between 1 and 12",
                        error_code=ErrorMessages.INVALID_INPUT,
                        status_code=HTTPStatus.BAD_REQUEST
                    )
            
            # Get tank information
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if not tank:
                raise AppException(
                    message=f"Tank with ID {tank_id} not found",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            display_tank_code = tank_code or tank.tank_code or f"Tank-{tank_id}"
            
            # Use tank_code for display
            display_id = display_tank_code
            display_label = "Tank Code"
            
            # Calculate date range based on whether month is provided
            if month is not None:
                # Export specific month
                start_date = date(year, month, 1)
                if month == 12:
                    end_date = date(year + 1, 1, 1)
                else:
                    end_date = date(year, month + 1, 1)
                start_datetime = datetime(year, month, 1, 0, 0, 0)
                if month == 12:
                    end_datetime = datetime(year + 1, 1, 1, 0, 0, 0)
                else:
                    end_datetime = datetime(year, month + 1, 1, 0, 0, 0)
                date_range_str = f"{year}-{month:02d}"
                # Format month-year for metadata
                month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                date_range_display = f"{month_names[month]}-{year}"
            else:
                # Export entire year
                start_date = date(year, 1, 1)
                end_date = date(year + 1, 1, 1)
                start_datetime = datetime(year, 1, 1, 0, 0, 0)
                end_datetime = datetime(year + 1, 1, 1, 0, 0, 0)
                date_range_str = str(year)
                date_range_display = str(year)
            
            # ============================================
            # SHEET 1: REFILL LOGS
            # ============================================
            refill_logs_query = (
                self.db.query(CanisterLn2Log)
                .filter(
                    CanisterLn2Log.tank_id == tank_id,
                    CanisterLn2Log.refill_date >= start_date,
                    CanisterLn2Log.refill_date < end_date
                )
            )
            
            if branch_id is not None:
                refill_logs_query = refill_logs_query.filter(CanisterLn2Log.branch_id == branch_id)
            
            refill_logs_query = refill_logs_query.order_by(
                CanisterLn2Log.refill_date,
                CanisterLn2Log.refill_time
            )
            
            refill_logs = refill_logs_query.all()
            
            # Prepare refill logs data
            refill_logs_data = []
            for log in refill_logs:
                refill_logs_data.append({
                    "Refill Date": log.refill_date.strftime("%Y-%m-%d") if log.refill_date else "",
                    "Refill Time": log.refill_time.strftime("%H:%M:%S") if log.refill_time else "",
                    "Cryoshipper": log.cryoshipper or "",
                    "Disinfected Shipper/Infected Tank Description": log.disinfected_shipper_infected_tank_description or "",
                    "Reservoir": log.reservoir or "",
                    "LN2 Ordered Date": log.ln2_ordered_date.strftime("%Y-%m-%d") if log.ln2_ordered_date else "",
                    "LN2 Received Date": log.ln2_received_date.strftime("%Y-%m-%d") if log.ln2_received_date else "",
                    "Description": log.description or "",
                    "Refilled By": log.refilled_by or ""
                })
            
            # Get current year total log count (for metadata)
            current_year = datetime.now().year
            current_year_start = date(current_year, 1, 1)
            current_year_end = date(current_year + 1, 1, 1)
            
            current_year_total_query = (
                self.db.query(CanisterLn2Log)
                .filter(
                    CanisterLn2Log.tank_id == tank_id,
                    CanisterLn2Log.refill_date >= current_year_start,
                    CanisterLn2Log.refill_date < current_year_end
                )
            )
            
            if branch_id is not None:
                current_year_total_query = current_year_total_query.filter(CanisterLn2Log.branch_id == branch_id)
            
            current_year_total = current_year_total_query.count()
            
            # ============================================
            # SHEET 2: KPI THRESHOLD DEVIATIONS
            # ============================================
            # KPI Threshold Targets
            kpi_targets = {
                "temperature": {"target": 5.0, "min": 0.0, "max": 10.0, "unit": "°C"},
                "agitation": {"target": 0.0, "min": 0.0, "max": 5.0, "unit": "G"},
                "light": {"target": 0.0, "min": 0.0, "max": 5.0, "unit": "lux"}
            }
            
            # Query IVF quality logs for deviations
            deviations_query = (
                self.db.query(
                    IVFQualityLog,
                    Tank.tank_code,
                    HospitalBranch.branch_name
                )
                .join(Tank, IVFQualityLog.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(
                    IVFQualityLog.reading_timestamp >= start_datetime,
                    IVFQualityLog.reading_timestamp < end_datetime,
                    IVFQualityLog.tank_id == tank_id,
                    Tank.is_active == True
                )
            )
            
            if branch_id is not None:
                deviations_query = deviations_query.filter(HospitalBranch.branch_id == branch_id)
            
            deviations_query = deviations_query.order_by(IVFQualityLog.reading_timestamp)
            
            deviations_results = deviations_query.all()
            
            # Prepare deviations data
            deviations_data = []
            for quality_log, tank_code_val, branch_name in deviations_results:
                # Determine which parameters violated thresholds
                violations = []
                if quality_log.is_temp_internal_loss or quality_log.is_temp_external_loss:
                    violations.append("Temperature")
                if quality_log.is_shock_loss:
                    violations.append("Shock")
                
                # Use temperature_internal as primary temperature, fallback to temperature_external
                temp_violation = quality_log.is_temp_internal_loss or quality_log.is_temp_external_loss
                
                deviations_data.append({
                    "Date": quality_log.reading_timestamp.strftime("%Y-%m-%d") if quality_log.reading_timestamp else "",
                    "Time": quality_log.reading_timestamp.strftime("%H:%M:%S") if quality_log.reading_timestamp else "",
                    "Tank Code": tank_code_val or "",
                    "Branch Name": branch_name or "",
                    "Device ID": quality_log.device_id or "",
                    "Temperature Internal (°C)": f"{quality_log.temperature_internal:.2f}" if quality_log.temperature_internal is not None else "",
                    "Temperature External (°C)": f"{quality_log.temperature_external:.2f}" if quality_log.temperature_external is not None else "",
                    "Temperature Target (°C)": f"{kpi_targets['temperature']['target']:.1f}",
                    "Temperature Min (°C)": f"{kpi_targets['temperature']['min']:.1f}",
                    "Temperature Max (°C)": f"{kpi_targets['temperature']['max']:.1f}",
                    "Temperature Violation": "Yes" if temp_violation else "No",
                    "Shock (G)": f"{quality_log.shock:.2f}" if quality_log.shock is not None else "",
                    "Shock Target (G)": f"{kpi_targets['agitation']['target']:.1f}",
                    "Shock Min (G)": f"{kpi_targets['agitation']['min']:.1f}",
                    "Shock Max (G)": f"{kpi_targets['agitation']['max']:.1f}",
                    "Shock Violation": "Yes" if quality_log.is_shock_loss else "No",
                    "Quality Loss (%)": f"{quality_log.quality_loss:.2f}" if quality_log.quality_loss is not None else "",
                    "Violated Parameters": ", ".join(violations) if violations else "None"
                })
            
            # ============================================
            # CREATE EXCEL FILE WITH TWO SHEETS
            # ============================================
            # Create DataFrames
            refill_logs_df = pd.DataFrame(refill_logs_data)
            deviations_df = pd.DataFrame(deviations_data)
            
            # Ensure at least one sheet is created (even if empty)
            # If both are empty, create empty sheets with headers
            if refill_logs_df.empty and deviations_df.empty:
                # Create empty dataframes with column headers
                refill_logs_df = pd.DataFrame(columns=[
                    "Refill Date", "Refill Time", "Cryoshipper", 
                    "Disinfected Shipper/Infected Tank Description", 
                    "Reservoir", "LN2 Ordered Date", "LN2 Received Date", 
                    "Description", "Refilled By"
                ])
                deviations_df = pd.DataFrame(columns=[
                    "Date", "Time", "Tank Code", "Branch Name", "Device ID",
                    "Temperature Internal (°C)", "Temperature External (°C)", "Temperature Target (°C)", "Temperature Min (°C)", "Temperature Max (°C)", "Temperature Violation",
                    "Shock (G)", "Shock Target (G)", "Shock Min (G)", "Shock Max (G)", "Shock Violation",
                    "Quality Loss (%)", "Violated Parameters"
                ])
            
            # Create Excel file in memory
            output = io.BytesIO()
            
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                # ============================================
                # SHEET 1: REFILL LOGS
                # ============================================
                # Always create the sheet (even if empty)
                # Write metadata for refill logs
                refill_metadata_data = [
                    [display_label, display_id],
                    ["Year" if month is None else "Month-Year", date_range_display],
                    ["Current Year Total", str(current_year_total)]
                ]
                refill_metadata_df = pd.DataFrame(refill_metadata_data)
                refill_metadata_df.to_excel(writer, sheet_name='Refill Logs', index=False, header=False, startrow=0)
                
                # Write refill logs data starting from row 5
                refill_logs_df.to_excel(writer, sheet_name='Refill Logs', index=False, startrow=4)
                
                # Format refill logs sheet
                refill_worksheet = writer.sheets['Refill Logs']
                if Font and PatternFill and Alignment:
                    brand_purple = "6B1176"
                    metadata_label_font = Font(bold=True, color=brand_purple, size=11)
                    metadata_value_font = Font(bold=True, color=brand_purple, size=11)
                    
                    for row_idx in range(1, 4):
                        for col_idx, cell in enumerate(refill_worksheet[row_idx]):
                            if col_idx == 0:
                                cell.font = metadata_label_font
                            else:
                                cell.font = metadata_value_font
                            cell.alignment = Alignment(horizontal="left", vertical="center")
                    
                    data_header_fill = PatternFill(start_color=brand_purple, end_color=brand_purple, fill_type="solid")
                    data_header_font = Font(bold=True, color="FFFFFF", size=11)
                    
                    # Only format header row if there are columns
                    if len(refill_logs_df.columns) > 0:
                        for cell in refill_worksheet[5]:
                            cell.fill = data_header_fill
                            cell.font = data_header_font
                            cell.alignment = Alignment(horizontal="center", vertical="center")
                
                # Auto-adjust column widths for refill logs
                for column in refill_worksheet.columns:
                    max_length = 0
                    column_letter = column[0].column_letter
                    for cell in column:
                        try:
                            if len(str(cell.value)) > max_length:
                                max_length = len(str(cell.value))
                        except:
                            pass
                    adjusted_width = min(max_length + 2, 50)
                    refill_worksheet.column_dimensions[column_letter].width = adjusted_width
                
                # ============================================
                # SHEET 2: KPI THRESHOLD DEVIATIONS
                # ============================================
                # Always create the sheet (even if empty)
                # Write metadata for deviations
                deviations_metadata_data = [
                    [display_label, display_id],
                    ["Year" if month is None else "Month-Year", date_range_display],
                    ["Total Deviations", str(len(deviations_data))]
                ]
                deviations_metadata_df = pd.DataFrame(deviations_metadata_data)
                deviations_metadata_df.to_excel(writer, sheet_name='KPI Threshold Deviations', index=False, header=False, startrow=0)
                
                # Write deviations data starting from row 5
                deviations_df.to_excel(writer, sheet_name='KPI Threshold Deviations', index=False, startrow=4)
                
                # Format deviations sheet
                deviations_worksheet = writer.sheets['KPI Threshold Deviations']
                if Font and PatternFill and Alignment:
                    brand_purple = "6B1176"
                    metadata_label_font = Font(bold=True, color=brand_purple, size=11)
                    metadata_value_font = Font(bold=True, color=brand_purple, size=11)
                    
                    for row_idx in range(1, 4):
                        for col_idx, cell in enumerate(deviations_worksheet[row_idx]):
                            if col_idx == 0:
                                cell.font = metadata_label_font
                            else:
                                cell.font = metadata_value_font
                            cell.alignment = Alignment(horizontal="left", vertical="center")
                    
                    data_header_fill = PatternFill(start_color=brand_purple, end_color=brand_purple, fill_type="solid")
                    data_header_font = Font(bold=True, color="FFFFFF", size=11)
                    
                    # Only format header row if there are columns
                    if len(deviations_df.columns) > 0:
                        for cell in deviations_worksheet[5]:
                            cell.fill = data_header_fill
                            cell.font = data_header_font
                            cell.alignment = Alignment(horizontal="center", vertical="center")
                
                # Auto-adjust column widths for deviations
                for column in deviations_worksheet.columns:
                    max_length = 0
                    column_letter = column[0].column_letter
                    for cell in column:
                        try:
                            if len(str(cell.value)) > max_length:
                                max_length = len(str(cell.value))
                        except:
                            pass
                    adjusted_width = min(max_length + 2, 50)
                    deviations_worksheet.column_dimensions[column_letter].width = adjusted_width
            
            output.seek(0)
            excel_content = output.read()
            output.close()
            
            # Generate filename - use tank_code
            file_id = display_tank_code
            if month is not None:
                filename = f"combined_report_{file_id}_{year}_{month:02d}.xlsx"
            else:
                filename = f"combined_report_{file_id}_{year}.xlsx"
            
            # Create response
            response = Response(
                content=excel_content,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"'
                }
            )
            
            logger.info(
                f"Exported combined report for {display_label.lower()} {display_id} ({date_range_str}): "
                f"{len(refill_logs_data)} refill logs, {len(deviations_data)} deviations"
            )
            
            return response
            
        except AppException:
            raise
        except Exception as e:
            logger.error(f"Error exporting combined report: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to export combined report: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def export_combined_refill_logs_and_deviations_excel_for_tank(
        self,
        tank_id: int,
        canister_number: Optional[str] = None,  # Kept for compatibility but not used
        year: Optional[int] = None,
        month: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> Response:
        """Export combined refill logs and KPI threshold deviations to Excel format for a specific tank."""
        # Get tank information for metadata
        tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
        if not tank:
            raise AppException(
                message=f"Tank with ID {tank_id} not found",
                error_code=ErrorMessages.NOT_FOUND,
                status_code=HTTPStatus.NOT_FOUND
            )
        tank_code = tank.tank_code or f"Tank-{tank_id}"
        
        # Work directly with tank_id - no need for canister_id
        return self.export_combined_refill_logs_and_deviations_excel(
            tank_id=tank_id,
            year=year,
            month=month,
            branch_id=branch_id,
            tank_code=tank_code  # Pass tank_code for metadata display
            )

    def export_readings_deviations_excel(
        self,
        tank_id: int,
        year: Optional[int] = None,
        month: Optional[int] = None,
        branch_id: Optional[int] = None,
        tank_code: Optional[str] = None
    ) -> Response:
        """
        Export deviations from the readings table combined with KPI config to Excel format,
        along with refill logs in a second sheet.
        
        Args:
            tank_id: Tank ID to export deviations for
            year: Year for the report (e.g., 2024). If not provided, uses current year.
            month: Month for the report (1-12). If not provided, exports entire year.
            branch_id: Optional branch ID for filtering
            tank_code: Optional tank code for display
            
        Returns:
            FastAPI Response with Excel file containing two sheets:
            - Sheet 1: Readings Deviations
            - Sheet 2: Refill Logs
            
        Raises:
            AppException: If export fails or tank not found
        """
        try:
            # Use current year if year not provided
            current_date = datetime.now()
            if year is None:
                year = current_date.year
            
            # Validate year
            if not (2000 <= year <= 2100):
                raise AppException(
                    message="Year must be between 2000 and 2100",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Validate month if provided
            if month is not None:
                if not (1 <= month <= 12):
                    raise AppException(
                        message="Month must be between 1 and 12",
                        error_code=ErrorMessages.INVALID_INPUT,
                        status_code=HTTPStatus.BAD_REQUEST
                    )
            
            # Get tank information
            tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
            if not tank:
                raise AppException(
                    message=f"Tank with ID {tank_id} not found",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            display_tank_code = tank_code or tank.tank_code or f"Tank-{tank_id}"
            
            # Calculate date range based on whether month is provided
            if month is not None:
                # Export specific month
                start_datetime = datetime(year, month, 1, 0, 0, 0)
                start_date = date(year, month, 1)
                if month == 12:
                    end_datetime = datetime(year + 1, 1, 1, 0, 0, 0)
                    end_date = date(year + 1, 1, 1)
                else:
                    end_datetime = datetime(year, month + 1, 1, 0, 0, 0)
                    end_date = date(year, month + 1, 1)
                date_range_str = f"{year}-{month:02d}"
                # Format month-year for metadata
                month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                date_range_display = f"{month_names[month]}-{year}"
            else:
                # Export entire year
                start_datetime = datetime(year, 1, 1, 0, 0, 0)
                end_datetime = datetime(year + 1, 1, 1, 0, 0, 0)
                start_date = date(year, 1, 1)
                end_date = date(year + 1, 1, 1)
                date_range_str = str(year)
                date_range_display = str(year)
            
            # ============================================
            # SHEET 1: READINGS DEVIATIONS
            # ============================================
            # Query readings with deviations joined with KPI config
            deviations_query = (
                self.db.query(
                    Readings,
                    KpiConfig,
                    Tank.tank_code,
                    HospitalBranch.branch_name
                )
                .join(KpiConfig, Readings.kpi_config_id == KpiConfig.id)
                .join(Tank, Readings.tank_id == Tank.tank_id)
                .join(HospitalBranch, Readings.branch_id == HospitalBranch.branch_id)
                .filter(
                    Readings.tank_id == tank_id,
                    Readings.deviation == True,
                    Readings.timestamp >= start_datetime,
                    Readings.timestamp < end_datetime,
                    KpiConfig.status == True
                )
            )
            
            if branch_id is not None:
                deviations_query = deviations_query.filter(Readings.branch_id == branch_id)
            
            deviations_query = deviations_query.order_by(Readings.timestamp)
            
            deviations_results = deviations_query.all()
            
            # Prepare deviations data
            deviations_data = []
            for reading, kpi_config, tank_code_val, branch_name in deviations_results:
                # Check if value is outside min/max range
                kpi_value = float(reading.kpi_value) if reading.kpi_value is not None else None
                kpi_min = float(kpi_config.min) if kpi_config.min is not None else None
                kpi_max = float(kpi_config.max) if kpi_config.max is not None else None
                
                # Determine violation type
                violation_type = ""
                if kpi_value is not None:
                    if kpi_min is not None and kpi_value < kpi_min:
                        violation_type = "Below Min"
                    elif kpi_max is not None and kpi_value > kpi_max:
                        violation_type = "Above Max"
                    else:
                        violation_type = "Threshold Breach"
                
                deviations_data.append({
                    "Date": reading.timestamp.strftime("%Y-%m-%d") if reading.timestamp else "",
                    "Time": reading.timestamp.strftime("%H:%M:%S") if reading.timestamp else "",
                    "Tank Code": tank_code_val or "",
                    "Branch Name": branch_name or "",
                    "Device ID": str(reading.device_id) if reading.device_id else "",
                    "KPI Name": kpi_config.kpi_name or "",
                    "Alert Name": kpi_config.alert_name or "Value",
                    "KPI Value": f"{kpi_value:.4f}" if kpi_value is not None else "",
                    "Unit": kpi_config.unit or "",
                    "Min Threshold": f"{kpi_min:.4f}" if kpi_min is not None else "",
                    "Max Threshold": f"{kpi_max:.4f}" if kpi_max is not None else "",
                    "Violation Type": violation_type,
                    "Alert Type": kpi_config.alert_type or "",
                    "Alert Sent": "Yes" if reading.deviation_alert_sent else "No"
                })
            
            # ============================================
            # SHEET 2: REFILL LOGS
            # ============================================
            refill_logs_query = (
                self.db.query(CanisterLn2Log)
                .filter(
                    CanisterLn2Log.tank_id == tank_id,
                    CanisterLn2Log.refill_date >= start_date,
                    CanisterLn2Log.refill_date < end_date
                )
            )
            
            if branch_id is not None:
                refill_logs_query = refill_logs_query.filter(CanisterLn2Log.branch_id == branch_id)
            
            refill_logs_query = refill_logs_query.order_by(
                CanisterLn2Log.refill_date,
                CanisterLn2Log.refill_time
            )
            
            refill_logs = refill_logs_query.all()
            
            # Prepare refill logs data
            refill_logs_data = []
            for log in refill_logs:
                refill_logs_data.append({
                    "Refill Date": log.refill_date.strftime("%Y-%m-%d") if log.refill_date else "",
                    "Refill Time": log.refill_time.strftime("%H:%M:%S") if log.refill_time else "",
                    "Cryoshipper": log.cryoshipper or "",
                    "Disinfected Shipper/Infected Tank Description": log.disinfected_shipper_infected_tank_description or "",
                    "Reservoir": log.reservoir or "",
                    "LN2 Ordered Date": log.ln2_ordered_date.strftime("%Y-%m-%d") if log.ln2_ordered_date else "",
                    "LN2 Received Date": log.ln2_received_date.strftime("%Y-%m-%d") if log.ln2_received_date else "",
                    "Description": log.description or "",
                    "Refilled By": log.refilled_by or ""
                })
            
            # Get current year total refill log count (for metadata)
            current_year = datetime.now().year
            current_year_start = date(current_year, 1, 1)
            current_year_end = date(current_year + 1, 1, 1)
            
            current_year_total_query = (
                self.db.query(CanisterLn2Log)
                .filter(
                    CanisterLn2Log.tank_id == tank_id,
                    CanisterLn2Log.refill_date >= current_year_start,
                    CanisterLn2Log.refill_date < current_year_end
                )
            )
            
            if branch_id is not None:
                current_year_total_query = current_year_total_query.filter(CanisterLn2Log.branch_id == branch_id)
            
            current_year_total = current_year_total_query.count()
            
            # ============================================
            # CREATE EXCEL FILE WITH TWO SHEETS
            # ============================================
            # Create DataFrames
            deviations_df = pd.DataFrame(deviations_data)
            refill_logs_df = pd.DataFrame(refill_logs_data)
            
            # Ensure sheets are created even if empty
            if deviations_df.empty:
                deviations_df = pd.DataFrame(columns=[
                    "Date", "Time", "Tank Code", "Branch Name", "Device ID",
                    "KPI Name", "Alert Name", "KPI Value", "Unit",
                    "Min Threshold", "Max Threshold", "Violation Type",
                    "Alert Type", "Alert Sent"
                ])
            
            if refill_logs_df.empty:
                refill_logs_df = pd.DataFrame(columns=[
                    "Refill Date", "Refill Time", "Cryoshipper",
                    "Disinfected Shipper/Infected Tank Description",
                    "Reservoir", "LN2 Ordered Date", "LN2 Received Date",
                    "Description", "Refilled By"
                ])
            
            # Create Excel file in memory
            output = io.BytesIO()
            
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                # ============================================
                # SHEET 1: READINGS DEVIATIONS
                # ============================================
                # Write metadata
                metadata_data = [
                    ["Tank Code", display_tank_code],
                    ["Year" if month is None else "Month-Year", date_range_display],
                    ["Total Deviations", str(len(deviations_data))]
                ]
                metadata_df = pd.DataFrame(metadata_data)
                metadata_df.to_excel(writer, sheet_name='Readings Deviations', index=False, header=False, startrow=0)
                
                # Write deviations data starting from row 5
                deviations_df.to_excel(writer, sheet_name='Readings Deviations', index=False, startrow=4)
                
                # Format deviations sheet
                worksheet = writer.sheets['Readings Deviations']
                if Font and PatternFill and Alignment:
                    brand_purple = "6B1176"
                    metadata_label_font = Font(bold=True, color=brand_purple, size=11)
                    metadata_value_font = Font(bold=True, color=brand_purple, size=11)
                    
                    for row_idx in range(1, 4):
                        for col_idx, cell in enumerate(worksheet[row_idx]):
                            if col_idx == 0:
                                cell.font = metadata_label_font
                            else:
                                cell.font = metadata_value_font
                            cell.alignment = Alignment(horizontal="left", vertical="center")
                    
                    data_header_fill = PatternFill(start_color=brand_purple, end_color=brand_purple, fill_type="solid")
                    data_header_font = Font(bold=True, color="FFFFFF", size=11)
                    
                    # Only format header row if there are columns
                    if len(deviations_df.columns) > 0:
                        for cell in worksheet[5]:
                            cell.fill = data_header_fill
                            cell.font = data_header_font
                            cell.alignment = Alignment(horizontal="center", vertical="center")
                
                # Auto-adjust column widths for deviations
                for column in worksheet.columns:
                    max_length = 0
                    column_letter = column[0].column_letter
                    for cell in column:
                        try:
                            if len(str(cell.value)) > max_length:
                                max_length = len(str(cell.value))
                        except:
                            pass
                    adjusted_width = min(max_length + 2, 50)
                    worksheet.column_dimensions[column_letter].width = adjusted_width
                
                # ============================================
                # SHEET 2: REFILL LOGS
                # ============================================
                # Write metadata for refill logs
                refill_metadata_data = [
                    ["Tank Code", display_tank_code],
                    ["Year" if month is None else "Month-Year", date_range_display],
                    ["Current Year Total", str(current_year_total)]
                ]
                refill_metadata_df = pd.DataFrame(refill_metadata_data)
                refill_metadata_df.to_excel(writer, sheet_name='Refill Logs', index=False, header=False, startrow=0)
                
                # Write refill logs data starting from row 5
                refill_logs_df.to_excel(writer, sheet_name='Refill Logs', index=False, startrow=4)
                
                # Format refill logs sheet
                refill_worksheet = writer.sheets['Refill Logs']
                if Font and PatternFill and Alignment:
                    brand_purple = "6B1176"
                    metadata_label_font = Font(bold=True, color=brand_purple, size=11)
                    metadata_value_font = Font(bold=True, color=brand_purple, size=11)
                    
                    for row_idx in range(1, 4):
                        for col_idx, cell in enumerate(refill_worksheet[row_idx]):
                            if col_idx == 0:
                                cell.font = metadata_label_font
                            else:
                                cell.font = metadata_value_font
                            cell.alignment = Alignment(horizontal="left", vertical="center")
                    
                    data_header_fill = PatternFill(start_color=brand_purple, end_color=brand_purple, fill_type="solid")
                    data_header_font = Font(bold=True, color="FFFFFF", size=11)
                    
                    # Only format header row if there are columns
                    if len(refill_logs_df.columns) > 0:
                        for cell in refill_worksheet[5]:
                            cell.fill = data_header_fill
                            cell.font = data_header_font
                            cell.alignment = Alignment(horizontal="center", vertical="center")
                
                # Auto-adjust column widths for refill logs
                for column in refill_worksheet.columns:
                    max_length = 0
                    column_letter = column[0].column_letter
                    for cell in column:
                        try:
                            if len(str(cell.value)) > max_length:
                                max_length = len(str(cell.value))
                        except:
                            pass
                    adjusted_width = min(max_length + 2, 50)
                    refill_worksheet.column_dimensions[column_letter].width = adjusted_width
            
            output.seek(0)
            excel_content = output.read()
            output.close()
            
            # Generate filename
            if month is not None:
                filename = f"readings_deviations_{display_tank_code}_{year}_{month:02d}.xlsx"
            else:
                filename = f"readings_deviations_{display_tank_code}_{year}.xlsx"
            
            # Create response
            response = Response(
                content=excel_content,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"'
                }
            )
            
            logger.info(
                f"Exported readings deviations for tank {display_tank_code} ({date_range_str}): "
                f"{len(deviations_data)} deviations, {len(refill_logs_data)} refill logs"
            )
            
            return response
            
        except AppException:
            raise
        except Exception as e:
            logger.error(f"Error exporting readings deviations: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to export readings deviations: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def export_readings_deviations_excel_for_tank(
        self,
        tank_id: int,
        year: Optional[int] = None,
        month: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> Response:
        """Export readings deviations to Excel format for a specific tank."""
        # Get tank information for metadata
        tank = self.db.query(Tank).filter(Tank.tank_id == tank_id).first()
        if not tank:
            raise AppException(
                message=f"Tank with ID {tank_id} not found",
                error_code=ErrorMessages.NOT_FOUND,
                status_code=HTTPStatus.NOT_FOUND
            )
        tank_code = tank.tank_code or f"Tank-{tank_id}"
        
        return self.export_readings_deviations_excel(
            tank_id=tank_id,
            year=year,
            month=month,
            branch_id=branch_id,
            tank_code=tank_code
        )
    
