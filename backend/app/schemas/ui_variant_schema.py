"""
UI Variant Schemas

Pydantic schemas for UI route variant API request/response validation.

These schemas handle:
- Public API responses (limited fields for security)
- Admin API responses (full metadata for health checks)
- Create/Update requests (admin operations)

SECURITY CONSIDERATIONS:
- Public responses only include route_path and component_key
- Sensitive metadata (hospital_id) only in admin responses
- No sensitive information should be exposed in component_key naming
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class UIVariantBase(BaseModel):
    """Base schema with common fields."""

    route_path: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Route path pattern (e.g., '/dashboard', '/track/:patientId')",
        examples=["/dashboard", "/track/:patientId", "/control-tower"],
    )
    component_key: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Component key in frontend registry (e.g., 'DashboardHospital2')",
        examples=["DashboardHospital2", "TrackHospital2", "ControlTowerHospital5"],
    )

    @field_validator("route_path")
    @classmethod
    def validate_route_path(cls, v: str) -> str:
        """Ensure route_path starts with / and has valid format."""
        v = v.strip()
        if not v.startswith("/"):
            raise ValueError("route_path must start with '/'")
        if "//" in v:
            raise ValueError("route_path cannot contain double slashes")
        if len(v) > 1 and v.endswith("/"):
            raise ValueError("route_path should not end with '/' (except root)")
        return v

    @field_validator("component_key")
    @classmethod
    def validate_component_key(cls, v: str) -> str:
        """Ensure component_key follows naming convention."""
        v = v.strip()
        if not v[0].isupper():
            raise ValueError(
                "component_key should be PascalCase (start with uppercase)"
            )
        return v


class UIVariantPublicResponse(BaseModel):
    """
    Public API response schema.

    This is the response sent to regular authenticated users.
    Only includes the minimum information needed for the frontend
    to render the correct component.

    SECURITY: Does not expose hospital_id or other metadata.
    """

    route_path: str = Field(..., description="Route path pattern")
    component_key: str = Field(..., description="Component key in frontend registry")

    class Config:
        from_attributes = True


class UIVariantAdminResponse(BaseModel):
    """
    Admin API response schema with full metadata.

    Used for:
    - Health check endpoints (development/staging only)
    - Admin management interfaces
    - Debugging and auditing

    SECURITY: This endpoint should be restricted to admin users
    and disabled in production for regular users.
    """

    id: int = Field(..., description="Variant ID")
    hospital_id: int = Field(..., description="Hospital ID this variant belongs to")
    route_path: str = Field(..., description="Route path pattern")
    component_key: str = Field(..., description="Component key in frontend registry")
    is_active: bool = Field(..., description="Whether variant is active")
    description: Optional[str] = Field(None, description="Description of this variant")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")

    class Config:
        from_attributes = True


class UIVariantCreate(UIVariantBase):
    """
    Schema for creating a new UI variant.

    Used by admin endpoints to add new variant mappings.
    """

    hospital_id: int = Field(..., description="Hospital ID this variant belongs to")
    is_active: bool = Field(True, description="Whether variant is active")
    description: Optional[str] = Field(
        None, max_length=1000, description="Description of this variant"
    )


class UIVariantUpdate(BaseModel):
    """
    Schema for updating an existing UI variant.

    All fields are optional - only provided fields will be updated.
    """

    route_path: Optional[str] = Field(
        None, min_length=1, max_length=255, description="Route path pattern"
    )
    component_key: Optional[str] = Field(
        None, min_length=1, max_length=255, description="Component key"
    )
    is_active: Optional[bool] = Field(None, description="Whether variant is active")
    description: Optional[str] = Field(
        None, max_length=1000, description="Description of this variant"
    )

    @field_validator("route_path")
    @classmethod
    def validate_route_path(cls, v: Optional[str]) -> Optional[str]:
        """Validate route_path if provided."""
        if v is None:
            return v
        v = v.strip()
        if not v.startswith("/"):
            raise ValueError("route_path must start with '/'")
        if "//" in v:
            raise ValueError("route_path cannot contain double slashes")
        if len(v) > 1 and v.endswith("/"):
            raise ValueError("route_path should not end with '/'")
        return v


class UIVariantHealthCheckResponse(BaseModel):
    """
    Response schema for health check endpoint.

    Provides all variant mappings across all hospitals for
    validating that database and code registry are in sync.

    SECURITY: This endpoint should ONLY be available in
    development/staging environments, never in production.
    """

    variants: List[UIVariantAdminResponse] = Field(
        ..., description="All UI variants in the system"
    )
    total_count: int = Field(..., description="Total number of variants")
    active_count: int = Field(..., description="Number of active variants")
    hospitals_with_variants: int = Field(
        ..., description="Number of hospitals with custom variants"
    )


class UIVariantCreateResponse(BaseModel):
    """Response schema for successful variant creation."""

    message: str = Field(..., description="Success message")
    variant: UIVariantAdminResponse = Field(..., description="Created variant details")


class UIVariantUpdateResponse(BaseModel):
    """Response schema for successful variant update."""

    message: str = Field(..., description="Success message")
    variant: UIVariantAdminResponse = Field(..., description="Updated variant details")


class UIVariantDeleteResponse(BaseModel):
    """Response schema for successful variant deletion."""

    message: str = Field(..., description="Success message")
    deleted_id: int = Field(..., description="ID of deleted variant")
