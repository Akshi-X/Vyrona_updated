"""
Quality Tracking Service
Handles business logic for quality tracking operations including LN2 refill logs
"""
import logging
from typing import List, Optional

from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from ...constants.http_status import HTTPStatus
from ...constants.messages import ErrorMessages
from ...exceptions.custom_exceptions import AppException
from ...models.IVF.cane_model import Cane
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.canister_model import Canister
from ...models.IVF.cryolock_model import Cryolock
from ...models.IVF.embryo_model import Embryo
from ...models.IVF.hospital_branch_model import HospitalBranch
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
    