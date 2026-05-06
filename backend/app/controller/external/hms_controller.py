"""External HMS integration endpoint.

POST /api/external/hms/patient-cryolock — accepts a single record or a list.
Authenticated by the standard TokenValidationMiddleware + RBAC stack
(ADMIN_ONLY_ENDPOINTS). The caller's hospital_id (from the admin's JWT) defines
the scope for branch/tank lookups.
"""

import logging
from typing import List, Union

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.constants.enums import UserRole
from app.exceptions import AuthenticationRequiredException
from app.schemas.external.hms_schema import (
    HMSCryolockItemResult,
    HMSCryolockUpdate,
    HMSCryolockUpdateResponse,
)
from app.service.external.hms_integration_service import HMSIntegrationService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/external/hms",
    tags=["External HMS Integration"],
)


@router.post("/patient-cryolock", response_model=HMSCryolockUpdateResponse)
def push_patient_cryolock_update(
    payload: Union[HMSCryolockUpdate, List[HMSCryolockUpdate]],
    request: Request,
    db: Session = Depends(get_db),
):
    if not hasattr(request.state, "current_user"):
        raise AuthenticationRequiredException()
    user = request.state.current_user
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin role required")

    hospital_id = getattr(request.state, "hospital_id", None)
    if hospital_id is None:
        raise HTTPException(
            status_code=400,
            detail="Caller token has no hospital_id; cannot scope HMS update",
        )

    items: List[HMSCryolockUpdate] = (
        [payload] if isinstance(payload, HMSCryolockUpdate) else list(payload)
    )
    if not items:
        raise HTTPException(status_code=400, detail="Empty payload")

    service = HMSIntegrationService(db)
    results: List[HMSCryolockItemResult] = []
    counters = {"created": 0, "updated": 0, "noop": 0, "skipped": 0, "failed": 0}

    for item in items:
        outcome = service.apply_cryolock_update(item, hospital_id, user)
        result = HMSCryolockItemResult(
            status=outcome["status"],
            operation=outcome.get("operation"),
            patient_crylock_id=outcome.get("patient_crylock_id"),
            tank_id=outcome.get("tank_id"),
            branch_id=outcome.get("branch_id"),
            reason=outcome.get("reason"),
        )
        results.append(result)

        if result.status == "success":
            op = result.operation or "noop"
            counters[op] = counters.get(op, 0) + 1
        elif result.status == "skipped":
            counters["skipped"] += 1
        else:
            counters["failed"] += 1

    return HMSCryolockUpdateResponse(
        accepted=len(items),
        created=counters["created"],
        updated=counters["updated"],
        noop=counters["noop"],
        skipped=counters["skipped"],
        failed=counters["failed"],
        results=results,
    )
