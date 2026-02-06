"""
ARC IVF External API Service
Handles integration with ARC IVF Storage API
"""
import logging
import os
from typing import Dict, Optional, Any
from datetime import datetime, date, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.config.config import settings
from ...models.IVF.hospital_model import Hospital
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.tank_model import Tank
from ...models.IVF.patient_crylock_info_model import PatientCrylockInfo

logger = logging.getLogger(__name__)

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False
    logger.warning("httpx not available. ARC IVF API calls will fail.")


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
            self._http_client = httpx.Client(
                timeout=httpx.Timeout(60.0, connect=20.0),
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )
        
        try:
            # Build API URL with TokenId query parameter
            url = f"{self.ARC_IVF_API_BASE_URL}/GetIVFStorage"
            params = {
                "TokenId": token_id
            }
            
            logger.info(f"Calling ARC IVF API: {url} with TokenId")
            
            # Make GET request
            response = self._http_client.get(url, params=params)
            
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
            else:
                # HTTP error
                logger.error(f"ARC IVF API returned HTTP {response.status_code}: {response.text}")
                return {
                    "storageList": [],
                    "status": "FAILURE",
                    "errorCode": response.status_code
                }
        
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
        """
        Extract tank code from ARC API cryolock number format.
        
        ARC API format: "T10/C2/B14/1" where:
        - T10 = Tank Number (first segment)
        - C2 = Canister Number
        - B14 = Location (cane identifier)
        - 1 = Cryolock Serial Number
        
        Args:
            cryolock_number: Cryolock number string from ARC API (e.g., "T10/C2/B14/1")
        
        Returns:
            Tank code (string) or None if cannot be extracted
        """
        if not cryolock_number:
            return None
        
        try:
            # Remove trailing slashes and split by '/'
            cleaned = cryolock_number.rstrip('/')
            parts = cleaned.split('/')
            
            if len(parts) > 0:
                tank_code = parts[0].strip()
                return tank_code if tank_code else None
        except (ValueError, AttributeError, Exception) as e:
            logger.warning(f"Could not extract tank code from cryolock_number: {cryolock_number}. Error: {e}")
        
        return None
    
    def _extract_canister_code_from_cryolock_number(self, cryolock_number: str) -> Optional[str]:
        """
        Extract canister code from ARC API cryolock number format.
        
        ARC API format: "T10/C2/B14/1" where:
        - T10 = Tank Number
        - C2 = Canister Number (second segment)
        - B14 = Location (cane identifier)
        - 1 = Cryolock Serial Number
        
        Args:
            cryolock_number: Cryolock number string from ARC API (e.g., "T10/C2/B14/1")
        
        Returns:
            Canister code (string) or None if cannot be extracted
        """
        if not cryolock_number:
            return None
        
        try:
            # Remove trailing slashes and split by '/'
            cleaned = cryolock_number.rstrip('/')
            parts = cleaned.split('/')
            
            if len(parts) > 1:
                canister_code = parts[1].strip()
                return canister_code if canister_code else None
        except (ValueError, AttributeError, Exception) as e:
            logger.warning(f"Could not extract canister code from cryolock_number: {cryolock_number}. Error: {e}")
        
        return None
    
    def _extract_location_from_cryolock_number(self, cryolock_number: str) -> Optional[str]:
        """
        Extract location (cane identifier) from ARC API cryolock number format.
        
        ARC API format: "T10/C2/B14/1" where:
        - T10 = Tank Number
        - C2 = Canister Number  
        - B14 = Location (cane identifier/location within canister)
        - 1 = Cryolock Serial Number
        
        The Location (B14, A11, etc.) represents the cane identifier and should be stored as cane_code.
        
        Args:
            cryolock_number: Cryolock number string from ARC API (e.g., "T10/C2/B14/1")
        
        Returns:
            Location/cane code (string) or None if cannot be extracted
        """
        if not cryolock_number:
            return None
        
        try:
            # Remove trailing slashes and split by '/'
            cleaned = cryolock_number.rstrip('/')
            parts = cleaned.split('/')
            
            # Third segment is Location (cane identifier)
            if len(parts) > 2:
                location = parts[2].strip()
                return location if location else None
        except (ValueError, AttributeError, Exception) as e:
            logger.warning(f"Could not extract location from cryolock_number: {cryolock_number}. Error: {e}")
        
        return None
    
    def _extract_position_from_cryolock_number(self, cryolock_number: str) -> Optional[int]:
        """
        Extract position number (Cryolock Serial Number) from ARC API cryolock number format.
        
        ARC API format: "T10/C2/B14/1" where:
        - T10 = Tank Number
        - C2 = Canister Number
        - B14 = Location (cane identifier)
        - 1 = Cryolock Serial Number (last segment, numeric)
        
        If the last segment is not a pure numeric value, return None to skip the record.
        
        Args:
            cryolock_number: Cryolock number string from ARC API (e.g., "T10/C2/B14/1")
        
        Returns:
            Position number/Cryolock Serial Number (integer) or None if cannot be extracted (will skip record)
        """
        if not cryolock_number:
            return None
        
        try:
            # Remove trailing slashes and split by '/'
            cleaned = cryolock_number.rstrip('/')
            parts = cleaned.split('/')
            
            if len(parts) > 0:
                last_part = parts[-1].strip()
                
                # Only accept pure numeric values (e.g., "2", "15", "8")
                # Reject alphanumeric values (e.g., "I3", "D15", "A8")
                try:
                    return int(last_part)
                except ValueError:
                    # Last segment is not numeric, skip this record
                    logger.warning(
                        f"Skipping record: cryolockNumber '{cryolock_number}' does not have a numeric position. "
                        f"Last segment '{last_part}' is not numeric."
                    )
                    return None
        except (ValueError, AttributeError, Exception) as e:
            logger.warning(f"Could not extract position from cryolock_number: {cryolock_number}. Error: {e}")
        
        return None
    
    def save_ivf_storage_to_db(
        self,
        db: Session,
        api_data: Dict[str, Any],
        created_by: Optional[str] = None
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
            
            # Find or create Tank by tank_code + branch_id (unique per branch)
            # Each branch can have T1, T2, etc. (e.g., Branch 1 (Tambaram) has T1, T2; Branch 5 has T1, T2, T3)
            tank = None
            if tank_code_to_use and branch:
                # Find tank by tank_code and branch_id (unique constraint ensures one tank per code per branch)
                tank = db.query(Tank).filter(
                    Tank.tank_code == tank_code_to_use,
                    Tank.branch_id == branch.branch_id
                ).first()
                
                if not tank:
                    # Create new tank with tank_code (unique per branch)
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
            
            if not tank:
                raise Exception(f"Cannot create patient_crylock_info without a tank. tank_code: {tank_code_to_use}, branch: {branch.branch_name if branch else 'N/A'}")
            
            # Find or create PatientCrylockInfo record
            # Unique constraint on (his_number, crylock_number) ensures one record per patient per crylock
            patient_crylock = db.query(PatientCrylockInfo).filter(
                PatientCrylockInfo.his_number == his_number,
                PatientCrylockInfo.crylock_number == crylock_number
            ).first()
            
            if not patient_crylock:
                # Create new patient_crylock_info record
                patient_crylock = PatientCrylockInfo(
                    branch_id=branch.branch_id,  # Branch based on siteName
                    tank_id=tank.tank_id,  # Reference to tank
                    his_number=his_number,  # Patient HIS number
                    crylock_number=crylock_number,  # Full crylock number (e.g., "T10/C5/E1/3")
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
                updated = False
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
            )
    
    def __del__(self):
        """Cleanup HTTP client on deletion"""
        if hasattr(self, '_http_client') and self._http_client:
            try:
                self._http_client.close()
            except:
                pass
