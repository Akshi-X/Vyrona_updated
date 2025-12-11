import json
import logging
from typing import Dict, List

from app.models.shipment_model import Shipment
from app.service.redis_service import get_redis
from app.utils.lane_risk_utils import LaneRiskUtils


logger = logging.getLogger(__name__)


class QualityIncidentsCalculator:
    """Handles Quality Incidents risk factor calculations."""

    def calculate(self, shipments: List[Shipment]) -> Dict:
        """
        Calculate Quality Incidents risk factor based on quality loss percentage.

        Quality Loss Percentage Ranges:
        - ≥ 85% (Green): High quality - no or minimal excursions
        - 60% – 84% (Yellow): Medium quality - moderate excursions
        - < 60% (Red): Low quality / risk - severe excursions

        Excursion Types:
        - High Excursion: KPIs exceeded acceptable range (above max threshold)
        - Low Excursion: KPIs fell below acceptable range (below min threshold)
        - Hybrid Excursion: Both high and low excursions occurred

        Based on: High/Low/Hybrid excursions, Missing logger, Missing logger data, Frequency of excursions
        """
        contributors = []

        if not shipments:
            return {
                "risk_factor": "Quality Incidents",
                "risk_contributors": ["-", "-", "-", "-"],
                "risk_scale": "N/A",
            }

        patient_ids = [shipment.patient_id for shipment in shipments]

        high_excursions = 0
        low_excursions = 0
        hybrid_excursions = 0
        missing_logger_data = 0
        total_excursions = 0
        total_readings = 0
        total_violations = 0

        try:
            r = get_redis()

            pipe = r.pipeline()
            history_keys = [f"quality_history:{patient_id}" for patient_id in patient_ids]
            for key in history_keys:
                pipe.lrange(key, 0, -1)
            histories = pipe.execute()

            kpi_parameters = ["temperature", "humidity", "agitation"]

            for idx, patient_id in enumerate(patient_ids):
                history = histories[idx] if idx < len(histories) else []

                if not history:
                    missing_logger_data += 1
                    continue

                has_high = False
                has_low = False
                patient_violations = 0
                patient_readings = 0

                for item in history:
                    try:
                        quality_data = json.loads(item)
                        patient_readings += 1
                        total_readings += 1

                        violated_params = quality_data.get("violated_parameters", [])
                        threshold_violations = quality_data.get("threshold_violations", {})

                        has_violation = bool(violated_params) or any(
                            threshold_violations.values()
                        )

                        if has_violation:
                            total_excursions += 1
                            patient_violations += 1
                            total_violations += 1

                            thresholds = quality_data.get("thresholds", {})

                            for param in kpi_parameters:
                                param_value = quality_data.get(param)
                                if param_value is None:
                                    continue

                                param_threshold = thresholds.get(param)
                                if not param_threshold:
                                    continue

                                if isinstance(param_threshold, dict):
                                    param_max = param_threshold.get("max")
                                    param_min = param_threshold.get("min")
                                else:
                                    param_max = getattr(param_threshold, "max", None)
                                    param_min = getattr(param_threshold, "min", None)

                                if param_max is not None and isinstance(
                                    param_value, (int, float)
                                ):
                                    if param_value > param_max:
                                        has_high = True
                                        logger.debug(
                                            f"High excursion detected: {param}={param_value} > max={param_max}"
                                        )

                                if param_min is not None and isinstance(
                                    param_value, (int, float)
                                ):
                                    if param_value < param_min:
                                        has_low = True
                                        logger.debug(
                                            f"Low excursion detected: {param}={param_value} < min={param_min}"
                                        )

                    except (json.JSONDecodeError, KeyError, TypeError) as e:
                        logger.debug(f"Error processing quality data item: {e}")
                        continue

                if has_high and has_low:
                    hybrid_excursions += 1
                elif has_high:
                    high_excursions += 1
                elif has_low:
                    low_excursions += 1

        except Exception as e:
            logger.warning(f"Error accessing Redis for quality data: {e}")
            missing_logger_data = len(patient_ids)

        if total_readings > 0:
            quality_loss_percentage = (total_violations / total_readings) * 100
            cumulative_quality_percentage = 100 - quality_loss_percentage
        else:
            quality_loss_percentage = 0.0
            cumulative_quality_percentage = 100.0

        logger.info(
            f"Quality Incidents Calculation - "
            f"Patients analyzed: {len(patient_ids)}, "
            f"Missing logger data: {missing_logger_data}, "
            f"Total readings: {total_readings}, Total violations: {total_violations}, "
            f"Quality loss: {quality_loss_percentage:.2f}%, "
            f"Cumulative quality: {cumulative_quality_percentage:.2f}%, "
            f"High excursions: {high_excursions}, Low excursions: {low_excursions}, Hybrid excursions: {hybrid_excursions}"
        )

        excursion_parts = []
        excursion_parts.append(f"High: {high_excursions}")
        excursion_parts.append(f"Low: {low_excursions}")
        excursion_parts.append(f"Hybrid: {hybrid_excursions}")

        contributors.append(f"High/low/Hybrid excursions: {', '.join(excursion_parts)}")
        contributors.append("-")
        contributors.append(f"Missing logger data: {missing_logger_data}")
        contributors.append(f"Frequency of excursions: {total_excursions}")

        if cumulative_quality_percentage >= 85:
            risk_score = 4.5
        elif cumulative_quality_percentage >= 60:
            if cumulative_quality_percentage >= 75:
                risk_score = 3.5
            else:
                risk_score = 2.5
        else:
            if cumulative_quality_percentage >= 40:
                risk_score = 1.5
            else:
                risk_score = 0.5

        classification = LaneRiskUtils.score_to_classification(risk_score)
        risk_scale = f"{risk_score:.1f} ({classification})"

        return {
            "risk_factor": "Quality Incidents",
            "risk_contributors": contributors[:4],
            "risk_scale": risk_scale,
        }

