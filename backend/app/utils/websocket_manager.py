"""
WebSocket Connection Manager
Manages WebSocket connections for quality monitoring
"""
import logging
import uuid
from datetime import datetime
from typing import Dict, Optional

from fastapi import WebSocket

from app.models.IVF.canister_model import Canister
from app.models.IVF.tank_model import Tank
from app.models.patient_model import Patient

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for quality monitoring"""
    
    def __init__(self):
        self.active_connections: Dict[str, Dict] = {}  # {connection_id: {websocket, connected_at, client_info, patient_id, canister_id, branch_id}}

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
            "canister_id": None,  # Canister ID this connection is subscribed to (IVF)
            "canister_number": None,  # Canister number this connection is subscribed to (IVF)
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

    def set_canister_subscription(self, connection_id: str, canister_id: int, canister_number: str = None):
        """Set which canister this connection is subscribed to (IVF) - tracks by canister_number (string)"""
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["canister_id"] = canister_id
            if canister_number is not None:
                # Store as string (database column is VARCHAR)
                self.active_connections[connection_id]["canister_number"] = str(canister_number)
            logger.info(f"Connection {connection_id} subscribed to canister_id {canister_id} (canister_number: {canister_number})")

    async def broadcast(self, data: dict, db):
        """
        Broadcast data to connections subscribed to this patient (CGT) or canister (IVF).
        Handles both CGT (patient_id) and IVF (canister_id) messages.
        """
        if not self.active_connections:
            return
        
        patient_id = data.get("patient_id")
        canister_id = data.get("canister_id")
        
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
        
        # Handle IVF messages (canister_id or canister_number)
        canister_number = data.get("canister_number")
        if canister_id or canister_number:
            # For IVF, validate canister belongs to user's branch
            # Get canister's branch_id from database
            # If only canister_number is provided, look up canister_id
            if canister_number and not canister_id:
                # Convert to string (database column is VARCHAR)
                canister_number_str = str(canister_number)
                canister = db.query(Canister).filter(Canister.canister_number == canister_number_str).first()
                if canister:
                    canister_id = canister.canister_id
                else:
                    return  # Canister doesn't exist
            elif canister_id:
                canister = db.query(Canister).filter(Canister.canister_id == canister_id).first()
            else:
                return  # Neither canister_id nor canister_number provided
            
            if not canister:
                return  # Canister doesn't exist
            
            # Get canister's branch_id through tank
            tank = db.query(Tank).filter(Tank.tank_id == canister.tank_id).first()
            if not tank:
                return  # Tank doesn't exist
            
            canister_branch_id = tank.branch_id
            
            disconnected = []
            for connection_id, conn_data in list(self.active_connections.items()):
                # Check if connection is subscribed to this canister (by canister_number - primary identifier)
                subscribed_canister_number = conn_data.get("canister_number")
                
                # Match by canister_number (primary identifier for IVF tracking)
                matches = False
                if subscribed_canister_number is not None and canister_number is not None:
                    # Compare as strings (database stores canister_number as VARCHAR)
                    if str(subscribed_canister_number) == str(canister_number):
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
                    if connection_branch_id != canister_branch_id:
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
                    "canister_id": conn_data.get("canister_id", None),
                    "canister_number": conn_data.get("canister_number", None)
                }
                for conn_id, conn_data in self.active_connections.items()
            ]
        }

