import logging
import sys
import os

# Add backend directory to path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config.database import SessionLocal
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.incubator_model import Incubator
from app.models.IVF.refrigerator_model import Refrigerator

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

def run():
    db = SessionLocal()
    try:
        # Get ARC Fertility hospital
        hospital = db.query(Hospital).filter(Hospital.hospital_name == "ARC Fertility Hospitals").first()
        if not hospital:
            logger.error("Hospital not found. Please run populate_db.py first.")
            return

        branch = db.query(HospitalBranch).filter(HospitalBranch.hospital_id == hospital.hospital_id, HospitalBranch.branch_name == "Chennai Main").first()
        if not branch:
            branch = db.query(HospitalBranch).filter(HospitalBranch.hospital_id == hospital.hospital_id).first()

        if not branch:
            logger.error("Branch not found.")
            return

        logger.info(f"Seeding devices for {hospital.hospital_name} - {branch.branch_name}")

        # Seed Incubators
        incubators = [
            {"incubator_code": "INC-001", "type": "Multi-Chamber", "chamber_r": 2, "chamber_c": 3},
            {"incubator_code": "INC-002", "type": "Single-Chamber", "chamber_r": 1, "chamber_c": 1},
        ]
        
        for data in incubators:
            exists = db.query(Incubator).filter_by(incubator_code=data["incubator_code"], branch_id=branch.branch_id).first()
            if not exists:
                inc = Incubator(
                    hospital_id=hospital.hospital_id,
                    branch_id=branch.branch_id,
                    incubator_code=data["incubator_code"],
                    type=data["type"],
                    chamber_r=data["chamber_r"],
                    chamber_c=data["chamber_c"]
                )
                db.add(inc)
                logger.info(f"  Added Incubator: {data['incubator_code']}")

        # Seed Refrigerators
        refrigerators = [
            {"refrigerator_code": "REF-001", "type": "Standard", "zone_count": 1},
            {"refrigerator_code": "REF-002", "type": "Ultra-Low", "zone_count": 2},
        ]
        
        for data in refrigerators:
            exists = db.query(Refrigerator).filter_by(refrigerator_code=data["refrigerator_code"], branch_id=branch.branch_id).first()
            if not exists:
                ref = Refrigerator(
                    hospital_id=hospital.hospital_id,
                    branch_id=branch.branch_id,
                    refrigerator_code=data["refrigerator_code"],
                    type=data["type"],
                    zone_count=data["zone_count"]
                )
                db.add(ref)
                logger.info(f"  Added Refrigerator: {data['refrigerator_code']}")

        db.commit()
        logger.info("="*50)
        logger.info("✅ Successfully seeded Refrigerators and Incubators!")
        logger.info("="*50)
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding devices: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run()
