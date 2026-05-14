"""
ARC IVF External API Service
Handles integration with ARC IVF Storage API
"""
import logging
import os
import time
from typing import Dict, Optional, Any
from datetime import datetime, date, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text
from sqlalchemy.exc import OperationalError
from psycopg2.errors import DeadlockDetected
from app.config.config import settings
from ...models.IVF.hospital_model import Hospital
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.tank_model import Tank
from ...models.IVF.patient_crylock_info_model import PatientCrylockInfo
from ...utils.ivf_helpers import (
    encrypt_sensitive_ivf_value,
    extract_tank_code_from_cryolock_number,
    extract_canister_code_from_cryolock_number,
    extract_cane_code_from_cryolock_number,
    extract_position_from_cryolock_number,
)
from ...utils.reservoir_utils import ensure_branch_reservoir

logger = logging.getLogger(__name__)

ARC_IVF_STORAGE_SYNC_LOCK_KEY = 78430219

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False
    logger.warning("httpx not available. ARC IVF API calls will fail.")


def retry_on_deadlock(max_retries=3, initial_delay=0.1, max_delay=2.0, backoff_factor=2.0):
    """
    Decorator to retry database operations on deadlock errors.
    
    Args:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds before first retry
        max_delay: Maximum delay in seconds between retries
        backoff_factor: Multiplier for exponential backoff
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            retries = 0
            delay = initial_delay
            
            while retries <= max_retries:
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    # Check if it's a deadlock error
                    if isinstance(e.orig, DeadlockDetected):
                        if retries < max_retries:
                            retries += 1
                            logger.warning(
                                f"Deadlock detected in {func.__name__}. "
                                f"Retrying ({retries}/{max_retries}) after {delay:.2f}s delay..."
                            )
                            time.sleep(delay)
                            delay = min(delay * backoff_factor, max_delay)
                            continue
                        else:
                            logger.error(
                                f"Deadlock detected in {func.__name__}. "
                                f"Max retries ({max_retries}) exceeded."
                            )
                    # Re-raise if not a deadlock or max retries exceeded
                    raise
                except Exception as e:
                    # Re-raise non-deadlock exceptions immediately
                    raise
            
            # This should never be reached, but just in case
            raise Exception(f"Failed after {max_retries} retries")
        
        return wrapper
    return decorator


class ARCIVFService:
    """Service for interacting with ARC IVF Storage API"""
    
    # ARC IVF API Base URL
    ARC_IVF_API_BASE_URL = "https://hims.arcivf.com/ARCGTIVFSTR/api/IVFStorage"
    
    def __init__(self):
        """Initialize the service"""
        if HTTPX_AVAILABLE:
            # Increased timeout: 60 seconds total, 20 seconds for connection
            # ARC API can be slow, especially when fetching large datasets
            self._http_client = httpx.Client(
                timeout=httpx.Timeout(60.0, connect=20.0),
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )
        else:
            self._http_client = None

    def _create_http_client(self):
        """Create an HTTP client with ARC API-friendly timeout/connection settings."""
        return httpx.Client(
            timeout=httpx.Timeout(60.0, connect=20.0),
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )
    
    def get_ivf_storage(self) -> Dict[str, Any]:
        """
        Fetch IVF storage information from ARC IVF API
        
        The TokenId is automatically read from the ARC_API_TOKEN (or ARC_IVF_TOKEN_ID) environment variable.
        
        Returns:
            Dictionary containing storage list and status information
        
        Raises:
            Exception: If API call fails or returns unexpected response
        """
        # Get TokenId from environment variable (check ARC_API_TOKEN first, then ARC_IVF_TOKEN_ID)
        token_id = settings.ARC_API_TOKEN or settings.ARC_IVF_TOKEN_ID
        
        if not token_id:
            # Get the backend directory (go up from app/service/IVF/arc_ivf_service.py)
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
            env_file_path = os.path.join(backend_dir, ".env")
            raise Exception(
                f"ARC_API_TOKEN or ARC_IVF_TOKEN_ID is required but not found in your .env file.\n"
                f"Please add one of the following lines to your .env file (located at: {env_file_path}):\n"
                f"ARC_API_TOKEN=0x02000000005A028DC9C47C62167D809052123BC8A2D0E8B76D0DADC01CCCBB72A4A9429BB252AD6415FDC24E7F950C9CF3AD4DC9\n"
                f"OR\n"
                f"ARC_IVF_TOKEN_ID=0x02000000005A028DC9C47C62167D809052123BC8A2D0E8B76D0DADC01CCCBB72A4A9429BB252AD6415FDC24E7F950C9CF3AD4DC9\n"
                f"After adding it, restart your server."
            )
        if not HTTPX_AVAILABLE:
            raise Exception("httpx library not available. Cannot make external API calls.")
        
        if not self._http_client:
            # Increased timeout: 60 seconds total, 20 seconds for connection
            self._http_client = self._create_http_client()
        
        try:
            # Build API URL with TokenId query parameter
            url = f"{self.ARC_IVF_API_BASE_URL}/GetIVFStorage"
            params = {
                "TokenId": token_id
            }
            
            logger.info(f"Calling ARC IVF API: {url} with TokenId")
            max_retries = 3
            initial_delay = 0.5
            transient_http_statuses = {429, 500, 502, 503, 504}

            for attempt in range(max_retries + 1):
                try:
                    # Ask server to close connection after response; reduces stale keep-alive failures.
                    response = self._http_client.get(
                        url,
                        params=params,
                        headers={"Connection": "close"}
                    )

                    # Retry transient upstream errors.
                    if response.status_code in transient_http_statuses and attempt < max_retries:
                        delay = initial_delay * (2 ** attempt)
                        logger.warning(
                            f"ARC IVF API transient HTTP {response.status_code} on attempt {attempt + 1}/{max_retries + 1}. "
                            f"Retrying after {delay:.2f}s."
                        )
                        time.sleep(delay)
                        continue

                    # Check response status
                    if response.status_code == 200:
                        data = response.json()

                        # Check if API returned success or failure
                        status = data.get("status", "").upper()
                        error_code = data.get("errorCode")
                        storage_list = data.get("storageList", [])

                        if status == "SUCCESS":
                            logger.info(f"ARC IVF API call successful. Retrieved {len(storage_list)} storage items")
                            return {
                                "storageList": storage_list,
                                "status": "SUCCESS",
                                "errorCode": error_code
                            }
                        else:
                            # API returned failure status
                            logger.warning(f"ARC IVF API returned failure status: {status}, errorCode: {error_code}")
                            return {
                                "storageList": [],
                                "status": "FAILURE",
                                "errorCode": error_code or 412
                            }

                    # Non-transient HTTP error
                    logger.error(f"ARC IVF API returned HTTP {response.status_code}: {response.text}")
                    return {
                        "storageList": [],
                        "status": "FAILURE",
                        "errorCode": response.status_code
                    }
                except (httpx.ConnectTimeout, httpx.TimeoutException, httpx.RequestError) as request_err:
                    # Retry transport and timeout errors (including incomplete chunked read) with backoff.
                    if attempt < max_retries:
                        delay = initial_delay * (2 ** attempt)
                        logger.warning(
                            f"ARC IVF API transient request failure on attempt {attempt + 1}/{max_retries + 1}: {request_err}. "
                            f"Retrying after {delay:.2f}s."
                        )
                        try:
                            self._http_client.close()
                        except Exception:
                            pass
                        self._http_client = self._create_http_client()
                        time.sleep(delay)
                        continue
                    raise
        
        except httpx.ConnectTimeout as e:
            # Handle connection timeout specifically (more specific than TimeoutException)
            logger.error(f"ARC IVF API connection timeout after 20 seconds: {str(e)}")
            return {
                "storageList": [],
                "status": "FAILURE",
                "errorCode": 408,  # Request Timeout
                "errorMessage": f"ARC IVF API connection timed out after 20 seconds. Unable to connect to the server. Please check your network connection and try again."
            }
        except httpx.TimeoutException as e:
            # Handle general timeout (read timeout, etc.)
            logger.error(f"ARC IVF API timeout after 60 seconds: {str(e)}")
            return {
                "storageList": [],
                "status": "FAILURE",
                "errorCode": 408,  # Request Timeout
                "errorMessage": f"ARC IVF API request timed out after 60 seconds. The API may be slow or unavailable. Please try again later."
            }
        except httpx.RequestError as e:
            logger.error(f"ARC IVF API request error: {str(e)}")
            # Return failure response instead of raising exception
            return {
                "storageList": [],
                "status": "FAILURE",
                "errorCode": 500,
                "errorMessage": f"ARC IVF API request failed: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Unexpected error calling ARC IVF API: {str(e)}", exc_info=True)
            # Return failure response instead of raising exception
            return {
                "storageList": [],
                "status": "FAILURE",
                "errorCode": 500,
                "errorMessage": f"Failed to fetch IVF storage data: {str(e)}"
            }
    
    def _extract_tank_code_from_cryolock_number(self, cryolock_number: str) -> Optional[str]:
        return extract_tank_code_from_cryolock_number(cryolock_number)

    def _extract_canister_code_from_cryolock_number(self, cryolock_number: str) -> Optional[str]:
        return extract_canister_code_from_cryolock_number(cryolock_number)

    def _extract_location_from_cryolock_number(self, cryolock_number: str) -> Optional[str]:
        return extract_cane_code_from_cryolock_number(cryolock_number)

    def _extract_position_from_cryolock_number(self, cryolock_number: str) -> Optional[int]:
        return extract_position_from_cryolock_number(cryolock_number)
    
    def save_ivf_storage_to_db(
        self,
        db: Session,
        api_data: Dict[str, Any],
        created_by: Optional[str] = None,
        rollback_on_error: bool = True
    ) -> Dict[str, Any]:
        """
        Save ARC IVF storage data to database using simplified patient_crylock_info structure.
        
        This method:
        - Extracts components from cryolockNumber (e.g., "T10/C5/E1/3")
        - Creates/finds tank by tank_code + branch_id (unique per branch)
        - Saves all data to patient_crylock_info table
        - Each patient has their own branch
        
        Args:
            db: Database session
            api_data: Dictionary containing ARC IVF API response data
            created_by: Optional user identifier for audit trail
        
        Returns:
            Dictionary with saved entity IDs and status
        
        Raises:
            Exception: If data saving fails
        """
        try:
            # Extract data from API response
            his_number = api_data.get("hisNumber")
            crylock_number = api_data.get("cryolockNumber")  # Format: "T10/C5/E1/3"
            canister_number_str = api_data.get("canisterNumber")
            tank_id_str = api_data.get("tankID")  # ARC API tankID (e.g., "575")
            cane_id_str = api_data.get("caneID")  # ARC API caneID (e.g., "575")
            dateof_vitrification_str = api_data.get("dateofVitrification")
            site_name = api_data.get("siteName")
            
            if not his_number or not site_name:
                raise Exception("Missing required fields: hisNumber or siteName")
            
            if not crylock_number:
                raise Exception("Missing required field: cryolockNumber")

            encrypted_his_number = encrypt_sensitive_ivf_value(his_number)
            encrypted_crylock_number = encrypt_sensitive_ivf_value(crylock_number)
            
            # Extract components from cryolockNumber format: "T10/C5/E1/3"
            # Format breakdown: Tank Code / Canister Number / Cane Code / Position Number
            # - T10 → tank_code (Tank Code)
            # - C5 → canister_number (Canister Number)
            # - E1 → cane_code (Cane Code)
            # - 3 → position_number (Position Number)
            tank_code_from_crylock = self._extract_tank_code_from_cryolock_number(crylock_number)
            canister_code_from_crylock = self._extract_canister_code_from_cryolock_number(crylock_number)
            cane_code_from_crylock = self._extract_location_from_cryolock_number(crylock_number)  # This is the cane code
            position_number = self._extract_position_from_cryolock_number(crylock_number)
            
            if position_number is None:
                # Skip records without a valid numeric position in cryolockNumber
                return {
                    "status": "SKIPPED",
                    "message": f"Skipped record: cryolockNumber '{crylock_number}' does not have a numeric position",
                    "reason": "INVALID_CRYOLOCK_POSITION",
                    "crylock_number": crylock_number
                }
            
            # Use extracted values, fallback to API fields if not available
            tank_code_to_use = tank_code_from_crylock if tank_code_from_crylock else None
            canister_number_to_use = canister_code_from_crylock if canister_code_from_crylock else canister_number_str
            cane_code_to_use = cane_code_from_crylock if cane_code_from_crylock else None
            
            # Parse date of vitrification
            date_of_vitrification = None
            if dateof_vitrification_str:
                try:
                    # Try parsing date string (format: "2023-03-11")
                    date_of_vitrification = datetime.strptime(dateof_vitrification_str, "%Y-%m-%d").date()
                except ValueError:
                    logger.warning(f"Could not parse date: {dateof_vitrification_str}")
            
            # Find or create Hospital (assuming default IVF hospital)
            hospital = db.query(Hospital).filter(
                Hospital.hospital_type == "IVF"
            ).first()
            
            if not hospital:
                # Create default IVF hospital if it doesn't exist
                hospital = Hospital(
                    hospital_name="ARC Fertility Hospitals",
                    hospital_type="IVF",
                    created_by=created_by
                )
                db.add(hospital)
                db.flush()
                logger.info(f"Created new hospital: {hospital.hospital_id}")
            
            # Find or create Hospital Branch (based on siteName)
            # Use case-insensitive matching for branch_name to handle variations
            branch = None
            if site_name:
                site_name_clean = site_name.strip()
                branch = db.query(HospitalBranch).filter(
                    func.lower(HospitalBranch.branch_name) == func.lower(site_name_clean),
                    HospitalBranch.hospital_id == hospital.hospital_id
                ).first()
                
                if branch:
                    logger.debug(f"Found existing branch: {branch.branch_id} - {branch.branch_name} (matched siteName: {site_name_clean})")
                else:
                    # Log warning if branch not found - might indicate data inconsistency
                    existing_branches = db.query(HospitalBranch.branch_name).filter(
                        HospitalBranch.hospital_id == hospital.hospital_id
                    ).all()
                    existing_branch_names = [b[0] for b in existing_branches if b[0]]
                    logger.warning(
                        f"Branch not found for siteName '{site_name_clean}'. "
                        f"Existing branches: {existing_branch_names}. Creating new branch."
                    )
            
            if not branch:
                branch = HospitalBranch(
                    hospital_id=hospital.hospital_id,
                    branch_name=site_name.strip() if site_name else None,
                    created_by=created_by
                )
                db.add(branch)
                db.flush()
                logger.info(f"Created new branch: {branch.branch_id} - {branch.branch_name} (from ARC API siteName: {site_name})")
                ensure_branch_reservoir(
                    db,
                    branch_id=branch.branch_id,
                    hospital_id=hospital.hospital_id,
                    branch_name=branch.branch_name or f"Branch {branch.branch_id}",
                )
            
            # Find or create Tank by tank_code + branch_id (unique per branch)
            # Each branch can have T1, T2, etc. (e.g., Branch 1 (Tambaram) has T1, T2; Branch 5 has T1, T2, T3)
            tank = None
            if tank_code_to_use and branch:
                # Use retry logic for tank operations to handle deadlocks
                retries = 0
                max_retries = 3
                initial_delay = 0.1
                max_delay = 1.0
                backoff_factor = 2.0
                delay = initial_delay
                
                while retries <= max_retries:
                    try:
                        # Query with FOR UPDATE and consistent ordering to prevent deadlocks
                        # Ordering by tank_id ensures all processes lock rows in the same order
                        # This prevents circular wait conditions that cause deadlocks
                        tank = db.query(Tank).filter(
                            Tank.tank_code == tank_code_to_use,
                            Tank.branch_id == branch.branch_id
                        ).order_by(Tank.tank_id).with_for_update(nowait=False).first()
                        
                        if not tank:
                            # Create new tank with tank_code (unique per branch)
                            # Unique constraint will handle concurrent inserts gracefully
                            tank = Tank(
                                branch_id=branch.branch_id,
                                tank_code=tank_code_to_use,  # e.g., "T10", "T1", "T2"
                                tank_id_arc=tank_id_str,  # Store ARC API tankID for reference
                                is_active=True,
                                created_by=created_by
                            )
                            db.add(tank)
                            db.flush()
                            logger.info(f"Created new tank: {tank.tank_id} - tank_code: {tank_code_to_use} (branch: {branch.branch_name}, tankID: {tank_id_str})")
                        else:
                            # Update tank_id_arc if it's different or missing
                            if tank_id_str and tank.tank_id_arc != tank_id_str:
                                tank.tank_id_arc = tank_id_str
                                tank.updated_by = created_by
                                tank.updated_at = datetime.now(timezone.utc)
                                db.flush()
                                logger.debug(f"Updated tank {tank.tank_id} tank_id_arc to {tank_id_str}")
                        
                        break  # Success, exit retry loop
                    except OperationalError as e:
                        # Check if it's a deadlock error
                        if isinstance(e.orig, DeadlockDetected):
                            if retries < max_retries:
                                retries += 1
                                logger.warning(
                                    f"Deadlock detected while updating tank (tank_code={tank_code_to_use}, branch_id={branch.branch_id}). "
                                    f"Retrying ({retries}/{max_retries}) after {delay:.2f}s delay..."
                                )
                                db.rollback()  # Rollback the failed transaction
                                time.sleep(delay)
                                delay = min(delay * backoff_factor, max_delay)
                                continue
                            else:
                                logger.error(
                                    f"Deadlock detected while updating tank. Max retries ({max_retries}) exceeded."
                                )
                        # Re-raise if not a deadlock or max retries exceeded
                        raise
                    except Exception as e:
                        # Re-raise non-deadlock exceptions immediately
                        raise
            
            if not tank:
                raise Exception(f"Cannot create patient_crylock_info without a tank. tank_code: {tank_code_to_use}, branch: {branch.branch_name if branch else 'N/A'}")
            
            # Find or create PatientCrylockInfo record
            # Unique constraint on (his_number, crylock_number) ensures one record per patient per crylock
            patient_crylock = db.query(PatientCrylockInfo).filter(
                or_(
                    PatientCrylockInfo.his_number == encrypted_his_number,
                    PatientCrylockInfo.his_number == his_number
                ),
                or_(
                    PatientCrylockInfo.crylock_number == encrypted_crylock_number,
                    PatientCrylockInfo.crylock_number == crylock_number
                )
            ).first()
            
            if not patient_crylock:
                # Create new patient_crylock_info record
                patient_crylock = PatientCrylockInfo(
                    branch_id=branch.branch_id,  # Branch based on siteName
                    tank_id=tank.tank_id,  # Reference to tank
                    his_number=encrypted_his_number,  # Encrypted Patient HIS number
                    crylock_number=encrypted_crylock_number,  # Encrypted full crylock number
                    # Extracted components
                    tank_code=tank_code_to_use,  # Extracted from crylockNumber (e.g., "T10")
                    canister_number=canister_number_to_use,  # Extracted from crylockNumber (e.g., "C5")
                    cane_code=cane_code_to_use,  # Extracted from crylockNumber (e.g., "E1")
                    position_number=position_number,  # Extracted from crylockNumber (e.g., 3)
                    # ARC API IDs
                    tank_id_arc=tank_id_str,  # Tank ID from ARC API
                    cane_id_arc=cane_id_str,  # Cane ID from ARC API
                    # Crylock details
                    date_of_vitrification=date_of_vitrification,
                    crylock_color=None,  # Can be updated later
                    goblet_color=None,  # Can be updated later
                    in_transit=False,
                    embryo_transfer=False,
                    description=None,
                    created_by=created_by
                )
                db.add(patient_crylock)
                db.flush()
                logger.info(f"Created new patient_crylock_info: id={patient_crylock.id}, HIS={his_number}, crylock={crylock_number} (branch: {branch.branch_name})")
            else:
                # Update existing record if needed
                # IMPORTANT: Preserve user-managed fields (crylock_color, goblet_color, description, 
                # embryo_transfer, in_transit) - these should NEVER be overwritten by ARC integration
                
                # Store existing user-managed values to ensure they are preserved
                existing_crylock_color = patient_crylock.crylock_color
                existing_goblet_color = patient_crylock.goblet_color
                existing_description = patient_crylock.description
                existing_embryo_transfer = patient_crylock.embryo_transfer
                existing_in_transit = patient_crylock.in_transit
                
                updated = False
                # Encrypt legacy plaintext values on first sync/update.
                if patient_crylock.his_number != encrypted_his_number:
                    patient_crylock.his_number = encrypted_his_number
                    updated = True
                if patient_crylock.crylock_number != encrypted_crylock_number:
                    patient_crylock.crylock_number = encrypted_crylock_number
                    updated = True
                # Update branch_id if different (patient should belong to their branch)
                if patient_crylock.branch_id != branch.branch_id:
                    patient_crylock.branch_id = branch.branch_id
                    updated = True
                # Update tank_id if different
                if patient_crylock.tank_id != tank.tank_id:
                    patient_crylock.tank_id = tank.tank_id
                    updated = True
                # Update extracted components if different
                if tank_code_to_use and patient_crylock.tank_code != tank_code_to_use:
                    patient_crylock.tank_code = tank_code_to_use
                    updated = True
                if canister_number_to_use and patient_crylock.canister_number != canister_number_to_use:
                    patient_crylock.canister_number = canister_number_to_use
                    updated = True
                if cane_code_to_use and patient_crylock.cane_code != cane_code_to_use:
                    patient_crylock.cane_code = cane_code_to_use
                    updated = True
                if position_number and patient_crylock.position_number != position_number:
                    patient_crylock.position_number = position_number
                    updated = True
                # Update ARC IDs if different
                if tank_id_str and patient_crylock.tank_id_arc != tank_id_str:
                    patient_crylock.tank_id_arc = tank_id_str
                    updated = True
                if cane_id_str and patient_crylock.cane_id_arc != cane_id_str:
                    patient_crylock.cane_id_arc = cane_id_str
                    updated = True
                # Update date if different
                if date_of_vitrification and patient_crylock.date_of_vitrification != date_of_vitrification:
                    patient_crylock.date_of_vitrification = date_of_vitrification
                    updated = True
                
                # Explicitly preserve user-managed fields - ensure they are never overwritten by ARC integration
                # These fields should only be updated through user actions, not ARC integration
                patient_crylock.crylock_color = existing_crylock_color
                patient_crylock.goblet_color = existing_goblet_color
                patient_crylock.description = existing_description
                patient_crylock.embryo_transfer = existing_embryo_transfer
                patient_crylock.in_transit = existing_in_transit
                
                if updated:
                    patient_crylock.updated_by = created_by
                    patient_crylock.updated_at = datetime.now(timezone.utc)
                    db.flush()
                    logger.debug(f"Updated patient_crylock_info: id={patient_crylock.id}, HIS={his_number}")
            
            # Don't commit here - let the caller batch commits for better performance
            
            return {
                "status": "SUCCESS",
                "message": "ARC IVF data saved successfully",
                "patient_crylock_info_id": patient_crylock.id if patient_crylock else None,
                "tank_id": tank.tank_id if tank else None,
                "position_number": position_number
            }
            
        except Exception as e:
            if rollback_on_error:
                db.rollback()
            # Log detailed error information
            error_details = {
                "error": str(e),
                "error_type": type(e).__name__,
                "api_data": {
                    "hisNumber": api_data.get("hisNumber"),
                    "siteName": api_data.get("siteName"),
                    "cryolockNumber": api_data.get("cryolockNumber"),
                    "canisterNumber": api_data.get("canisterNumber"),
                    "tankID": api_data.get("tankID"),
                    "caneID": api_data.get("caneID"),
                    "dateofVitrification": api_data.get("dateofVitrification"),
                }
            }
            logger.error(f"Error saving ARC IVF data to database: {error_details}", exc_info=True)
            # Include more context in the exception message
            raise Exception(
                f"Failed to save ARC IVF data to database. "
                f"Error: {str(e)}. "
                f"HIS Number: {api_data.get('hisNumber')}, "
                f"Site: {api_data.get('siteName')}, "
                f"Cryolock: {api_data.get('cryolockNumber')}"
            ) from e
    
    def __del__(self):
        """Cleanup HTTP client on deletion"""
        if hasattr(self, '_http_client') and self._http_client:
            try:
                self._http_client.close()
            except:
                pass


def is_deadlock_error(exc: Exception) -> bool:
    """Detect PostgreSQL deadlock errors even when wrapped."""
    current = exc
    visited = 0
    while current is not None and visited < 5:
        if isinstance(current, OperationalError):
            original = getattr(current, "orig", None)
            pgcode = getattr(original, "pgcode", None)
            if pgcode == "40P01":
                return True
        if "deadlock detected" in str(current).lower():
            return True
        current = getattr(current, "__cause__", None) or getattr(current, "__context__", None)
        visited += 1
    return False


def try_acquire_arc_sync_lock(db: Session):
    """
    Acquire a PostgreSQL advisory lock on a dedicated connection.
    Returns the lock connection when acquired, otherwise None.
    """
    lock_conn = db.get_bind().connect()
    lock_acquired = lock_conn.execute(
        text("SELECT pg_try_advisory_lock(:lock_key)"),
        {"lock_key": ARC_IVF_STORAGE_SYNC_LOCK_KEY}
    ).scalar()
    if lock_acquired:
        return lock_conn
    lock_conn.close()
    return None


def release_arc_sync_lock(lock_conn) -> None:
    """Release the advisory lock and close the dedicated connection."""
    if not lock_conn:
        return
    try:
        lock_conn.execute(
            text("SELECT pg_advisory_unlock(:lock_key)"),
            {"lock_key": ARC_IVF_STORAGE_SYNC_LOCK_KEY}
        )
    except Exception as unlock_err:
        logger.warning(f"Failed to release ARC sync advisory lock cleanly: {unlock_err}")
    finally:
        lock_conn.close()


def sync_arc_ivf_storage(db: Session, created_by: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetch ARC IVF storage data and persist into database.

    Returns ARC API shaped response dict with optional errorMessage.
    """
    lock_conn = None
    try:
        service = ARCIVFService()
        result = service.get_ivf_storage()

        if result.get("status") == "SUCCESS":
            lock_conn = try_acquire_arc_sync_lock(db)
            if not lock_conn:
                logger.warning("Skipping ARC IVF sync because another sync is already running")
                return {
                    "storageList": [],
                    "status": "FAILURE",
                    "errorCode": 409,
                    "errorMessage": "ARC IVF sync already in progress. Please retry shortly."
                }

            storage_list = result.get("storageList", [])

            logger.info(f"Fetched {len(storage_list)} items from ARC API - saving ALL to database for all branches")

            unique_patients = set()
            unique_tanks = set()
            unique_canisters = set()
            unique_canes = set()
            unique_cryolocks = set()

            for storage_item in storage_list:
                if storage_item.get("hisNumber"):
                    unique_patients.add(storage_item.get("hisNumber"))
                if storage_item.get("tankID"):
                    unique_tanks.add(storage_item.get("tankID"))
                if storage_item.get("canisterNumber"):
                    unique_canisters.add(storage_item.get("canisterNumber"))
                if storage_item.get("caneID"):
                    unique_canes.add(storage_item.get("caneID"))
                if storage_item.get("cryolockNumber"):
                    unique_cryolocks.add(storage_item.get("cryolockNumber"))

            logger.info(
                f"Storage data statistics: "
                f"Total items: {len(storage_list)}, "
                f"Unique patients: {len(unique_patients)}, "
                f"Unique tanks: {len(unique_tanks)}, "
                f"Unique canisters: {len(unique_canisters)}, "
                f"Unique canes: {len(unique_canes)}, "
                f"Unique cryolocks: {len(unique_cryolocks)}"
            )

            saved_count = 0
            failed_count = 0
            skipped_count = 0
            failed_items = []
            max_deadlock_retries = 3
            initial_retry_delay = 0.1
            max_retry_delay = 1.0

            for idx, storage_item in enumerate(storage_list, 1):
                item_retries = 0
                retry_delay = initial_retry_delay
                item_saved = False
                while item_retries <= max_deadlock_retries and not item_saved:
                    try:
                        save_result = service.save_ivf_storage_to_db(
                            db=db,
                            api_data=storage_item,
                            created_by=created_by,
                            rollback_on_error=False
                        )
                        db.commit()
                        item_saved = True

                        if save_result.get("status") == "SKIPPED":
                            skipped_count += 1
                            logger.debug(
                                f"Skipped ARC IVF data item {idx}/{len(storage_list)} "
                                f"(HIS={storage_item.get('hisNumber')}, Site={storage_item.get('siteName')}, "
                                f"Cryolock={storage_item.get('cryolockNumber')}): {save_result.get('message')}"
                            )
                        else:
                            saved_count += 1

                        if idx % 100 == 0 or idx == len(storage_list):
                            logger.info(f"Progress: {idx}/{len(storage_list)} items processed ({saved_count} saved, {skipped_count} skipped, {failed_count} failed)")
                        elif idx % 10 == 0:
                            logger.debug(f"Processing item {idx}/{len(storage_list)}")
                    except Exception as save_error:
                        db.rollback()
                        if is_deadlock_error(save_error) and item_retries < max_deadlock_retries:
                            item_retries += 1
                            logger.warning(
                                f"Deadlock while saving ARC IVF item {idx}/{len(storage_list)} "
                                f"(HIS={storage_item.get('hisNumber')}, Site={storage_item.get('siteName')}, "
                                f"Cryolock={storage_item.get('cryolockNumber')}). "
                                f"Retrying {item_retries}/{max_deadlock_retries} after {retry_delay:.2f}s"
                            )
                            time.sleep(retry_delay)
                            retry_delay = min(retry_delay * 2, max_retry_delay)
                            continue

                        failed_count += 1
                        error_type = type(save_error).__name__
                        error_message = str(save_error)

                        failed_item = {
                            "index": idx,
                            "hisNumber": storage_item.get('hisNumber'),
                            "siteName": storage_item.get('siteName'),
                            "cryolockNumber": storage_item.get('cryolockNumber'),
                            "canisterNumber": storage_item.get('canisterNumber'),
                            "tankID": storage_item.get('tankID'),
                            "caneID": storage_item.get('caneID'),
                            "error_type": error_type,
                            "error_message": error_message
                        }
                        failed_items.append(failed_item)

                        logger.error(
                            f"Failed to save ARC IVF data item {idx}/{len(storage_list)} "
                            f"(HIS={storage_item.get('hisNumber')}, Site={storage_item.get('siteName')}, "
                            f"Cryolock={storage_item.get('cryolockNumber')}): "
                            f"[{error_type}] {error_message}",
                            exc_info=True
                        )
                        break

            logger.info(f"Database save summary: {saved_count} saved, {skipped_count} skipped, {failed_count} failed out of {len(storage_list)} total items")

            if failed_count > 0:
                error_types = {}
                for item in failed_items:
                    error_type = item['error_type']
                    if error_type not in error_types:
                        error_types[error_type] = []
                    error_types[error_type].append(item)

                logger.warning(f"Failure Analysis:")
                logger.warning(f"  Total failures: {failed_count}")
                for error_type, items in error_types.items():
                    logger.warning(f"  {error_type}: {len(items)} failures")
                    for item in items[:5]:
                        logger.warning(
                            f"    - Item {item['index']}: HIS={item['hisNumber']}, "
                            f"Site={item['siteName']}, Cryolock={item['cryolockNumber']}, "
                            f"Error: {item['error_message'][:100]}"
                        )
                    if len(items) > 5:
                        logger.warning(f"    ... and {len(items) - 5} more {error_type} errors")

                missing_position = [item for item in failed_items if 'position' in item['error_message'].lower() or 'extract' in item['error_message'].lower()]
                missing_fields = [item for item in failed_items if 'missing' in item['error_message'].lower() or 'required' in item['error_message'].lower()]
                constraint_violations = [item for item in failed_items if 'unique' in item['error_message'].lower() or 'constraint' in item['error_message'].lower()]

                if missing_position:
                    logger.warning(f"  Pattern: {len(missing_position)} failures due to position extraction issues")
                if missing_fields:
                    logger.warning(f"  Pattern: {len(missing_fields)} failures due to missing required fields")
                if constraint_violations:
                    logger.warning(f"  Pattern: {len(constraint_violations)} failures due to database constraint violations")

            branches_from_arc = set()
            for item in result.get("storageList", []):
                site_name = item.get("siteName")
                if site_name:
                    branches_from_arc.add(site_name.strip())

            logger.info(
                f"ARC Data Summary: "
                f"Total records from ARC: {len(result.get('storageList', []))}, "
                f"Total branches from ARC: {len(branches_from_arc)}, "
                f"Branches: {', '.join(sorted(branches_from_arc))}, "
                f"Saved to DB: {saved_count}, "
                f"Skipped: {skipped_count}, "
                f"Failed: {failed_count}"
            )

        return result
    finally:
        release_arc_sync_lock(lock_conn)
