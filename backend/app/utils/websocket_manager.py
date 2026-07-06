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
from app.models.IVF.device_model import Device
from app.models.IVF.ln2_iot_device_model import Ln2IotDevice
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
            "branch_id": None,   # Branch ID for IVF users (for validation)
            "live": True,        # If True, send KPI pushes; if False (1H/24H/7D), do not send
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
    
    def set_tank_id_subscription(self, connection_id: str, tank_id: int):
        """Set which tank this connection is subscribed to (IVF) - tracks by tank_id (integer)"""
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["tank_id"] = tank_id
            logger.info(f"Connection {connection_id} subscribed to tank_id {tank_id}")

    def set_incubator_subscription(
        self,
        connection_id: str,
        incubator_id: int,
        chamber_id: str,
        incubator_code: str = None,
    ):
        """Set which incubator chamber this connection is subscribed to."""
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["incubator_id"] = incubator_id
            self.active_connections[connection_id]["chamber_id"] = chamber_id
            if incubator_code is not None:
                self.active_connections[connection_id]["incubator_code"] = incubator_code
            logger.info(
                f"Connection {connection_id} subscribed to incubator_id {incubator_id} chamber {chamber_id}"
            )

    def set_refrigerator_subscription(
        self,
        connection_id: str,
        refrigerator_id: int,
        zone_id: Optional[str],
        refrigerator_code: str = None,
    ):
        """Set which refrigerator zone this connection is subscribed to."""
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["refrigerator_id"] = refrigerator_id
            self.active_connections[connection_id]["zone_id"] = zone_id
            if refrigerator_code is not None:
                self.active_connections[connection_id]["refrigerator_code"] = refrigerator_code
            logger.info(
                f"Connection {connection_id} subscribed to refrigerator_id {refrigerator_id} zone {zone_id}"
            )

    def set_live(self, connection_id: str, live: bool):
        """Set whether to send live KPI data to this connection (True = LIVE range only)."""
        if connection_id in self.active_connections:
            self.active_connections[connection_id]["live"] = bool(live)
            logger.info(f"Connection {connection_id} live={live}")

    async def broadcast(self, data: dict, db):
        """
        Broadcast data to connections subscribed to this patient (CGT) or tank (IVF).
        Handles both CGT (patient_id) and IVF (tank_id or device_code) messages.

        For IVF messages:
        - tank_id: Required; match by tank_id only (no tank_code or branch_id).
        - device_code / device_id: Optional; resolved via Tank.tive_device_id or Device -> Ln2IotDevice -> tank.
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
        
        # Handle IVF messages (tank_id, tank_code, or device_code/device_id)
        tank_code = data.get("tank_code")
        tank_id_from_data = data.get("tank_id")
        # Payload may send device_code (e.g. "LN2-1") as device_code or device_id
        device_code = data.get("device_code") or data.get("device_id")
        if device_code is not None:
            device_code = str(device_code).strip() or None

        # Resolve to tank_id, tank_code, and tank_branch_id
        tank = None
        tank_branch_id = None

        # Priority: device_code > tank_code > tank_id
        if device_code and not tank_code and not tank_id_from_data:
            # 1) Tive: Tank.tive_device_id stores device code (e.g. "TIVE-TEST-001")
            tank = db.query(Tank).filter(Tank.tive_device_id == device_code).first()
            if not tank:
                # 2) LN2: Device.device_code (e.g. "LN2-1") -> Ln2IotDevice -> tank
                dev = db.query(Device).filter(Device.device_code == device_code).first()
                if dev:
                    ln2_dev = db.query(Ln2IotDevice).filter(Ln2IotDevice.device_id == dev.id).first()
                    if ln2_dev:
                        tank = ln2_dev.tank
            if tank:
                tank_id_from_data = tank.tank_id
                tank_code = tank.tank_code
                tank_branch_id = tank.branch_id
                logger.debug(f"Resolved device_code {device_code!r} to tank_code {tank_code} (tank_id: {tank_id_from_data})")
            else:
                logger.warning(f"No tank found for device_code: {device_code!r}")
                return  # Tank not found for this device
        elif tank_id_from_data is not None:
            # Payload has tank_id; match by tank_id only (no DB lookup, tank_code, or branch_id).
            try:
                tank_id_from_data = int(tank_id_from_data)
            except (TypeError, ValueError):
                return
        else:
            return  # No valid identifier (no device_id or tank_id)
        
        # Broadcast to connections subscribed to this tank_id and only when they want live data
        disconnected = []
        for connection_id, conn_data in list(self.active_connections.items()):
            subscribed_tank_id = conn_data.get("tank_id")
            if subscribed_tank_id is None or subscribed_tank_id != tank_id_from_data:
                continue
            if not conn_data.get("live", True):
                continue  # Client is on 1H/24H/7D; do not send socket data
            
            try:
                await conn_data["websocket"].send_json(data)
            except Exception as e:
                logger.error(f"Error sending IVF data to client {connection_id}: {e}")
                disconnected.append(connection_id)
        
        # Remove disconnected clients
        for conn_id in disconnected:
            self.disconnect(conn_id)

    async def broadcast_refrigerator(self, data: dict):
        """
        Broadcast refrigerator KPI data to connections subscribed to the matching
        refrigerator_id + zone_id, respecting the live flag.
        """
        if not self.active_connections:
            return

        refrigerator_id_from_data = data.get("refrigerator_id")
        zone_id_from_data = data.get("zone_id")
        if refrigerator_id_from_data is None:
            return
        try:
            refrigerator_id_from_data = int(refrigerator_id_from_data)
        except (TypeError, ValueError):
            return

        disconnected = []
        for connection_id, conn_data in list(self.active_connections.items()):
            if conn_data.get("refrigerator_id") != refrigerator_id_from_data:
                continue
            if zone_id_from_data is not None and conn_data.get("zone_id") != zone_id_from_data:
                continue
            if not conn_data.get("live", True):
                continue
            try:
                await conn_data["websocket"].send_json(data)
            except Exception as e:
                logger.error(f"Error sending refrigerator KPI data to client {connection_id}: {e}")
                disconnected.append(connection_id)

        for conn_id in disconnected:
            self.disconnect(conn_id)

    async def broadcast_incubator(self, data: dict):
        """
        Broadcast incubator KPI data to connections subscribed to the matching
        incubator_id + chamber_id, respecting the live flag.
        No DB lookup needed (incubator_id and chamber_id are in the payload).
        """
        if not self.active_connections:
            return

        incubator_id_from_data = data.get("incubator_id")
        chamber_id_from_data = data.get("chamber_id")
        if incubator_id_from_data is None:
            return
        try:
            incubator_id_from_data = int(incubator_id_from_data)
        except (TypeError, ValueError):
            return

        disconnected = []
        for connection_id, conn_data in list(self.active_connections.items()):
            if conn_data.get("incubator_id") != incubator_id_from_data:
                continue
            if chamber_id_from_data is not None and conn_data.get("chamber_id") != chamber_id_from_data:
                continue
            if not conn_data.get("live", True):
                continue
            try:
                await conn_data["websocket"].send_json(data)
            except Exception as e:
                logger.error(f"Error sending incubator KPI data to client {connection_id}: {e}")
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
                    "connected_at": conn_data["connected_at"],
                    "client_info": conn_data["client_info"],
                    "patient_id": conn_data.get("patient_id", None),
                    "tank_id": conn_data.get("tank_id", None),
                    "tank_code": conn_data.get("tank_code", None)
                }
                for conn_id, conn_data in self.active_connections.items()
            ]
        }

