"""
IVF Dashboard Service
Service layer for IVF dashboard metrics with role-based access control.
"""
from datetime import datetime
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case

from ...models.IVF.embryo_model import Embryo
from ...models.IVF.cryolock_model import Cryolock
from ...models.IVF.cane_model import Cane
from ...models.IVF.canister_model import Canister
from ...models.IVF.tank_model import Tank
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.canister_ln2_log_model import CanisterLn2Log
from ...models.IVF.ivf_quality_log_model import IVFQualityLog
from ...models.IVF.ivf_shipment_model import IVFShipment
from ...constants.enums import CanisterStatus


class IVFDashboardService:
    """Service for IVF dashboard metrics with role-based filtering."""
    
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
    
    def get_total_embryos_cryolocks(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get total count of embryos and cryolocks.
        
        Metric 1: Total Embryos/Cryolocks (for all the sites)
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_embryos, total_cryolocks, and total_embryos_cryolocks
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Base query for embryos
        embryo_query = self.db.query(func.count(Embryo.embryo_id)).filter(Embryo.is_active == True)
        
        # Base query for cryolocks
        cryolock_query = self.db.query(func.count(Cryolock.cryolock_id))
        
        # Apply branch filtering if needed
        if filter_branch_id is not None:
            # Join through: Embryo -> Cryolock -> Cane -> Canister -> Tank -> Branch
            embryo_query = (
                embryo_query
                .join(Cryolock, Embryo.cryolock_id == Cryolock.cryolock_id)
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
            
            # For cryolocks, join through: Cryolock -> Cane -> Canister -> Tank -> Branch
            cryolock_query = (
                cryolock_query
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        else:
            # No branch filter - count all active embryos and cryolocks
            # For embryos, we still need to join to get valid relationships
            embryo_query = (
                embryo_query
                .join(Cryolock, Embryo.cryolock_id == Cryolock.cryolock_id)
            )
        
        total_embryos = embryo_query.scalar() or 0
        total_cryolocks = cryolock_query.scalar() or 0
        total_embryos_cryolocks = total_embryos + total_cryolocks
        
        return {
            "total_embryos": total_embryos,
            "total_cryolocks": total_cryolocks,
            "total_embryos_cryolocks": total_embryos_cryolocks
        }
    
    def get_total_containers(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get total number of containers (cryolocks).
        
        Metric 2: Total number of Containers (For all Sites)
        
        Note: "Containers" in the ARC IVF API context refers to cryolocks, not canisters.
        This matches the source API's totalNumberofContainers field which counts cryolocks.
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_containers count (cryolocks)
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Base query for cryolocks (containers)
        cryolock_query = self.db.query(func.count(Cryolock.cryolock_id))
        
        # Apply branch filtering if needed
        if filter_branch_id is not None:
            # Join through: Cryolock -> Cane -> Canister -> Tank -> Branch
            cryolock_query = (
                cryolock_query
                .join(Cane, Cryolock.cane_id == Cane.cane_id)
                .join(Canister, Cane.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        
        total_containers = cryolock_query.scalar() or 0
        
        return {
            "total_containers": total_containers
        }
    
    def get_quality_deviations_flagged(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get count of quality deviations flagged.
        
        Metric 3: # Quality Deviations Flagged (For all Sites)
        
        Quality deviations are telemetry-driven and based on `ivf_quality_log`:
        - Any entry with `quality_loss > 0`, or any KPI loss flag set:
          `is_temp_internal_loss`, `is_temp_external_loss`, `is_humidity_loss`, `is_shock_loss`
        
        KPIs monitored: Internal Temperature, External Temperature, Humidity, Shock
        
        Args:
            branch_id: Optional branch ID to filter by
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
            IVFQualityLog.is_humidity_loss == True,
            IVFQualityLog.is_shock_loss == True,
        )
        
        q = self.db.query(
            func.count(IVFQualityLog.id).label("total_quality_deviations"),
        ).filter(base_filter)
        
        # Apply branch filtering if needed (ivf_quality_log is tank-level monitoring)
        if filter_branch_id is not None:
            q = (
                q.join(Tank, IVFQualityLog.tank_id == Tank.tank_id)
                 .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                 .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        
        row = q.first()
        total_deviations = int(row.total_quality_deviations or 0)

        # Keep ln2_level_deviations as 0 (legacy field used by older UI/types).
        return {
            "total_quality_deviations": total_deviations,
            "ln2_level_deviations": 0,
        }
    
    def get_top_deviation_driver(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get top deviation driver.
        
        Metric 4: Top Deviation Driver (For all Sites)
        
        Returns the KPI (Key Performance Indicator) with the highest deviation count.
        KPIs tracked (tank-level monitoring):
        - Internal Temperature deviations (is_temp_internal_loss)
        - External Temperature deviations (is_temp_external_loss)
        - Humidity deviations (is_humidity_loss)
        - Shock deviations (is_shock_loss)
        
        Role-based access:
        - Manager (IVF): See metrics across all sites
        - User (IVF): See metrics only for their assigned branch
        - Admin: See metrics across all sites
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with top deviation driver name, count, and all drivers breakdown
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Helper function to build query with optional branch filtering
        # Join through: IVFQualityLog -> Tank -> Branch (tank-level monitoring)
        def build_query(deviation_filter):
            query = (
                self.db.query(func.count(IVFQualityLog.id))
                .filter(deviation_filter)
            )
            
            # Apply branch filtering if needed
            if filter_branch_id is not None:
                query = (
                    query
                    .join(Tank, IVFQualityLog.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(HospitalBranch.branch_id == filter_branch_id)
                )
            
            return query
        
        # Count internal temperature deviations
        temp_internal_count = build_query(IVFQualityLog.is_temp_internal_loss == True).scalar() or 0
        
        # Count external temperature deviations
        temp_external_count = build_query(IVFQualityLog.is_temp_external_loss == True).scalar() or 0
        
        # Count humidity deviations
        humidity_count = build_query(IVFQualityLog.is_humidity_loss == True).scalar() or 0
        
        # Count shock deviations
        shock_count = build_query(IVFQualityLog.is_shock_loss == True).scalar() or 0
        
        # Determine top driver
        drivers = {
            "Internal Temperature": temp_internal_count,
            "External Temperature": temp_external_count,
            "Humidity": humidity_count,
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
    
    def get_total_deviations(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get total count of deviations from IVF quality logs.
        
        Counts distinct records in IVFQualityLog where any deviation flag is True:
        - is_temp_internal_loss (Internal Temperature)
        - is_temp_external_loss (External Temperature)
        - is_humidity_loss (Humidity)
        - is_shock_loss (Shock)
        
        Uses distinct count to avoid double-counting records with multiple violations.
        
        Role-based access:
        - Manager (IVF): Count deviations across all branches
        - User (IVF): Count deviations only for their assigned branch/site
        - Admin: Count deviations across all branches
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total deviations (distinct count)
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Count total deviations (any flag is True)
        # Use distinct count to avoid double-counting records with multiple violations
        total_filter = or_(
            IVFQualityLog.is_temp_internal_loss == True,
            IVFQualityLog.is_temp_external_loss == True,
            IVFQualityLog.is_humidity_loss == True,
            IVFQualityLog.is_shock_loss == True
        )
        total_query = (
            self.db.query(func.count(func.distinct(IVFQualityLog.id)))
            .filter(total_filter)
        )
        
        # Apply branch filtering if needed
        # Join through: IVFQualityLog -> Tank -> Branch (tank-level monitoring)
        if filter_branch_id is not None:
            total_query = (
                total_query
                .join(Tank, IVFQualityLog.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        
        total_count = total_query.scalar() or 0
        
        # Count individual KPI deviations for breakdown
        # Helper function to build query with optional branch filtering
        def build_count_query(deviation_filter):
            query = (
                self.db.query(func.count(func.distinct(IVFQualityLog.id)))
                .filter(deviation_filter)
            )
            
            # Apply branch filtering if needed
            if filter_branch_id is not None:
                query = (
                    query
                    .join(Tank, IVFQualityLog.tank_id == Tank.tank_id)
                    .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                    .filter(HospitalBranch.branch_id == filter_branch_id)
                )
            
            return query
        
        # Count internal temperature deviations
        temp_internal_count = build_count_query(IVFQualityLog.is_temp_internal_loss == True).scalar() or 0
        
        # Count external temperature deviations
        temp_external_count = build_count_query(IVFQualityLog.is_temp_external_loss == True).scalar() or 0
        
        # Count humidity deviations
        humidity_count = build_count_query(IVFQualityLog.is_humidity_loss == True).scalar() or 0
        
        # Count shock deviations
        shock_count = build_count_query(IVFQualityLog.is_shock_loss == True).scalar() or 0
        
        return {
            "total_deviations": total_count,
            "temp_internal_deviations": temp_internal_count,
            "temp_external_deviations": temp_external_count,
            "humidity_deviations": humidity_count,
            "shock_deviations": shock_count
        }
    
    def get_outbound_shipments(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get count of outbound shipments.
        
        Metric 5: # Outbound Shipments (For all Sites)
        
        For IVF context, "outbound shipments" refers to patient shipments
        between sites (source_branch_id -> destination_branch_id).
        Counts shipments where source_branch_id != destination_branch_id.
        If there are no shipment details, returns 0.
        
        Role-based filtering:
        - User role: Counts shipments where source_branch_id OR destination_branch_id matches user's branch
        - Manager/Admin role: Counts all outbound shipments across all branches
        
        Args:
            branch_id: Optional branch ID to filter by
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
        
        # Apply branch filtering if needed (for User role)
        if filter_branch_id is not None:
            # Count shipments where either source OR destination branch matches user's branch
            shipment_query = shipment_query.filter(
                or_(
                    IVFShipment.source_branch_id == filter_branch_id,
                    IVFShipment.destination_branch_id == filter_branch_id
                )
            )
        
        total_shipments = shipment_query.scalar()
        
        # Explicitly return 0 if None (no shipments)
        if total_shipments is None:
            total_shipments = 0
        
        return {
            "total_outbound_shipments": total_shipments
        }

    def get_deviations_graph(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get deviations graph data for IVF dashboard.
        
        Returns data for a horizontal bar chart showing:
        - Stacked bar: Internal Temperature, External Temperature, Humidity, Shock deviations
        - Top risk driver bar: Maximum deviation value for each tank/site
        
        Chart structure (Quality deviation):
        - Y-axis: Tanks (User view) or Sites (Manager/Admin view)
        - X-axis: Deviation values (0-100)
        - For each tank/site: Two horizontal bars
          1. Stacked bar: Internal Temperature, External Temperature, Humidity, Shock
          2. Solid bar: Top risk driver (blue) - maximum deviation value
        
        Deviation types are mapped from IVF quality logs (tank-level monitoring):
        - temp_internal: is_temp_internal_loss
        - temp_external: is_temp_external_loss
        - humidity: is_humidity_loss
        - shock: is_shock_loss
        """
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Case statements for new KPI flags
        temp_internal_case = case((IVFQualityLog.is_temp_internal_loss.is_(True), 1), else_=0)
        temp_external_case = case((IVFQualityLog.is_temp_external_loss.is_(True), 1), else_=0)
        humidity_case = case((IVFQualityLog.is_humidity_loss.is_(True), 1), else_=0)
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
                    func.coalesce(func.sum(temp_internal_case), 0).label("temp_internal_deviations"),
                    func.coalesce(func.sum(temp_external_case), 0).label("temp_external_deviations"),
                    func.coalesce(func.sum(humidity_case), 0).label("humidity_deviations"),
                    func.coalesce(func.sum(shock_case), 0).label("shock_deviations")
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
                humidity_val = int(row.humidity_deviations)
                shock_val = int(row.shock_deviations)
                
                # Determine the highest top risk driver name and count for this tank
                tank_drivers = {
                    "temp_internal": temp_internal_val,
                    "temp_external": temp_external_val,
                    "humidity": humidity_val,
                    "shock": shock_val
                }
                top_risk_driver_name, top_risk_driver_count = self._get_top_risk_driver_with_count(tank_drivers)
                
                data.append({
                    "container_name": str(row.tank_code) if row.tank_code else None,  # Tank code (kept as container_name for frontend compatibility)
                    "temperature": temp_internal_val + temp_external_val,  # Combined internal + external temp for backward compatibility
                    "temp_internal": temp_internal_val,  # Internal temperature deviations
                    "temp_external": temp_external_val,  # External temperature deviations
                    "humidity": humidity_val,  # Humidity deviations
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
        # Manager sees: site name with cumulative counts of temp_internal, temp_external, humidity, shock for all tanks in that site
        # and top risk driver name with cumulative count per site
        query = (
            self.db.query(
                HospitalBranch.branch_id.label("site_id"),
                HospitalBranch.branch_name.label("site_name"),
                func.coalesce(func.sum(temp_internal_case), 0).label("temp_internal_deviations"),
                func.coalesce(func.sum(temp_external_case), 0).label("temp_external_deviations"),
                func.coalesce(func.sum(humidity_case), 0).label("humidity_deviations"),
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
            humidity_val = int(row.humidity_deviations)
            shock_val = int(row.shock_deviations)
            
            # Determine top risk driver name and count for this site
            site_drivers = {
                "temp_internal": temp_internal_val,
                "temp_external": temp_external_val,
                "humidity": humidity_val,
                "shock": shock_val
            }
            top_risk_driver_name, top_risk_driver_count = self._get_top_risk_driver_with_count(site_drivers)
            
            data.append({
                "site_id": row.site_id,
                "site_name": row.site_name,  # Site name
                "temperature": temp_internal_val + temp_external_val,  # Combined internal + external temp for backward compatibility
                "temp_internal": temp_internal_val,  # Cumulative internal temperature deviations for all tanks in this site
                "temp_external": temp_external_val,  # Cumulative external temperature deviations for all tanks in this site
                "humidity": humidity_val,  # Cumulative humidity deviations for all tanks in this site
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
                    e.g., {"temp_internal": 10, "temp_external": 5, "humidity": 8, "shock": 15}
        
        Returns:
            Tuple of (driver_name, count)
        """
        if not drivers or not any(drivers.values()):
            return ("N/A", 0)
        
        # Map internal names to display names
        name_mapping = {
            "temp_internal": "Internal Temperature",
            "temp_external": "External Temperature",
            "humidity": "Humidity",
            "shock": "Shock"
        }
        
        top_driver_key = max(drivers.items(), key=lambda item: item[1])[0]
        top_driver_name = name_mapping.get(top_driver_key, top_driver_key.title())
        top_driver_count = drivers[top_driver_key]
        
        return (top_driver_name, top_driver_count)
    