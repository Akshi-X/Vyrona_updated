from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user_pharma_id
from app.service.control_tower_service import ControlTowerService

router = APIRouter(prefix="/control-tower", tags=["control-tower"])


@router.get("/active-routes", response_model=Dict[str, Any])
def get_active_routes(
    pharma_id: Optional[int] = Depends(get_current_user_pharma_id),
    db: Session = Depends(get_db)
):
    """
    Get detailed list of active routes (shipments currently in TRANSPORTATION stage) and include real-time metrics.
    
    Response:
        {
          "routes": [
             { "route": "A → B", "status": "Safe", "date": "YYYY-MM-DD", "company": "...", "transit_days": 3, "carrier": "...", "updated_at": "..." },
             ...
          ],
          "metrics": {
             "active_routes": 10,
             "avg_transit_days": 2.5,
             "safe_routes": 7,
             "delayed_routes": 2,
             "risky_routes": 1,
             "last_updated": "..."
          }
        }
    """
    try:
        service = ControlTowerService(db)
        routes = service.get_active_routes(pharma_id)
        metrics = service.get_real_time_metrics(pharma_id)
        return {"routes": routes, "metrics": metrics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting active routes: {str(e)}")

