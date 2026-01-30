"""
Quality Tracking Service
Handles business logic for quality tracking operations including LN2 refill logs
"""
import csv
import io
import logging
from datetime import date, datetime
from typing import List, Optional

import pandas as pd
from fastapi import Response
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.orm import Session

try:
    from openpyxl.styles import Alignment, Font, PatternFill
except ImportError:
    # openpyxl.styles may not be available in all environments
    Alignment = Font = PatternFill = None

from ...constants.app_constants import COMMON_API_HEADERS
from ...constants.http_status import HTTPStatus
from ...constants.messages import ErrorMessages
from ...exceptions.custom_exceptions import AppException
from ...models.IVF.cane_model import Cane
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.canister_model import Canister
from ...models.IVF.cryolock_model import Cryolock
from ...models.IVF.embryo_model import Embryo
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.ivf_quality_log_model import IVFQualityLog
from ...models.IVF.ivf_telemetry_data_model import IVFTelemetryData
from ...models.IVF.patient_model import IVFPatient
from ...models.IVF.tank_model import Tank
from ...schemas.IVF.quality_tracking_schema import (
    ColorUpdateResponse,
    CryolockColorUpdate,
    CryolockFlagUpdate,
    CryolockFlagUpdateResponse,
    GobletColorUpdate,
    IVFCanisterTrackingItem,
    IVFCanisterTrackingResponse,
    RefillLogCreate,
    RefillLogListResponse,
    RefillLogResponse,
    RefillLogStatusUpdate,
)

logger = logging.getLogger(__name__)


class QualityTrackingService:
    """Service for quality tracking operations"""
    
    def __init__(self, db: Session):
        self.db = db

    def resolve_canister_id(self, canister_number: str, branch_id: Optional[int] = None) -> int:
        """
        Resolve a canister_number (external identifier) to the internal canister_id.

        Args:
            canister_number: Canister number/code (e.g., "C1")
            branch_id: Optional branch filter for authorization (when present)

        Returns:
            canister_id (int)

        Raises:
            AppException: If the canister_number is not found (or not accessible under branch filter)
        """
        try:
            query = (
                self.db.query(Canister)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .filter(Canister.canister_number == canister_number)
            )

            if branch_id is not None:
                query = query.filter(Tank.branch_id == branch_id)

            canister = query.first()
            if not canister:
                raise AppException(
                    message=f"Canister with number '{canister_number}' not found",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )

            return canister.canister_id
        except AppException:
            raise
        except Exception as e:
            logger.error(f"Error resolving canister_id for canister_number={canister_number}: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to resolve canister: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def create_refill_log(
        self,
        canister_id: int,
        refill_log_data: RefillLogCreate,
        created_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> RefillLogResponse:
        """
        Create a new refill log entry
        
        Args:
            canister_id: Canister ID from URL path
            refill_log_data: Refill log data to create
            created_by: Username of the user creating the log
            
        Returns:
            Created refill log response
            
        Raises:
            AppException: If creation fails
        """
        try:
            # Calculate counts based on latest log for this canister
            last_log = self.db.query(CanisterLn2Log).filter(
                CanisterLn2Log.canister_id == canister_id
            ).order_by(
                desc(CanisterLn2Log.created_at)
            ).first()

            last_refilled_count = last_log.refilled_count if last_log else 0
            last_opened_count = last_log.opened_count if last_log else 0

            # Create new refill log using CanisterLn2Log model
            refill_log = CanisterLn2Log(
                canister_id=canister_id,
                refill_date=refill_log_data.refill_date,
                refill_time=refill_log_data.refill_time,
                refilled_by=refill_log_data.refilled_by,
                description=refill_log_data.description,
                status=refill_log_data.status,
                cryoshipper=refill_log_data.cryoshipper,
                disinfected_shipper_infected_tank_description=refill_log_data.disinfected_shipper_infected_tank_description,
                reservoir=refill_log_data.reservoir,
                ln2_ordered_date=refill_log_data.ln2_ordered_date,
                ln2_received_date=refill_log_data.ln2_received_date,
                created_by=created_by,
                branch_id=branch_id,
                refilled_count=last_refilled_count + 1,
                opened_count=last_opened_count + 1
            )
            
            self.db.add(refill_log)
            self.db.commit()
            self.db.refresh(refill_log)
            
            logger.info(f"Created refill log with ID {refill_log.log_id} for canister {canister_id}")
            
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
        canister_id: int,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> RefillLogListResponse:
        """
        Get refill logs for a specific canister with optional filtering
        
        Args:
            canister_id: Canister ID to filter by (required)
            status: Optional status to filter by
            limit: Optional limit on number of results
            
        Returns:
            List of refill logs matching the criteria
        """
        try:
            query = self.db.query(CanisterLn2Log)
            
            # Filter by canister_id
            query = query.filter(CanisterLn2Log.canister_id == canister_id)

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

    def update_refill_log_status(
        self,
        canister_id: int,
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
                CanisterLn2Log.canister_id == canister_id
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
                "Updated refill log status | log_id=%s canister_id=%s status=%s",
                log_id,
                canister_id,
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

    def get_canister_tracking_details(
        self,
        canister_id: int,
        branch_id: Optional[int] = None
    ) -> IVFCanisterTrackingResponse:
        """
        Fetch tracking details for a specific canister (grouped by cryolock).

        Response includes cryolock flags: embryo_transfer and in_transit.
        Also returns available_slots calculated as:
        total_slots - count(cryolocks where embryo_transfer OR in_transit OR embryo_grading is set on any embryo)
        """
        try:
            # total_slots = distinct cryolocks in this canister
            total_slots_query = (
                self.db.query(func.count(func.distinct(Cryolock.cryolock_id)))
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(Canister.canister_id == canister_id)
            )
            if branch_id is not None:
                total_slots_query = total_slots_query.filter(HospitalBranch.branch_id == branch_id)
            total_slots = total_slots_query.scalar() or 0

            # moved_by_grading = cryolocks with any active embryo that has embryo_grading set (non-empty)
            moved_by_grading_subq = (
                self.db.query(Embryo.cryolock_id)
                .filter(
                    Embryo.is_active == True,
                    Embryo.embryo_grading.isnot(None),
                    Embryo.embryo_grading != ''
                )
                .distinct()
                .subquery()
            )

            # moved_count = distinct cryolocks where embryo_transfer OR in_transit OR embryo_grading is set
            moved_count_query = (
                self.db.query(func.count(func.distinct(Cryolock.cryolock_id)))
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .outerjoin(moved_by_grading_subq, Cryolock.cryolock_id == moved_by_grading_subq.c.cryolock_id)
                .filter(
                    Canister.canister_id == canister_id,
                    or_(
                        Cryolock.embryo_transfer == True,
                        Cryolock.in_transit == True,
                        moved_by_grading_subq.c.cryolock_id.isnot(None)
                    )
                )
            )
            if branch_id is not None:
                moved_count_query = moved_count_query.filter(HospitalBranch.branch_id == branch_id)
            moved_count = moved_count_query.scalar() or 0
            available_slots = max(total_slots - moved_count, 0)

            # Data rows (group by cryolock so we don't duplicate on multiple embryos)
            # Exclude cryolocks where embryo_transfer=True OR in_transit=True
            query = (
                self.db.query(
                    IVFPatient.his_number,
                    Cryolock.cryolock_number,
                    Canister.canister_number,
                    Cane.cane_code,
                    Cryolock.goblet_color,
                    Cryolock.cryolock_color,
                    func.max(Embryo.date_of_vitrification).label('date_of_vitrification'),
                    Cryolock.embryo_transfer,
                    Cryolock.in_transit
                )
                .join(Cryolock, Embryo.cryolock_id == Cryolock.cryolock_id)
                .join(IVFPatient, Embryo.patient_id == IVFPatient.patient_id)
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(
                    Embryo.is_active == True,
                    Canister.canister_id == canister_id,
                    # Exclude cryolocks that have been moved (embryo_transfer OR in_transit)
                    Cryolock.embryo_transfer != True,
                    Cryolock.in_transit != True
                )
            )
            if branch_id is not None:
                query = query.filter(HospitalBranch.branch_id == branch_id)

            query = query.group_by(
                IVFPatient.his_number,
                Cryolock.cryolock_number,
                Canister.canister_number,
                Cane.cane_code,
                Cryolock.goblet_color,
                Cryolock.cryolock_color,
                Cryolock.embryo_transfer,
                Cryolock.in_transit
            ).order_by(IVFPatient.his_number, Cryolock.cryolock_number)

            results = query.all()

            tracking_rows: List[IVFCanisterTrackingItem] = []
            for row in results:
                tracking_rows.append(
                    IVFCanisterTrackingItem(
                        his_number=row.his_number or "",
                        cryolock_number=row.cryolock_number or "",
                        canister_number=str(row.canister_number) if row.canister_number else None,
                        cane_code=row.cane_code or "",
                        goblet_color=row.goblet_color or "",
                        cryolock_color=row.cryolock_color or "",
                        date_of_vitrification=row.date_of_vitrification,
                        embryo_transfer=bool(row.embryo_transfer),
                        in_transit=bool(row.in_transit)
                    )
                )

            return IVFCanisterTrackingResponse(
                data=tracking_rows,
                total=total_slots,
                available_slots=available_slots
            )
        except Exception as e:
            logger.error(f"Error fetching canister tracking details: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to fetch canister tracking details: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def mark_embryo_transfer(
        self,
        canister_id: int,
        flag_update: CryolockFlagUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> CryolockFlagUpdateResponse:
        """Mark a cryolock as moved to embryo transfer (embryo_transfer = True)."""
        return self._set_cryolock_flag(
            canister_id=canister_id,
            cryolock_number=flag_update.cryolock_number,
            flag_field="embryo_transfer",
            updated_by=updated_by,
            branch_id=branch_id
        )

    def mark_in_transit(
        self,
        canister_id: int,
        flag_update: CryolockFlagUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> CryolockFlagUpdateResponse:
        """Mark a cryolock as moved to transit (in_transit = True)."""
        return self._set_cryolock_flag(
            canister_id=canister_id,
            cryolock_number=flag_update.cryolock_number,
            flag_field="in_transit",
            updated_by=updated_by,
            branch_id=branch_id
        )

    def _set_cryolock_flag(
        self,
        canister_id: int,
        cryolock_number: str,
        flag_field: str,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> CryolockFlagUpdateResponse:
        if flag_field not in {"embryo_transfer", "in_transit"}:
            raise AppException(
                message=f"Invalid flag_field '{flag_field}'",
                error_code=ErrorMessages.BAD_REQUEST,
                status_code=HTTPStatus.BAD_REQUEST
            )

        try:
            query = (
                self.db.query(Cryolock)
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .filter(
                    Canister.canister_id == canister_id,
                    Cryolock.cryolock_number == cryolock_number
                )
            )

            if branch_id is not None:
                query = (
                    query.join(Tank, Canister.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(HospitalBranch.branch_id == branch_id)
                )

            cryolock = query.first()
            if not cryolock:
                raise AppException(
                    message=f"Cryolock with number '{cryolock_number}' not found in canister {canister_id}",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )

            setattr(cryolock, flag_field, True)
            cryolock.updated_by = updated_by

            self.db.commit()
            self.db.refresh(cryolock)

            return CryolockFlagUpdateResponse(
                success=True,
                message=f"Updated {flag_field} successfully",
                cryolock_number=cryolock.cryolock_number or cryolock_number,
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
        branch_id: Optional[int] = None
    ) -> ColorUpdateResponse:
        """
        Update goblet color for a specific cryolock within a canister.
        Note: goblet_color is stored in the cryolocks table.
        
        Args:
            canister_id: Canister ID from URL path
            color_update: Goblet color update data containing cryolock_number and goblet_color
            updated_by: Username of the user updating the color
            branch_id: Optional branch ID for filtering
            
        Returns:
            ColorUpdateResponse with update details
            
        Raises:
            AppException: If update fails or cryolock not found
        """
        try:
            # Find the cryolock by canister_id and cryolock_number
            query = (
                self.db.query(Cryolock)
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .filter(
                    Canister.canister_id == canister_id,
                    Cryolock.cryolock_number == color_update.cryolock_number
                )
            )
            
            # Apply branch filter if provided
            if branch_id is not None:
                query = (
                    query.join(Tank, Canister.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(HospitalBranch.branch_id == branch_id)
                )
            
            cryolock = query.first()
            
            if not cryolock:
                raise AppException(
                    message=f"Cryolock with number '{color_update.cryolock_number}' not found in canister {canister_id}",
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
                cryolock_number=color_update.cryolock_number,
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
    
    def update_cryolock_color(
        self,
        canister_id: int,
        color_update: CryolockColorUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> ColorUpdateResponse:
        """
        Update cryolock color for a specific cryolock within a canister.
        
        Args:
            canister_id: Canister ID from URL path
            color_update: Cryolock color update data containing cryolock_number and cryolock_color
            updated_by: Username of the user updating the color
            branch_id: Optional branch ID for filtering
            
        Returns:
            ColorUpdateResponse with update details
            
        Raises:
            AppException: If update fails or cryolock not found
        """
        try:
            # Find the cryolock by canister_id and cryolock_number
            query = (
                self.db.query(Cryolock)
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .filter(
                    Canister.canister_id == canister_id,
                    Cryolock.cryolock_number == color_update.cryolock_number
                )
            )
            
            # Apply branch filter if provided
            if branch_id is not None:
                query = (
                    query.join(Tank, Canister.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(HospitalBranch.branch_id == branch_id)
                )
            
            cryolock = query.first()
            
            if not cryolock:
                raise AppException(
                    message=f"Cryolock with number '{color_update.cryolock_number}' not found in canister {canister_id}",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Update the cryolock color
            cryolock.cryolock_color = color_update.cryolock_color
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
                cryolock_number=color_update.cryolock_number,
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

    def export_monthly_refill_logs_excel(
        self,
        canister_id: int,
        year: Optional[int] = None,
        month: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> Response:
        """
        Export monthly refill logs to Excel format.
        
        Args:
            canister_id: Canister ID to export logs for
            year: Year for the monthly report (e.g., 2024). If not provided, uses current year.
            month: Month for the monthly report (1-12). If not provided, uses current month.
            branch_id: Optional branch ID for filtering
            
        Returns:
            FastAPI Response with Excel file
            
        Raises:
            AppException: If export fails or canister not found
        """
        try:
            # Use current month if year/month not provided
            current_date = datetime.now()
            if year is None:
                year = current_date.year
            if month is None:
                month = current_date.month
            
            # Validate month
            if not (1 <= month <= 12):
                raise AppException(
                    message="Month must be between 1 and 12",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Validate year
            if not (2000 <= year <= 2100):
                raise AppException(
                    message="Year must be between 2000 and 2100",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Get canister information
            canister = self.db.query(Canister).filter(Canister.canister_id == canister_id).first()
            if not canister:
                raise AppException(
                    message=f"Canister with ID {canister_id} not found",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            canister_number = canister.canister_number or f"Canister-{canister_id}"
            
            # Calculate date range for the month
            start_date = date(year, month, 1)
            # Get last day of month
            if month == 12:
                end_date = date(year + 1, 1, 1)
            else:
                end_date = date(year, month + 1, 1)
            
            # Query refill logs for the specified month
            query = (
                self.db.query(CanisterLn2Log)
                .filter(
                    CanisterLn2Log.canister_id == canister_id,
                    CanisterLn2Log.refill_date >= start_date,
                    CanisterLn2Log.refill_date < end_date
                )
            )
            
            # Apply branch filter if provided
            if branch_id is not None:
                query = query.filter(CanisterLn2Log.branch_id == branch_id)
            
            # Order by date and time
            query = query.order_by(
                CanisterLn2Log.refill_date,
                CanisterLn2Log.refill_time
            )
            
            refill_logs = query.all()
            
            if not refill_logs:
                raise AppException(
                    message=f"No refill logs found for canister {canister_number} in {year}-{month:02d}",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Prepare data for Excel - matching the table columns from the UI
            excel_data = []
            for log in refill_logs:
                excel_data.append({
                    "Container ID": canister_number,
                    "Refill Date": log.refill_date.strftime("%Y-%m-%d") if log.refill_date else "",
                    "Refill Time": log.refill_time.strftime("%H:%M:%S") if log.refill_time else "",
                    "Cryoshipper": log.cryoshipper or "",
                    "Disinfected Shipper/Infected Tank Description": log.disinfected_shipper_infected_tank_description or "",
                    "Reservoir": log.reservoir or "",
                    "LN2 Ordered Date": log.ln2_ordered_date.strftime("%Y-%m-%d") if log.ln2_ordered_date else "",
                    "LN2 Received Date": log.ln2_received_date.strftime("%Y-%m-%d") if log.ln2_received_date else "",
                    "Description": log.description or "",
                    "Refilled By": log.refilled_by or "",
                    "Status": log.status.value if log.status else ""
                })
            
            # Create DataFrame
            df = pd.DataFrame(excel_data)
            
            # Create Excel file in memory
            output = io.BytesIO()
            
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                # Write metadata at the top
                metadata_df = pd.DataFrame({
                    "Field": ["Canister/Container ID", "Date"],
                    "Value": [canister_number, f"{year}-{month:02d}"]
                })
                
                # Write metadata to first rows
                metadata_df.to_excel(writer, sheet_name='Refill Logs', index=False, startrow=0)
                
                # Write data starting from row 4 (after metadata and header)
                df.to_excel(writer, sheet_name='Refill Logs', index=False, startrow=3)
                
                # Get workbook and worksheet for formatting
                workbook = writer.book
                worksheet = writer.sheets['Refill Logs']
                
                # Format metadata section with brand colors
                if Font and PatternFill and Alignment:
                    # Brand colors: #6B1176 (purple), #FDF4FF (light purple background)
                    brand_purple = "6B1176"  # Primary brand purple
                    brand_purple_light = "FDF4FF"  # Light purple background
                    
                    # Style metadata header (row 1) - light purple background with purple text
                    metadata_header_fill = PatternFill(start_color=brand_purple_light, end_color=brand_purple_light, fill_type="solid")
                    metadata_header_font = Font(bold=True, color=brand_purple, size=11)
                    
                    for cell in worksheet[1]:
                        cell.fill = metadata_header_fill
                        cell.font = metadata_header_font
                        cell.alignment = Alignment(horizontal="left", vertical="center")
                    
                    # Style metadata values (row 2) - bold purple text
                    metadata_value_font = Font(bold=True, color=brand_purple, size=11)
                    for cell in worksheet[2]:
                        cell.font = metadata_value_font
                        cell.alignment = Alignment(horizontal="left", vertical="center")
                    
                    # Style data header (row 4) - purple background with white text
                    data_header_fill = PatternFill(start_color=brand_purple, end_color=brand_purple, fill_type="solid")
                    data_header_font = Font(bold=True, color="FFFFFF", size=11)
                    
                    for cell in worksheet[4]:
                        cell.fill = data_header_fill
                        cell.font = data_header_font
                        cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    # If openpyxl.styles is not available, skip formatting
                    logger.warning("openpyxl.styles not available, skipping Excel formatting")
                
                # Auto-adjust column widths
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
            
            output.seek(0)
            excel_content = output.read()
            output.close()
            
            # Generate filename
            filename = f"refill_logs_{canister_number}_{year}_{month:02d}.xlsx"
            
            # Create response
            response = Response(
                content=excel_content,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"'
                }
            )
            
            logger.info(
                f"Exported {len(refill_logs)} refill logs for canister {canister_number} ({year}-{month:02d})"
            )
            
            return response
            
        except AppException:
            raise
        except Exception as e:
            logger.error(f"Error exporting monthly refill logs: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to export refill logs: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def export_kpi_threshold_monthly_csv(
        self,
        canister_number: str,
        year: Optional[int] = None,
        month: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> Response:
        """
        Export KPI threshold data as monthly CSV log for a specific canister.
        
        Args:
            canister_number: Canister number to filter by (e.g., "C1") - required
            year: Year for the monthly report (e.g., 2024). If not provided, uses current year.
            month: Month for the monthly report (1-12). If not provided, uses current month.
            branch_id: Optional branch ID for filtering
            
        Returns:
            FastAPI Response with CSV file containing KPI threshold data
            
        Raises:
            AppException: If export fails
        """
        try:
            # Validate canister_number is provided
            if not canister_number or not canister_number.strip():
                raise AppException(
                    message="canister_number is required",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Use current month if year/month not provided
            current_date = datetime.now()
            if year is None:
                year = current_date.year
            if month is None:
                month = current_date.month
            
            # Validate month
            if not (1 <= month <= 12):
                raise AppException(
                    message="Month must be between 1 and 12",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Validate year
            if not (2000 <= year <= 2100):
                raise AppException(
                    message="Year must be between 2000 and 2100",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Resolve canister_id (required)
            canister_id = self.resolve_canister_id(canister_number, branch_id)
            
            # Calculate date range for the month
            start_datetime = datetime(year, month, 1, 0, 0, 0)
            if month == 12:
                end_datetime = datetime(year + 1, 1, 1, 0, 0, 0)
            else:
                end_datetime = datetime(year, month + 1, 1, 0, 0, 0)
            
            # Query IVF quality logs for the specified month and canister
            query = (
                self.db.query(
                    IVFQualityLog,
                    Canister.canister_number,
                    HospitalBranch.branch_name
                )
                .join(Canister, IVFQualityLog.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(
                    IVFQualityLog.reading_timestamp >= start_datetime,
                    IVFQualityLog.reading_timestamp < end_datetime,
                    IVFQualityLog.canister_id == canister_id,
                    Canister.is_active == True
                )
            )
            
            # Apply branch filter if provided
            if branch_id is not None:
                query = query.filter(HospitalBranch.branch_id == branch_id)
            
            # Order by timestamp
            query = query.order_by(IVFQualityLog.reading_timestamp)
            
            results = query.all()
            
            if not results:
                raise AppException(
                    message=f"No KPI threshold data found for {year}-{month:02d}",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # KPI Threshold Targets (from IVF_PARAMETER_TARGETS)
            kpi_targets = {
                "temperature": {"target": 5.0, "min": 0.0, "max": 10.0, "unit": "°C"},
                "humidity": {"target": 50.0, "min": 45.0, "max": 55.0, "unit": "%"},
                "agitation": {"target": 0.0, "min": 0.0, "max": 5.0, "unit": "G"},
                "light": {"target": 0.0, "min": 0.0, "max": 5.0, "unit": "lux"}
            }
            
            # Prepare CSV data
            csv_data = []
            for quality_log, canister_number, branch_name in results:
                # Determine which parameters violated thresholds
                violations = []
                if quality_log.is_temp_loss:
                    violations.append("Temperature")
                if quality_log.is_humidity_loss:
                    violations.append("Humidity")
                if quality_log.is_agitation_loss:
                    violations.append("Agitation")
                if quality_log.is_light_loss:
                    violations.append("Light")
                
                csv_data.append({
                    "Date": quality_log.reading_timestamp.strftime("%Y-%m-%d") if quality_log.reading_timestamp else "",
                    "Time": quality_log.reading_timestamp.strftime("%H:%M:%S") if quality_log.reading_timestamp else "",
                    "Canister Number": canister_number or "",
                    "Branch Name": branch_name or "",
                    "Device ID": quality_log.device_id or "",
                    "Temperature (°C)": f"{quality_log.temperature:.2f}" if quality_log.temperature is not None else "",
                    "Temperature Target (°C)": f"{kpi_targets['temperature']['target']:.1f}",
                    "Temperature Min (°C)": f"{kpi_targets['temperature']['min']:.1f}",
                    "Temperature Max (°C)": f"{kpi_targets['temperature']['max']:.1f}",
                    "Temperature Violation": "Yes" if quality_log.is_temp_loss else "No",
                    "Humidity (%)": f"{quality_log.humidity:.2f}" if quality_log.humidity is not None else "",
                    "Humidity Target (%)": f"{kpi_targets['humidity']['target']:.1f}",
                    "Humidity Min (%)": f"{kpi_targets['humidity']['min']:.1f}",
                    "Humidity Max (%)": f"{kpi_targets['humidity']['max']:.1f}",
                    "Humidity Violation": "Yes" if quality_log.is_humidity_loss else "No",
                    "Agitation (G)": f"{quality_log.agitation:.2f}" if quality_log.agitation is not None else "",
                    "Agitation Target (G)": f"{kpi_targets['agitation']['target']:.1f}",
                    "Agitation Min (G)": f"{kpi_targets['agitation']['min']:.1f}",
                    "Agitation Max (G)": f"{kpi_targets['agitation']['max']:.1f}",
                    "Agitation Violation": "Yes" if quality_log.is_agitation_loss else "No",
                    "Light (lux)": f"{quality_log.light:.2f}" if quality_log.light is not None else "",
                    "Light Target (lux)": f"{kpi_targets['light']['target']:.1f}",
                    "Light Min (lux)": f"{kpi_targets['light']['min']:.1f}",
                    "Light Max (lux)": f"{kpi_targets['light']['max']:.1f}",
                    "Light Violation": "Yes" if quality_log.is_light_loss else "No",
                    "Quality Loss (%)": f"{quality_log.quality_loss:.2f}" if quality_log.quality_loss is not None else "",
                    "Violated Parameters": ", ".join(violations) if violations else "None"
                })
            
            # Create CSV in memory
            buffer = io.StringIO()
            
            try:
                if csv_data:
                    fieldnames = list(csv_data[0].keys())
                    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(csv_data)
                
                csv_text = buffer.getvalue()
            except Exception as exc:
                logger.error(
                    f"CSV export generation failed for KPI thresholds {year}-{month:02d}: {exc}",
                    exc_info=True
                )
                raise AppException(
                    message=f"Failed to generate CSV export: {str(exc)}",
                    error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                    status_code=HTTPStatus.INTERNAL_SERVER_ERROR
                )
            finally:
                buffer.close()
            
            # Encode CSV content
            csv_content = csv_text.encode("utf-8")
            
            # Generate filename
            filename = f"kpi_threshold_{canister_number}_{year}_{month:02d}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}UTC.csv"
            
            # Create response
            response = Response(content=csv_content, media_type="text/csv")
            response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
            for header, value in COMMON_API_HEADERS.items():
                response.headers.setdefault(header, value)
            
            logger.info(
                f"Exported {len(csv_data)} KPI threshold records for {year}-{month:02d}"
            )
            
            return response
            
        except AppException:
            raise
        except Exception as e:
            logger.error(f"Error exporting KPI threshold monthly CSV: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to export KPI threshold data: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    def export_telemetry_data_monthly_csv(
        self,
        canister_number: str,
        year: Optional[int] = None,
        month: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> Response:
        """
        Export IVF telemetry data as monthly CSV log for a specific canister.
        
        Args:
            canister_number: Canister number to filter by (e.g., "C1") - required
            year: Year for the monthly report (e.g., 2024). If not provided, uses current year.
            month: Month for the monthly report (1-12). If not provided, uses current month.
            branch_id: Optional branch ID for filtering
            
        Returns:
            FastAPI Response with CSV file containing telemetry data
            
        Raises:
            AppException: If export fails
        """
        try:
            # Validate canister_number is provided
            if not canister_number or not canister_number.strip():
                raise AppException(
                    message="canister_number is required",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Use current month if year/month not provided
            current_date = datetime.now()
            if year is None:
                year = current_date.year
            if month is None:
                month = current_date.month
            
            # Validate month
            if not (1 <= month <= 12):
                raise AppException(
                    message="Month must be between 1 and 12",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Validate year
            if not (2000 <= year <= 2100):
                raise AppException(
                    message="Year must be between 2000 and 2100",
                    error_code=ErrorMessages.INVALID_INPUT,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            # Resolve canister_id (required)
            canister_id = self.resolve_canister_id(canister_number, branch_id)
            
            # Calculate date range for the month
            start_datetime = datetime(year, month, 1, 0, 0, 0)
            if month == 12:
                end_datetime = datetime(year + 1, 1, 1, 0, 0, 0)
            else:
                end_datetime = datetime(year, month + 1, 1, 0, 0, 0)
            
            # Query IVF telemetry data for the specified month and canister
            query = (
                self.db.query(
                    IVFTelemetryData,
                    Canister.canister_number,
                    HospitalBranch.branch_name
                )
                .join(Canister, IVFTelemetryData.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(
                    IVFTelemetryData.created_at >= start_datetime,
                    IVFTelemetryData.created_at < end_datetime,
                    IVFTelemetryData.canister_id == canister_id,
                    Canister.is_active == True
                )
            )
            
            # Apply branch filter if provided
            if branch_id is not None:
                query = query.filter(HospitalBranch.branch_id == branch_id)
            
            # Order by created_at
            query = query.order_by(IVFTelemetryData.created_at)
            
            results = query.all()
            
            if not results:
                raise AppException(
                    message=f"No telemetry data found for {year}-{month:02d}",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Prepare CSV data
            csv_data = []
            for telemetry_record, canister_number, branch_name in results:
                # Extract data from JSONB telemetry_data field
                telemetry_json = telemetry_record.telemetry_data or {}
                
                # Extract temperature
                temperature_value = None
                temperature_unit = None
                if "Temperature" in telemetry_json and telemetry_json["Temperature"]:
                    temp_obj = telemetry_json["Temperature"]
                    temperature_value = temp_obj.get("Celsius") or temp_obj.get("Value")
                    temperature_unit = temp_obj.get("Unit", "")
                
                # Extract humidity
                humidity_value = None
                humidity_unit = None
                if "Humidity" in telemetry_json and telemetry_json["Humidity"]:
                    humidity_obj = telemetry_json["Humidity"]
                    humidity_value = humidity_obj.get("Percentage") or humidity_obj.get("Value")
                    humidity_unit = humidity_obj.get("Unit", "")
                
                # Extract shock/agitation
                shock_value = None
                if "Shock" in telemetry_json and telemetry_json["Shock"]:
                    shock_value = telemetry_json["Shock"].get("G") or telemetry_json["Shock"].get("Value")
                elif "Vibration" in telemetry_json and telemetry_json["Vibration"]:
                    shock_value = telemetry_json["Vibration"].get("Value")
                elif "Agitation" in telemetry_json and telemetry_json["Agitation"]:
                    shock_value = telemetry_json["Agitation"].get("Value")
                
                # Extract light
                light_value = None
                if "Light" in telemetry_json and telemetry_json["Light"]:
                    light_obj = telemetry_json["Light"]
                    light_value = light_obj.get("Lux") or light_obj.get("Value")
                
                # Extract location
                latitude = None
                longitude = None
                if "Location" in telemetry_json and telemetry_json["Location"]:
                    location_obj = telemetry_json["Location"]
                    latitude = location_obj.get("Latitude") or location_obj.get("latitude")
                    longitude = location_obj.get("Longitude") or location_obj.get("longitude")
                
                # Extract timestamp from telemetry data
                telemetry_timestamp = telemetry_json.get("Timestamp") or telemetry_json.get("timestamp")
                
                # Extract device ID from telemetry data (fallback to column value)
                device_id = telemetry_json.get("DeviceId") or telemetry_json.get("device_id") or telemetry_record.device_id
                
                # Extract battery and connectivity info if available
                battery_level = telemetry_json.get("BatteryLevel") or telemetry_json.get("battery_level")
                is_charging = telemetry_json.get("IsCharging") or telemetry_json.get("is_charging")
                connected_status = telemetry_json.get("Connected") or telemetry_json.get("connected")
                signal_strength = telemetry_json.get("SignalStrength") or telemetry_json.get("signal_strength")
                
                csv_data.append({
                    "ID": telemetry_record.id,
                    "Created At": telemetry_record.created_at.strftime("%Y-%m-%d %H:%M:%S") if telemetry_record.created_at else "",
                    "Telemetry Timestamp": telemetry_timestamp or "",
                    "Canister ID": telemetry_record.canister_id,
                    "Canister Number": canister_number or "",
                    "Branch Name": branch_name or "",
                    "Device ID": device_id or "",
                    "Temperature Value": f"{temperature_value}" if temperature_value is not None else "",
                    "Temperature Unit": temperature_unit or "",
                    "Humidity Value": f"{humidity_value}" if humidity_value is not None else "",
                    "Humidity Unit": humidity_unit or "",
                    "Shock/Agitation (G)": f"{shock_value}" if shock_value is not None else "",
                    "Light Value (Lux)": f"{light_value}" if light_value is not None else "",
                    "Latitude": f"{latitude}" if latitude is not None else "",
                    "Longitude": f"{longitude}" if longitude is not None else "",
                    "Battery Level": f"{battery_level}" if battery_level is not None else "",
                    "Is Charging": f"{is_charging}" if is_charging is not None else "",
                    "Connected": f"{connected_status}" if connected_status is not None else "",
                    "Signal Strength": f"{signal_strength}" if signal_strength is not None else "",
                    "Raw Telemetry Data": str(telemetry_json) if telemetry_json else ""
                })
            
            # Create CSV in memory
            buffer = io.StringIO()
            
            try:
                if csv_data:
                    fieldnames = list(csv_data[0].keys())
                    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(csv_data)
                
                csv_text = buffer.getvalue()
            except Exception as exc:
                logger.error(
                    f"CSV export generation failed for telemetry data {year}-{month:02d}: {exc}",
                    exc_info=True
                )
                raise AppException(
                    message=f"Failed to generate CSV export: {str(exc)}",
                    error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                    status_code=HTTPStatus.INTERNAL_SERVER_ERROR
                )
            finally:
                buffer.close()
            
            # Encode CSV content
            csv_content = csv_text.encode("utf-8")
            
            # Generate filename
            filename = f"telemetry_data_{canister_number}_{year}_{month:02d}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}UTC.csv"
            
            # Create response
            response = Response(content=csv_content, media_type="text/csv")
            response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
            for header, value in COMMON_API_HEADERS.items():
                response.headers.setdefault(header, value)
            
            logger.info(
                f"Exported {len(csv_data)} telemetry data records for {year}-{month:02d}"
            )
            
            return response
            
        except AppException:
            raise
        except Exception as e:
            logger.error(f"Error exporting telemetry data monthly CSV: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to export telemetry data: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    