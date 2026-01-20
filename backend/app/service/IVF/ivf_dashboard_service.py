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
        
        Deviation drivers considered:
        - Critical canister status
        - Risk canister status
        - Low LN2 levels
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with top deviation driver name, count, and percentage
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        # Count critical canisters
        critical_query = (
            self.db.query(func.count(Canister.canister_id))
            .filter(
                Canister.is_active == True,
                Canister.canister_status == CanisterStatus.CRITICAL
            )
        )
        
        # Count risk canisters
        risk_query = (
            self.db.query(func.count(Canister.canister_id))
            .filter(
                Canister.is_active == True,
                Canister.canister_status == CanisterStatus.RISK
            )
        )
        
        # Count low LN2 level events
        ln2_query = (
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
            critical_query = (
                critical_query
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
            
            risk_query = (
                risk_query
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
            
            # For logs: Join through CanisterLn2Log -> Canister -> Tank -> Branch
            ln2_query = (
                ln2_query
                .join(Canister, CanisterLn2Log.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        
        critical_count = critical_query.scalar() or 0
        risk_count = risk_query.scalar() or 0
        ln2_count = ln2_query.scalar() or 0
        
        # Determine top driver
        drivers = {
            "Critical Canister Status": critical_count,
            "Risk Canister Status": risk_count,
            "Low LN2 Levels": ln2_count
        }
        
        # Find top driver
        if not any(drivers.values()):
            return {
                "driver_name": "N/A",
                "count": 0,
                "percentage": 0.0
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

    def get_avg_quality_loss_per_container(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Calculate average quality loss per container.
        
        Quality loss per container is calculated as the average quality_loss
        from IVF quality logs for all time.
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with avg_quality_loss_per_container and total_containers
        """
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        per_container_query = (
            self.db.query(
                IVFQualityLog.canister_id.label("canister_id"),
                func.avg(IVFQualityLog.quality_loss).label("avg_loss")
            )
            .join(Canister, IVFQualityLog.canister_id == Canister.canister_id)
            .filter(
                Canister.is_active == True,
                IVFQualityLog.quality_loss.isnot(None)
            )
            .group_by(IVFQualityLog.canister_id)
        )
        
        if filter_branch_id is not None:
            per_container_query = (
                per_container_query
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        
        per_container_subquery = per_container_query.subquery()
        
        avg_quality_loss = (
            self.db.query(func.avg(per_container_subquery.c.avg_loss))
            .scalar()
        )
        total_containers = (
            self.db.query(func.count(per_container_subquery.c.canister_id))
            .scalar()
        )
        
        avg_quality_loss_value = round(float(avg_quality_loss), 2) if avg_quality_loss is not None else 0.0
        total_containers_value = int(total_containers) if total_containers is not None else 0
        
        return {
            "avg_quality_loss_per_container": avg_quality_loss_value,
            "total_containers": total_containers_value
        }

    def get_deviations_graph(self, branch_id: Optional[int] = None, role: Optional[str] = None) -> Dict:
        """
        Get deviations graph data for IVF dashboard.
        
        User view: container-wise deviations within the site.
        Manager/Admin view: cumulative deviations per site.
        
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
            totals = {"temperature": 0, "humidity": 0, "agitation": 0}
            for row in results:
                total_deviations = int(row.temperature_deviations + row.humidity_deviations + row.agitation_deviations)
                data.append({
                    "container_id": row.container_id,
                    "container_number": row.container_number,
                    "temperature_deviations": int(row.temperature_deviations),
                    "humidity_deviations": int(row.humidity_deviations),
                    "agitation_deviations": int(row.agitation_deviations),
                    "total_deviations": total_deviations
                })
                totals["temperature"] += int(row.temperature_deviations)
                totals["humidity"] += int(row.humidity_deviations)
                totals["agitation"] += int(row.agitation_deviations)
            
            top_deviation_type = self._get_top_deviation_type(totals)
            
            return {
                "view_level": "container",
                "top_deviation_type": top_deviation_type,
                "data": data
            }
        
        # Manager/Admin view: cumulative deviations per site
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
        
        results = query.all()
        
        data = []
        totals = {"temperature": 0, "humidity": 0, "agitation": 0}
        for row in results:
            total_deviations = int(row.temperature_deviations + row.humidity_deviations + row.agitation_deviations)
            site_totals = {
                "temperature": int(row.temperature_deviations),
                "humidity": int(row.humidity_deviations),
                "agitation": int(row.agitation_deviations)
            }
            data.append({
                "site_id": row.site_id,
                "site_name": row.site_name,
                "temperature_deviations": site_totals["temperature"],
                "humidity_deviations": site_totals["humidity"],
                "agitation_deviations": site_totals["agitation"],
                "total_deviations": total_deviations,
                "top_deviation_type": self._get_top_deviation_type(site_totals)
            })
            totals["temperature"] += site_totals["temperature"]
            totals["humidity"] += site_totals["humidity"]
            totals["agitation"] += site_totals["agitation"]
        
        top_deviation_type = self._get_top_deviation_type(totals)
        
        return {
            "view_level": "site",
            "top_deviation_type": top_deviation_type,
            "data": data
        }

    @staticmethod
    def _get_top_deviation_type(totals: Dict[str, int]) -> str:
        """Return the deviation type with the highest count."""
        if not totals or not any(totals.values()):
            return "N/A"
        return max(totals.items(), key=lambda item: item[1])[0]
    
