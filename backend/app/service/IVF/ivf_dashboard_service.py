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
from ...models.shipment_model import Shipment
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
        Get total number of containers (canisters).
        
        Metric 2: Total number of Containers (For all Sites)
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_containers count
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Base query for canisters
        canister_query = self.db.query(func.count(Canister.canister_id)).filter(Canister.is_active == True)
        
        # Apply branch filtering if needed
        if filter_branch_id is not None:
            # Join through: Canister -> Tank -> Branch
            canister_query = (
                canister_query
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        
        total_containers = canister_query.scalar() or 0
        
        return {
            "total_containers": total_containers
        }
    
    def get_quality_deviations_flagged(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get count of quality deviations flagged.
        
        Metric 3: # Quality Deviations Flagged (For all Sites)
        
        Quality deviations are based on:
        - Canisters with status "risk" or "critical"
        - Canister LN2 logs with low LN2 levels (indicating potential issues)
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_quality_deviations count
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Count canisters with risk or critical status
        canister_query = (
            self.db.query(func.count(Canister.canister_id))
            .filter(
                Canister.is_active == True,
                Canister.canister_status.in_([CanisterStatus.RISK, CanisterStatus.CRITICAL])
            )
        )
        
        # Count canister logs with low LN2 levels (quality deviation indicator)
        # Low LN2 level is considered < 50% (arbitrary threshold, adjust as needed)
        log_query = (
            self.db.query(func.count(CanisterLn2Log.log_id))
            .filter(
                or_(
                    CanisterLn2Log.ln2_level_before < 50.0,
                    CanisterLn2Log.ln2_level_after < 50.0
                )
            )
        )
        
        # Apply branch filtering if needed
        if filter_branch_id is not None:
            # For canisters: Join through Canister -> Tank -> Branch
            canister_query = (
                canister_query
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
            
            # For logs: Join through CanisterLn2Log -> Canister -> Tank -> Branch
            log_query = (
                log_query
                .join(Canister, CanisterLn2Log.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        
        canister_deviations = canister_query.scalar() or 0
        log_deviations = log_query.scalar() or 0
        
        # Total deviations = canister status deviations + LN2 level deviations
        total_deviations = canister_deviations + log_deviations
        
        return {
            "total_quality_deviations": total_deviations,
            "canister_status_deviations": canister_deviations,
            "ln2_level_deviations": log_deviations
        }
    
    def get_top_deviation_driver(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get top deviation driver.
        
        Metric 4: Top Deviation Driver (For all Sites)
        
        Returns the KPI (Key Performance Indicator) with the highest deviation count.
        KPIs tracked:
        - Temperature deviations (is_temp_loss)
        - Humidity deviations (is_humidity_loss)
        - Agitation deviations (is_agitation_loss)
        
        Role-based access:
        - Manager (IVF): See metrics across all sites
        - User (IVF): See metrics only for their assigned branch
        - Admin: See metrics across all sites
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with top deviation driver name, count, and percentage
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Base query conditions for quality logs with deviations
        # Join through: IVFQualityLog -> Canister -> Tank -> Branch
        base_conditions = [
            Canister.is_active == True
        ]
        
        # Apply branch filtering if needed
        if filter_branch_id is not None:
            base_conditions.append(HospitalBranch.branch_id == filter_branch_id)
        
        # Count temperature deviations
        temp_query = (
            self.db.query(func.count(IVFQualityLog.id))
            .join(Canister, IVFQualityLog.canister_id == Canister.canister_id)
            .join(Tank, Canister.tank_id == Tank.tank_id)
            .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
            .filter(and_(*base_conditions))
            .filter(IVFQualityLog.is_temp_loss == True)
        )
        temp_count = temp_query.scalar() or 0
        
        # Count humidity deviations
        humidity_query = (
            self.db.query(func.count(IVFQualityLog.id))
            .join(Canister, IVFQualityLog.canister_id == Canister.canister_id)
            .join(Tank, Canister.tank_id == Tank.tank_id)
            .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
            .filter(and_(*base_conditions))
            .filter(IVFQualityLog.is_humidity_loss == True)
        )
        humidity_count = humidity_query.scalar() or 0
        
        # Count agitation deviations
        agitation_query = (
            self.db.query(func.count(IVFQualityLog.id))
            .join(Canister, IVFQualityLog.canister_id == Canister.canister_id)
            .join(Tank, Canister.tank_id == Tank.tank_id)
            .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
            .filter(and_(*base_conditions))
            .filter(IVFQualityLog.is_agitation_loss == True)
        )
        agitation_count = agitation_query.scalar() or 0
        
        # Determine top driver
        drivers = {
            "Temperature": temp_count,
            "Humidity": humidity_count,
            "Agitation": agitation_count
        }
        
        # Find top driver
        if not any(drivers.values()):
            return {
                "driver_name": "N/A",
                "count": 0,
                "percentage": 0.0,
                "all_drivers": drivers
            }
        
        top_driver = max(drivers.items(), key=lambda x: x[1])
        driver_name, driver_count = top_driver
        
        total_deviations = sum(drivers.values())
        percentage = round((driver_count / total_deviations * 100), 2) if total_deviations > 0 else 0.0
        
        return {
            "driver_name": driver_name,
            "count": driver_count,
            "percentage": percentage,
            "all_drivers": drivers
        }
    
    def get_outbound_shipments(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get count of outbound shipments.
        
        Metric 5: # Outbound Shipments (For all Sites)
        
        For IVF context, "outbound shipments" refers to patient shipments
        between sites (source_location -> destination_location).
        If there are no shipment details, returns 0.
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_outbound_shipments count (0 if no shipments)
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)

        shipment_query = (
            self.db.query(func.count(Shipment.id))
            .filter(
                Shipment.source_location.isnot(None),
                Shipment.destination_location.isnot(None),
                Shipment.source_location != Shipment.destination_location
            )
        )
        
        if filter_branch_id is not None:
            branch_name = (
                self.db.query(HospitalBranch.branch_name)
                .filter(HospitalBranch.branch_id == filter_branch_id)
                .scalar()
            )
            if not branch_name:
                return {"total_outbound_shipments": 0}
            
            shipment_query = shipment_query.filter(
                or_(
                    Shipment.source_location == branch_name,
                    Shipment.destination_location == branch_name
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
        - Stacked bar: Temperature, Humidity, Agitation/Vibration deviations
        - Top risk driver bar: Maximum deviation value for each container
        
        Chart structure (Quality deviation):
        - Y-axis: Containers (A, B, C, D, E)
        - X-axis: Deviation values (0-100)
        - For each container: Two horizontal bars
          1. Stacked bar: Temperature (purple), Humidity (grey), Agitation/Vibration (pink)
          2. Solid bar: Top risk driver (blue) - maximum deviation value
        
        Deviation types are mapped from IVF quality logs:
        - temperature: is_temp_loss
        - humidity: is_humidity_loss
        - agitation: is_agitation_loss
        """
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        temperature_case = case((IVFQualityLog.is_temp_loss.is_(True), 1), else_=0)
        humidity_case = case((IVFQualityLog.is_humidity_loss.is_(True), 1), else_=0)
        agitation_case = case((IVFQualityLog.is_agitation_loss.is_(True), 1), else_=0)
        
        log_join = and_(
            IVFQualityLog.canister_id == Canister.canister_id,
            IVFQualityLog.reading_timestamp.isnot(None)
        )
        
        role_normalized = role.title() if role else None
        is_user_view = role_normalized == "User"
        
        if is_user_view:
            # Container-wise deviations within the user's branch
            # User sees: container name, individual driver counts, highest top risk driver name and count per container
            query = (
                self.db.query(
                    Canister.canister_id.label("container_id"),
                    Canister.canister_number.label("container_number"),
                    func.coalesce(func.sum(temperature_case), 0).label("temperature_deviations"),
                    func.coalesce(func.sum(humidity_case), 0).label("humidity_deviations"),
                    func.coalesce(func.sum(agitation_case), 0).label("agitation_deviations")
                )
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .outerjoin(IVFQualityLog, log_join)
                .filter(Canister.is_active == True)
            )
            
            if filter_branch_id is not None:
                query = query.filter(HospitalBranch.branch_id == filter_branch_id)
            
            results = (
                query.group_by(Canister.canister_id, Canister.canister_number)
                .order_by(Canister.canister_id)
                .all()
            )
            
            data = []
            for row in results:
                temp_val = int(row.temperature_deviations)
                humidity_val = int(row.humidity_deviations)
                agitation_val = int(row.agitation_deviations)
                
                # Determine the highest top risk driver name and count for this container
                container_drivers = {
                    "temperature": temp_val,
                    "humidity": humidity_val,
                    "agitation": agitation_val
                }
                top_risk_driver_name, top_risk_driver_count = self._get_top_risk_driver_with_count(container_drivers)
                
                data.append({
                    "container_name": str(row.container_number) if row.container_number else None,  # Container number/code
                    "temperature": temp_val,  # Individual driver count
                    "humidity": humidity_val,  # Individual driver count
                    "agitation_vibration": agitation_val,  # Individual driver count
                    "top_risk_driver_name": top_risk_driver_name,  # Highest top risk driver name
                    "top_risk_driver_count": top_risk_driver_count,  # Highest top risk driver count
                    "top_risk_driver": top_risk_driver_count  # For backward compatibility with chart
                })
            
            return {
                "view_level": "container",
                "data": data
            }
        
        # Manager/Admin view: site-wise cumulative deviations
        # Manager sees: site name with cumulative counts of temperature, humidity, agitation for all containers in that site
        # and top risk driver name with cumulative count per site
        query = (
            self.db.query(
                HospitalBranch.branch_id.label("site_id"),
                HospitalBranch.branch_name.label("site_name"),
                func.coalesce(func.sum(temperature_case), 0).label("temperature_deviations"),
                func.coalesce(func.sum(humidity_case), 0).label("humidity_deviations"),
                func.coalesce(func.sum(agitation_case), 0).label("agitation_deviations")
            )
            .join(Tank, Tank.branch_id == HospitalBranch.branch_id)
            .join(Canister, Canister.tank_id == Tank.tank_id)
            .outerjoin(IVFQualityLog, log_join)
            .filter(Canister.is_active == True)
            .group_by(HospitalBranch.branch_id, HospitalBranch.branch_name)
            .order_by(HospitalBranch.branch_name)
        )
        
        if filter_branch_id is not None:
            query = query.filter(HospitalBranch.branch_id == filter_branch_id)
        
        results = query.all()
        
        data = []
        for row in results:
            temp_val = int(row.temperature_deviations)
            humidity_val = int(row.humidity_deviations)
            agitation_val = int(row.agitation_deviations)
            
            # Determine top risk driver name and count for this site
            site_drivers = {
                "temperature": temp_val,
                "humidity": humidity_val,
                "agitation": agitation_val
            }
            top_risk_driver_name, top_risk_driver_count = self._get_top_risk_driver_with_count(site_drivers)
            
            data.append({
                "site_id": row.site_id,
                "site_name": row.site_name,  # Site name
                "temperature": temp_val,  # Cumulative count for all containers in this site
                "humidity": humidity_val,  # Cumulative count for all containers in this site
                "agitation_vibration": agitation_val,  # Cumulative count for all containers in this site
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
                    e.g., {"temperature": 10, "humidity": 5, "agitation": 15}
        
        Returns:
            Tuple of (driver_name, count)
        """
        if not drivers or not any(drivers.values()):
            return ("N/A", 0)
        
        # Map internal names to display names
        name_mapping = {
            "temperature": "Temperature",
            "humidity": "Humidity",
            "agitation": "Agitation / Vibration"
        }
        
        top_driver_key = max(drivers.items(), key=lambda item: item[1])[0]
        top_driver_name = name_mapping.get(top_driver_key, top_driver_key.title())
        top_driver_count = drivers[top_driver_key]
        
        return (top_driver_name, top_driver_count)
    