"""
Script to populate shipment_leg_document table with data from existing shipment_leg records.
Creates document records based on doc_count_needed for each shipment leg.
"""

from sqlalchemy.orm import Session

from app.config.database import get_db, init_db
from app.models.shipment_leg_model import ShipmentLeg
from app.models.shipment_leg_document_model import ShipmentLegDocument


# Standard document names for shipment legs
STANDARD_DOCUMENTS = [
    "Bill of Lading",
    "Customs Declaration",
    "Insurance Certificate",
    "Certificate of Origin",
    "Packing List",
    "Commercial Invoice",
    "Quality Control Report",
    "Temperature Log",
    "Chain of Custody",
    "Export License",
    "Import Permit",
    "Phytosanitary Certificate",
    "Health Certificate",
    "Transport Permit",
    "Warehouse Receipt"
]


def get_document_name(index: int, total_needed: int) -> str:
    """
    Get document name based on index.
    Uses standard documents in order, cycling if needed.
    """
    if index < len(STANDARD_DOCUMENTS):
        return STANDARD_DOCUMENTS[index]
    else:
        # If more documents needed than standard list, add numbered suffix
        base_doc = STANDARD_DOCUMENTS[index % len(STANDARD_DOCUMENTS)]
        return f"{base_doc} ({index // len(STANDARD_DOCUMENTS) + 1})"


def populate_shipment_leg_documents(db: Session):
    """Main function to populate shipment leg documents"""
    print("Populating shipment leg documents...\n")
    
    # Get all existing shipment legs
    shipment_legs = db.query(ShipmentLeg).all()
    print(f"Found {len(shipment_legs)} shipment legs")
    
    if not shipment_legs:
        print("No shipment legs found. Please populate shipment legs first.")
        return
    
    documents_created = 0
    documents_skipped = 0
    
    # Process each shipment leg
    print(f"\nProcessing {len(shipment_legs)} shipment legs...\n")
    
    for leg in shipment_legs:
        # Check if documents already exist for this leg
        existing_docs = db.query(ShipmentLegDocument).filter(
            ShipmentLegDocument.shipment_leg_id == leg.id
        ).count()
        
        if existing_docs > 0:
            print(f"  Leg {leg.id} already has {existing_docs} documents, skipping")
            documents_skipped += existing_docs
            continue
        
        # Get doc_count_needed (default to 0 if None)
        doc_count_needed = leg.doc_count_needed or 0
        doc_count_actual = leg.doc_count_actual or 0
        
        if doc_count_needed == 0:
            print(f"  Leg {leg.id} ({leg.from_location} -> {leg.to_location}): No documents needed (doc_count_needed=0), skipping")
            continue
        
        # Determine how many documents are missing
        # If doc_count_actual is None or less than doc_count_needed, mark documents as missing
        missing_count = max(0, doc_count_needed - doc_count_actual)
        
        print(f"  Leg {leg.id} ({leg.from_location} -> {leg.to_location}):")
        print(f"    Needed: {doc_count_needed}, Actual: {doc_count_actual}, Missing: {missing_count}")
        
        # Create document records
        for i in range(doc_count_needed):
            document_name = get_document_name(i, doc_count_needed)
            
            # Determine if this document is missing
            # If we've created fewer documents than actual count, mark as not missing
            # Otherwise, mark as missing
            is_missing = i >= doc_count_actual
            
            document = ShipmentLegDocument(
                shipment_leg_id=leg.id,
                document_name=document_name,
                is_missing=is_missing
            )
            
            db.add(document)
            documents_created += 1
            
            status = "MISSING" if is_missing else "PRESENT"
            print(f"      - {document_name} [{status}]")
        
        print()
    
    # Commit all changes
    db.commit()
    
    print(f"\n✓ Created {documents_created} document records")
    if documents_skipped > 0:
        print(f"  Skipped {documents_skipped} existing documents")
    
    # Print summary statistics
    total_docs = db.query(ShipmentLegDocument).count()
    missing_docs = db.query(ShipmentLegDocument).filter(
        ShipmentLegDocument.is_missing == True
    ).count()
    present_docs = total_docs - missing_docs
    
    print(f"\nSummary:")
    print(f"  Total documents: {total_docs}")
    print(f"  Present: {present_docs}")
    print(f"  Missing: {missing_docs}")


def main():
    """Main function"""
    init_db()
    db_gen = get_db()
    db = next(db_gen)
    
    try:
        populate_shipment_leg_documents(db)
        print("\n✓ Shipment leg documents population completed successfully!")
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

