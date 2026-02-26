"""
WebSocket Connection Manager for Chat
Manages WebSocket connections for real-time chat messaging
"""
from fastapi import WebSocket
from typing import Dict, Optional, Set
import uuid
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class ChatConnectionManager:
    """Manages WebSocket connections for chat messaging"""
    
    def __init__(self):
        # {connection_id: {websocket, user_id, pharma_id, connected_at, subscribed_patients: Set[str]}}
        self.active_connections: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, user_id: str, pharma_id: Optional[int], connection_id: str = None) -> str:
        """Register WebSocket connection"""
        if connection_id is None:
            connection_id = str(uuid.uuid4())
        
        self.active_connections[connection_id] = {
            "websocket": websocket,
            "user_id": user_id,
            "pharma_id": pharma_id,
            "connected_at": datetime.now().isoformat(),
            "subscribed_patients": set()
        }
        return connection_id

    def disconnect(self, connection_id: str):
        """Remove connection by connection ID"""
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]

    def disconnect_by_websocket(self, websocket: WebSocket) -> Optional[str]:
        """Remove connection by websocket object"""
        for conn_id, conn_data in list(self.active_connections.items()):
            if conn_data["websocket"] == websocket:
                del self.active_connections[conn_id]
                return conn_id
        return None

    def subscribe_to_patient(self, connection_id: str, patient_id: str):
        """Subscribe connection to a specific patient's messages"""
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["subscribed_patients"].add(patient_id)

    def unsubscribe_from_patient(self, connection_id: str, patient_id: str):
        """Unsubscribe connection from a specific patient's messages"""
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["subscribed_patients"].discard(patient_id)

    async def broadcast_to_patient(self, patient_id: str, message_data: dict, sender_pharma_id: int, db):
        """Broadcast message to connections subscribed to this patient"""
        if not self.active_connections:
            return
        
        from app.models.patient_model import Patient
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient or patient.pharma_id != sender_pharma_id:
            return
        
        disconnected = []
        for connection_id, conn_data in list(self.active_connections.items()):
            if conn_data.get("pharma_id") != patient.pharma_id:
                continue
            
            subscribed_patients = conn_data.get("subscribed_patients", set())
            if patient_id in subscribed_patients:
                try:
                    await conn_data["websocket"].send_json(message_data)
                except Exception as e:
                    logger.error(f"Error sending message to {connection_id}: {e}", exc_info=True)
                    disconnected.append(connection_id)
        
        for conn_id in disconnected:
            self.disconnect(conn_id)

    def subscribe_to_tank(self, connection_id: str, tank_id: str):
        """Subscribe connection to a specific tank's messages (IVF flow)"""
        if connection_id in self.active_connections:
            self.active_connections[connection_id].setdefault("subscribed_tanks", set()).add(tank_id)
    
    def unsubscribe_from_tank(self, connection_id: str, tank_id: str):
        """Unsubscribe connection from a specific tank's messages (IVF flow)"""
        if connection_id in self.active_connections:
            self.active_connections[connection_id].setdefault("subscribed_tanks", set()).discard(tank_id)

    async def broadcast_to_tank(self, tank_id: str, message_data: dict, sender_tank_id: int, db):
        """Broadcast message to connections subscribed to this tank (IVF flow)"""
        if not self.active_connections:
            return
        
        from app.models.IVF.tank_model import Tank
        tank = db.query(Tank).filter(Tank.id == tank_id).first()
        if not tank or tank.tank_id != sender_tank_id:
            return
        
        disconnected = []
        for connection_id, conn_data in list(self.active_connections.items()):
            subscribed_tanks = conn_data.get("subscribed_tanks", set())
            if tank_id in subscribed_tanks:
                try:
                    await conn_data["websocket"].send_json(message_data)
                except Exception as e:
                    logger.error(f"Error sending message to {connection_id}: {e}", exc_info=True)
                    disconnected.append(connection_id)
        
        for conn_id in disconnected:
            self.disconnect(conn_id)

    async def send_to_user(self, user_id: str, message_data: dict):
        """Send message to a specific user"""
        disconnected = []
        for connection_id, conn_data in list(self.active_connections.items()):
            if conn_data.get("user_id") == user_id:
                try:
                    await conn_data["websocket"].send_json(message_data)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {e}", exc_info=True)
                    disconnected.append(connection_id)
        
        for conn_id in disconnected:
            self.disconnect(conn_id)

    def get_connections_info(self):
        """Get information about all active connections"""
        return {
            "count": len(self.active_connections),
            "connections": [
                {
                    "id": conn_id,
                    "user_id": conn_data["user_id"],
                    "pharma_id": conn_data["pharma_id"],
                    "connected_at": conn_data["connected_at"],
                    "subscribed_patients": list(conn_data.get("subscribed_patients", set()))
                }
                for conn_id, conn_data in self.active_connections.items()
            ]
        }
    
    def get_active_connections(self):
        """Get all active connections dictionary"""
        return self.active_connections.copy()
    
    def get_connections_by_pharma(self, pharma_id: int):
        """Get all active connections for a specific pharma"""
        return {
            conn_id: conn_data
            for conn_id, conn_data in self.active_connections.items()
            if conn_data.get("pharma_id") == pharma_id
        }

