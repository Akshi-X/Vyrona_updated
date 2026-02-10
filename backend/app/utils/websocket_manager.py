"""
WebSocket Connection Manager
Manages WebSocket connections for quality monitoring
"""
import logging
import uuid
from datetime import datetime
from typing import Dict, Optional

from fastapi import WebSocket

from app.models.IVF.tank_model import Tank
from app.models.patient_model import Patient

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for quality monitoring"""
    
    def __init__(self):
        self.active_connections: Dict[str, Dict] = {}  # {connection_id: {websocket, connected_at, client_info, patient_id, tank_id, tank_code, branch_id}}

    async def connect(self, websocket: WebSocket, connection_id: str = None) -> str:
        """Register WebSocket connection (connection should already be accepted)"""
        # Note: Connection should already be accepted before calling this
        if connection_id is None:
            connection_id = str(uuid.uuid4())
        
        self.active_connections[connection_id] = {
            "websocket": websocket,
            "connected_at": datetime.now().isoformat(),
            "client_info": {
                "host": websocket.client.host if websocket.client else "unknown",
                "port": websocket.client.port if websocket.client else "unknown"
            },
            "patient_id": None,  # Patient ID this connection is subscribed to (CGT)
            "tank_id": None,  # Tank ID this connection is subscribed to (IVF)
            "tank_code": None,  # Tank code this connection is subscribed to (IVF, e.g., "T1", "T2")
            "branch_id": None    # Branch ID for IVF users (for validation)
        }
        logger.info(f"WebSocket connection registered: {connection_id}")
        return connection_id

    def disconnect(self, connection_id: str):
        """Remove connection by connection ID"""
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]
            logger.info(f"WebSocket connection removed: {connection_id}")

    def disconnect_by_websocket(self, websocket: WebSocket) -> Optional[str]:
        """Remove connection by websocket object"""
        for conn_id, conn_data in list(self.active_connections.items()):
            if conn_data["websocket"] == websocket:
                del self.active_connections[conn_id]
                logger.info(f"WebSocket connection removed: {conn_id}")
                return conn_id
        return None

    def set_patient_subscription(self, connection_id: str, patient_id: str):
        """Set which patient this connection is subscribed to (CGT)"""
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["patient_id"] = patient_id
            logger.info(f"Connection {connection_id} subscribed to patient {patient_id}")

    def set_tank_subscription(self, connection_id: str, tank_id: int, tank_code: str = None):
        """Set which tank this connection is subscribed to (IVF) - tracks by tank_code (string, e.g., 'T1', 'T2')"""
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["tank_id"] = tank_id
            if tank_code is not None:
                # Store as string
                self.active_connections[connection_id]["tank_code"] = str(tank_code)
            logger.info(f"Connection {connection_id} subscribed to tank_id {tank_id} (tank_code: {tank_code})")
    

    async def broadcast(self, data: dict, db):
        """
        Broadcast data to connections subscribed to this patient (CGT) or tank (IVF).
        Handles both CGT (patient_id) and IVF (tank_id/tank_code/device_id) messages.
        
        For IVF messages, supports multiple identifiers:
        - tank_code: Direct tank code (e.g., "T1", "T2")
        - tank_id: Direct tank ID
        - device_id: Device ID that maps to tank via tive_device_id field
        """
        if not self.active_connections:
            return
        
        patient_id = data.get("patient_id")
        
        # Handle CGT messages (patient_id)
        if patient_id:
            # Get patient's pharma_id from database
            patient = db.query(Patient).filter(Patient.id == patient_id).first()
            if not patient:
                return  # Patient doesn't exist
            
            patient_pharma_id = patient.pharma_id
                
            disconnected = []
            for connection_id, conn_data in list(self.active_connections.items()):
                # Check if connection's pharma matches patient's pharma
                connection_pharma_id = conn_data.get("pharma_id")
                if connection_pharma_id != patient_pharma_id:
                    continue  # Skip connections from different pharma
                
                # Only send to connections subscribed to this patient
                subscribed_patient = conn_data.get("patient_id")
                if subscribed_patient == patient_id:
                    try:
                        await conn_data["websocket"].send_json(data)
                    except Exception as e:
                        logger.error(f"Error sending to client {connection_id}: {e}")
                        disconnected.append(connection_id)
            
            # Remove disconnected clients
            for conn_id in disconnected:
                self.disconnect(conn_id)
        
        # Handle IVF messages (tank_id, tank_code, or device_id)
        tank_code = data.get("tank_code")
        tank_id_from_data = data.get("tank_id")
        device_id = data.get("device_id")
        
        # Resolve to tank_id, tank_code, and tank_branch_id
        tank = None
        tank_branch_id = None
        
        # Priority: device_id > tank_code > tank_id
        if device_id and not tank_code and not tank_id_from_data:
            # Look up tank by device_id (tive_device_id field)
            tank = db.query(Tank).filter(Tank.tive_device_id == str(device_id)).first()
            if tank:
                tank_id_from_data = tank.tank_id
                tank_code = tank.tank_code
                tank_branch_id = tank.branch_id
                logger.debug(f"Resolved device_id {device_id} to tank_code {tank_code} (tank_id: {tank_id_from_data})")
            else:
                logger.warning(f"No tank found for device_id: {device_id}")
                return  # Tank not found for this device_id
        elif tank_code:
            # Look up tank by tank_code
            tank = db.query(Tank).filter(Tank.tank_code == str(tank_code)).first()
            if tank:
                tank_id_from_data = tank.tank_id
                tank_branch_id = tank.branch_id
            else:
                return  # Tank code doesn't exist
        elif tank_id_from_data:
            # Get tank info by tank_id
            tank = db.query(Tank).filter(Tank.tank_id == tank_id_from_data).first()
            if not tank:
                return  # Tank doesn't exist
            tank_branch_id = tank.branch_id
            if not tank_code:
                tank_code = tank.tank_code
        else:
            return  # No valid identifier provided (no device_id, tank_code, or tank_id)
        
        # At this point, we have tank_id_from_data, tank_code, and tank_branch_id resolved
        disconnected = []
        for connection_id, conn_data in list(self.active_connections.items()):
            # Check if connection is subscribed to this tank (by tank_code - primary identifier)
            subscribed_tank_code = conn_data.get("tank_code")
            subscribed_tank_id = conn_data.get("tank_id")
            
            # Match by tank_code (primary identifier for IVF tracking)
            matches = False
            if subscribed_tank_code is not None and tank_code is not None:
                # Compare as strings
                if str(subscribed_tank_code) == str(tank_code):
                    matches = True
            # Fallback: match by tank_id if tank_code not available
            elif subscribed_tank_id is not None and tank_id_from_data is not None:
                if subscribed_tank_id == tank_id_from_data:
                    matches = True
            
            if not matches:
                continue
            
            # Validate branch access for IVF users
            # Admin: can see all branches (branch_id is None)
            # User/Manager: can only see their branch
            connection_branch_id = conn_data.get("branch_id")
            user_role = conn_data.get("role")
            
            # Admin can see all branches
            if user_role == "Admin":
                pass  # Allow access
            # User/Manager must match branch
            elif connection_branch_id is not None:
                if connection_branch_id != tank_branch_id:
                    continue  # Skip connections from different branches
            # If no branch_id set, allow (might be CGT user or legacy connection)
            
            try:
                await conn_data["websocket"].send_json(data)
            except Exception as e:
                logger.error(f"Error sending IVF data to client {connection_id}: {e}")
                disconnected.append(connection_id)
        
        # Remove disconnected clients
        for conn_id in disconnected:
            self.disconnect(conn_id)

    def get_connections_info(self):
        """Get information about all active connections"""
        return {
            "count": len(self.active_connections),
            "connections": [
                {
                    "id": conn_id,
                    "connected_at": conn_data["connected_at"],
                    "client_info": conn_data["client_info"],
                    "patient_id": conn_data.get("patient_id", None),
                    "tank_id": conn_data.get("tank_id", None),
                    "tank_code": conn_data.get("tank_code", None)
                }
                for conn_id, conn_data in self.active_connections.items()
            ]
        }

