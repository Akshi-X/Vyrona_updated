# IVF Models package
from .hospital_model import Hospital
from .hospital_branch_model import HospitalBranch
from .tank_model import Tank
from .incubator_model import Incubator
from .refrigerator_model import Refrigerator
from .refrigerator_device_model import RefrigeratorDevice
from .refrigerator_raw_data_model import RefrigeratorRawData
from .canister_ln2_log_model import CanisterLn2Log
from .ivf_telemetry_data_model import IVFTelemetryData
from .ivf_quality_log_model import IVFQualityLog
from .ivf_geolocation_model import IVFGeolocation
from .ivf_shipment_model import IVFShipment
from .patient_crylock_info_model import PatientCrylockInfo
from .critical_alert_model import CriticalAlert, AlertType, AlertSource, AlertTriggeredBy, AlertSeverity, AlertStatus
from .reservoir_model import Reservoir
from .reservoir_log_model import ReservoirLog
from .ln2_refill_detection_model import Ln2RefillDetection
from .ivf_cycle_model import IvfCycle
from .ivf_cycle_log_model import IvfCycleLog
from .ivf_oocyte_grade_model import IvfOocyteGrade
from .ivf_oocyte_image_model import IvfOocyteImage
from .ivf_cycle_report_model import IvfCycleReport
from .ml_job_model import MlJob

# Register UIRouteVariant so Hospital.ui_variants relationship resolves (same Base registry).
# Without this, any code that touches Hospital (e.g. CriticalAlert -> ... -> Hospital) fails with
# InvalidRequestError: 'UIRouteVariant' failed to locate a name.
from app.models.ui_route_variant_model import UIRouteVariant  # noqa: F401

