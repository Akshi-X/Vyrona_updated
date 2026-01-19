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
        
        current_month_start, next_month_start = self._get_current_month_bounds()
        
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
                CanisterLn2Log.opened_at >= current_month_start,
                CanisterLn2Log.opened_at < next_month_start,
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
        
        current_month_start, next_month_start = self._get_current_month_bounds()
        
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
                CanisterLn2Log.opened_at >= current_month_start,
                CanisterLn2Log.opened_at < next_month_start,
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
        
        For IVF context, "outbound shipments" refers to canister movements or openings
        tracked through canister LN2 logs. Each log entry with opened_at timestamp
        represents an outbound movement/operation (shipment).
        
        If there are no shipments (no log entries with opened_at in current month), returns 0.
        
        Args:
            branch_id: Optional branch ID to filter by
            role: User's role to determine filtering
            
        Returns:
            Dictionary with total_outbound_shipments count (0 if no shipments)
        """
        # Apply branch filter based on role
        filter_branch_id = self._get_branch_filter(branch_id, role)
        
        current_month_start, next_month_start = self._get_current_month_bounds()
        
        # Count canister log entries (opened events) in current month
        # These represent outbound operations/movements (shipments)
        log_query = (
            self.db.query(func.count(CanisterLn2Log.log_id))
            .filter(
                CanisterLn2Log.opened_at >= current_month_start,
                CanisterLn2Log.opened_at < next_month_start,
                CanisterLn2Log.opened_at.isnot(None)
            )
        )
        
        # Apply branch filtering if needed
        if filter_branch_id is not None:
            # Join through: CanisterLn2Log -> Canister -> Tank -> Branch
            log_query = (
                log_query
                .join(Canister, CanisterLn2Log.canister_id == Canister.canister_id)
                .join(Tank, Canister.tank_id == Tank.tank_id)
                .join(HospitalBranch, Tank.branch_id == HospitalBranch.branch_id)
                .filter(HospitalBranch.branch_id == filter_branch_id)
            )
        
        # Get count - will return 0 if no shipments found
        total_shipments = log_query.scalar()
        
        # Explicitly return 0 if None (no shipments)
        if total_shipments is None:
            total_shipments = 0
        
        return {
            "total_outbound_shipments": total_shipments
        }
    
