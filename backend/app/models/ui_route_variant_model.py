"""
UI Route Variant Model

Stores route-to-component mappings per hospital/organization.
When a hospital has a custom UI variant for a route, it's stored here.

This enables multi-tenant UI customization where different hospitals
can have different UI components for the same routes.

SECURITY CONSIDERATIONS:
- Hospital ID must always be validated against the authenticated user
- Never allow client-provided hospital_id to determine variant access
- Component keys should not expose sensitive information

USAGE:
- Add mappings via admin panel or database migrations
- Frontend fetches mappings on login
- VariantRoute component uses these mappings to render custom UIs
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.config.database import Base


class UIRouteVariant(Base):
    """
    Database model for UI route variants.

    Each record maps a route path to a custom component for a specific hospital.

    Attributes:
        id: Primary key
        hospital_id: Foreign key to hospitals table
        route_path: The route path pattern (e.g., "/dashboard", "/track/:patientId")
        component_key: The key used to look up the component in the frontend registry
        is_active: Whether this variant is currently active
        description: Optional description of why this variant exists
        created_at: When the variant was created
        updated_at: When the variant was last updated
    """

    __tablename__ = "ui_route_variants"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Hospital association
    hospital_id = Column(
        Integer,
        ForeignKey("hospitals.hospital_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="The hospital this variant belongs to",
    )

    # Route and component mapping
    route_path = Column(
        String(255),
        nullable=False,
        comment="Route path pattern (e.g., '/dashboard', '/track/:patientId')",
    )
    component_key = Column(
        String(255),
        nullable=False,
        comment="Key to look up component in frontend registry (e.g., 'DashboardHospital2')",
    )

    # Status
    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
        comment="Whether this variant is currently active",
    )

    # Metadata for maintenance
    description = Column(
        Text,
        nullable=True,
        comment="Description of why this variant exists and what it does",
    )

    # Audit fields
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="When this variant was created",
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="When this variant was last updated",
    )

    # Relationships
    hospital = relationship("Hospital", back_populates="ui_variants")

    # Constraints
    __table_args__ = (
        # Each hospital can only have one variant per route
        UniqueConstraint("hospital_id", "route_path", name="uq_hospital_route_variant"),
        # Index for faster lookups by hospital
        Index("ix_ui_route_variants_hospital_active", "hospital_id", "is_active"),
        # Index for health check queries
        Index("ix_ui_route_variants_component_key", "component_key"),
    )

    def __repr__(self) -> str:
        return (
            f"<UIRouteVariant(id={self.id}, hospital_id={self.hospital_id}, "
            f"route='{self.route_path}', component='{self.component_key}', "
            f"active={self.is_active})>"
        )

    def to_dict(self) -> dict:
        """Convert model to dictionary for admin responses."""
        return {
            "id": self.id,
            "hospital_id": self.hospital_id,
            "route_path": self.route_path,
            "component_key": self.component_key,
            "is_active": self.is_active,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_public_dict(self) -> dict:
        """
        Convert model to dictionary for public API responses.
        Excludes sensitive/internal fields.
        """
        return {
            "route_path": self.route_path,
            "component_key": self.component_key,
        }
