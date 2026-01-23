"""
Quality Tracking Service
Handles business logic for quality tracking operations including LN2 refill logs
"""
import logging
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

# Import shared models (matching pattern from ivf_service.py)
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.ivf_quality_log_model import IVFQualityLog
from ...models.IVF.canister_model import Canister
from ...models.IVF.tank_model import Tank
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.cane_model import Cane
from ...models.IVF.cryolock_model import Cryolock
from ...models.IVF.embryo_model import Embryo
from ...models.IVF.patient_model import IVFPatient
from ...models.shipment_model import Shipment
from ...schemas.IVF.quality_tracking_schema import (
    RefillLogCreate,
    RefillLogStatusUpdate,
    RefillLogResponse,
    RefillLogListResponse,
    IVFQualityThreshold,
    IVFQualityDataPoint,
    IVFQualityTrackingSeries,
    IVFQualityParameterStatus,
    IVFQualityKpiSummary,
    IVFQualityKpiResponse,
    IVFCanisterTrackingItem,
    IVFCanisterTrackingResponse,
    GobletColorUpdate,
    CryolockColorUpdate,
    ColorUpdateResponse
)
from ...exceptions.custom_exceptions import AppException
from ...constants.messages import ErrorMessages
from ...constants.http_status import HTTPStatus

logger = logging.getLogger(__name__)


class QualityTrackingService:
    """Service for quality tracking operations"""

    DEFAULT_THRESHOLDS: Dict[str, IVFQualityThreshold] = {
        "temperature": IVFQualityThreshold(min=2.0, max=8.0, unit="C"),
        "humidity": IVFQualityThreshold(min=30.0, max=70.0, unit="%"),
        "agitation": IVFQualityThreshold(min=0.0, max=5.0, unit="%")
    }
    
    def __init__(self, db: Session):
        self.db = db
    
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
                liquid_nitrogen_volume=refill_log_data.liquid_nitrogen_volume,
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

    def get_ivf_quality_kpis(
        self,
        canister_id: int,
        limit: int = 50,
        branch_id: Optional[int] = None
    ) -> IVFQualityKpiResponse:
        """
        Get IVF container quality KPIs and tracking data.
        """
        try:
            query = self.db.query(IVFQualityLog).filter(
                IVFQualityLog.canister_id == canister_id
            )

            if branch_id is not None:
                query = (
                    query.join(Canister, IVFQualityLog.canister_id == Canister.canister_id)
                    .join(Tank, Canister.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(HospitalBranch.branch_id == branch_id)
                )

            logs = (
                query.order_by(desc(IVFQualityLog.reading_timestamp))
                .limit(limit)
                .all()
            )

            tracking_series = self._build_tracking_series(logs)
            last_log = logs[0] if logs else None

            thresholds = dict(self.DEFAULT_THRESHOLDS)
            parameters = self._build_parameter_statuses(last_log, thresholds)
            kpi_summary = self._build_kpi_summary(logs, thresholds)

            return IVFQualityKpiResponse(
                container_id=canister_id,
                last_reading_timestamp=last_log.reading_timestamp if last_log else None,
                thresholds=thresholds,
                tracking=tracking_series,
                parameters=parameters,
                kpi_summary=kpi_summary
            )
        except Exception as e:
            logger.error(f"Error fetching IVF quality KPIs: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to fetch IVF quality KPIs: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def get_canister_tracking_details(
        self,
        canister_id: int,
        branch_id: Optional[int] = None
    ) -> IVFCanisterTrackingResponse:
        """
        Fetch tracking details for a specific canister.
        Returns data matching the table structure: HIS #, Cryolock #, Canister #, 
        Cane ID, Goblet Color, Cryolock Color, Date of Vitrification, and Move to.
        """
        try:
            query = (
                self.db.query(
                    IVFPatient.his_number,
                    Cryolock.cryolock_number,
                    Canister.canister_number,
                    Cane.cane_id,
                    Cane.cane_code,
                    Cane.goblet_color,
                    Cryolock.cryolock_color,
                    Embryo.date_of_vitrification
                )
                .join(Cryolock, Embryo.cryolock_id == Cryolock.cryolock_id)
                .join(IVFPatient, Embryo.patient_id == IVFPatient.patient_id)
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(
                    Embryo.is_active == True,
                    Canister.canister_id == canister_id
                )
            )

            if branch_id is not None:
                query = query.filter(HospitalBranch.branch_id == branch_id)

            query = query.order_by(IVFPatient.his_number, Cryolock.cryolock_number)

            results = query.all()

            tracking_rows: List[IVFCanisterTrackingItem] = []
            for row in results:
                # Format Cane ID: use cane_code if available, otherwise format as "Cane-{cane_id}"
                cane_display = row.cane_code if row.cane_code else f"Cane-{row.cane_id}"

                tracking_rows.append(
                    IVFCanisterTrackingItem(
                        his_number=row.his_number or "",
                        cryolock_number=row.cryolock_number or "",
                        canister_number=row.canister_number,
                        cane_id=cane_display,
                        goblet_color=row.goblet_color or "",
                        cryolock_color=row.cryolock_color or "",
                        date_of_vitrification=row.date_of_vitrification,
                        move_to=True  # All items can be moved (UI action)
                    )
                )

            return IVFCanisterTrackingResponse(
                data=tracking_rows,
                total=len(tracking_rows)
            )
        except Exception as e:
            logger.error(f"Error fetching canister tracking details: {str(e)}", exc_info=True)
            raise AppException(
                message=f"Failed to fetch canister tracking details: {str(e)}",
                error_code=ErrorMessages.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )

    def _build_tracking_series(self, logs: List[IVFQualityLog]) -> IVFQualityTrackingSeries:
        ordered_logs = list(reversed(logs))
        data_points = [
            IVFQualityDataPoint(
                timestamp=log.reading_timestamp,
                temperature=log.temperature,
                humidity=log.humidity,
                agitation=log.agitation
            )
            for log in ordered_logs
        ]
        return IVFQualityTrackingSeries(
            data_points=data_points,
            count=len(data_points)
        )

    def _build_parameter_statuses(
        self,
        last_log: Optional[IVFQualityLog],
        thresholds: Dict[str, IVFQualityThreshold]
    ) -> List[IVFQualityParameterStatus]:
        if not last_log:
            return [
                IVFQualityParameterStatus(
                    parameter=param,
                    current_value=None,
                    unit=threshold.unit,
                    status="No Data",
                    acceptable_range=threshold,
                    is_anomaly=False
                )
                for param, threshold in thresholds.items()
            ]

        values = {
            "temperature": last_log.temperature,
            "humidity": last_log.humidity,
            "agitation": last_log.agitation
        }

        statuses: List[IVFQualityParameterStatus] = []
        for param, threshold in thresholds.items():
            value = values.get(param)
            if value is None:
                status = "No Data"
                is_anomaly = False
            else:
                is_anomaly = self._is_outside_threshold(value, threshold)
                status = "Anomaly" if is_anomaly else "Normal"

            statuses.append(
                IVFQualityParameterStatus(
                    parameter=param.replace("_", " ").title(),
                    current_value=value,
                    unit=threshold.unit,
                    status=status,
                    acceptable_range=threshold,
                    is_anomaly=is_anomaly
                )
            )

        return statuses

    def _build_kpi_summary(
        self,
        logs: List[IVFQualityLog],
        thresholds: Dict[str, IVFQualityThreshold]
    ) -> IVFQualityKpiSummary:
        temp_values = [log.temperature for log in logs if log.temperature is not None]
        humidity_values = [log.humidity for log in logs if log.humidity is not None]
        agitation_values = [log.agitation for log in logs if log.agitation is not None]

        anomaly_counts = {
            "temperature": self._count_anomalies(logs, "temperature", thresholds["temperature"]),
            "humidity": self._count_anomalies(logs, "humidity", thresholds["humidity"]),
            "agitation": self._count_anomalies(logs, "agitation", thresholds["agitation"])
        }

        last_quality_loss = logs[0].quality_loss if logs else None

        return IVFQualityKpiSummary(
            avg_temperature=self._safe_average(temp_values),
            avg_humidity=self._safe_average(humidity_values),
            avg_agitation=self._safe_average(agitation_values),
            anomaly_counts=anomaly_counts,
            total_readings=len(logs),
            quality_loss=round(float(last_quality_loss), 2) if last_quality_loss is not None else 0.0
        )

    @staticmethod
    def _is_outside_threshold(value: float, threshold: IVFQualityThreshold) -> bool:
        if threshold.min is not None and value < threshold.min:
            return True
        if threshold.max is not None and value > threshold.max:
            return True
        return False

    def _count_anomalies(
        self,
        logs: List[IVFQualityLog],
        attribute: str,
        threshold: IVFQualityThreshold
    ) -> int:
        count = 0
        for log in logs:
            value = getattr(log, attribute)
            if value is None:
                continue
            if self._is_outside_threshold(value, threshold):
                count += 1
        return count

    @staticmethod
    def _safe_average(values: List[float]) -> Optional[float]:
        if not values:
            return None
        return round(sum(values) / len(values), 2)
    
    def update_goblet_color(
        self,
        canister_id: int,
        color_update: GobletColorUpdate,
        updated_by: Optional[str] = None,
        branch_id: Optional[int] = None
    ) -> ColorUpdateResponse:
        """
        Update goblet color for a specific cane within a canister.
        
        Args:
            canister_id: Canister ID from URL path
            color_update: Goblet color update data containing cane_identifier and goblet_color
            updated_by: Username of the user updating the color
            branch_id: Optional branch ID for filtering
            
        Returns:
            ColorUpdateResponse with update details
            
        Raises:
            AppException: If update fails or cane not found
        """
        try:
            # Find the cane by canister_id and cane_identifier
            # cane_identifier can be either cane_code or numeric part of "Cane-{id}"
            cane_identifier = color_update.cane_identifier.strip()
            
            # Try to find by cane_code first
            query = self.db.query(Cane).filter(
                Cane.canister_id == canister_id
            )
            
            # Check if identifier looks like a numeric ID (from "Cane-{id}" format)
            if cane_identifier.isdigit():
                cane_id = int(cane_identifier)
                query = query.filter(Cane.cane_id == cane_id)
            elif cane_identifier.startswith("Cane-") and cane_identifier[5:].isdigit():
                # Handle "Cane-5" format - extract the numeric part
                cane_id = int(cane_identifier[5:])
                query = query.filter(Cane.cane_id == cane_id)
            else:
                # Try to match by cane_code
                query = query.filter(Cane.cane_code == cane_identifier)
            
            # Apply branch filter if provided
            if branch_id is not None:
                query = (
                    query.join(Canister, Cane.canister_id == Canister.canister_id)
                    .join(Tank, Canister.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(HospitalBranch.branch_id == branch_id)
                )
            
            cane = query.first()
            
            if not cane:
                raise AppException(
                    message=f"Cane with identifier '{cane_identifier}' not found in canister {canister_id}",
                    error_code=ErrorMessages.NOT_FOUND,
                    status_code=HTTPStatus.NOT_FOUND
                )
            
            # Update the goblet color
            cane.goblet_color = color_update.goblet_color
            cane.updated_by = updated_by
            
            self.db.commit()
            self.db.refresh(cane)
            
            logger.info(
                "Updated goblet color | canister_id=%s cane_id=%s goblet_color=%s",
                canister_id,
                cane.cane_id,
                color_update.goblet_color
            )
            
            return ColorUpdateResponse(
                success=True,
                message=f"Goblet color updated successfully to '{color_update.goblet_color}'",
                cane_id=cane.cane_id,
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
                "Updated cryolock color | canister_id=%s cryolock_id=%s cryolock_number=%s cryolock_color=%s",
                canister_id,
                cryolock.cryolock_id,
                color_update.cryolock_number,
                color_update.cryolock_color
            )
            
            return ColorUpdateResponse(
                success=True,
                message=f"Cryolock color updated successfully to '{color_update.cryolock_color}'",
                cryolock_id=cryolock.cryolock_id,
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
    