"""
ARC IVF External API Service
Handles integration with ARC IVF Storage API
"""
import logging
from typing import Dict, Optional, Any
from datetime import datetime, date, timezone
from sqlalchemy.orm import Session
from app.config.config import settings

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
            self._http_client = httpx.Client(
                timeout=httpx.Timeout(30.0, connect=10.0),
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
            import os
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
            self._http_client = httpx.Client(
                timeout=httpx.Timeout(30.0, connect=10.0),
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
        
        except httpx.TimeoutException as e:
            logger.error(f"ARC IVF API timeout: {str(e)}")
            raise Exception(f"ARC IVF API request timed out: {str(e)}")
        except httpx.RequestError as e:
            logger.error(f"ARC IVF API request error: {str(e)}")
            raise Exception(f"ARC IVF API request failed: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error calling ARC IVF API: {str(e)}", exc_info=True)
            raise Exception(f"Failed to fetch IVF storage data: {str(e)}")
    
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
        Save ARC IVF storage data to database using normalized structure.
        
        This method now uses the same normalized structure as Excel import:
        - Extracts position_number from cryolockNumber (e.g., "T1/C1/A11/2" -> position = 2)
        - Uses position_number for cryolock lookup instead of combined string
        - Links patients to branches
        - Does not store derived fields (total_number_of_embryos, total_number_of_containers)
        
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
            # Import models here to avoid circular imports
            from ...models.IVF.hospital_model import Hospital
            from ...models.IVF.hospital_branch_model import HospitalBranch
            from ...models.IVF.tank_model import Tank
            from ...models.IVF.canister_model import Canister
            from ...models.IVF.cane_model import Cane
            from ...models.IVF.cryolock_model import Cryolock
            from ...models.IVF.patient_model import IVFPatient
            from ...models.IVF.embryo_model import Embryo
            
            # Extract data from API response
            his_number = api_data.get("hisNumber")
            cryolock_number = api_data.get("cryolockNumber")  # Format: "T1/C1/A11/2"
            canister_number_str = api_data.get("canisterNumber")
            tank_id_str = api_data.get("tankID")  # Legacy field - may be numeric like "1428"
            cane_id_str = api_data.get("caneID")
            dateof_vitrification_str = api_data.get("dateofVitrification")
            site_name = api_data.get("siteName")
            
            if not his_number or not site_name:
                raise Exception("Missing required fields: hisNumber or siteName")
            
            # Extract components from cryolockNumber format: "T10/C2/B14/1"
            # Format breakdown: Tank Number / Canister Number / Location / Cryolock Serial Number
            # - T10 → tank_code (Tank Number)
            # - C2 → canister_number (Canister Number)
            # - B14 → cane_code (Location - cane identifier/location within canister)
            # - 1 → position_number (Cryolock Serial Number)
            tank_code_from_cryolock = self._extract_tank_code_from_cryolock_number(cryolock_number)
            canister_code_from_cryolock = self._extract_canister_code_from_cryolock_number(cryolock_number)
            location_from_cryolock = self._extract_location_from_cryolock_number(cryolock_number)  # This is the cane identifier
            position_number = self._extract_position_from_cryolock_number(cryolock_number)
            
            if position_number is None:
                # Skip records without a valid numeric position in cryolockNumber
                return {
                    "status": "SKIPPED",
                    "message": f"Skipped record: cryolockNumber '{cryolock_number}' does not have a numeric position",
                    "reason": "INVALID_CRYOLOCK_POSITION",
                    "cryolock_number": cryolock_number
                }
            
            # Use tank_code from cryolockNumber if available, otherwise fall back to tankID
            # Priority: cryolockNumber format (T10) > tankID field (1428)
            tank_code_to_use = tank_code_from_cryolock if tank_code_from_cryolock else tank_id_str
            
            # Use canister_code from cryolockNumber if available, otherwise fall back to canisterNumber field
            # Priority: cryolockNumber format (C2) > canisterNumber field
            canister_code_to_use = canister_code_from_cryolock if canister_code_from_cryolock else canister_number_str
            
            # Use location from cryolockNumber as cane_code (Location = cane identifier)
            # Priority: cryolockNumber format (B14, A11) > caneID field
            # The Location segment represents the cane identifier within the canister
            cane_code_to_use = location_from_cryolock if location_from_cryolock else cane_id_str
            
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
            
            # Find or create Hospital Branch (no derived fields stored)
            branch = db.query(HospitalBranch).filter(
                HospitalBranch.branch_name == site_name,
                HospitalBranch.hospital_id == hospital.hospital_id
            ).first()
            
            if not branch:
                branch = HospitalBranch(
                    hospital_id=hospital.hospital_id,
                    branch_name=site_name,
                    created_by=created_by
                )
                db.add(branch)
                db.flush()
                logger.info(f"Created new branch: {branch.branch_id} - {branch.branch_name}")
            
            # Find or create Tank using tank_code from cryolockNumber (e.g., "T1")
            tank = None
            if tank_code_to_use:
                # Find tank by tank_code and branch_id (tanks belong to branches)
                tank = db.query(Tank).filter(
                    Tank.tank_code == tank_code_to_use,
                    Tank.branch_id == branch.branch_id
                ).first()
                
                if not tank:
                    # Create new tank with code from cryolockNumber format
                    tank = Tank(
                        branch_id=branch.branch_id,
                        tank_code=tank_code_to_use,
                        is_active=True,
                        created_by=created_by
                    )
                    db.add(tank)
                    db.flush()
                    logger.info(f"Created new tank: {tank.tank_id} - {tank.tank_code} (from cryolockNumber: {cryolock_number})")
            
            # Find or create Canister using canister_code from cryolockNumber (e.g., "C1")
            canister = None
            if canister_code_to_use and tank:
                # Find canister by canister_number and tank_id (canisters belong to tanks)
                canister = db.query(Canister).filter(
                    Canister.canister_number == canister_code_to_use,
                    Canister.tank_id == tank.tank_id
                ).first()
                
                if not canister:
                    # Create new canister with code from cryolockNumber format
                    canister = Canister(
                        tank_id=tank.tank_id,
                        canister_number=canister_code_to_use,
                        is_active=True,
                        created_by=created_by
                    )
                    db.add(canister)
                    db.flush()
                    logger.info(f"Created new canister: {canister.canister_id} - {canister.canister_number} (from cryolockNumber: {cryolock_number})")
            
            # Find or create Cane using location from cryolockNumber (e.g., "B14", "A11")
            # Location segment represents the cane identifier/location within the canister
            cane = None
            if cane_code_to_use and canister:
                # Find cane by cane_code (location identifier) and canister_id (canes belong to canisters)
                cane = db.query(Cane).filter(
                    Cane.cane_code == cane_code_to_use,
                    Cane.canister_id == canister.canister_id
                ).first()
                
                if not cane:
                    # Create new cane with location identifier from cryolockNumber format
                    # Location (B14, A11) is stored as cane_code
                    cane = Cane(
                        canister_id=canister.canister_id,
                        cane_code=cane_code_to_use,  # Location identifier from ARC format
                        is_active=True,
                        created_by=created_by
                    )
                    db.add(cane)
                    db.flush()
                    logger.info(f"Created new cane: {cane.cane_id} - {cane.cane_code} (Location from cryolockNumber: {cryolock_number})")
            
            # Find or create Cryolock using normalized structure (cane_id + position_number)
            cryolock = None
            if cane and position_number is not None:
                # Use normalized lookup: cane_id + position_number (unique constraint)
                cryolock = db.query(Cryolock).filter(
                    Cryolock.cane_id == cane.cane_id,
                    Cryolock.position_number == position_number
                ).first()
                
                if not cryolock:
                    # Create new cryolock with position_number and date_of_vitrification
                    cryolock = Cryolock(
                        cane_id=cane.cane_id,
                        position_number=position_number,
                        cryolock_number=cryolock_number,  # Store original string for reference
                        date_of_vitrification=date_of_vitrification,  # Store date at cryolock level
                        created_by=created_by
                    )
                    db.add(cryolock)
                    db.flush()
                    logger.info(f"Created new cryolock: {cryolock.cryolock_id} - position {position_number} in cane {cane.cane_id}")
                else:
                    # Update cryolock_number or date_of_vitrification if changed
                    updated = False
                    if cryolock.cryolock_number != cryolock_number:
                        cryolock.cryolock_number = cryolock_number
                        updated = True
                    if date_of_vitrification and cryolock.date_of_vitrification != date_of_vitrification:
                        cryolock.date_of_vitrification = date_of_vitrification
                        updated = True
                    
                    if updated:
                        cryolock.updated_by = created_by
                        cryolock.updated_at = datetime.now(timezone.utc)
                        db.flush()
                        logger.debug(f"Updated cryolock {cryolock.cryolock_id}")
            
            # Find or create Patient (with branch_id link)
            patient = db.query(IVFPatient).filter(
                IVFPatient.his_number == his_number
            ).first()
            
            if not patient:
                patient = IVFPatient(
                    his_number=his_number,
                    branch_id=branch.branch_id,  # Link patient to branch
                    created_by=created_by
                )
                db.add(patient)
                db.flush()
                logger.info(f"Created new patient: {patient.patient_id} - {patient.his_number}")
            else:
                # Update branch_id if it's different
                if patient.branch_id != branch.branch_id:
                    patient.branch_id = branch.branch_id
                    patient.updated_by = created_by
                    patient.updated_at = datetime.now(timezone.utc)
                    db.flush()
                    logger.debug(f"Updated patient {patient.patient_id} branch_id to {branch.branch_id}")
            
            # Create or update Embryo (one per cryolock - validation)
            embryo = None
            if cryolock and patient:
                # Check if embryo already exists for this cryolock (one embryo per cryolock)
                embryo = db.query(Embryo).filter(
                    Embryo.cryolock_id == cryolock.cryolock_id,
                    Embryo.is_active == True
                ).first()
                
                if not embryo:
                    # Create new embryo
                    # Note: date_of_vitrification is now stored at cryolock level, not embryo level
                    embryo = Embryo(
                        patient_id=patient.patient_id,
                        cryolock_id=cryolock.cryolock_id,
                        is_active=True,
                        created_by=created_by
                    )
                    db.add(embryo)
                    db.flush()
                    logger.info(f"Created new embryo: {embryo.embryo_id} in cryolock {cryolock.cryolock_id}")
                else:
                    # Update existing embryo if patient changed
                    # Note: date_of_vitrification is now managed at cryolock level
                    updated = False
                    if embryo.patient_id != patient.patient_id:
                        embryo.patient_id = patient.patient_id
                        updated = True
                    
                    if updated:
                        embryo.updated_by = created_by
                        embryo.updated_at = datetime.now(timezone.utc)
                        db.flush()
                        logger.info(f"Updated embryo: {embryo.embryo_id}")
            
            # Don't commit here - let the caller batch commits for better performance
            
            return {
                "status": "SUCCESS",
                "message": "ARC IVF data saved successfully",
                "patient_id": patient.patient_id if patient else None,
                "tank_id": tank.tank_id if tank else None,
                "canister_id": canister.canister_id if canister else None,
                "cane_id": cane.cane_id if cane else None,
                "cryolock_id": cryolock.cryolock_id if cryolock else None,
                "embryo_id": embryo.embryo_id if embryo else None,
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
