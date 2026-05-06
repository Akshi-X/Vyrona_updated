"""
IVF Dashboard Service
Service layer for IVF dashboard metrics with role-based access control.
"""
from datetime import datetime
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case, text

from ...models.readings_model import Readings
from ...models.kpi_config_model import KpiConfig

from ...models.IVF.patient_crylock_info_model import PatientCrylockInfo
from ...models.IVF.tank_model import Tank
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.ivf_quality_log_model import IVFQualityLog
from ...models.IVF.ivf_shipment_model import IVFShipment


class IVFDashboardService:
    """Service for IVF dashboard metrics with role-based filtering."""
    
    def get_deviation_counts_by_kpi(
        self,
        hospital_id: int,
        branch_id: Optional[int] = None,
        role: Optional[str] = None,
        from_dt: Optional[datetime] = None,
        to_dt: Optional[datetime] = None,
    ) -> Dict[str, int]:
            """
            Get count of KPI deviation alerts grouped by KpiConfig.alert_name.
            Optionally filtered by created_at range (from_dt, to_dt).
            """
            filter_branch_id = self._get_branch_filter(branch_id, role)

            query = text("""SELECT
                                COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown') AS alert_name,
                                COUNT(c.alert_id) AS deviation_count
                            FROM
                                critical_alerts c
                            LEFT JOIN
                                kpi_config k ON k.id = CASE
                                    WHEN c.dedup_key ~ ':[0-9]+$'
                                    THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                                    ELSE NULL
                                END
                            WHERE
                                c.hospital_id = :hospital_id
                                AND c.source = 'KPI'
                                AND (:branch_id IS NULL OR c.branch_id = :branch_id)
                                AND (:from_dt IS NULL OR c.created_at >= :from_dt)
                                AND (:to_dt IS NULL OR c.created_at < :to_dt)
                            GROUP BY
                                COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown');""")

            results = self.db.execute(query, {
                "hospital_id": hospital_id,
                "branch_id": filter_branch_id,
                "from_dt": from_dt,
                "to_dt": to_dt,
            }).fetchall()

            return {alert_name: deviation_count for alert_name, deviation_count in results}

    def __init__(self, db: Session):
        self.db = db
    
    def _get_current_month_bounds(self) -> Tuple[datetime, datetime]:
        """Return start of current month and start of next month."""
        current_date = datetime.now()
        current_month_start = current_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        if current_date.month == 12:
            next_month_start = current_date.replace(
                year=current_date.year + 1,
                month=1,
                day=1,
                hour=0,
                minute=0,
                second=0,
                microsecond=0
            )
        else:
            next_month_start = current_date.replace(
                month=current_date.month + 1,
                day=1,
                hour=0,
                minute=0,
                second=0,
                microsecond=0
            )
        
        return current_month_start, next_month_start
    
    def _get_branch_filter(self, branch_id: Optional[int], role: Optional[str]) -> Optional[int]:
        """
        Determine branch filter based on role.
        
        Rules:
        - Manager role with IVF department: No filtering (show all sites) -> return None
        - User role: Filter by branch_id -> return branch_id
        - Admin role: No filtering (show all sites) -> return None
        
        Args:
            branch_id: User's branch_id
            role: User's role
            
        Returns:
            Branch ID to filter by, or None for no filtering
        """
        if role is None:
            return None
        
        role_normalized = role.title() if role else None
        
        # Manager role: show all sites (no filtering)
        if role_normalized == "Manager":
            return None
        
        # User role: filter by branch
        if role_normalized == "User":
            return branch_id
        
        # Admin role: show all sites (no filtering)
        if role_normalized == "Admin":
            return None
        
        # Default: no filtering
        return None
    
    def get_total_embryos_cryolocks(self, branch_id: Optional[int] = None, hospital_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get total count of embryos and cryolocks.
        
        Metric 1: Total Embryos/Cryolocks (for all the sites)
        
        Note: In the new model structure, we only track cryolocks (containers) in PatientCrylockInfo.
        Each cryolock can contain embryos, but we don't track individual embryo counts.
        For backward compatibility:
        - total_cryolocks: Count of active cryolocks (excluding embryo_transfer=True)
        - total_embryos: Set to same as total_cryolocks (since each cryolock contains embryos)
        - total_embryos_cryolocks: Sum of both (effectively 2 * total_cryolocks)
        
        Args:
            branch_id: Optional branch ID to filter by
            hospital_id: Optional hospital ID to scope results (when branch_id not set, e.g. Manager/Admin)
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_embryos, total_cryolocks, and total_embryos_cryolocks
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Query PatientCrylockInfo for cryolocks
        # Exclude cryolocks that have been moved to embryo transfer
        cryolock_query = (
            self.db.query(func.count(PatientCrylockInfo.id))
            .filter(PatientCrylockInfo.embryo_transfer != True)
        )
        
        # Apply branch filtering if needed
        if filter_branch_id is not None:
            cryolock_query = cryolock_query.filter(PatientCrylockInfo.branch_id == filter_branch_id)
        elif hospital_id is not None:
            cryolock_query = (
                cryolock_query.join(HospitalBranch, PatientCrylockInfo.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.hospital_id == hospital_id)
            )
        
        total_cryolocks = cryolock_query.scalar() or 0
        
        # For backward compatibility: treat each cryolock as containing embryos
        # In reality, we don't track individual embryo counts, so we use cryolock count
        total_embryos = total_cryolocks
        total_embryos_cryolocks = total_embryos + total_cryolocks
        
        return {
            "total_embryos": total_embryos,
            "total_cryolocks": total_cryolocks,
            "total_embryos_cryolocks": total_embryos_cryolocks
        }
    
    def get_total_containers(self, branch_id: Optional[int] = None, hospital_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get total number of tanks.
        
        Metric 2: Total number of Containers (For all Sites)
        
        Note: Endpoint name/response key is kept as "containers" for backward compatibility,
        but the count is derived from IVF tanks.
        
        Args:
            branch_id: Optional branch ID to filter by
            hospital_id: Optional hospital ID to scope results (when branch_id not set)
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_containers count (tanks)
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Query active tanks and count by branch scope (if applicable)
        tank_query = (
            self.db.query(func.count(Tank.tank_id))
            .filter(Tank.is_active == True)
        )
        
        # Apply branch or hospital filtering if needed
        if filter_branch_id is not None:
            tank_query = tank_query.filter(Tank.branch_id == filter_branch_id)
        elif hospital_id is not None:
            tank_query = (
                tank_query.join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.hospital_id == hospital_id)
            )
        
        total_containers = tank_query.scalar() or 0
        
        return {
            "total_containers": total_containers
        }
    
    def get_quality_deviations_flagged(self, branch_id: Optional[int] = None, hospital_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get count of quality deviations flagged.
        
        Metric 3: # Quality Deviations Flagged (For all Sites)
        
        Quality deviations are telemetry-driven and based on `ivf_quality_log`:
        - Any entry with `quality_loss > 0`, or any KPI loss flag set:
          `is_temp_internal_loss`, `is_temp_external_loss`, `is_shock_loss`
        
        KPIs monitored: Internal Temperature, External Temperature, Shock
        
        Args:
            branch_id: Optional branch ID to filter by
            hospital_id: Optional hospital ID to scope results (when branch_id not set)
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_quality_deviations count and breakdown counts
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Base query: count deviations in ivf_quality_log
        # A deviation is defined as any KPI loss flag or quality_loss > 0
        base_filter = or_(
            and_(IVFQualityLog.quality_loss.isnot(None), IVFQualityLog.quality_loss > 0),
            IVFQualityLog.is_temp_internal_loss == True,
            IVFQualityLog.is_temp_external_loss == True,
            IVFQualityLog.is_shock_loss == True,
        )
        
        q = self.db.query(
            func.count(IVFQualityLog.id).label("total_quality_deviations"),
        ).filter(base_filter)
        
        # Apply branch or hospital filtering if needed (ivf_quality_log is tank-level monitoring)
        if filter_branch_id is not None:
            q = (
                q.join(Tank, IVFQualityLog.tank_id == Tank.tank_id)
                 .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                 .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        elif hospital_id is not None:
            q = (
                q.join(Tank, IVFQualityLog.tank_id == Tank.tank_id)
                 .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                 .filter(HospitalBranch.hospital_id == hospital_id)
            )
        
        row = q.first()
        total_deviations = int(row.total_quality_deviations or 0)

        # Keep ln2_level_deviations as 0 (legacy field used by older UI/types).
        return {
            "total_quality_deviations": total_deviations,
            "ln2_level_deviations": 0,
        }
    
    def get_top_deviation_driver(self, branch_id: Optional[int] = None, hospital_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get top deviation driver.
        
        Metric 4: Top Deviation Driver (For all Sites)
        
        Returns the KPI (Key Performance Indicator) with the highest deviation count.
        KPIs tracked (tank-level monitoring):
        - Internal Temperature deviations (is_temp_internal_loss)
        - External Temperature deviations (is_temp_external_loss)
        - Shock deviations (is_shock_loss)
        
        Role-based access:
        - Manager (IVF): See metrics across all sites
        - User (IVF): See metrics only for their assigned branch
        - Admin: See metrics across all sites
        
        Args:
            branch_id: Optional branch ID to filter by
            hospital_id: Optional hospital ID to scope results (when branch_id not set)
            role: User's role to determine filtering
            
        Returns:
            Dictionary with top deviation driver name, count, and all drivers breakdown
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Helper function to build query with optional branch/hospital filtering
        # Join through: IVFQualityLog -> Tank -> Branch (tank-level monitoring)
        def build_query(deviation_filter):
            query = (
                self.db.query(func.count(IVFQualityLog.id))
                .filter(deviation_filter)
            )
            
            if filter_branch_id is not None:
                query = (
                    query
                    .join(Tank, IVFQualityLog.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(HospitalBranch.branch_id == filter_branch_id)
                )
            elif hospital_id is not None:
                query = (
                    query
                    .join(Tank, IVFQualityLog.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(HospitalBranch.hospital_id == hospital_id)
                )
            
            return query
        
        # Count internal temperature deviations
        temp_internal_count = build_query(IVFQualityLog.is_temp_internal_loss == True).scalar() or 0
        
        # Count external temperature deviations
        temp_external_count = build_query(IVFQualityLog.is_temp_external_loss == True).scalar() or 0
        
        # Count shock deviations
        shock_count = build_query(IVFQualityLog.is_shock_loss == True).scalar() or 0
        
        # Determine top driver
        drivers = {
            "Internal Temperature": temp_internal_count,
            "External Temperature": temp_external_count,
            "Shock": shock_count
        }
        
        # Find top driver
        if not any(drivers.values()):
            return {
                "driver_name": "N/A",
                "count": 0,
                "all_drivers": drivers
            }
        
        top_driver = max(drivers.items(), key=lambda x: x[1])
        driver_name, driver_count = top_driver
        
        return {
            "driver_name": driver_name,
            "count": driver_count,
            "all_drivers": drivers
        }
    
    def get_total_deviations(
        self,
        hospital_id: Optional[int] = None,
        branch_id: Optional[int] = None,
        role: Optional[str] = None,
        from_dt: Optional[datetime] = None,
        to_dt: Optional[datetime] = None,
    ) -> Dict:
        """
        Get total count of deviations from critical_alerts.

        Optionally filtered by created_at range (from_dt, to_dt).
        active_total_deviations counts only Active-status alerts within the same range.
        """
        filter_branch_id = self._get_branch_filter(branch_id, role)

        deviations = self.get_deviation_counts_by_kpi(
            hospital_id=hospital_id, branch_id=filter_branch_id, role=role,
            from_dt=from_dt, to_dt=to_dt,
        )

        active_query = text("""
            SELECT COUNT(c.alert_id)
            FROM critical_alerts c
            WHERE c.hospital_id = :hospital_id
              AND c.source = 'KPI'
              AND c.status = 'Active'
              AND (:branch_id IS NULL OR c.branch_id = :branch_id)
              AND (:from_dt IS NULL OR c.created_at >= :from_dt)
              AND (:to_dt IS NULL OR c.created_at < :to_dt)
        """)
        active_count = self.db.execute(active_query, {
            "hospital_id": hospital_id,
            "branch_id": filter_branch_id,
            "from_dt": from_dt,
            "to_dt": to_dt,
        }).scalar() or 0

        return {
            "total_deviations": sum(deviations.values()),
            "active_total_deviations": int(active_count),
            "deviations_by_kpi": deviations,
        }
    
    def get_outbound_shipments(self, branch_id: Optional[int] = None, hospital_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get count of outbound shipments.
        
        Metric 5: # Outbound Shipments (For all Sites)
        
        For IVF context, "outbound shipments" refers to patient shipments
        between sites (source_branch_id -> destination_branch_id).
        Counts shipments where source_branch_id != destination_branch_id.
        If there are no shipment details, returns 0.
        
        Role-based filtering:
        - User role: Counts shipments where source_branch_id OR destination_branch_id matches user's branch
        - Manager/Admin role: Counts outbound shipments for their hospital only (when hospital_id provided)
        
        Args:
            branch_id: Optional branch ID to filter by
            hospital_id: Optional hospital ID to scope results (when branch_id not set)
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_outbound_shipments count (0 if no shipments)
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)

        # Count shipments where source and destination branches are different (outbound shipments)
        shipment_query = (
            self.db.query(func.count(IVFShipment.id))
            .filter(
                IVFShipment.source_branch_id.isnot(None),
                IVFShipment.destination_branch_id.isnot(None),
                IVFShipment.source_branch_id != IVFShipment.destination_branch_id
            )
        )
        
        # Apply branch or hospital filtering if needed
        if filter_branch_id is not None:
            shipment_query = shipment_query.filter(
                or_(
                    IVFShipment.source_branch_id == filter_branch_id,
                    IVFShipment.destination_branch_id == filter_branch_id
                )
            )
        elif hospital_id is not None:
            branch_ids_subq = (
                self.db.query(HospitalBranch.branch_id).filter(HospitalBranch.hospital_id == hospital_id).subquery()
            )
            shipment_query = shipment_query.filter(
                or_(
                    IVFShipment.source_branch_id.in_(branch_ids_subq),
                    IVFShipment.destination_branch_id.in_(branch_ids_subq)
                )
            )
        
        total_shipments = shipment_query.scalar()
        
        # Explicitly return 0 if None (no shipments)
        if total_shipments is None:
            total_shipments = 0
        
        return {
            "total_outbound_shipments": total_shipments
        }

    def get_branch_deviations(
        self,
        hospital_id: Optional[int] = None,
        branch_id: Optional[int] = None,
        role: Optional[str] = None,
        from_dt: Optional[datetime] = None,
        to_dt: Optional[datetime] = None,
    ) -> Dict:
        filter_branch_id = self._get_branch_filter(branch_id, role)
        role_normalized = role.title() if role else None

        if role_normalized == "User":
            query = text("""
            SELECT
                b.branch_name,
                t.tank_code,
                COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown') AS alert_name,
                COUNT(c.alert_id) AS deviation_count
            FROM
                critical_alerts c
            JOIN
                hospital_branches b ON c.branch_id = b.branch_id
            LEFT JOIN
                kpi_config k ON k.id = CASE
                    WHEN c.dedup_key ~ ':[0-9]+$'
                    THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                    ELSE NULL
                END
            JOIN
                tanks t ON c.tank_id = t.tank_id
            WHERE
                c.hospital_id = :hospital_id
                AND c.source = 'KPI'
                AND (:branch_id IS NULL OR b.branch_id = :branch_id)
                AND (:from_dt IS NULL OR c.created_at >= :from_dt)
                AND (:to_dt IS NULL OR c.created_at < :to_dt)
            GROUP BY
                b.branch_name,
                t.tank_code,
                COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown')
            ORDER BY
                b.branch_name,
                t.tank_code,
                alert_name;
            """)
        else:
            query = text("""
            SELECT
                b.branch_name,
                COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown') AS alert_name,
                COUNT(c.alert_id) AS deviation_count
            FROM
                critical_alerts c
            JOIN
                hospital_branches b ON c.branch_id = b.branch_id
            LEFT JOIN
                kpi_config k ON k.id = CASE
                    WHEN c.dedup_key ~ ':[0-9]+$'
                    THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                    ELSE NULL
                END
            JOIN
                tanks t ON c.tank_id = t.tank_id
            WHERE
                c.hospital_id = :hospital_id
                AND c.source = 'KPI'
                AND (:branch_id IS NULL OR b.branch_id = :branch_id)
                AND (:from_dt IS NULL OR c.created_at >= :from_dt)
                AND (:to_dt IS NULL OR c.created_at < :to_dt)
            GROUP BY
                b.branch_name, COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown')
            ORDER BY
                b.branch_name,
                alert_name;
            """)

        data_rows = self.db.execute(
            query,
            {
                "hospital_id": hospital_id,
                "branch_id": filter_branch_id,
                "from_dt": from_dt,
                "to_dt": to_dt,
            },
        ).mappings().fetchall()

        heading_query = text("""
        SELECT
            t.tank_code
        FROM
            tanks t
        JOIN
            hospital_branches b ON t.branch_id = b.branch_id
        WHERE
            t.is_active = TRUE
            AND b.hospital_id = :hospital_id
            AND (:branch_id IS NULL OR b.branch_id = :branch_id)
        ORDER BY
            t.tank_code;
        """)

        heading_rows = self.db.execute(
            heading_query,
            {
                "hospital_id": hospital_id,
                "branch_id": filter_branch_id,
            },
        ).fetchall()

        available_heading = [str(row[0]) for row in heading_rows if row[0] is not None]

        return {
            "available_heading": available_heading,
            "data": data_rows,
        }

    def get_deviations_graph_all_branches(
        self,
        hospital_id: Optional[int] = None,
        role: Optional[str] = None,
        from_dt: Optional[datetime] = None,
        to_dt: Optional[datetime] = None,
    ) -> Dict:
        query = text("""
        WITH branch_list AS (
            SELECT
                b.branch_id,
                b.branch_name
            FROM
                hospital_branches b
            WHERE
                b.hospital_id = :hospital_id
        ),
        alert_list AS (
            SELECT DISTINCT
                COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown') AS alert_name
            FROM
                kpi_config k
            WHERE
                k.hospital_id = :hospital_id
                AND (k.alert_name IS NOT NULL OR k.kpi_name IS NOT NULL)
        ),
        deviation_counts AS (
            SELECT
                c.branch_id,
                COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown') AS alert_name,
                COUNT(c.alert_id) AS deviation_count
            FROM
                critical_alerts c
            LEFT JOIN
                kpi_config k ON k.id = CASE
                    WHEN c.dedup_key ~ ':[0-9]+$'
                    THEN CAST(regexp_replace(c.dedup_key, '^.*:', '') AS INTEGER)
                    ELSE NULL
                END
            WHERE
                c.hospital_id = :hospital_id
                AND c.source = 'KPI'
                AND (:from_dt IS NULL OR c.created_at >= :from_dt)
                AND (:to_dt IS NULL OR c.created_at < :to_dt)
            GROUP BY
                c.branch_id, COALESCE(NULLIF(k.alert_name, ''), NULLIF(k.kpi_name, ''), 'Unknown')
        )
        SELECT
            bl.branch_name,
            al.alert_name,
            COALESCE(dc.deviation_count, 0) AS deviation_count
        FROM
            branch_list bl
        CROSS JOIN
            alert_list al
        LEFT JOIN
            deviation_counts dc
            ON dc.branch_id = bl.branch_id
            AND dc.alert_name = al.alert_name
        ORDER BY
            bl.branch_name, al.alert_name;
        """)

        data_rows = self.db.execute(query, {
            "hospital_id": hospital_id,
            "from_dt": from_dt,
            "to_dt": to_dt,
        }).mappings().fetchall()

        heading_query = text("""
        SELECT
            b.branch_name
        FROM
            hospital_branches b
        WHERE
            b.hospital_id = :hospital_id
        ORDER BY
            b.branch_name;
        """)
        heading_rows = self.db.execute(heading_query, {"hospital_id": hospital_id}).fetchall()
        available_heading = [str(row[0]) for row in heading_rows if row[0] is not None]

        return {
            "available_heading": available_heading,
            "data": data_rows,
        }

        
    def get_deviations_graph(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get deviations graph data for IVF dashboard.
        
        Returns data for a horizontal bar chart showing:
        - Stacked bar: Internal Temperature, External Temperature, Shock deviations
        - Top risk driver bar: Maximum deviation value for each tank/site
        
        Chart structure (Quality deviation):
        - Y-axis: Tanks (User view) or Sites (Manager/Admin view)
        - X-axis: Deviation values (0-100)
        - For each tank/site: Two horizontal bars
          1. Stacked bar: Internal Temperature, External Temperature, Shock
          2. Solid bar: Top risk driver (blue) - maximum deviation value
        
        Deviation types are mapped from IVF quality logs (tank-level monitoring):
        - temp_internal: is_temp_internal_loss
        - temp_external: is_temp_external_loss
        - shock: is_shock_loss
        """
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Case statements for new KPI flags
        temp_internal_case = case((IVFQualityLog.is_temp_internal_loss.is_(True), 1), else_=0)
        temp_external_case = case((IVFQualityLog.is_temp_external_loss.is_(True), 1), else_=0)
        shock_case = case((IVFQualityLog.is_shock_loss.is_(True), 1), else_=0)
        
        # Join through: IVFQualityLog -> Tank -> Branch (tank-level monitoring)
        log_join = and_(
            IVFQualityLog.tank_id == Tank.tank_id,
            IVFQualityLog.reading_timestamp.isnot(None)
        )
        
        role_normalized = role.title() if role else None
        is_user_view = role_normalized == "User"
        
        if is_user_view:
            # Tank-wise deviations within the user's branch
            # User sees: tank code, individual driver counts, highest top risk driver name and count per tank
            query = (
                self.db.query(
                    Tank.tank_id.label("tank_id"),
                    Tank.tank_code.label("tank_code"),
                )
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .outerjoin(IVFQualityLog, log_join)
                .filter(Tank.is_active == True)
            )
            
            if filter_branch_id is not None:
                query = query.filter(HospitalBranch.branch_id == filter_branch_id)
            
            results = (
                query.group_by(Tank.tank_id, Tank.tank_code)
                .order_by(Tank.tank_id)
                .all()
            )
            
            data = []
            for row in results:
                temp_internal_val = int(row.temp_internal_deviations)
                temp_external_val = int(row.temp_external_deviations)
                shock_val = int(row.shock_deviations)
                
                # Determine the highest top risk driver name and count for this tank
                tank_drivers = {
                    "temp_internal": temp_internal_val,
                    "temp_external": temp_external_val,
                    "shock": shock_val
                }
                top_risk_driver_name, top_risk_driver_count = self._get_top_risk_driver_with_count(tank_drivers)
                
                data.append({
                    "container_name": str(row.tank_code) if row.tank_code else None,  # Tank code (kept as container_name for frontend compatibility)
                    "temperature": temp_internal_val + temp_external_val,  # Combined internal + external temp for backward compatibility
                    "temp_internal": temp_internal_val,  # Internal temperature deviations
                    "temp_external": temp_external_val,  # External temperature deviations
                    "agitation_vibration": shock_val,  # Shock deviations (kept as agitation_vibration for backward compatibility)
                    "shock": shock_val,  # Shock deviations
                    "top_risk_driver_name": top_risk_driver_name,  # Highest top risk driver name
                    "top_risk_driver_count": top_risk_driver_count,  # Highest top risk driver count
                    "top_risk_driver": top_risk_driver_count  # For backward compatibility with chart
                })
            
            return {
                "view_level": "container",  # Kept as "container" for frontend compatibility, but represents tanks
                "data": data
            }
        
        # Manager/Admin view: site-wise cumulative deviations
        # Manager sees: site name with cumulative counts of temp_internal, temp_external, shock for all tanks in that site
        # and top risk driver name with cumulative count per site
        query = (
            self.db.query(
                HospitalBranch.branch_id.label("site_id"),
                HospitalBranch.branch_name.label("site_name"),
                func.coalesce(func.sum(temp_internal_case), 0).label("temp_internal_deviations"),
                func.coalesce(func.sum(temp_external_case), 0).label("temp_external_deviations"),
                func.coalesce(func.sum(shock_case), 0).label("shock_deviations")
            )
            .join(Tank, Tank.branch_id == HospitalBranch.branch_id)
            .outerjoin(IVFQualityLog, log_join)
            .filter(Tank.is_active == True)
            .group_by(HospitalBranch.branch_id, HospitalBranch.branch_name)
            .order_by(HospitalBranch.branch_name)
        )
        
        if filter_branch_id is not None:
            query = query.filter(HospitalBranch.branch_id == filter_branch_id)
        
        results = query.all()
        
        data = []
        for row in results:
            temp_internal_val = int(row.temp_internal_deviations)
            temp_external_val = int(row.temp_external_deviations)
            shock_val = int(row.shock_deviations)
            
            # Determine top risk driver name and count for this site
            site_drivers = {
                "temp_internal": temp_internal_val,
                "temp_external": temp_external_val,
                "shock": shock_val
            }
            top_risk_driver_name, top_risk_driver_count = self._get_top_risk_driver_with_count(site_drivers)
            
            data.append({
                "site_id": row.site_id,
                "site_name": row.site_name,  # Site name
                "temperature": temp_internal_val + temp_external_val,  # Combined internal + external temp for backward compatibility
                "temp_internal": temp_internal_val,  # Cumulative internal temperature deviations for all tanks in this site
                "temp_external": temp_external_val,  # Cumulative external temperature deviations for all tanks in this site
                "agitation_vibration": shock_val,  # Cumulative shock deviations for all tanks in this site (kept for backward compatibility)
                "shock": shock_val,  # Cumulative shock deviations for all tanks in this site
                "top_risk_driver_name": top_risk_driver_name,  # Top risk driver name for this site
                "top_risk_driver_count": top_risk_driver_count,  # Top risk driver cumulative count for this site
                "top_risk_driver": top_risk_driver_count  # For backward compatibility with chart
            })
        
        return {
            "view_level": "site",
            "data": data
        }

    @staticmethod
    def _get_top_deviation_type(totals: Dict[str, int]) -> str:
        """Return the deviation type with the highest count."""
        if not totals or not any(totals.values()):
            return "N/A"
        return max(totals.items(), key=lambda item: item[1])[0]
    
    @staticmethod
    def _get_top_risk_driver_with_count(drivers: Dict[str, int]) -> tuple:
        """
        Return the top risk driver name and count.
        
        Args:
            drivers: Dictionary with driver names as keys and counts as values
                    e.g., {"temp_internal": 10, "temp_external": 5, "shock": 15}
        
        Returns:
            Tuple of (driver_name, count)
        """
        if not drivers or not any(drivers.values()):
            return ("N/A", 0)
        
        # Map internal names to display names
        name_mapping = {
            "temp_internal": "Internal Temperature",
            "temp_external": "External Temperature",
            "shock": "Shock"
        }
        
        top_driver_key = max(drivers.items(), key=lambda item: item[1])[0]
        top_driver_name = name_mapping.get(top_driver_key, top_driver_key.title())
        top_driver_count = drivers[top_driver_key]
        
        return (top_driver_name, top_driver_count)
    
