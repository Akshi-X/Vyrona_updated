"""
Database seed script.
Populates the database with sample data so Dashboard, Database, Track, Control Tower,
Tasks, Support (Feedback), and Chat pages are not empty.

Run after init_db (pharma companies, pharma admins, MyGrape admin must exist).
Idempotent: skips seeding if patients already exist (assumes DB already seeded).
"""

import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from app.config.database import SessionLocal
from app.models import (
    Pharma,
    User,
    Provider,
    Carrier,
    Patient,
    PatientStage,
    Shipment,
    ShipmentLeg,
    Therapy,
    ShipmentLegDocument,
    Tasks,
    Feedback,
    Comment,
    ChatMessage,
)
from app.utils.patient_utils import generate_patient_id
from app.utils.utils import generate_user_id
from app.constants.enums import (
    PatientStage as PatientStageEnum,
    RouteStatus,
    FeedbackDepartment,
    FeedbackType,
    FeedbackPriority,
    AffectedModule,
    FeedbackStatus,
    TaskPriority,
    TaskStatus,
)

logger = logging.getLogger(__name__)


def _get_first_pharma_and_admin(db: Session):
    """Return (first pharma, first pharma admin user) or (None, None)."""
    pharma = db.query(Pharma).first()
    if not pharma:
        return None, None
    admin = (
        db.query(User)
        .filter(User.pharma_id == pharma.id, User.role == "Pharma_admin", User.status.is_(True))
        .first()
    )
    if not admin:
        admin = db.query(User).filter(User.role == "Mygrape_admin").first()
    return pharma, admin


def _ensure_providers(db: Session, pharma_id: int):
    """Create providers for pharma if none exist. Returns list of provider ids."""
    existing = db.query(Provider).filter(Provider.pharma_id == pharma_id).all()
    if existing:
        return [p.id for p in existing]
    providers = [
        Provider(id="PROV-001", name="DHL Supply Chain", location="Frankfurt", pharma_id=pharma_id),
        Provider(id="PROV-002", name="XPO Healthcare Logistics", location="London", pharma_id=pharma_id),
    ]
    for p in providers:
        db.add(p)
    db.commit()
    return [p.id for p in providers]


def _ensure_carriers(db: Session):
    """Create carriers if none exist. Returns list of carrier ids."""
    existing = db.query(Carrier).all()
    if existing:
        return [c.id for c in existing]
    carriers = [
        Carrier(name="FedEx Medical", carrier_type="Air"),
        Carrier(name="Maersk Healthcare", carrier_type="Ocean"),
    ]
    for c in carriers:
        db.add(c)
    db.commit()
    return [c.id for c in carriers]


def _ensure_patients(db: Session, pharma_id: int, provider_id: str, count: int = 5):
    """Create sample patients. Returns list of (patient_id, patient)."""
    existing = db.query(Patient).filter(Patient.pharma_id == pharma_id).limit(1).first()
    if existing:
        return [(p.id, p) for p in db.query(Patient).filter(Patient.pharma_id == pharma_id).all()]
    patients = []
    names = [
        ("Emma", "Wilson", "Oncology"),
        ("James", "Brown", "Cell Therapy"),
        ("Olivia", "Davis", "Gene Therapy"),
        ("William", "Miller", "Clinical Trial"),
        ("Sophia", "Garcia", "Oncology"),
    ]
    # Get first ID so we can generate unique IDs in one transaction (generate_patient_id only sees committed rows)
    first_id = generate_patient_id(db)
    prefix = first_id[:-3]  # e.g. "PT130226-"
    start_seq = int(first_id[-3:])
    for i, (first, last, cond) in enumerate(names[:count]):
        pid = f"{prefix}{start_seq + i:03d}"
        p = Patient(
            id=pid,
            patient_name=f"{first} {last}",
            condition=cond,
            insurance_provider="Global Health Inc",
            insurance_type="Commercial",
            hospital_name="City Medical Center",
            location="New York",
            provider_id=provider_id,
            pharma_id=pharma_id,
            created_by="seed",
        )
        db.add(p)
        patients.append((pid, p))
    db.commit()
    for _, p in patients:
        db.refresh(p)
    return patients


def _ensure_patient_stages(db: Session, patient_ids: list):
    """Add stage history for each patient (Scheduled -> Transportation -> Reinfusion)."""
    for patient_id in patient_ids:
        existing = db.query(PatientStage).filter(PatientStage.patient_id == patient_id).first()
        if existing:
            continue
        stages_config = [
            (PatientStageEnum.SCHEDULED, True, None),
            (PatientStageEnum.TRANSPORTATION, False, True),
            (PatientStageEnum.REINFUSION, False, True),
        ]
        for stage, is_active, is_success in stages_config:
            s = PatientStage(
                patient_id=patient_id,
                stage=stage,
                is_active=is_active,
                is_success=is_success,
                created_by="seed",
            )
            db.add(s)
    db.commit()


def _ensure_shipments(
    db: Session,
    patient_ids: list,
    pharma_id: int,
    provider_id: str,
    carrier_id: int,
):
    """Create 2–3 shipments with legs, therapy, and documents."""
    existing = db.query(Shipment).filter(Shipment.pharma_id == pharma_id).first()
    if existing:
        return
    now = datetime.now(timezone.utc)
    dep = now - timedelta(days=2)
    arr = now - timedelta(days=1)
    for i, pid in enumerate(patient_ids[:3]):
        ship = Shipment(
            source_location="Boston Manufacturing",
            destination_location="Berlin Treatment Center",
            source_country="US",
            destination_country="DE",
            source_latitude=42.36,
            source_longitude=-71.06,
            destination_latitude=52.52,
            destination_longitude=13.40,
            departure_time=dep,
            arrival_time=arr,
            routes_status=RouteStatus.SAFE,
            transportation_success=True,
            patient_id=pid,
            pharma_id=pharma_id,
            provider_id=provider_id,
            carrier_id=carrier_id,
            created_by="seed",
        )
        db.add(ship)
        db.flush()
        leg = ShipmentLeg(
            shipment_id=ship.id,
            provider_id=provider_id,
            carrier_id=carrier_id,
            leg_order=1,
            mode_of_transport="Air",
            from_location="Boston",
            to_location="Berlin",
            flight_code="LH402",
            latitude=52.52,
            longitude=13.40,
            departure_time=dep,
            arrival_time=arr,
            leg_quality_loss=0.5,
            leg_status=RouteStatus.SAFE,
            leg_success=True,
            created_by="seed",
        )
        db.add(leg)
        db.flush()
        therapy = Therapy(
            shipment_leg_id=leg.id,
            therapy_name="Cell Therapy",
            temperature_min=2.0,
            temperature_max=8.0,
            humidity_min=30.0,
            humidity_max=60.0,
            created_by="seed",
        )
        db.add(therapy)
        doc = ShipmentLegDocument(
            shipment_leg_id=leg.id,
            document_name="Customs clearance",
            is_missing=False,
        )
        db.add(doc)
    db.commit()


def _ensure_tasks(db: Session, assignee_id: str, created_by_id: str, patient_ids: list):
    """Create sample tasks."""
    existing = db.query(Tasks).first()
    if existing:
        return
    tasks_data = [
        ("Verify shipment docs", "Ensure all customs docs are ready", TaskPriority.HIGH, TaskStatus.IN_PROGRESS),
        ("Temperature check", "Confirm cold chain compliance at handover", TaskPriority.MEDIUM, TaskStatus.NOT_STARTED),
        ("Patient consent", "Obtain final consent for reinfusion", TaskPriority.LOW, TaskStatus.DONE),
    ]
    for i, (name, desc, pri, status) in enumerate(tasks_data):
        t = Tasks(
            task_name=name,
            description=desc,
            assignee_id=assignee_id,
            created_by_id=created_by_id,
            due_date=datetime.now(timezone.utc) + timedelta(days=7),
            priority=pri,
            status=status,
            patient_id=patient_ids[i % len(patient_ids)] if patient_ids else None,
        )
        db.add(t)
    db.commit()


def _ensure_feedback_and_comments(db: Session, submitted_by: str):
    """Create 2 feedback tickets with comments."""
    existing = db.query(Feedback).limit(1).first()
    if existing:
        return
    y, m = datetime.now(timezone.utc).year, datetime.now(timezone.utc).month
    tickets = [
        {
            "ticket_id": f"TK-{y}-{m:02d}-001",
            "department": FeedbackDepartment.LOGISTICS,
            "feedback_type": FeedbackType.FEATURE_REQUEST,
            "subject": "Improve shipment ETA accuracy",
            "description": "We need more accurate ETAs for the control tower map.",
            "priority": FeedbackPriority.HIGH,
            "affected_modules": AffectedModule.CONTROL_TOWER.value,
            "status": FeedbackStatus.OPEN,
        },
        {
            "ticket_id": f"TK-{y}-{m:02d}-002",
            "department": FeedbackDepartment.QUALITY_ASSURANCE,
            "feedback_type": FeedbackType.BUG,
            "subject": "Quality loss % not updating",
            "description": "Quality loss percentage stays at 0 on leg details.",
            "priority": FeedbackPriority.MEDIUM,
            "affected_modules": AffectedModule.TRACK_SHIPMENT.value,
            "status": FeedbackStatus.IN_PROGRESS,
        },
    ]
    for t in tickets:
        ticket_id = t.pop("ticket_id")
        fb = Feedback(ticket_id=ticket_id, submitted_by=submitted_by, **t)
        db.add(fb)
        db.flush()
        com = Comment(
            ticket_id=ticket_id,
            comment="We will look into this shortly.",
            commented_by=submitted_by,
        )
        db.add(com)
    db.commit()


def _ensure_chat_messages(db: Session, sender_id: str, patient_id: str):
    """Create 2 chat messages for a patient."""
    existing = db.query(ChatMessage).filter(
        ChatMessage.patient_id == patient_id,
        ChatMessage.sender_id == sender_id,
    ).first()
    if existing:
        return
    for msg in [
        "Patient consent received. Proceeding with shipment.",
        "Handover completed at Berlin. All checks passed.",
    ]:
        m = ChatMessage(
            message_content=msg,
            patient_id=patient_id,
            sender_id=sender_id,
            created_by=sender_id,
        )
        db.add(m)
    db.commit()


def run_seed():
    """
    Seed the database with sample data so all main pages have content.
    Idempotent: if patients already exist for any pharma, skip seeding.
    """
    db = SessionLocal()
    try:
        pharma, admin = _get_first_pharma_and_admin(db)
        if not pharma or not admin:
            logger.warning("Seed skipped: no pharma or no admin user. Run init_db first.")
            return

        # Skip if we already have patients (assume already seeded)
        if db.query(Patient).filter(Patient.pharma_id == pharma.id).first():
            logger.info("Seed skipped: patients already exist (DB likely already seeded).")
            return

        logger.info("Seeding database with sample data...")

        provider_ids = _ensure_providers(db, pharma.id)
        provider_id = provider_ids[0]

        _ensure_carriers(db)
        carriers = db.query(Carrier).all()
        carrier_id = carriers[0].id if carriers else None

        patients = _ensure_patients(db, pharma.id, provider_id, count=5)
        patient_ids = [pid for pid, _ in patients]

        _ensure_patient_stages(db, patient_ids)
        _ensure_shipments(db, patient_ids, pharma.id, provider_id, carrier_id)
        _ensure_tasks(db, admin.user_id, admin.user_id, patient_ids)
        _ensure_feedback_and_comments(db, admin.user_id)
        if patient_ids:
            _ensure_chat_messages(db, admin.user_id, patient_ids[0])

        logger.info("Seed completed: patients, shipments, tasks, feedback, chat messages created.")
    except Exception as e:
        db.rollback()
        logger.error("Seed failed: %s", e, exc_info=True)
        raise
    finally:
        db.close()
