"""
ARC IVF API Schemas
Pydantic models for ARC IVF Storage API request/response
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class ARCIVFStorageItem(BaseModel):
    """Individual storage item from ARC IVF Storage API"""
    his_number: Optional[str] = Field(None, description="Patient Hospital ID", alias="hisNumber")
    cryolock_number: Optional[str] = Field(None, description="Cryolock Number (Format: T10/C2/B14/1)", alias="cryolockNumber")
    canister_number: Optional[str] = Field(None, description="Canister Number", alias="canisterNumber")
    tank_id: Optional[str] = Field(None, description="Tank Unique ID", alias="tankID")
    cane_id: Optional[str] = Field(None, description="Cane Unique ID", alias="caneID")
    dateof_vitrification: Optional[str] = Field(None, description="Date of Vitrification (Date of OCR)", alias="dateofVitrification")
    site_name: Optional[str] = Field(None, description="Branch Name", alias="siteName")
    total_number_of_embryos: Optional[str] = Field(None, description="Total Number of Embryos as per Given Branch Name", alias="totalNumberofEmbryos")
    total_number_of_containers: Optional[str] = Field(None, description="Total Number of Cryolocks as per Given Branch Name", alias="totalNumberofContainers")
    
    class Config:
        populate_by_name = True


class ARCIVFStorageResponse(BaseModel):
    """Response model for ARC IVF Storage API"""
    storage_list: List[ARCIVFStorageItem] = Field(default_factory=list, description="List of storage items", alias="storageList")
    status: str = Field(..., description="Status of the API call (SUCCESS/FAILURE)")
    error_code: int = Field(..., description="API Call status code", alias="errorCode")
    error_message: Optional[str] = Field(None, description="Error message if API call failed", alias="errorMessage")
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "storageList": [
                    {
                        "hisNumber": "3222044212F",
                        "cryolockNumber": "T1/C1/A11/2",
                        "canisterNumber": "C1",
                        "tankID": "6216",
                        "caneID": "6216",
                        "dateofVitrification": "2023-03-11",
                        "siteName": "Tambaram",
                        "totalNumberofEmbryos": "640",
                        "totalNumberofContainers": "384"
                    }
                ],
                "status": "SUCCESS",
                "errorCode": 200
            }
        }
