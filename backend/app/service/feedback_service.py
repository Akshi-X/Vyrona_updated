import os
import shutil
import logging
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc
from sqlalchemy.exc import IntegrityError
from fastapi import UploadFile, HTTPException
from ..config.config import settings
from ..exceptions.custom_exceptions import (
    FeedbackCreateFailedException, FeedbackInvalidDataException,
    FeedbackAttachmentTooLargeException, FeedbackAttachmentInvalidTypeException,
    FeedbackAttachmentSaveFailedException, FeedbackTicketIdGenerationFailedException,
    FeedbackNotFoundException, FeedbackUserNotFoundException,
    FeedbackCommentCreateFailedException, FeedbackStatusUpdateFailedException
)

from ..models.feedback_model import Feedback
from ..models.feedback_comments import Comment
from ..models.feedback_attachment import FeedbackAttachment
from ..models.user_model import User
from .user_service import get_mygrape_admin_email
from ..schemas.feedback_schema import (
    FeedbackCreateRequest, CommentCreateRequest, FeedbackStatusUpdateRequest,
    FeedbackCreateResponse, CommentCreateResponse, FeedbackStatusUpdateResponse,
    FeedbackSummaryResponse, FeedbackDetailResponse, CommentResponse,
    FeedbackFilterRequest
)
from ..constants.app_constants import (
    FEEDBACK_TICKET_PREFIX, FEEDBACK_ID_LENGTH, 
    FEEDBACK_MAX_ATTACHMENT_SIZE_MB, FEEDBACK_ALLOWED_ATTACHMENT_EXTENSIONS,
    FEEDBACK_UPLOAD_DIR
)
from ..constants.enums import FeedbackStatus
from .email_service import send_feedback_new_ticket_email, send_feedback_status_update_email, send_feedback_new_comment_email

# Setup logger
logger = logging.getLogger(__name__)


def generate_ticket_id(db: Session) -> str:
    """Generate unique ticket ID in format TK-YYYY-MM-nnn"""
    current_date = datetime.now(timezone.utc)
    year = current_date.year
    month = current_date.month
    
    # Get the highest ticket number for current month
    prefix = f"{FEEDBACK_TICKET_PREFIX}-{year}-{month:02d}-"
    
    # Find the highest existing ticket number for this month
    existing_tickets = db.query(Feedback).filter(
        Feedback.ticket_id.like(f"{prefix}%")
    ).order_by(desc(Feedback.ticket_id)).all()
    
    if not existing_tickets:
        ticket_number = 1
    else:
        # Extract number from last ticket ID
        last_ticket_id = existing_tickets[0].ticket_id
        last_number = int(last_ticket_id.split('-')[-1])
        ticket_number = last_number + 1
    
    # Format with leading zeros
    return f"{prefix}{ticket_number:03d}"


def save_attachment(file: UploadFile, feedback_id: str) -> dict:
    """Save uploaded file and return attachment info"""
    # Create directory structure: uploads/feedback/{ticket_id}/
    upload_dir = os.path.join(FEEDBACK_UPLOAD_DIR, feedback_id)
    os.makedirs(upload_dir, exist_ok=True)
    
    # Validate file size
    file_size_mb = file.size / (1024 * 1024)
    if file_size_mb > FEEDBACK_MAX_ATTACHMENT_SIZE_MB:
        raise FeedbackAttachmentTooLargeException(
            file_size_mb=file_size_mb,
            max_size_mb=FEEDBACK_MAX_ATTACHMENT_SIZE_MB
        )
    
    # Validate file extension
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in FEEDBACK_ALLOWED_ATTACHMENT_EXTENSIONS:
        raise FeedbackAttachmentInvalidTypeException(
            file_extension=file_extension,
            allowed_extensions=FEEDBACK_ALLOWED_ATTACHMENT_EXTENSIONS
        )
    
    # Generate unique filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
    stored_filename = f"{timestamp}_{file.filename}"
    file_path = os.path.join(upload_dir, stored_filename)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise FeedbackAttachmentSaveFailedException(
            filename=file.filename,
            reason=str(e)
        )
    
    return {
        "original_filename": file.filename,
        "stored_filename": stored_filename,
        "file_path": file_path.replace("\\", "/"),  # Normalize path separators for cross-platform compatibility
        "file_size": file.size,
        "mime_type": file.content_type
    }


def create_feedback(
    db: Session, 
    request: FeedbackCreateRequest, 
    submitted_by: str,
    attachments: List[UploadFile] = []
) -> FeedbackCreateResponse:
    """Create a new feedback ticket"""
    
    # Generate ticket ID
    ticket_id = generate_ticket_id(db)
    
    # Create feedback record
    feedback = Feedback(
        ticket_id=ticket_id,
        department=request.department,
        feedback_type=request.feedback_type,
        subject=request.subject,
        description=request.description,
        priority=request.priority,
        affected_modules=request.affected_modules.value,
        status=FeedbackStatus.OPEN,
        submitted_by=submitted_by,
        created_by=submitted_by
    )
    
    # Save to database first to get the ticket_id
    try:
        db.add(feedback)
        db.commit()
        db.refresh(feedback)
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Database integrity error creating feedback: {str(e)}")
        raise FeedbackCreateFailedException(reason=f"Database integrity error: {str(e)}")
    except Exception as e:
        db.rollback()
        logger.error(f"Database error creating feedback: {str(e)}")
        raise FeedbackCreateFailedException(reason=f"Database error: {str(e)}")
    
    # Handle attachments if provided (after we have ticket_id)
    if attachments:
        try:
            for attachment in attachments:
                # Save each attachment
                attachment_info = save_attachment(attachment, feedback.ticket_id)
                
                # Create attachment record
                attachment_record = FeedbackAttachment(
                    ticket_id=feedback.ticket_id,
                    original_filename=attachment_info["original_filename"],
                    stored_filename=attachment_info["stored_filename"],
                    file_path=attachment_info["file_path"],
                    file_size=attachment_info["file_size"],
                    mime_type=attachment_info["mime_type"],
                    uploaded_by=submitted_by
                )
                
                db.add(attachment_record)
            
            # Update feedback record
            feedback.updated_at = datetime.now(timezone.utc)
            feedback.updated_by = submitted_by
            
            try:
                db.commit()
            except IntegrityError as e:
                db.rollback()
                raise FeedbackCreateFailedException(reason=f"Database integrity error saving attachments: {str(e)}")
            except Exception as e:
                db.rollback()
                raise FeedbackCreateFailedException(reason=f"Database error saving attachments: {str(e)}")
        except (FeedbackAttachmentTooLargeException, FeedbackAttachmentInvalidTypeException, FeedbackAttachmentSaveFailedException):
            raise
        except Exception as e:
            raise FeedbackAttachmentSaveFailedException(
                filename="multiple files",
                reason=str(e)
            )
    
    # Get user details for email
    user = db.query(User).filter(User.user_id == submitted_by).first()
    if not user:
        raise FeedbackUserNotFoundException(user_id=submitted_by)
    
    # Send email notifications - always send to admin, conditionally to user
    try:
        # Get common MyGrape admin email
        mygrape_admin_email = get_mygrape_admin_email()
        
        send_feedback_new_ticket_email(
            ticket_id=feedback.ticket_id,
            subject=feedback.subject,
            description=feedback.description,
            priority=feedback.priority.value,
            department=feedback.department.value,
            submitted_by_name=f"{user.first_name} {user.last_name}",
            submitted_by_email=user.email,
            feedback_id=feedback.ticket_id,
            mygrape_admin_email=mygrape_admin_email,
            send_to_user=request.send_email
        )
    except Exception as e:
        # Log error but don't fail the request
        logger.error(f"Failed to send email notification for ticket {feedback.ticket_id}: {str(e)}", exc_info=True)
    
    return FeedbackCreateResponse(
        message="Feedback ticket created successfully",
        ticket_id=feedback.ticket_id,
        feedback_id=feedback.ticket_id,
        status=feedback.status.value
    )


def add_comment(
    db: Session, 
    feedback_id: str, 
    request: CommentCreateRequest, 
    commented_by: str
) -> CommentCreateResponse:
    """Add a comment to a feedback ticket"""
    
    # Check if feedback exists
    feedback = db.query(Feedback).filter(Feedback.ticket_id == feedback_id).first()
    if not feedback:
        raise FeedbackNotFoundException(feedback_id=feedback_id)
    
    # Create comment
    comment = Comment(
        ticket_id=feedback_id,
        comment=request.comment,
        commented_by=commented_by,
        created_by=commented_by
    )
    
    try:
        db.add(comment)
        db.commit()
        db.refresh(comment)
    except IntegrityError as e:
        db.rollback()
        raise FeedbackCommentCreateFailedException(feedback_id=feedback_id, reason=f"Database integrity error: {str(e)}")
    except Exception as e:
        db.rollback()
        raise FeedbackCommentCreateFailedException(feedback_id=feedback_id, reason=f"Database error: {str(e)}")
    
    # Get user details for email
    user = db.query(User).filter(User.user_id == commented_by).first()
    if not user:
        raise FeedbackUserNotFoundException(user_id=commented_by)
    
    # Get submitter details for email
    submitter = db.query(User).filter(User.user_id == feedback.submitted_by).first()
    if not submitter:
        raise FeedbackUserNotFoundException(user_id=feedback.submitted_by)
    
    # Send email notifications - always send to admin, conditionally to user
    try:
        # Get common MyGrape admin email
        mygrape_admin_email = get_mygrape_admin_email()
        
        send_feedback_new_comment_email(
            ticket_id=feedback.ticket_id,
            subject=feedback.subject,
            comment=request.comment,
            commented_by_name=f"{user.first_name} {user.last_name}",
            submitted_by_email=submitter.email,
            feedback_id=feedback.ticket_id,
            mygrape_admin_email=mygrape_admin_email,
            send_to_user=request.send_email
        )
    except Exception as e:
        # Log error but don't fail the request
        logger.error(f"Failed to send email notification for comment on ticket {feedback.ticket_id}: {str(e)}", exc_info=True)
    
    return CommentCreateResponse(
        message="Comment added successfully",
        comment_id=comment.id,
        ticket_id=feedback.ticket_id
    )


def update_feedback_status(
    db: Session, 
    feedback_id: str, 
    request: FeedbackStatusUpdateRequest, 
    updated_by: str
) -> FeedbackStatusUpdateResponse:
    """Update feedback ticket status"""
    
    # Check if feedback exists
    feedback = db.query(Feedback).filter(Feedback.ticket_id == feedback_id).first()
    if not feedback:
        raise FeedbackNotFoundException(feedback_id=feedback_id)
    
    old_status = feedback.status.value
    feedback.status = request.status
    feedback.updated_by = updated_by
    feedback.updated_at = datetime.now(timezone.utc)
    
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise FeedbackStatusUpdateFailedException(feedback_id=feedback_id, reason=f"Database integrity error: {str(e)}")
    except Exception as e:
        db.rollback()
        raise FeedbackStatusUpdateFailedException(feedback_id=feedback_id, reason=f"Database error: {str(e)}")
    
    # Get user details for email
    user = db.query(User).filter(User.user_id == updated_by).first()
    if not user:
        raise FeedbackUserNotFoundException(user_id=updated_by)
    
    # Get submitter details for email
    submitter = db.query(User).filter(User.user_id == feedback.submitted_by).first()
    if not submitter:
        raise FeedbackUserNotFoundException(user_id=feedback.submitted_by)
    
    # Send email notifications - always send to admin, conditionally to user
    try:
        # Get common MyGrape admin email
        mygrape_admin_email = get_mygrape_admin_email()
        
        send_feedback_status_update_email(
            ticket_id=feedback.ticket_id,
            subject=feedback.subject,
            old_status=old_status,
            new_status=request.status.value,
            updated_by_name=f"{user.first_name} {user.last_name}",
            submitted_by_email=submitter.email,
            feedback_id=feedback.ticket_id,
            mygrape_admin_email=mygrape_admin_email,
            send_to_user=request.send_email
        )
    except Exception as e:
        # Log error but don't fail the request
        logger.error(f"Failed to send email notification for status update on ticket {feedback.ticket_id}: {str(e)}", exc_info=True)
    
    return FeedbackStatusUpdateResponse(
        message="Feedback status updated successfully",
        ticket_id=feedback.ticket_id,
        old_status=old_status,
        new_status=request.status.value
    )


def get_all_feedback(
    db: Session, 
    filters: Optional[FeedbackFilterRequest] = None
) -> List[FeedbackSummaryResponse]:
    """Get all feedback tickets with optional filtering"""
    
    query = db.query(Feedback)
    
    # Apply filters - only feedback_type, status, and submitted_on
    if filters:
        if filters.feedback_type:
            query = query.filter(Feedback.feedback_type == filters.feedback_type)
        if filters.status:
            query = query.filter(Feedback.status == filters.status)
        if filters.from_date:
            query = query.filter(Feedback.submitted_on >= filters.from_date)
    
    # Order by most recent first
    feedback_list = query.order_by(desc(Feedback.submitted_on)).all()
    
    return [
        FeedbackSummaryResponse(
            feedback_id=feedback.ticket_id,
            feedback=feedback.subject,
            type=feedback.feedback_type.value,
            status=feedback.status.value,
            submitted_on=feedback.submitted_on
        )
        for feedback in feedback_list
    ]


def get_user_feedback(
    db: Session, 
    user_id: str
) -> List[FeedbackSummaryResponse]:
    """Get all feedback tickets submitted by a specific user"""
    
    # Get all feedback for the user, ordered by most recent first
    feedback_list = db.query(Feedback).filter(
        Feedback.submitted_by == user_id
    ).order_by(desc(Feedback.submitted_on)).all()
    
    return [
        FeedbackSummaryResponse(
            feedback_id=feedback.ticket_id,
            feedback=feedback.subject,
            type=feedback.feedback_type.value,
            status=feedback.status.value,
            submitted_on=feedback.submitted_on
        )
        for feedback in feedback_list
    ]


def get_feedback_by_id(db: Session, feedback_id: str) -> FeedbackDetailResponse:
    """Get detailed feedback by ticket ID"""
    
    feedback = db.query(Feedback).filter(Feedback.ticket_id == feedback_id).first()
    if not feedback:
        raise FeedbackNotFoundException(feedback_id=feedback_id)
    
    # Get user details for submitted_by
    user = db.query(User).filter(User.user_id == feedback.submitted_by).first()
    if not user:
        raise FeedbackUserNotFoundException(user_id=feedback.submitted_by)
    
    # Get comments with user details
    comments = db.query(Comment).filter(Comment.ticket_id == feedback_id).order_by(Comment.created_at).all()
    
    # Get attachments
    attachments = db.query(FeedbackAttachment).filter(FeedbackAttachment.ticket_id == feedback_id).order_by(FeedbackAttachment.uploaded_at).all()
    
    return FeedbackDetailResponse(
        id=feedback.ticket_id,
        ticket_id=feedback.ticket_id,
        department=feedback.department.value,
        feedback_type=feedback.feedback_type.value,
        subject=feedback.subject,
        description=feedback.description,
        priority=feedback.priority.value,
        affected_modules=feedback.affected_modules,
        status=feedback.status.value,
        submitted_by=f"{user.first_name} {user.last_name}",
        submitted_by_email=user.email,
        submitted_on=feedback.submitted_on,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at,
        comments=[comment.comment for comment in comments],
        attachment_paths=[f"/uploads/feedback/{feedback.ticket_id}/{os.path.basename(attachment.file_path)}" for attachment in attachments]
    )


def get_feedback_comments(db: Session, feedback_id: str) -> List[CommentResponse]:
    """Get all comments for a specific feedback ticket"""
    
    # Check if feedback exists
    feedback = db.query(Feedback).filter(Feedback.ticket_id == feedback_id).first()
    if not feedback:
        raise FeedbackNotFoundException(feedback_id=feedback_id)
    
    # Join with User table to get user names
    comments = db.query(Comment, User).join(User, Comment.commented_by == User.user_id).filter(Comment.ticket_id == feedback_id).order_by(Comment.created_at).all()
    
    return [
        CommentResponse(
            id=comment.id,
            comment=comment.comment,
            commented_by=f"{user.first_name} {user.last_name}".strip() if user.first_name and user.last_name else user.user_id,
            created_at=comment.created_at
        )
        for comment, user in comments
    ]
