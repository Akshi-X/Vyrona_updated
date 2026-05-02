from typing import List, Optional, Union

from pydantic import BaseModel, Field


class HMSCryolockUpdate(BaseModel):
    """Single cryolock update pushed by an external HMS."""

    hisNumber: str = Field(..., min_length=1, description="Patient MRN / HIS number")
    siteName: str = Field(..., min_length=1, description="Branch / site name")
    cryolockNumber: str = Field(
        ...,
        min_length=1,
        description="Format Tank/Canister/Cane/Position, e.g. 'T10/C5/E1/3'",
    )
    canisterNumber: Optional[str] = Field(None, description="Fallback if cryolockNumber lacks it")
    tankID: Optional[str] = Field(None, description="HMS-internal tank ID")
    caneID: Optional[str] = Field(None, description="HMS-internal cane ID")
    dateofVitrification: Optional[str] = Field(
        None, description="Vitrification date in YYYY-MM-DD format"
    )


HMSCryolockPayload = Union[HMSCryolockUpdate, List[HMSCryolockUpdate]]


class HMSCryolockItemResult(BaseModel):
    status: str  # "success" | "skipped" | "failed"
    operation: Optional[str] = None  # "create" | "update" | "noop"
    patient_crylock_id: Optional[int] = None
    tank_id: Optional[int] = None
    branch_id: Optional[int] = None
    reason: Optional[str] = None  # populated when status != "success"


class HMSCryolockUpdateResponse(BaseModel):
    accepted: int
    created: int
    updated: int
    noop: int
    skipped: int
    failed: int
    results: List[HMSCryolockItemResult]
