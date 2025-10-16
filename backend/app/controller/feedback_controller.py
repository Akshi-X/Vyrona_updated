from fastapi import APIRouter, Depends, Request, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from app.config import database
from app.schemas.feedback_schema import (
    FeedbackCreateRequest, CommentCreateRequest, FeedbackStatusUpdateRequest,
    FeedbackCreateResponse, CommentCreateResponse, FeedbackStatusUpdateResponse,
    FeedbackSummaryResponse, FeedbackDetailResponse, CommentResponse,
    FeedbackFilterRequest
)
from app.service.feedback_service import (
    create_feedback, add_comment, update_feedback_status,
    get_feedback_by_id, get_feedback_comments,get_user_feedback,get_all_feedback
)
from app.dependencies.auth_dependencies import get_current_user
from app.models import user_model

router = APIRouter(
    tags=["Feedback"],
    prefix="/feedback",
    responses={404: {"description": "Not found"}}
)


# ============================================
# FEEDBACK ENDPOINTS
# ============================================

@router.post("", 
    response_model=FeedbackCreateResponse, 
    summary="Create feedback ticket", 
    description="""
    Create a new feedback ticket with optional file attachment.
    """)
def create_feedback_endpoint(
    request: Request,
    attachment: Optional[UploadFile] = File(None, description="Optional file attachment (max 10MB)"),
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Create a new feedback ticket with optional attachment"""
    
    # Get pre-validated data from middleware
    validated_data = request.state.validated_feedback_data
    
    # Create request object from validated data
    feedback_request = FeedbackCreateRequest(**validated_data)
    
    # Call service (all business logic there)
    return create_feedback(
        db=db,
        request=feedback_request,
        submitted_by=current_user.user_id,
        attachment=attachment
    )


@router.get("/admin", response_model=List[FeedbackSummaryResponse], summary="Get all feedback tickets", description="Retrieve all feedback tickets with optional filtering")
def get_all_feedback_endpoint(
    feedback_type: Optional[str] = Query(None, description="Filter by feedback type"),
    status: Optional[str] = Query(None, description="Filter by status"),
    submitted_on: Optional[datetime] = Query(None, description="Filter by submission date (ISO format)"),
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Get all feedback tickets with optional filtering"""
    # Create filter object with only feedback_type, status, and submitted_on filters
    filters = FeedbackFilterRequest(
        feedback_type=feedback_type,
        status=status,
        from_date=submitted_on,
    )
    
    # Call service (all business logic there)
    return get_all_feedback(
        db=db,
        filters=filters
    )


@router.get("/user/{user_id}", response_model=List[FeedbackSummaryResponse], summary="Get user feedback tickets", description="Retrieve all feedback tickets submitted by a specific user")
def get_user_feedback_endpoint(
    user_id: str,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Get all feedback tickets submitted by a specific user"""
    # Call service (all business logic there)
    return get_user_feedback(
        db=db,
        user_id=user_id
    )


@router.get("/{feedback_id}", response_model=FeedbackDetailResponse, summary="Get feedback ticket details", description="Retrieve detailed information about a specific feedback ticket")
def get_feedback_by_id_endpoint(
    feedback_id: str,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Get detailed feedback by ID"""
    # Call service (all business logic there)
    return get_feedback_by_id(db=db, feedback_id=feedback_id)


@router.post("/{feedback_id}/comments", response_model=CommentCreateResponse, summary="Add comment to feedback", description="Add a new comment to an existing feedback ticket")
def add_comment_endpoint(
    feedback_id: str,
    request: CommentCreateRequest,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Add a comment to a feedback ticket"""
    # Call service (all business logic there)
    return add_comment(
        db=db,
        feedback_id=feedback_id,
        request=request,
        commented_by=current_user.user_id
    )


@router.get("/{feedback_id}/comments", response_model=List[CommentResponse], summary="Get feedback comments", description="Retrieve all comments for a specific feedback ticket")
def get_feedback_comments_endpoint(
    feedback_id: str,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Get all comments for a specific feedback ticket"""
    # Call service (all business logic there)
    return get_feedback_comments(db=db, feedback_id=feedback_id)


@router.patch("/{feedback_id}/status", response_model=FeedbackStatusUpdateResponse, summary="Update feedback status", description="Update the status of a feedback ticket (e.g., open, in_progress, resolved, closed)")
def update_feedback_status_endpoint(
    feedback_id: str,
    request: FeedbackStatusUpdateRequest,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Update feedback ticket status"""
    # Call service (all business logic there)
    return update_feedback_status(
        db=db,
        feedback_id=feedback_id,
        request=request,
        updated_by=current_user.user_id
    )
