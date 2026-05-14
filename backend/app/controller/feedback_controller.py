from fastapi import APIRouter, Depends, Request, UploadFile, File, Query, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
import json
import io

from app.config import database
from app.schemas.feedback_schema import (
    FeedbackCreateRequest, CommentCreateRequest, FeedbackStatusUpdateRequest,
    FeedbackCreateResponse, CommentCreateResponse, FeedbackStatusUpdateResponse,
    FeedbackSummaryResponse, FeedbackDetailResponse, CommentResponse,
    FeedbackFilterRequest
)
from app.service.feedback_service import (
    create_feedback, add_comment, update_feedback_status,
    get_feedback_by_id, get_feedback_comments, get_user_feedback, get_all_feedback,
    get_feedback_attachment_content
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

@router.post("/create", 
    response_model=FeedbackCreateResponse, 
    summary="Create feedback ticket with optional file attachments", 
    description="""
    Create a new feedback ticket with optional multiple file attachments.
    Send individual form fields for feedback data and optional files.
    Files will be saved to uploads/feedback/{ticket_id}/ folder.
    If no files are provided, no attachments will be stored.
    """)
async def create_feedback_with_attachments_endpoint(
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user),
    attachments: Optional[List[UploadFile]] = File(None)
):
    """Create a new feedback ticket with optional multiple file attachments"""
    
    try:
        # Parse form data manually
        form_data = await request.form()
        
        # Log received form data for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Form data keys: {list(form_data.keys())}")
        logger.info(f"Attachments count: {len(attachments) if attachments else 0}")
        
        # Extract JSON data from 'request' field
        request_json = form_data.get("request")
        
        if not request_json:
            logger.error("Missing 'request' field in form data")
            raise HTTPException(
                status_code=400, 
                detail="Missing 'request' field in form data"
            )
        
        # Parse JSON from request field
        try:
            data = json.loads(request_json)
            logger.info(f"Parsed JSON data: {data}")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in request field: {str(e)}")
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid JSON in request field: {str(e)}"
            )
        
        # Create the request object from JSON data
        request_data = FeedbackCreateRequest(**data)
        
        # Call service (all business logic there)
        return create_feedback(
            db=db,
            request=request_data,
            submitted_by=current_user.user_id,
            attachments=attachments or []
        )
    except HTTPException:
        raise
    except Exception as e:
        # Log the error for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error creating feedback: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


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


@router.get(
    "/{feedback_id}/attachments/{attachment_id}/{filename}",
    summary="Get feedback attachment content",
    description="Stream attachment bytes restored from base64 payload stored in database."
)
def get_feedback_attachment_endpoint(
    feedback_id: str,
    attachment_id: int,
    filename: str,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Stream attachment content for view/download."""
    _ = filename
    attachment_data = get_feedback_attachment_content(db=db, feedback_id=feedback_id, attachment_id=attachment_id)

    return StreamingResponse(
        io.BytesIO(attachment_data["content"]),
        media_type=attachment_data["mime_type"],
        headers={"Content-Disposition": f'inline; filename="{attachment_data["filename"]}"'}
    )


@router.post("/{feedback_id}/comments", response_model=CommentCreateResponse, summary="Add comment to feedback", description="Add a new comment to an existing feedback ticket")
def add_comment_endpoint(
    feedback_id: str,
    request: CommentCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Add a comment to a feedback ticket"""
    # Call service (all business logic there)
    return add_comment(
        db=db,
        feedback_id=feedback_id,
        request=request,
        commented_by=current_user.user_id,
        background_tasks=background_tasks
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
    current_user: user_model.User = Depends(get_current_user)
):
    """Update feedback ticket status"""
    # Call service (all business logic there)
    return update_feedback_status(
        db=db,
        feedback_id=feedback_id,
        request=request,
        updated_by=current_user.user_id,
        background_tasks=background_tasks
    )
