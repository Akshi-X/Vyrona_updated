"""
Shared utility for reservoir management.
"""
import logging
from sqlalchemy.orm import Session

from app.models.IVF.reservoir_model import Reservoir

logger = logging.getLogger(__name__)


def ensure_branch_reservoir(
    db: Session,
    branch_id: int,
    hospital_id: int,
    branch_name: str,
) -> Reservoir:
    """
    Create a default reservoir for a branch if one doesn't exist yet.
    Returns the existing or newly created reservoir.
    Idempotent — safe to call multiple times.

    Caller is responsible for committing the session.
    """
    existing = db.query(Reservoir).filter(Reservoir.branch_id == branch_id).first()
    if existing:
        return existing

    reservoir = Reservoir(
        reservoir_name=f"{branch_name} Reservoir",
        branch_id=branch_id,
        hospital_id=hospital_id,
        created_by="system",
        updated_by="system",
    )
    db.add(reservoir)
    db.flush()  # get reservoir_id without committing
    logger.info(
        f"Auto-created reservoir '{reservoir.reservoir_name}' "
        f"(id={reservoir.reservoir_id}) for branch_id={branch_id}"
    )
    return reservoir
