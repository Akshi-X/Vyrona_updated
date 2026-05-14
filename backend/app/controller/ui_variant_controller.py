"""
UI Variant Controller

Provides API endpoints for managing UI route variants.
Enables multi-tenant UI customization where different hospitals
can have different UI components for the same routes.

ENDPOINTS:
- GET /api/ui-variants/ - Get variants for current user's hospital (authenticated)
- GET /api/ui-variants/health-check - Get all variants for health check (admin, non-prod only)
- POST /api/ui-variants/ - Create a new variant (admin only)
- PUT /api/ui-variants/{variant_id} - Update a variant (admin only)
- DELETE /api/ui-variants/{variant_id} - Delete a variant (admin only)

SECURITY CONSIDERATIONS:
- Hospital ID is ALWAYS derived from the authenticated user's token
- Never trust client-provided hospital_id for access control
- Health check endpoint is disabled in production
- Variant information is not exposed in error messages
"""

import logging
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth_dependencies import get_current_user
from app.models.IVF.hospital_model import Hospital
from app.models.ui_route_variant_model import UIRouteVariant
from app.models.user_model import User
from app.schemas.ui_variant_schema import (
    UIVariantAdminResponse,
    UIVariantCreate,
    UIVariantCreateResponse,
    UIVariantDeleteResponse,
    UIVariantHealthCheckResponse,
    UIVariantPublicResponse,
    UIVariantUpdate,
    UIVariantUpdateResponse,
)

# Configure logger
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ui-variants", tags=["UI Variants"])


def get_user_hospital_id(request: Request, db: Session) -> int | None:
    """
    Extract hospital_id from the authenticated user.

    SECURITY: This is the ONLY way to determine which hospital's
    variants a user should see. Never trust client-provided values.

    Uses request.state.current_user and request.state.hospital_id
    (set by TokenValidationMiddleware).
    """
    try:
        # Prefer hospital_id from token (set by middleware for hospital users)
        hospital_id = getattr(request.state, "hospital_id", None)
        if hospital_id is not None:
            return int(hospital_id)

        # Fallback: get from current_user (set by TokenValidationMiddleware)
        user = getattr(request.state, "current_user", None)
        if not user:
            return None

        if user.hospital_id:
            return user.hospital_id

        if user.branch_id:
            from app.models.IVF.hospital_branch_model import HospitalBranch

            branch = (
                db.query(HospitalBranch)
                .filter(HospitalBranch.branch_id == user.branch_id)
                .first()
            )
            if branch:
                return branch.hospital_id

        return None
    except Exception as e:
        logger.warning(f"Error getting user hospital_id: {e}")
        return None


def is_admin_user(request: Request, db: Session) -> bool:
    """
    Check if the current user has admin privileges.

    Uses request.state.current_user (set by TokenValidationMiddleware).
    """
    try:
        user = getattr(request.state, "current_user", None)
        if not user:
            return False
        admin_roles = ["Admin", "admin", "mygrape_admin", "pharma_admin"]
        return user.role in admin_roles
    except Exception:
        return False


def is_production() -> bool:
    """Check if running in production environment."""
    env = os.getenv("ENVIRONMENT", "development").lower()
    return env in ["production", "prod"]


# =============================================================================
# PUBLIC ENDPOINTS (Authenticated users)
# =============================================================================


@router.get("/", response_model=List[UIVariantPublicResponse])
def get_variants_for_current_hospital(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get all active UI variant mappings for the current user's hospital.

    This endpoint is called by the frontend on app initialization to determine
    which custom components to render for the authenticated user.

    SECURITY:
    - Hospital ID is derived from the authenticated user's token
    - Only returns variants for the user's own hospital
    - Returns empty list if user has no hospital association

    Returns:
        List of variant mappings (route_path, component_key)
    """
    try:
        # SECURITY: Get hospital_id from authenticated user, NOT from request params
        hospital_id = get_user_hospital_id(request, db)

        if not hospital_id:
            # User is not associated with a hospital - no custom variants
            logger.debug("User has no hospital association, returning empty variants")
            return []

        # Query active variants for this hospital only
        variants = (
            db.query(UIRouteVariant)
            .filter(
                UIRouteVariant.hospital_id == hospital_id,
                UIRouteVariant.is_active == True,
            )
            .all()
        )

        logger.debug(f"Found {len(variants)} variants for hospital {hospital_id}")

        # Return only public fields (route_path, component_key)
        return [
            UIVariantPublicResponse(
                route_path=v.route_path,
                component_key=v.component_key,
            )
            for v in variants
        ]

    except HTTPException:
        raise
    except Exception as e:
        # SECURITY: Don't expose internal error details
        logger.error(f"Error fetching UI variants: {e}")
        # Return empty list instead of error to prevent breaking the frontend
        return []


# =============================================================================
# HEALTH CHECK ENDPOINT (Development/Staging only)
# =============================================================================


@router.get("/health-check", response_model=UIVariantHealthCheckResponse)
def get_all_variants_for_health_check(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get all UI variants across all hospitals for health check validation.

    This endpoint is used by the frontend health check utility to verify
    that database variants match the code registry.

    SECURITY:
    - Disabled in production environment
    - Requires admin privileges
    - Logs access for auditing

    Returns:
        All variants with full metadata for health check validation
    """
    # SECURITY: Block in production
    if is_production():
        logger.warning("Health check endpoint accessed in production - blocked")
        raise HTTPException(
            status_code=403,
            detail="Health check endpoint is not available in production",
        )

    # SECURITY: Require admin privileges
    if not is_admin_user(request, db):
        logger.warning("Non-admin user attempted to access health check endpoint")
        raise HTTPException(
            status_code=403,
            detail="Admin privileges required for health check endpoint",
        )

    try:
        # Get all variants (active and inactive)
        variants = db.query(UIRouteVariant).all()

        # Calculate statistics
        active_count = sum(1 for v in variants if v.is_active)
        hospital_ids = set(v.hospital_id for v in variants)

        logger.info(
            f"Health check: Found {len(variants)} variants across {len(hospital_ids)} hospitals"
        )

        return UIVariantHealthCheckResponse(
            variants=[
                UIVariantAdminResponse(
                    id=v.id,
                    hospital_id=v.hospital_id,
                    route_path=v.route_path,
                    component_key=v.component_key,
                    is_active=v.is_active,
                    description=v.description,
                    created_at=v.created_at,
                    updated_at=v.updated_at,
                )
                for v in variants
            ],
            total_count=len(variants),
            active_count=active_count,
            hospitals_with_variants=len(hospital_ids),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in health check endpoint: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error performing health check",
        )


# =============================================================================
# ADMIN ENDPOINTS (Variant management)
# =============================================================================


@router.post("/", response_model=UIVariantCreateResponse, status_code=201)
def create_variant(
    variant_data: UIVariantCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new UI variant mapping.

    SECURITY:
    - Requires admin privileges
    - Validates that hospital exists

    Args:
        variant_data: Variant details including hospital_id, route_path, component_key

    Returns:
        Created variant details
    """
    # SECURITY: Require admin privileges
    if not is_admin_user(request, db):
        raise HTTPException(
            status_code=403,
            detail="Admin privileges required to create variants",
        )

    try:
        # Validate hospital exists
        hospital = (
            db.query(Hospital)
            .filter(Hospital.hospital_id == variant_data.hospital_id)
            .first()
        )

        if not hospital:
            raise HTTPException(
                status_code=404,
                detail=f"Hospital with ID {variant_data.hospital_id} not found",
            )

        # Check for duplicate (same hospital + route combination)
        existing = (
            db.query(UIRouteVariant)
            .filter(
                UIRouteVariant.hospital_id == variant_data.hospital_id,
                UIRouteVariant.route_path == variant_data.route_path,
            )
            .first()
        )

        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Variant for route '{variant_data.route_path}' already exists for hospital {variant_data.hospital_id}",
            )

        # Create new variant
        new_variant = UIRouteVariant(
            hospital_id=variant_data.hospital_id,
            route_path=variant_data.route_path,
            component_key=variant_data.component_key,
            is_active=variant_data.is_active,
            description=variant_data.description,
        )

        db.add(new_variant)
        db.commit()
        db.refresh(new_variant)

        logger.info(
            f"Created UI variant: {new_variant.component_key} for hospital {new_variant.hospital_id} "
            f"(route: {new_variant.route_path})"
        )

        return UIVariantCreateResponse(
            message="UI variant created successfully",
            variant=UIVariantAdminResponse(
                id=new_variant.id,
                hospital_id=new_variant.hospital_id,
                route_path=new_variant.route_path,
                component_key=new_variant.component_key,
                is_active=new_variant.is_active,
                description=new_variant.description,
                created_at=new_variant.created_at,
                updated_at=new_variant.updated_at,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating UI variant: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Error creating UI variant",
        )


@router.put("/{variant_id}", response_model=UIVariantUpdateResponse)
def update_variant(
    variant_id: int,
    variant_data: UIVariantUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Update an existing UI variant.

    SECURITY:
    - Requires admin privileges

    Args:
        variant_id: ID of variant to update
        variant_data: Fields to update (only provided fields are changed)

    Returns:
        Updated variant details
    """
    # SECURITY: Require admin privileges
    if not is_admin_user(request, db):
        raise HTTPException(
            status_code=403,
            detail="Admin privileges required to update variants",
        )

    try:
        # Find existing variant
        variant = (
            db.query(UIRouteVariant).filter(UIRouteVariant.id == variant_id).first()
        )

        if not variant:
            raise HTTPException(
                status_code=404,
                detail=f"Variant with ID {variant_id} not found",
            )

        # Check for route conflict if route_path is being changed
        if variant_data.route_path and variant_data.route_path != variant.route_path:
            existing = (
                db.query(UIRouteVariant)
                .filter(
                    UIRouteVariant.hospital_id == variant.hospital_id,
                    UIRouteVariant.route_path == variant_data.route_path,
                    UIRouteVariant.id != variant_id,
                )
                .first()
            )

            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"Variant for route '{variant_data.route_path}' already exists for this hospital",
                )

        # Update only provided fields
        update_fields = variant_data.model_dump(exclude_unset=True)
        for field, value in update_fields.items():
            setattr(variant, field, value)

        db.commit()
        db.refresh(variant)

        logger.info(f"Updated UI variant {variant_id}: {variant.component_key}")

        return UIVariantUpdateResponse(
            message="UI variant updated successfully",
            variant=UIVariantAdminResponse(
                id=variant.id,
                hospital_id=variant.hospital_id,
                route_path=variant.route_path,
                component_key=variant.component_key,
                is_active=variant.is_active,
                description=variant.description,
                created_at=variant.created_at,
                updated_at=variant.updated_at,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating UI variant: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Error updating UI variant",
        )


@router.delete("/{variant_id}", response_model=UIVariantDeleteResponse)
def delete_variant(
    variant_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Delete a UI variant.

    SECURITY:
    - Requires admin privileges

    Note: Consider using is_active=False instead of deletion
    to preserve history.

    Args:
        variant_id: ID of variant to delete

    Returns:
        Confirmation of deletion
    """
    # SECURITY: Require admin privileges
    if not is_admin_user(request, db):
        raise HTTPException(
            status_code=403,
            detail="Admin privileges required to delete variants",
        )

    try:
        # Find existing variant
        variant = (
            db.query(UIRouteVariant).filter(UIRouteVariant.id == variant_id).first()
        )

        if not variant:
            raise HTTPException(
                status_code=404,
                detail=f"Variant with ID {variant_id} not found",
            )

        # Store info for logging before deletion
        component_key = variant.component_key
        hospital_id = variant.hospital_id

        db.delete(variant)
        db.commit()

        logger.info(
            f"Deleted UI variant {variant_id}: {component_key} (hospital {hospital_id})"
        )

        return UIVariantDeleteResponse(
            message="UI variant deleted successfully",
            deleted_id=variant_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting UI variant: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Error deleting UI variant",
        )


# =============================================================================
# UTILITY ENDPOINTS
# =============================================================================


@router.get("/hospital/{hospital_id}", response_model=List[UIVariantAdminResponse])
def get_variants_for_hospital(
    hospital_id: int,
    request: Request,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get all variants for a specific hospital (admin only).

    Used for admin management interfaces.

    Args:
        hospital_id: Hospital to query
        include_inactive: Whether to include inactive variants

    Returns:
        List of variants with full metadata
    """
    # SECURITY: Require admin privileges
    if not is_admin_user(request, db):
        raise HTTPException(
            status_code=403,
            detail="Admin privileges required to view hospital variants",
        )

    try:
        query = db.query(UIRouteVariant).filter(
            UIRouteVariant.hospital_id == hospital_id
        )

        if not include_inactive:
            query = query.filter(UIRouteVariant.is_active == True)

        variants = query.all()

        return [
            UIVariantAdminResponse(
                id=v.id,
                hospital_id=v.hospital_id,
                route_path=v.route_path,
                component_key=v.component_key,
                is_active=v.is_active,
                description=v.description,
                created_at=v.created_at,
                updated_at=v.updated_at,
            )
            for v in variants
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching variants for hospital {hospital_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error fetching hospital variants",
        )
