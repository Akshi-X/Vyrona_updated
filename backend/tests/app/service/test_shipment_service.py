import pytest
from unittest.mock import MagicMock, Mock, patch
from datetime import datetime, timezone, timedelta

from app.service.shipment_service import ShipmentService
from app.exceptions.patient_exceptions import PatientNotFoundException, ShipmentNotStartedException
from app.models.shipment_model import Shipment
from app.models.patient_model import Patient
from app.models.patient_stage_model import PatientStage as PatientStageModel
from app.models.shipment_leg_model import ShipmentLeg
from app.models.carrier_model import Carrier
from app.models.provider_model import Provider
from app.models.shipment_leg_document_model import ShipmentLegDocument
from app.constants.enums import PatientStage, RouteStatus


@pytest.fixture
def db_session():
    """Create a mock database session"""
    return MagicMock()


@pytest.fixture
def service(db_session):
    """Create a ShipmentService instance with mocked db"""
    return ShipmentService(db=db_session)


def test_validate_patient_for_shipment_operations_success(service):
    """Test successful patient validation"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 42
    
    service.db.query.return_value.filter.return_value.first.return_value = patient
    service.db.query.return_value.filter.return_value.count.return_value = 1
    
    # Mock _get_active_transportation_stage to return None (no active stage)
    service._get_active_transportation_stage = MagicMock(return_value=None)
    
    result = service._validate_patient_for_shipment_operations("PT-123", pharma_id=42, require_shipment=True)
    
    assert result == patient


def test_validate_patient_for_shipment_operations_patient_not_found(service):
    """Test patient validation when patient doesn't exist"""
    service.db.query.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(PatientNotFoundException):
        service._validate_patient_for_shipment_operations("PT-123", pharma_id=42)


def test_validate_patient_for_shipment_operations_wrong_pharma(service):
    """Test patient validation when patient belongs to different pharma"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 99  # Different pharma
    
    service.db.query.return_value.filter.return_value.first.return_value = patient
    
    with pytest.raises(PatientNotFoundException):
        service._validate_patient_for_shipment_operations("PT-123", pharma_id=42)


def test_validate_patient_for_shipment_operations_shipment_not_started(service):
    """Test patient validation when shipment not started"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 42
    
    active_stage = Mock(spec=PatientStageModel)
    
    service.db.query.return_value.filter.return_value.first.side_effect = [patient, active_stage]
    service.db.query.return_value.filter.return_value.count.return_value = 0
    
    service._get_active_transportation_stage = MagicMock(return_value=active_stage)
    
    with pytest.raises(ShipmentNotStartedException):
        service._validate_patient_for_shipment_operations("PT-123", pharma_id=42, require_shipment=True)


def test_get_shipment_carrier_success(service):
    """Test getting carrier from first leg"""
    carrier_name = "Test Carrier"
    service.db.query.return_value.join.return_value.filter.return_value.order_by.return_value.first.return_value = (carrier_name,)
    
    result = service._get_shipment_carrier(shipment_id=1)
    
    assert result == carrier_name


def test_get_shipment_carrier_fallback(service):
    """Test carrier fallback when no carrier found"""
    service.db.query.return_value.join.return_value.filter.return_value.order_by.return_value.first.return_value = None
    
    result = service._get_shipment_carrier(shipment_id=1, fallback_carrier="Fallback Carrier")
    
    assert result == "Fallback Carrier"


def test_get_real_time_metrics_success(service):
    """Test getting real-time metrics"""
    # Mock shipment and active stage
    shipment1 = Mock(spec=Shipment)
    shipment1.routes_status = RouteStatus.SAFE
    shipment1.departure_time = datetime.now(timezone.utc)
    
    shipment2 = Mock(spec=Shipment)
    shipment2.routes_status = RouteStatus.DELAYED
    shipment2.departure_time = datetime.now(timezone.utc)
    
    # Mock query results: (shipment, active_stage_id)
    service.db.query.return_value.outerjoin.return_value.filter.return_value.all.return_value = [
        (shipment1, 1),  # Has active stage
        (shipment2, None),  # No active stage
    ]
    
    result = service.get_real_time_metrics(pharma_id=42)
    
    assert result["active_routes"] == 1
    assert result["safe_routes"] == 1
    assert result["delayed_routes"] == 1
    assert "last_updated" in result


def test_get_real_time_metrics_empty_results(service):
    """Test real-time metrics with no shipments"""
    service.db.query.return_value.outerjoin.return_value.filter.return_value.all.return_value = []
    
    result = service.get_real_time_metrics(pharma_id=42)
    
    assert result["active_routes"] == 0
    assert result["avg_transit_days"] == 0.0
    assert result["safe_routes"] == 0
    assert result["delayed_routes"] == 0
    assert result["risky_routes"] == 0


def test_get_active_routes_success(service):
    """Test getting active routes"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.patient_id = "PT-123"
    shipment.source_location = "Location A"
    shipment.destination_location = "Location B"
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.arrival_time = None
    shipment.routes_status = RouteStatus.SAFE
    shipment.updated_at = datetime.now(timezone.utc)
    
    # Mock _build_filtered_active_routes_query to return a query that yields the shipment
    query_mock = MagicMock()
    query_mock.all.return_value = [(shipment, "Pharma Name", "Provider Name", "Carrier Name")]
    service._build_filtered_active_routes_query = MagicMock(return_value=query_mock)
    
    # Mock carrier lookup
    service._batch_get_shipment_carriers = MagicMock(return_value={1: "Test Carrier"})
    
    result = service.get_active_routes(pharma_id=42)
    
    assert len(result) == 1
    assert result[0]["source"] == "Location A"
    assert result[0]["destination"] == "Location B"


def test_get_active_routes_with_filters(service):
    """Test getting active routes with filters"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.patient_id = "PT-123"
    shipment.source_location = "Location A"
    shipment.destination_location = "Location B"
    shipment.routes_status = RouteStatus.SAFE
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.updated_at = datetime.now(timezone.utc)
    
    query_mock = MagicMock()
    query_mock.all.return_value = [(shipment, "Pharma Name", "Provider Name", "Test Carrier")]
    service._build_filtered_active_routes_query = MagicMock(return_value=query_mock)
    
    service._batch_get_shipment_carriers = MagicMock(return_value={1: "Test Carrier"})
    
    result = service.get_active_routes(
        pharma_id=42,
        route_status="safe",
        carriers=["Test Carrier"],
        regions=["Europe"]
    )
    
    assert isinstance(result, list)


def test_get_3pl_player_details_success(service):
    """Test getting 3PL player details"""
    leg = Mock(spec=ShipmentLeg)
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = datetime.now(timezone.utc)
    leg.arrival_time = datetime.now(timezone.utc)
    leg.ln2_refill = "Yes"
    leg.warehouse = "Warehouse 1"
    
    handover_time = datetime.now(timezone.utc)
    carrier_name = "Test Carrier"
    provider_name = None
    
    # Mock patient validation
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 42
    service._validate_patient_for_shipment_operations = MagicMock(return_value=patient)
    
    # Mock the complex query chain
    query_mock = MagicMock()
    query_mock.filter.return_value = query_mock
    query_mock.order_by.return_value.all.return_value = [
        (leg, handover_time, carrier_name, provider_name, 42, "PT-123")
    ]
    service.db.query.return_value.join.return_value.outerjoin.return_value.outerjoin.return_value = query_mock
    
    result = service.get_3pl_player_details(pharma_id=42, patient_id="PT-123")
    
    assert len(result) == 1
    assert result[0]["player_name"] == "Test Carrier"
    assert result[0]["modes"] == "Air"
    assert result[0]["source"] == "Location A"


def test_get_3pl_player_details_patient_not_found(service):
    """Test 3PL player details when patient not found"""
    service.db.query.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(PatientNotFoundException):
        service.get_3pl_player_details(pharma_id=42, patient_id="PT-123")


def test_get_3pl_player_details_shipment_not_started(service):
    """Test 3PL player details when shipment not started"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 42
    
    active_stage = Mock(spec=PatientStageModel)
    
    service.db.query.return_value.filter.return_value.first.side_effect = [patient, active_stage]
    service.db.query.return_value.filter.return_value.count.return_value = 0
    service._get_active_transportation_stage = MagicMock(return_value=active_stage)
    
    with pytest.raises(ShipmentNotStartedException):
        service.get_3pl_player_details(pharma_id=42, patient_id="PT-123")


def test_get_transport_time_comparison_success(service, monkeypatch):
    """Test getting transport time comparison"""
    leg1 = Mock(spec=ShipmentLeg)
    leg1.from_location = "Location A"
    leg1.to_location = "Location B"
    leg1.scheduled_time = datetime.now(timezone.utc)
    leg1.arrival_time = datetime.now(timezone.utc)
    leg1.departure_time = datetime.now(timezone.utc)
    leg1.handover_time = None
    
    leg2 = Mock(spec=ShipmentLeg)
    leg2.from_location = "Location B"
    leg2.to_location = "Location C"
    leg2.scheduled_time = None
    leg2.arrival_time = datetime.now(timezone.utc)
    leg2.departure_time = datetime.now(timezone.utc)
    leg2.handover_time = None
    
    # Mock patient validation
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 42
    service._validate_patient_for_shipment_operations = MagicMock(return_value=patient)
    
    # Mock format_duration function
    def mock_format_duration(start, end):
        return "2.5 h"
    
    from app.service import shipment_service
    monkeypatch.setattr(shipment_service, "format_duration", mock_format_duration)
    
    # Mock shipment legs query - returns tuples of (leg, patient_id, pharma_id)
    query_mock = MagicMock()
    query_mock.filter.return_value = query_mock
    query_mock.order_by.return_value.all.return_value = [
        (leg1, "PT-123", 42),
        (leg2, "PT-123", 42)
    ]
    service.db.query.return_value.join.return_value = query_mock
    
    result = service.get_transport_time_comparison(patient_id="PT-123", pharma_id=42)
    
    assert len(result) == 2
    assert result[0]["source_location"] == "Location A"
    assert result[1]["source_location"] == "Location B"


def test_get_transport_time_comparison_patient_not_found(service):
    """Test transport time comparison when patient not found"""
    service.db.query.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(PatientNotFoundException):
        service.get_transport_time_comparison(patient_id="PT-123", pharma_id=42)


def test_get_patient_journey_summary_success(service):
    """Test getting patient journey summary"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.condition = "Condition A"
    patient.hospital_name = "Hospital A"
    patient.pharma_id = 42
    
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.patient_id = "PT-123"
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.arrival_time = None
    
    active_stage = Mock(spec=PatientStageModel)
    active_stage.stage = PatientStage.TRANSPORTATION
    
    # Mock patient validation
    service.db.query.return_value.filter.return_value.first.side_effect = [patient, active_stage]
    service.db.query.return_value.filter.return_value.count.return_value = 1
    service._get_active_transportation_stage = MagicMock(return_value=active_stage)
    
    # Mock shipments query
    service.db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [shipment]
    
    # Mock legs query for _build_shipment_summary
    leg = Mock(spec=ShipmentLeg)
    leg.leg_order = 1
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = datetime.now(timezone.utc)
    leg.arrival_time = None
    leg.scheduled_time = None
    leg.handover_time = None
    leg.leg_status = RouteStatus.SAFE
    leg.leg_quality_loss = None
    leg.ln2_refill = None
    leg.warehouse = None
    leg.doc_count_actual = None
    leg.doc_count_needed = None
    
    service.db.query.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = [(leg, "Carrier A", "Provider A")]
    
    # Mock reengineering stage query
    service.db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
    
    result = service.get_patient_journey_summary(patient_id="PT-123", pharma_id=42)
    
    assert result["patient_id"] == "PT-123"
    assert result["condition"] == "Condition A"
    assert "current_status" in result


def test_get_patient_journey_summary_patient_not_found(service):
    """Test patient journey summary when patient not found"""
    service.db.query.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(PatientNotFoundException):
        service.get_patient_journey_summary(patient_id="PT-123", pharma_id=42)


def test_get_control_tower_map_data_success(service):
    """Test getting control tower map data"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.patient_id = "PT-123"
    shipment.source_location = "Location A"
    shipment.destination_location = "Location B"
    shipment.source_country = "US"
    shipment.destination_country = "CA"
    shipment.source_latitude = 40.7128
    shipment.source_longitude = -74.0060
    shipment.destination_latitude = 34.0522
    shipment.destination_longitude = -118.2437
    shipment.routes_status = RouteStatus.SAFE
    shipment.updated_at = datetime.now(timezone.utc)
    
    # Mock _build_filtered_active_routes_query
    query_mock = MagicMock()
    query_mock.all.return_value = [(shipment, "Pharma Name", "Provider Name", "Carrier Name")]
    service._build_filtered_active_routes_query = MagicMock(return_value=query_mock)
    
    # Mock carrier lookup
    service._batch_get_shipment_carriers = MagicMock(return_value={1: "Test Carrier"})
    
    result = service.get_control_tower_map_data(pharma_id=42)
    
    assert "routes" in result
    assert "total_routes" in result
    assert result["total_routes"] == 1


def test_get_control_tower_map_data_with_filters(service):
    """Test control tower map data with filters"""
    # Mock _build_filtered_active_routes_query
    query_mock = MagicMock()
    query_mock.all.return_value = []
    service._build_filtered_active_routes_query = MagicMock(return_value=query_mock)
    
    service._batch_get_shipment_carriers = MagicMock(return_value={})
    
    result = service.get_control_tower_map_data(
        pharma_id=42,
        route_status="safe",
        carriers=["Carrier A"],
        regions=["Europe"]
    )
    
    assert result["total_routes"] == 0


def test_get_all_carriers_success(service):
    """Test getting all carriers"""
    # Mock the two query chains (shipment level and leg level)
    # First query (shipment level): db.query(Carrier.name).join(Shipment).filter(...).filter(active_only).all()
    query1_final = MagicMock()
    query1_final.all.return_value = [("Carrier A",), ("Carrier B",)]
    query1_final.filter.return_value = query1_final  # Chain filter calls
    
    query1_after_join = MagicMock()
    query1_after_join.filter.return_value = query1_final
    query1_after_join.filter.return_value.filter.return_value = query1_final
    
    query1_base = MagicMock()
    query1_base.join.return_value = query1_after_join
    
    # Second query (leg level): db.query(Carrier.name).join(ShipmentLeg).join(Shipment).filter(...).filter(active_only).all()
    query2_final = MagicMock()
    query2_final.all.return_value = [("Carrier C",)]
    query2_final.filter.return_value = query2_final  # Chain filter calls
    
    query2_after_join2 = MagicMock()
    query2_after_join2.filter.return_value = query2_final
    query2_after_join2.filter.return_value.filter.return_value = query2_final
    
    query2_after_join1 = MagicMock()
    query2_after_join1.join.return_value = query2_after_join2
    
    query2_base = MagicMock()
    query2_base.join.return_value = query2_after_join1
    
    # Use side_effect to return different mocks for each db.query() call
    service.db.query.side_effect = [query1_base, query2_base]
    
    result = service.get_all_carriers(pharma_id=42, active_only=True)
    
    assert len(result) >= 3
    assert "Carrier A" in result
    assert "Carrier B" in result
    assert "Carrier C" in result


def test_get_all_carriers_empty(service):
    """Test getting carriers when none exist"""
    # Mock both query chains to return empty
    query1 = MagicMock()
    query1.join.return_value.filter.return_value.all.return_value = []
    
    query2 = MagicMock()
    query2.join.return_value.join.return_value.filter.return_value.all.return_value = []
    
    service.db.query.side_effect = [query1, query2]
    
    result = service.get_all_carriers(pharma_id=42, active_only=True)
    
    assert result == []


def test_get_available_regions_success(service, monkeypatch):
    """Test getting available regions"""
    # Mock the query to return countries
    query_mock = MagicMock()
    query_mock.filter.return_value = query_mock
    query_mock.distinct.return_value.all.return_value = [
        ("US", "CA"),  # source_country, destination_country
        ("GB", "FR"),
        ("CN", "JP"),
    ]
    service.db.query.return_value = query_mock
    
    # Mock country_to_region function
    def mock_country_to_region(country_code):
        region_map = {
            "US": "North America",
            "CA": "North America",
            "GB": "Europe",
            "FR": "Europe",
            "CN": "Asia",
            "JP": "Asia"
        }
        return region_map.get(country_code)
    
    from app.service import shipment_service
    monkeypatch.setattr(shipment_service, "country_to_region", mock_country_to_region)
    
    result = service.get_available_regions(pharma_id=42)
    
    assert len(result) >= 3
    assert "Asia" in result
    assert "Europe" in result
    assert "North America" in result


def test_get_available_regions_empty(service):
    """Test getting regions when none exist"""
    query_mock = MagicMock()
    query_mock.filter.return_value = query_mock
    query_mock.distinct.return_value.all.return_value = []
    service.db.query.return_value = query_mock
    
    result = service.get_available_regions(pharma_id=42)
    
    assert result == []


def test_get_document_checklist_success(service):
    """Test getting document checklist"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 42
    
    leg1 = Mock(spec=ShipmentLeg)
    leg1.id = 1
    leg1.leg_order = 1
    leg1.from_location = "Location A"
    leg1.to_location = "Location B"
    leg1.doc_count_actual = 3
    leg1.doc_count_needed = 5
    
    leg2 = Mock(spec=ShipmentLeg)
    leg2.id = 2
    leg2.leg_order = 2
    leg2.from_location = "Location B"
    leg2.to_location = "Location C"
    leg2.doc_count_actual = 4
    leg2.doc_count_needed = 4
    
    missing_doc = Mock(spec=ShipmentLegDocument)
    missing_doc.document_name = "Bill of Lading"
    
    # Mock patient query - first db.query() call
    patient_query = MagicMock()
    patient_query.filter.return_value.first.return_value = patient
    
    # Mock legs query - second db.query() call (joins with Shipment)
    # Query: db.query(ShipmentLeg).join(Shipment).filter(patient_id).filter(pharma_id).order_by(...).all()
    legs_query_final = MagicMock()
    legs_query_final.order_by.return_value.all.return_value = [leg1, leg2]
    legs_query_final.filter.return_value = legs_query_final  # Chain filter calls
    
    legs_query_after_join = MagicMock()
    legs_query_after_join.filter.return_value = legs_query_final  # Chain filter calls
    legs_query_after_join.order_by.return_value.all.return_value = [leg1, leg2]
    
    legs_query_base = MagicMock()
    legs_query_base.join.return_value = legs_query_after_join
    
    # Mock missing documents query - third db.query() call
    docs_query = MagicMock()
    docs_query.filter.return_value.all.return_value = [missing_doc]
    
    # Set up the query chain - first call for patient, second for legs, third for docs
    service.db.query.side_effect = [
        patient_query,      # Patient query
        legs_query_base,    # Legs query base
        docs_query          # Missing documents query
    ]
    
    result = service.get_document_checklist(patient_id="PT-123", pharma_id=42)
    
    assert "items" in result
    assert "total_items" in result
    assert "missing_documents" in result
    assert "non_compliance_percentage" in result
    assert result["total_items"] == 2
    assert len(result["missing_documents"]) == 1


def test_get_document_checklist_patient_not_found(service):
    """Test document checklist when patient not found"""
    service.db.query.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(PatientNotFoundException):
        service.get_document_checklist(patient_id="PT-123", pharma_id=42)


def test_get_document_checklist_wrong_pharma(service):
    """Test document checklist when patient belongs to different pharma"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 99  # Different pharma
    
    service.db.query.return_value.filter.return_value.first.return_value = patient
    
    with pytest.raises(PatientNotFoundException):
        service.get_document_checklist(patient_id="PT-123", pharma_id=42)


def test_get_document_checklist_empty_legs(service):
    """Test document checklist with no shipment legs"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 42
    
    service.db.query.return_value.filter.return_value.first.return_value = patient
    service.db.query.return_value.join.return_value.filter.return_value.order_by.return_value.all.return_value = []
    
    result = service.get_document_checklist(patient_id="PT-123", pharma_id=42)
    
    assert result["total_items"] == 0
    assert result["non_compliance_percentage"] == 0.0


def test_update_patient_stage_on_shipment_leg_failure_success(service):
    """Test updating patient stage on shipment leg failure"""
    leg = Mock(spec=ShipmentLeg)
    leg.shipment_id = 1
    leg.leg_status = RouteStatus.FAILED
    
    shipment = Mock(spec=Shipment)
    shipment.patient_id = "PT-123"
    
    active_stage = Mock(spec=PatientStageModel)
    active_stage.id = 1
    active_stage.is_active = True
    
    service.db.query.return_value.filter.return_value.first.side_effect = [leg, shipment, active_stage]
    service.db.query.return_value.filter.return_value.update.return_value = None
    service.db.commit = MagicMock()
    
    service.update_patient_stage_on_shipment_leg_failure(shipment_leg_id=1)
    
    service.db.commit.assert_called_once()


def test_get_real_time_metrics_propagates_error(service):
    """Test that get_real_time_metrics propagates unexpected errors"""
    service.db.query.side_effect = RuntimeError("Database error")
    
    with pytest.raises(RuntimeError):
        service.get_real_time_metrics(pharma_id=42)


def test_get_real_time_metrics_high_risk_routes(service):
    """Test real-time metrics with HIGH_RISK route status"""
    shipment = Mock(spec=Shipment)
    shipment.routes_status = RouteStatus.HIGH_RISK
    shipment.departure_time = datetime.now(timezone.utc)
    
    service.db.query.return_value.outerjoin.return_value.filter.return_value.all.return_value = [
        (shipment, None),  # No active stage
    ]
    
    result = service.get_real_time_metrics(pharma_id=42)
    
    assert result["risky_routes"] == 1
    assert result["active_routes"] == 0


def test_get_active_routes_propagates_error(service):
    """Test that get_active_routes propagates unexpected errors"""
    service.db.query.side_effect = RuntimeError("Database error")
    
    with pytest.raises(RuntimeError):
        service.get_active_routes(pharma_id=42)


def test_get_active_routes_carrier_filter_excludes(service):
    """Test that get_active_routes filters out carriers that don't match"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.patient_id = "PT-123"
    shipment.source_location = "Location A"
    shipment.destination_location = "Location B"
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.routes_status = RouteStatus.SAFE
    shipment.updated_at = datetime.now(timezone.utc)
    
    query_mock = MagicMock()
    query_mock.all.return_value = [(shipment, "Pharma Name", "Provider Name", "Carrier Name")]
    service._build_filtered_active_routes_query = MagicMock(return_value=query_mock)
    
    service._batch_get_shipment_carriers = MagicMock(return_value={1: "Other Carrier"})
    
    # Filter by carriers that don't match
    result = service.get_active_routes(
        pharma_id=42,
        carriers=["Test Carrier"]  # Doesn't match "Other Carrier"
    )
    
    assert len(result) == 0


def test_batch_get_shipment_carriers_empty_list(service):
    """Test _batch_get_shipment_carriers with empty shipment_ids list"""
    result = service._batch_get_shipment_carriers([])
    
    assert result == {}


def test_batch_get_shipment_carriers_success(service):
    """Test _batch_get_shipment_carriers with shipment IDs"""
    # Mock subquery
    subquery_mock = MagicMock()
    subquery_mock.c.shipment_id = "shipment_id"
    subquery_mock.c.min_leg_order = "min_leg_order"
    
    # Mock the query chain
    subquery_query = MagicMock()
    subquery_query.filter.return_value.group_by.return_value.subquery.return_value = subquery_mock
    
    main_query = MagicMock()
    main_query.join.return_value.join.return_value.filter.return_value.all.return_value = [
        (1, "Carrier A"),
        (2, "Carrier B")
    ]
    
    service.db.query.side_effect = [subquery_query, main_query]
    
    result = service._batch_get_shipment_carriers([1, 2])
    
    assert result == {1: "Carrier A", 2: "Carrier B"}


def test_build_filtered_active_routes_query_with_route_status(service, monkeypatch):
    """Test _build_filtered_active_routes_query with route_status filter"""
    from app.service import shipment_service
    
    def mock_parse_route_status_filter(status):
        return RouteStatus.SAFE if status == "safe" else None
    
    monkeypatch.setattr(shipment_service, "parse_route_status_filter", mock_parse_route_status_filter)
    
    query_mock = MagicMock()
    query_mock.filter.return_value = query_mock
    service.db.query.return_value.join.return_value.outerjoin.return_value.outerjoin.return_value.outerjoin.return_value = query_mock
    
    result = service._build_filtered_active_routes_query(
        pharma_id=42,
        route_status="safe",
        regions=None
    )
    
    assert result is not None


def test_build_filtered_active_routes_query_with_regions(service, monkeypatch):
    """Test _build_filtered_active_routes_query with regions filter"""
    from app.service import shipment_service
    
    def mock_apply_region_filter(query, regions):
        return query
    
    monkeypatch.setattr(shipment_service, "apply_region_filter", mock_apply_region_filter)
    
    query_mock = MagicMock()
    query_mock.filter.return_value = query_mock
    service.db.query.return_value.join.return_value.outerjoin.return_value.outerjoin.return_value.outerjoin.return_value = query_mock
    
    result = service._build_filtered_active_routes_query(
        pharma_id=42,
        route_status=None,
        regions=["Europe"]
    )
    
    assert result is not None


def test_update_patient_stage_on_shipment_leg_failure_leg_not_found(service):
    """Test update_patient_stage_on_shipment_leg_failure when leg not found"""
    service.db.query.return_value.filter.return_value.first.return_value = None
    
    # Should return early without error
    service.update_patient_stage_on_shipment_leg_failure(shipment_leg_id=1)
    
    service.db.commit.assert_not_called()


def test_update_patient_stage_on_shipment_leg_failure_shipment_not_found(service):
    """Test update_patient_stage_on_shipment_leg_failure when shipment not found"""
    leg = Mock(spec=ShipmentLeg)
    leg.shipment_id = 1
    
    service.db.query.return_value.filter.return_value.first.side_effect = [leg, None]
    
    # Should return early without error
    service.update_patient_stage_on_shipment_leg_failure(shipment_leg_id=1)
    
    service.db.commit.assert_not_called()


def test_update_patient_stage_on_shipment_leg_failure_leg_not_failed(service):
    """Test update_patient_stage_on_shipment_leg_failure when leg status is not FAILED"""
    leg = Mock(spec=ShipmentLeg)
    leg.shipment_id = 1
    leg.leg_status = RouteStatus.SAFE
    
    shipment = Mock(spec=Shipment)
    shipment.patient_id = "PT-123"
    
    service.db.query.return_value.filter.return_value.first.side_effect = [leg, shipment]
    
    # Should return early without error
    service.update_patient_stage_on_shipment_leg_failure(shipment_leg_id=1)
    
    service.db.commit.assert_not_called()


def test_update_patient_stage_on_shipment_leg_failure_exception(service):
    """Test update_patient_stage_on_shipment_leg_failure exception handling"""
    leg = Mock(spec=ShipmentLeg)
    leg.shipment_id = 1
    leg.leg_status = RouteStatus.FAILED
    
    shipment = Mock(spec=Shipment)
    shipment.patient_id = "PT-123"
    
    active_stage = Mock(spec=PatientStageModel)
    
    service.db.query.return_value.filter.return_value.first.side_effect = [leg, shipment, active_stage]
    service._get_active_transportation_stage = MagicMock(return_value=active_stage)
    service.db.commit.side_effect = Exception("Database error")
    
    with pytest.raises(Exception):
        service.update_patient_stage_on_shipment_leg_failure(shipment_leg_id=1)
    
    service.db.rollback.assert_called_once()


def test_get_patient_journey_summary_with_leg2(service):
    """Test get_patient_journey_summary with leg2 shipment"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.condition = "Condition A"
    patient.hospital_name = "Hospital A"
    patient.pharma_id = 42
    
    leg1_shipment = Mock(spec=Shipment)
    leg1_shipment.id = 1
    leg1_shipment.patient_id = "PT-123"
    leg1_shipment.departure_time = datetime.now(timezone.utc)
    leg1_shipment.arrival_time = None
    
    leg2_shipment = Mock(spec=Shipment)
    leg2_shipment.id = 2
    leg2_shipment.patient_id = "PT-123"
    leg2_shipment.departure_time = datetime.now(timezone.utc)
    leg2_shipment.arrival_time = None
    
    active_stage = Mock(spec=PatientStageModel)
    active_stage.stage = PatientStage.TRANSPORTATION
    
    service._validate_patient_for_shipment_operations = MagicMock(return_value=patient)
    service.db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [leg1_shipment, leg2_shipment]
    
    # Mock legs query for both shipments
    leg = Mock(spec=ShipmentLeg)
    leg.leg_order = 1
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = datetime.now(timezone.utc)
    leg.arrival_time = None
    leg.scheduled_time = None
    leg.handover_time = None
    leg.leg_status = RouteStatus.SAFE
    leg.leg_quality_loss = None
    leg.ln2_refill = None
    leg.warehouse = None
    leg.doc_count_actual = None
    leg.doc_count_needed = None
    
    service.db.query.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = [(leg, "Carrier A", "Provider A")]
    
    # Mock reengineering stage query
    service.db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
    
    result = service.get_patient_journey_summary(patient_id="PT-123", pharma_id=42)
    
    assert result["patient_id"] == "PT-123"
    assert "leg1" in result
    assert "leg2" in result


def test_get_patient_journey_summary_with_reengineering_stage(service):
    """Test get_patient_journey_summary with reengineering stage"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.condition = "Condition A"
    patient.hospital_name = "Hospital A"
    patient.pharma_id = 42
    
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.patient_id = "PT-123"
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.arrival_time = None
    
    active_stage = Mock(spec=PatientStageModel)
    active_stage.stage = PatientStage.TRANSPORTATION
    
    reengineering_stage = Mock(spec=PatientStageModel)
    reengineering_stage.end_time = datetime.now(timezone.utc)
    reengineering_stage.is_active = False
    reengineering_stage.start_time = datetime.now(timezone.utc)
    
    service._validate_patient_for_shipment_operations = MagicMock(return_value=patient)
    
    # Mock legs query for _build_shipment_summary
    leg = Mock(spec=ShipmentLeg)
    leg.leg_order = 1
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = datetime.now(timezone.utc)
    leg.arrival_time = None
    leg.scheduled_time = None
    leg.handover_time = None
    leg.leg_status = RouteStatus.SAFE
    leg.leg_quality_loss = None
    leg.ln2_refill = None
    leg.warehouse = None
    leg.doc_count_actual = None
    leg.doc_count_needed = None
    
    # Mock _get_reengineering_stage to return the stage
    service._get_reengineering_stage = MagicMock(return_value={
        "status": "completed",
        "start_date": reengineering_stage.start_time.isoformat(),
        "end_date": reengineering_stage.end_time.isoformat(),
        "scheduled_start": reengineering_stage.start_time.isoformat(),
        "scheduled_end": None,
        "description": None
    })
    
    # Mock shipments query
    shipments_query = MagicMock()
    shipments_query.all.return_value = [shipment]
    
    # Mock legs query for _build_shipment_summary
    legs_query = MagicMock()
    legs_query.outerjoin.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = [(leg, "Carrier A", "Provider A")]
    
    # Mock active_stage query
    active_stage_query = MagicMock()
    active_stage_query.filter.return_value.first.return_value = active_stage
    
    # Set up side_effect for multiple db.query() calls
    service.db.query.side_effect = [
        shipments_query,      # Shipments query
        legs_query,           # Legs query (for _build_shipment_summary)
        active_stage_query,   # Active stage query
    ]
    
    result = service.get_patient_journey_summary(patient_id="PT-123", pharma_id=42)
    
    assert result["reengineering"] is not None
    assert result["reengineering"]["status"] == "completed"


def test_build_shipment_summary_with_provider(service):
    """Test _build_shipment_summary with provider name"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.arrival_time = None
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.scheduled_time = None
    shipment.handover_time = None
    
    leg = Mock(spec=ShipmentLeg)
    leg.leg_order = 1
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = datetime.now(timezone.utc)
    leg.arrival_time = None
    leg.scheduled_time = None
    leg.handover_time = None
    leg.leg_status = RouteStatus.SAFE
    leg.leg_quality_loss = None
    leg.ln2_refill = None
    leg.warehouse = None
    leg.doc_count_actual = None
    leg.doc_count_needed = None
    
    # Query returns (leg, carrier_name, provider_name) - provider should be used as primary_provider
    # Query chain: db.query(...).outerjoin(Carrier).outerjoin(Provider).filter(...).order_by(...).all()
    query_base = MagicMock()
    query_after_join1 = MagicMock()
    query_after_join2 = MagicMock()
    query_after_filter = MagicMock()
    query_after_filter.order_by.return_value.all.return_value = [
        (leg, None, "Provider A")  # No carrier, but has provider
    ]
    query_after_join2.filter.return_value = query_after_filter
    query_after_join1.outerjoin.return_value = query_after_join2
    query_base.outerjoin.return_value = query_after_join1
    service.db.query.return_value = query_base
    
    result = service._build_shipment_summary(shipment)
    
    assert result["provider_name"] == "Provider A"
    assert result["status"] == "in_progress"


def test_build_shipment_summary_with_arrival_time(service):
    """Test _build_shipment_summary with arrival_time"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.arrival_time = datetime.now(timezone.utc)
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.scheduled_time = None
    shipment.handover_time = None
    
    leg = Mock(spec=ShipmentLeg)
    leg.leg_order = 1
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = datetime.now(timezone.utc)
    leg.arrival_time = datetime.now(timezone.utc)
    leg.scheduled_time = None
    leg.handover_time = None
    leg.leg_status = RouteStatus.SAFE
    leg.leg_quality_loss = None
    leg.ln2_refill = None
    leg.warehouse = None
    leg.doc_count_actual = None
    leg.doc_count_needed = None
    
    service.db.query.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = [
        (leg, "Carrier A", None)
    ]
    
    result = service._build_shipment_summary(shipment)
    
    assert result["status"] == "completed"
    assert result["arrival_date"] is not None


def test_build_shipment_summary_completed_with_departure_no_in_progress(service):
    """Test _build_shipment_summary with departure_time but all legs completed (not in_progress)"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.arrival_time = None
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.scheduled_time = None
    shipment.handover_time = None
    
    leg = Mock(spec=ShipmentLeg)
    leg.leg_order = 1
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = datetime.now(timezone.utc)
    leg.arrival_time = datetime.now(timezone.utc)  # Leg is completed
    leg.scheduled_time = None
    leg.handover_time = None
    leg.leg_status = RouteStatus.SAFE
    leg.leg_quality_loss = None
    leg.ln2_refill = None
    leg.warehouse = None
    leg.doc_count_actual = None
    leg.doc_count_needed = None
    
    service.db.query.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = [
        (leg, "Carrier A", None)
    ]
    
    result = service._build_shipment_summary(shipment)
    
    # When departure_time exists but no legs are in progress, status should be "completed"
    assert result["status"] == "completed"


def test_build_shipment_summary_upcoming_status(service):
    """Test _build_shipment_summary with upcoming status"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.arrival_time = None
    shipment.departure_time = None
    shipment.scheduled_time = None
    shipment.handover_time = None
    
    leg = Mock(spec=ShipmentLeg)
    leg.leg_order = 1
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = None
    leg.arrival_time = None
    leg.scheduled_time = None
    leg.handover_time = None
    leg.leg_status = RouteStatus.SAFE
    leg.leg_quality_loss = None
    leg.ln2_refill = None
    leg.warehouse = None
    leg.doc_count_actual = None
    leg.doc_count_needed = None
    
    service.db.query.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = [
        (leg, "Carrier A", None)
    ]
    
    result = service._build_shipment_summary(shipment)
    
    assert result["status"] == "upcoming"


def test_build_shipment_summary_with_handover_time(service):
    """Test _build_shipment_summary using handover_time for arrival_date"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.arrival_time = None
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.scheduled_time = None
    shipment.handover_time = datetime.now(timezone.utc)
    
    leg = Mock(spec=ShipmentLeg)
    leg.leg_order = 1
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = datetime.now(timezone.utc)
    leg.arrival_time = None
    leg.scheduled_time = None
    leg.handover_time = None
    leg.leg_status = RouteStatus.SAFE
    leg.leg_quality_loss = None
    leg.ln2_refill = None
    leg.warehouse = None
    leg.doc_count_actual = None
    leg.doc_count_needed = None
    
    service.db.query.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = [
        (leg, "Carrier A", None)
    ]
    
    result = service._build_shipment_summary(shipment)
    
    assert result["arrival_date"] is not None


def test_build_shipment_summary_with_planned_date_from_departure(service):
    """Test _build_shipment_summary using departure_time as planned_date"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.arrival_time = None
    shipment.departure_time = datetime.now(timezone.utc)
    shipment.scheduled_time = None
    shipment.handover_time = None
    
    leg = Mock(spec=ShipmentLeg)
    leg.leg_order = 1
    leg.mode_of_transport = "Air"
    leg.from_location = "Location A"
    leg.to_location = "Location B"
    leg.departure_time = datetime.now(timezone.utc)
    leg.arrival_time = None
    leg.scheduled_time = None
    leg.handover_time = None
    leg.leg_status = RouteStatus.SAFE
    leg.leg_quality_loss = None
    leg.ln2_refill = None
    leg.warehouse = None
    leg.doc_count_actual = None
    leg.doc_count_needed = None
    
    service.db.query.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = [
        (leg, "Carrier A", None)
    ]
    
    result = service._build_shipment_summary(shipment)
    
    assert result["planned_date"] is not None


def test_build_shipment_summary_exception(service):
    """Test _build_shipment_summary exception handling"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    
    service.db.query.side_effect = Exception("Database error")
    
    with pytest.raises(Exception):
        service._build_shipment_summary(shipment)


def test_get_reengineering_stage_completed(service):
    """Test _get_reengineering_stage with completed status"""
    reengineering_stage = Mock(spec=PatientStageModel)
    reengineering_stage.end_time = datetime.now(timezone.utc)
    reengineering_stage.is_active = False
    reengineering_stage.start_time = datetime.now(timezone.utc)
    
    service.db.query.return_value.filter.return_value.order_by.return_value.first.return_value = reengineering_stage
    
    result = service._get_reengineering_stage("PT-123")
    
    assert result is not None
    assert result["status"] == "completed"


def test_get_reengineering_stage_ongoing(service):
    """Test _get_reengineering_stage with ongoing status"""
    reengineering_stage = Mock(spec=PatientStageModel)
    reengineering_stage.end_time = None
    reengineering_stage.is_active = True
    reengineering_stage.start_time = datetime.now(timezone.utc)
    
    service.db.query.return_value.filter.return_value.order_by.return_value.first.return_value = reengineering_stage
    
    result = service._get_reengineering_stage("PT-123")
    
    assert result is not None
    assert result["status"] == "ongoing"


def test_get_reengineering_stage_upcoming(service):
    """Test _get_reengineering_stage with upcoming status"""
    reengineering_stage = Mock(spec=PatientStageModel)
    reengineering_stage.end_time = None
    reengineering_stage.is_active = False
    reengineering_stage.start_time = datetime.now(timezone.utc)
    
    service.db.query.return_value.filter.return_value.order_by.return_value.first.return_value = reengineering_stage
    
    result = service._get_reengineering_stage("PT-123")
    
    assert result is not None
    assert result["status"] == "upcoming"


def test_get_reengineering_stage_exception(service):
    """Test _get_reengineering_stage exception handling"""
    service.db.query.side_effect = Exception("Database error")
    
    result = service._get_reengineering_stage("PT-123")
    
    assert result is None


def test_get_control_tower_map_data_carrier_filter_excludes(service):
    """Test get_control_tower_map_data filters out carriers that don't match"""
    shipment = Mock(spec=Shipment)
    shipment.id = 1
    shipment.patient_id = "PT-123"
    shipment.source_location = "Location A"
    shipment.destination_location = "Location B"
    shipment.source_country = "US"
    shipment.destination_country = "CA"
    shipment.source_latitude = 40.7128
    shipment.source_longitude = -74.0060
    shipment.destination_latitude = 34.0522
    shipment.destination_longitude = -118.2437
    shipment.routes_status = RouteStatus.SAFE
    shipment.updated_at = datetime.now(timezone.utc)
    
    query_mock = MagicMock()
    query_mock.all.return_value = [(shipment, "Pharma Name", "Provider Name", "Carrier Name")]
    service._build_filtered_active_routes_query = MagicMock(return_value=query_mock)
    
    service._batch_get_shipment_carriers = MagicMock(return_value={1: "Other Carrier"})
    
    result = service.get_control_tower_map_data(
        pharma_id=42,
        carriers=["Test Carrier"]  # Doesn't match
    )
    
    assert result["total_routes"] == 0


def test_get_control_tower_map_data_exception(service):
    """Test get_control_tower_map_data exception handling"""
    service._build_filtered_active_routes_query = MagicMock(side_effect=Exception("Database error"))
    
    with pytest.raises(Exception):
        service.get_control_tower_map_data(pharma_id=42)


def test_get_all_carriers_no_pharma_id(service):
    """Test get_all_carriers when pharma_id is None"""
    query_mock = MagicMock()
    query_mock.filter.return_value.all.return_value = [("Carrier A",), ("Carrier B",)]
    service.db.query.return_value = query_mock
    
    result = service.get_all_carriers(pharma_id=None, active_only=True)
    
    assert len(result) == 2
    assert "Carrier A" in result
    assert "Carrier B" in result


def test_get_all_carriers_exception(service):
    """Test get_all_carriers exception handling"""
    service.db.query.side_effect = Exception("Database error")
    
    with pytest.raises(Exception):
        service.get_all_carriers(pharma_id=42)


def test_get_available_regions_exception(service):
    """Test get_available_regions exception handling"""
    service.db.query.side_effect = Exception("Database error")
    
    with pytest.raises(Exception):
        service.get_available_regions(pharma_id=42)


def test_get_document_checklist_exception(service):
    """Test get_document_checklist exception handling"""
    patient = Mock(spec=Patient)
    patient.id = "PT-123"
    patient.pharma_id = 42
    
    service.db.query.return_value.filter.return_value.first.return_value = patient
    service.db.query.return_value.join.return_value.filter.side_effect = Exception("Database error")
    
    with pytest.raises(Exception):
        service.get_document_checklist(patient_id="PT-123", pharma_id=42)


# ==========================================
# Tests for Utility Functions Coverage
# ==========================================

def test_normalize_datetime_to_utc_timezone_aware(service):
    """Test normalize_datetime_to_utc with timezone-aware datetime (lines 59, 61)"""
    from app.utils.shipment_utils import normalize_datetime_to_utc
    from datetime import timezone as tz
    
    # Test with timezone-aware datetime (not UTC)
    dt_with_tz = datetime(2024, 1, 1, 12, 0, 0, tzinfo=tz(timedelta(hours=5)))  # UTC+5
    result = normalize_datetime_to_utc(dt_with_tz)
    assert result.tzinfo == timezone.utc
    
    # Test with timezone-aware datetime (already UTC)
    dt_utc = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    result = normalize_datetime_to_utc(dt_utc)
    assert result == dt_utc
    assert result.tzinfo == timezone.utc


def test_normalize_datetime_to_utc_naive_datetime(service):
    """Test normalize_datetime_to_utc with naive datetime (line 59)"""
    from app.utils.shipment_utils import normalize_datetime_to_utc
    
    # Test with naive datetime (no timezone) - line 59
    dt_naive = datetime(2024, 1, 1, 12, 0, 0)  # No tzinfo
    result = normalize_datetime_to_utc(dt_naive)
    assert result.tzinfo == timezone.utc
    assert result.replace(tzinfo=None) == dt_naive  # Same time, just with timezone added


def test_calculate_transit_days_none(service):
    """Test calculate_transit_days with None departure_time (line 68)"""
    from app.utils.shipment_utils import calculate_transit_days
    
    result = calculate_transit_days(None)
    assert result is None


def test_parse_route_status_filter_variations(service):
    """Test parse_route_status_filter with different status variations (lines 77-84)"""
    from app.utils.shipment_utils import parse_route_status_filter
    from app.constants.enums import RouteStatus
    
    # Test "safe"
    result = parse_route_status_filter("safe")
    assert result == RouteStatus.SAFE
    
    # Test "delayed"
    result = parse_route_status_filter("delayed")
    assert result == RouteStatus.DELAYED
    
    # Test "high_risk"
    result = parse_route_status_filter("high_risk")
    assert result == RouteStatus.HIGH_RISK
    
    # Test "risk_route" (alternative)
    result = parse_route_status_filter("risk_route")
    assert result == RouteStatus.HIGH_RISK
    
    # Test invalid status
    result = parse_route_status_filter("invalid")
    assert result is None


def test_carrier_matches_filter_none_carrier(service):
    """Test carrier_matches_filter with None carrier (line 90)"""
    from app.utils.shipment_utils import carrier_matches_filter
    
    result = carrier_matches_filter(None, ["Carrier A", "Carrier B"])
    assert result is False


def test_apply_region_filter_invalid_regions(service):
    """Test apply_region_filter with invalid regions (lines 117-135)"""
    from app.utils.shipment_utils import apply_region_filter
    from sqlalchemy.orm import Query
    
    # Mock query
    query = MagicMock(spec=Query)
    query.filter = MagicMock(return_value=query)
    
    # Mock get_countries_by_regions to return empty list (invalid regions)
    with patch('app.utils.shipment_utils.get_countries_by_regions', return_value=[]):
        result = apply_region_filter(query, regions=["InvalidRegion"])
        # Should apply filter that never matches
        query.filter.assert_called_once()
    
    # Test with valid regions
    with patch('app.utils.shipment_utils.get_countries_by_regions', return_value=["US", "CA"]):
        result = apply_region_filter(query, regions=["North America"])
        # Should apply OR filter
        query.filter.assert_called()


def test_format_duration_edge_cases(service):
    """Test format_duration with edge cases (lines 140-159)"""
    from app.utils.shipment_utils import format_duration
    
    # Test with None start
    result = format_duration(None, datetime.now(timezone.utc))
    assert result is None
    
    # Test with None end
    result = format_duration(datetime.now(timezone.utc), None)
    assert result is None
    
    # Test with negative duration (end before start)
    start = datetime.now(timezone.utc)
    end = start - timedelta(hours=1)
    result = format_duration(start, end)
    assert result is None
    
    # Test with zero duration
    start = datetime.now(timezone.utc)
    result = format_duration(start, start)
    assert result is None


def test_format_duration_hours_formatting(service):
    """Test format_duration hours formatting logic (lines 152-159)"""
    from app.utils.shipment_utils import format_duration
    
    # Test normal duration formatting
    start = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    end = datetime(2024, 1, 1, 12, 30, 0, tzinfo=timezone.utc)  # 2.5 hours
    result = format_duration(start, end)
    assert result == "2.5 h"
    
    # Test duration that rounds to whole number (should strip .00)
    start = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    end = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)  # 2.0 hours
    result = format_duration(start, end)
    assert result == "2 h"  # Should strip .0
    
    # Test very small duration that might round to 0 (line 156-157)
    start = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    end = datetime(2024, 1, 1, 10, 0, 1, tzinfo=timezone.utc)  # 1 second
    result = format_duration(start, end)
    # Should format as very small hours (0.000277... hours = 1 second)
    assert result is not None
    assert result.endswith(" h")
    
    # Test duration with decimal that needs rounding (line 153)
    start = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    end = datetime(2024, 1, 1, 10, 1, 30, tzinfo=timezone.utc)  # 1.5 minutes = 0.025 hours
    result = format_duration(start, end)
    assert result is not None
    assert result.endswith(" h")
    
    # Test case where formatted_hours becomes empty after stripping (lines 156-157)
    # This happens when rounded_hours is 0.00 - after formatting "0.00", stripping '0' gives ".",
    # then stripping '.' gives empty string, which triggers the if not formatted_hours check
    # We need a duration that rounds to exactly 0.00 but has positive seconds
    start = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    # Use a duration less than 0.005 hours (18 seconds) so it rounds to 0.00 when rounded to 2 decimals
    # 1 second = 0.000277... hours, rounds to 0.00
    end = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc) + timedelta(seconds=1)
    result = format_duration(start, end)
    # Should format as "0 h" because rounded_hours=0.00 -> "0.00" -> strip '0' -> "." -> strip '.' -> "" -> "0"
    assert result == "0 h"


def test_get_start_date_from_shipment_fallbacks(service):
    """Test get_start_date_from_shipment fallback logic (lines 166-168)"""
    from app.utils.shipment_utils import get_start_date_from_shipment
    
    # Test with departure_time
    shipment1 = Mock(spec=Shipment)
    shipment1.departure_time = datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
    shipment1.updated_at = None
    result = get_start_date_from_shipment(shipment1)
    assert result == "2024-01-15"
    
    # Test fallback to updated_at
    shipment2 = Mock(spec=Shipment)
    shipment2.departure_time = None
    shipment2.updated_at = datetime(2024, 2, 20, 10, 0, 0, tzinfo=timezone.utc)
    result = get_start_date_from_shipment(shipment2)
    assert result == "2024-02-20"
    
    # Test with both None
    shipment3 = Mock(spec=Shipment)
    shipment3.departure_time = None
    shipment3.updated_at = None
    result = get_start_date_from_shipment(shipment3)
    assert result is None


def test_format_time_12hour_none(service):
    """Test format_time_12hour with None datetime (lines 171-178)"""
    from app.utils.shipment_utils import format_time_12hour
    
    result = format_time_12hour(None)
    assert result is None
    
    # Test with valid datetime
    dt = datetime(2024, 1, 1, 16, 25, 17, tzinfo=timezone.utc)
    result = format_time_12hour(dt)
    assert result == "16:25:17"


# ==========================================
# Tests for utils.py Utility Functions Coverage
# ==========================================

def test_country_to_region_success(service):
    """Test country_to_region with valid country code (lines 193-197)"""
    from app.utils.utils import country_to_region
    
    # Test with US
    result = country_to_region("US")
    assert result is not None
    assert isinstance(result, str)
    
    # Test with Germany
    result = country_to_region("DE")
    assert result is not None


def test_country_to_region_none_input(service):
    """Test country_to_region with None input (lines 190-191)"""
    from app.utils.utils import country_to_region
    
    result = country_to_region(None)
    assert result is None


def test_country_to_region_empty_string(service):
    """Test country_to_region with empty string (lines 190-191)"""
    from app.utils.utils import country_to_region
    
    result = country_to_region("")
    assert result is None


def test_country_to_region_invalid_country(service):
    """Test country_to_region with invalid country code (lines 198-200)"""
    from app.utils.utils import country_to_region
    
    # Test with invalid country code that causes exception
    with patch('app.utils.utils._cc.convert') as mock_convert:
        mock_convert.side_effect = Exception("Conversion failed")
        
        result = country_to_region("INVALID")
        assert result is None


def test_country_to_region_not_found_returns_none(service):
    """Test country_to_region when conversion returns None (line 197)"""
    from app.utils.utils import country_to_region
    
    with patch('app.utils.utils._cc.convert', return_value=None):
        result = country_to_region("XX")
        assert result is None


def test_get_countries_by_regions_empty_list(service):
    """Test get_countries_by_regions with empty list (lines 214-215)"""
    from app.utils.utils import get_countries_by_regions
    
    result = get_countries_by_regions([])
    assert result == set()


def test_get_countries_by_regions_success(service):
    """Test get_countries_by_regions with valid regions (lines 217-233)"""
    from app.utils.utils import get_countries_by_regions
    
    # Mock country_to_region to return regions
    with patch('app.utils.utils.country_to_region') as mock_country_to_region:
        # Mock the country converter data
        with patch('app.utils.utils._cc') as mock_cc:
            mock_cc.data = MagicMock()
            mock_cc.data.__getitem__.return_value = MagicMock()
            mock_cc.data.__getitem__.return_value.dropna.return_value.unique.return_value.tolist.return_value = ["US", "CA", "DE", "FR"]
            
            # Set up country_to_region to return regions
            def mock_region(country):
                if country == "US" or country == "CA":
                    return "North America"
                elif country == "DE" or country == "FR":
                    return "Europe"
                return None
            
            mock_country_to_region.side_effect = mock_region
            
            result = get_countries_by_regions(["North America"])
            assert "US" in result
            assert "CA" in result
            assert "DE" not in result


def test_get_countries_by_regions_fallback_data_table(service):
    """Test get_countries_by_regions fallback to data_table (lines 224-225)"""
    from app.utils.utils import get_countries_by_regions
    
    with patch('app.utils.utils._cc') as mock_cc:
        # Simulate no 'data' attribute, but has 'data_table'
        # Use hasattr check and setattr to avoid AttributeError
        if hasattr(mock_cc, 'data'):
            delattr(mock_cc, 'data')
        mock_cc.data_table = MagicMock()
        mock_cc.data_table.__getitem__.return_value = MagicMock()
        mock_cc.data_table.__getitem__.return_value.dropna.return_value.unique.return_value.tolist.return_value = ["US", "CA"]
        
        with patch('app.utils.utils.country_to_region') as mock_country_to_region:
            mock_country_to_region.return_value = "North America"
            
            result = get_countries_by_regions(["North America"])
            assert isinstance(result, set)


def test_get_countries_by_regions_no_data_attributes(service):
    """Test get_countries_by_regions when no data attributes exist (line 225)"""
    from app.utils.utils import get_countries_by_regions
    
    with patch('app.utils.utils._cc') as mock_cc:
        # Simulate no 'data' or 'data_table' attributes
        if hasattr(mock_cc, 'data'):
            delattr(mock_cc, 'data')
        if hasattr(mock_cc, 'data_table'):
            delattr(mock_cc, 'data_table')
        
        result = get_countries_by_regions(["North America"])
        assert result == set()


def test_get_countries_by_regions_exception_handling(service):
    """Test get_countries_by_regions exception handling (lines 234-236)"""
    from app.utils.utils import get_countries_by_regions
    
    with patch('app.utils.utils._cc') as mock_cc:
        mock_cc.data = MagicMock()
        mock_cc.data.__getitem__.side_effect = Exception("Data access error")
        
        result = get_countries_by_regions(["North America"])
        assert result == set()

