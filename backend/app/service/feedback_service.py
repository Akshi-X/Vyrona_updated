import os
import logging
import base64
import json
from datetime import datetime, timezone
from typing import Optional, List
from urllib.parse import quote
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc
from sqlalchemy.exc import IntegrityError
from fastapi import UploadFile, HTTPException, BackgroundTasks
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
from ..models.IVF.hospital_model import Hospital
from ..models.IVF.hospital_branch_model import HospitalBranch
from .user_service import get_mygrape_admin_email
from ..schemas.feedback_schema import (
    FeedbackCreateRequest, CommentCreateRequest, FeedbackStatusUpdateRequest,
    FeedbackCreateResponse, CommentCreateResponse, FeedbackStatusUpdateResponse,
    FeedbackSummaryResponse, FeedbackDetailResponse, CommentResponse,
    FeedbackFilterRequest
)
from ..constants.app_constants import (
    FEEDBACK_TICKET_PREFIX, FEEDBACK_ID_LENGTH, 
    FEEDBACK_MAX_ATTACHMENT_SIZE_MB, FEEDBACK_ALLOWED_ATTACHMENT_EXTENSIONS
)
from ..constants.enums import FeedbackStatus
from .email_service import send_feedback_new_ticket_email, send_feedback_status_update_email, send_feedback_new_comment_email
from .activity_log_service import (
    ActivityLogService,
    build_actor_from_user,
    build_target,
    is_audit_log_disabled_for_user,
)
from ..constants.enums import ActivityOutcome

# Setup logger
logger = logging.getLogger(__name__)

BASE64_ATTACHMENT_PREFIX = "base64_attachment:"


def _encode_attachment_payload(
    original_filename: str,
    stored_filename: str,
    mime_type: Optional[str],
    file_bytes: bytes
) -> str:
    """Encode file metadata + bytes as a compact JSON string in file_path column."""
    payload = {
        "original_filename": original_filename,
        "stored_filename": stored_filename,
        "mime_type": mime_type or "application/octet-stream",
        "data": base64.b64encode(file_bytes).decode("ascii"),
    }
    return BASE64_ATTACHMENT_PREFIX + json.dumps(payload, separators=(",", ":"))


def _decode_attachment_payload(file_path: str) -> Optional[dict]:
    if not file_path or not file_path.startswith(BASE64_ATTACHMENT_PREFIX):
        return None
    encoded_payload = file_path[len(BASE64_ATTACHMENT_PREFIX):]
    return json.loads(encoded_payload)


def _build_attachment_path(ticket_id: str, attachment: FeedbackAttachment) -> str:
    """Build frontend-compatible attachment URL without changing response shape."""
    if attachment.file_path and attachment.file_path.startswith(BASE64_ATTACHMENT_PREFIX):
        filename = attachment.stored_filename or attachment.original_filename or f"attachment_{attachment.id}"
        return f"/api/feedback/{ticket_id}/attachments/{attachment.id}/{quote(filename)}"

    return f"/uploads/feedback/{ticket_id}/{os.path.basename(attachment.file_path)}"


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
    """Persist uploaded file as base64 payload in DB and return attachment metadata."""
    # Validate file extension
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in FEEDBACK_ALLOWED_ATTACHMENT_EXTENSIONS:
        raise FeedbackAttachmentInvalidTypeException(
            file_extension=file_extension,
            allowed_extensions=FEEDBACK_ALLOWED_ATTACHMENT_EXTENSIONS
        )

    # Read bytes from upload stream.
    try:
        file.file.seek(0)
        file_bytes = file.file.read()
        file.file.seek(0)
    except Exception as e:
        raise FeedbackAttachmentSaveFailedException(
            filename=file.filename,
            reason=str(e)
        )

    file_size = len(file_bytes)
    file_size_mb = file_size / (1024 * 1024)
    if file_size_mb > FEEDBACK_MAX_ATTACHMENT_SIZE_MB:
        raise FeedbackAttachmentTooLargeException(
            file_size_mb=file_size_mb,
            max_size_mb=FEEDBACK_MAX_ATTACHMENT_SIZE_MB
        )

    # Keep stored_filename semantics unchanged for display and compatibility.
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    stored_filename = f"{timestamp}_{file.filename}"

    encoded_payload = _encode_attachment_payload(
        original_filename=file.filename,
        stored_filename=stored_filename,
        mime_type=file.content_type,
        file_bytes=file_bytes
    )

    return {
        "original_filename": file.filename,
        "stored_filename": stored_filename,
        "file_path": encoded_payload,
        "file_size": file_size,
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
    
    # Convert list of AffectedModule enums to comma-separated string
    affected_modules_str = ",".join([module.value for module in request.affected_modules])
    
    # Create feedback record
    feedback = Feedback(
        ticket_id=ticket_id,
        department=request.department,
        feedback_type=request.feedback_type,
        subject=request.subject,
        description=request.description,
        priority=request.priority,
        affected_modules=affected_modules_str,
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

    ActivityLogService(db).log_activity(
        action="support_ticket.created",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(user),
        target=build_target("support_ticket", feedback.ticket_id, feedback.subject),
        metadata={
            "priority": feedback.priority.value,
            "department": feedback.department.value,
            "feedback_type": feedback.feedback_type.value,
        },
        audit_log_disabled=is_audit_log_disabled_for_user(user),
    )
    
    # Send email notifications - always send to admin, conditionally to user
    try:
        # Get common MyGrape admin email
        mygrape_admin_email = get_mygrape_admin_email(db)
        if not mygrape_admin_email:
            raise FeedbackUserNotFoundException(user_id="Mygrape_admin")
        
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
            send_to_user=request.send_email,
            extra_recipient_emails=["support@mygrape.org"]
        )
        ActivityLogService(db).log_activity(
            action="email.support_ticket_created",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            target=build_target("support_ticket", feedback.ticket_id, feedback.subject),
            metadata={"recipient_email": mygrape_admin_email},
            audit_log_disabled=is_audit_log_disabled_for_user(user),
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
    commented_by: str,
    background_tasks: Optional[BackgroundTasks] = None
) -> CommentCreateResponse:
    """Add a comment to a feedback ticket"""
    
    # Optimize: Get feedback and submitter in one query using join
    feedback_with_submitter = db.query(Feedback, User).join(
        User, Feedback.submitted_by == User.user_id
    ).filter(Feedback.ticket_id == feedback_id).first()
    
    if not feedback_with_submitter:
        raise FeedbackNotFoundException(feedback_id=feedback_id)
    
    feedback, submitter = feedback_with_submitter
    
    # Get user details for email (commented_by user)
    user = db.query(User).filter(User.user_id == commented_by).first()
    if not user:
        raise FeedbackUserNotFoundException(user_id=commented_by)
    
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

    ActivityLogService(db).log_activity(
        action="support_ticket.comment_added",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(user),
        target=build_target("support_ticket", feedback.ticket_id, feedback.subject),
        metadata={"comment_id": comment.id},
        audit_log_disabled=is_audit_log_disabled_for_user(user),
    )
    
    # Send email notifications in background - always send to admin, conditionally to user
    if background_tasks:
        # Get common MyGrape admin email (cache this if possible, but for now keep it simple)
        mygrape_admin_email = get_mygrape_admin_email(db)
        if not mygrape_admin_email:
            raise FeedbackUserNotFoundException(user_id="Mygrape_admin")
        
        # Prepare email data
        commented_by_name = f"{user.first_name} {user.last_name}"
        
        # Add background task for email sending
        background_tasks.add_task(
            send_feedback_new_comment_email,
            ticket_id=feedback.ticket_id,
            subject=feedback.subject,
            comment=request.comment,
            commented_by_name=commented_by_name,
            submitted_by_email=submitter.email,
            feedback_id=feedback.ticket_id,
            mygrape_admin_email=mygrape_admin_email,
            send_to_user=request.send_email
        )
        ActivityLogService(db).log_activity(
            action="email.support_ticket_comment_queued",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            target=build_target("support_ticket", feedback.ticket_id, feedback.subject),
            metadata={"recipient_email": mygrape_admin_email},
            audit_log_disabled=is_audit_log_disabled_for_user(user),
        )
    else:
        # Fallback: send synchronously if background_tasks not available (shouldn't happen in normal flow)
        try:
            mygrape_admin_email = get_mygrape_admin_email(db)
            if not mygrape_admin_email:
                raise FeedbackUserNotFoundException(user_id="Mygrape_admin")
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
            ActivityLogService(db).log_activity(
                action="email.support_ticket_comment_sent",
                outcome=ActivityOutcome.SUCCESS.value,
                actor=build_actor_from_user(user),
                target=build_target("support_ticket", feedback.ticket_id, feedback.subject),
                metadata={"recipient_email": mygrape_admin_email},
                audit_log_disabled=is_audit_log_disabled_for_user(user),
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
    updated_by: str,
    background_tasks: Optional[BackgroundTasks] = None
) -> FeedbackStatusUpdateResponse:
    """Update feedback ticket status"""
    
    # Optimize: Get feedback and submitter in one query using join
    feedback_with_submitter = db.query(Feedback, User).join(
        User, Feedback.submitted_by == User.user_id
    ).filter(Feedback.ticket_id == feedback_id).first()
    
    if not feedback_with_submitter:
        raise FeedbackNotFoundException(feedback_id=feedback_id)
    
    feedback, submitter = feedback_with_submitter
    
    # Get user details for email (updated_by user)
    user = db.query(User).filter(User.user_id == updated_by).first()
    if not user:
        raise FeedbackUserNotFoundException(user_id=updated_by)
    
    old_status = feedback.status.value
    feedback.status = request.status
    feedback.updated_by = updated_by
    feedback.updated_at = datetime.now(timezone.utc)

    updated_by_name = f"{user.first_name} {user.last_name}".strip() or user.user_id
    status_comment = Comment(
        ticket_id=feedback_id,
        comment=f"User {updated_by_name} has updated the status to {request.status.value}",
        commented_by=updated_by,
        created_by=updated_by
    )
    db.add(status_comment)
    
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise FeedbackStatusUpdateFailedException(feedback_id=feedback_id, reason=f"Database integrity error: {str(e)}")
    except Exception as e:
        db.rollback()
        raise FeedbackStatusUpdateFailedException(feedback_id=feedback_id, reason=f"Database error: {str(e)}")

    ActivityLogService(db).log_activity(
        action="support_ticket.status_updated",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(user),
        target=build_target("support_ticket", feedback.ticket_id, feedback.subject),
        metadata={"old_status": old_status, "new_status": request.status.value},
        audit_log_disabled=is_audit_log_disabled_for_user(user),
    )
    
    # Send email notifications in background - always send to admin, conditionally to user
    if background_tasks:
        # Get common MyGrape admin email
        mygrape_admin_email = get_mygrape_admin_email(db)
        if not mygrape_admin_email:
            raise FeedbackUserNotFoundException(user_id="Mygrape_admin")
        
        # Prepare email data
        updated_by_name = f"{user.first_name} {user.last_name}"
        
        # Add background task for email sending
        background_tasks.add_task(
            send_feedback_status_update_email,
            ticket_id=feedback.ticket_id,
            subject=feedback.subject,
            old_status=old_status,
            new_status=request.status.value,
            updated_by_name=updated_by_name,
            submitted_by_email=submitter.email,
            feedback_id=feedback.ticket_id,
            mygrape_admin_email=mygrape_admin_email,
            send_to_user=request.send_email
        )
        ActivityLogService(db).log_activity(
            action="email.support_ticket_status_queued",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            target=build_target("support_ticket", feedback.ticket_id, feedback.subject),
            metadata={"recipient_email": mygrape_admin_email},
            audit_log_disabled=is_audit_log_disabled_for_user(user),
        )
    else:
        # Fallback: send synchronously if background_tasks not available (shouldn't happen in normal flow)
        try:
            mygrape_admin_email = get_mygrape_admin_email(db)
            if not mygrape_admin_email:
                raise FeedbackUserNotFoundException(user_id="Mygrape_admin")
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
            ActivityLogService(db).log_activity(
                action="email.support_ticket_status_sent",
                outcome=ActivityOutcome.SUCCESS.value,
                actor=build_actor_from_user(user),
                target=build_target("support_ticket", feedback.ticket_id, feedback.subject),
                metadata={"recipient_email": mygrape_admin_email},
                audit_log_disabled=is_audit_log_disabled_for_user(user),
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
    
    query = db.query(Feedback, User, Hospital, HospitalBranch).join(
        User, Feedback.submitted_by == User.user_id
    ).outerjoin(
        Hospital, Hospital.hospital_id == User.hospital_id
    ).outerjoin(
        HospitalBranch, HospitalBranch.branch_id == User.branch_id
    )
    
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
            submitted_on=feedback.submitted_on,
            submitted_by_name=f"{user.first_name} {user.last_name}".strip() if user else None,
            hospital_name=hospital.hospital_name if hospital else None,
            branch_name=branch.branch_name if branch else None
        )
        for feedback, user, hospital, branch in feedback_list
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
    
    # Parse comma-separated affected_modules string back to list
    affected_modules_list = feedback.affected_modules.split(",") if feedback.affected_modules else []
    
    return FeedbackDetailResponse(
        id=feedback.ticket_id,
        ticket_id=feedback.ticket_id,
        department=feedback.department.value,
        feedback_type=feedback.feedback_type.value,
        subject=feedback.subject,
        description=feedback.description,
        priority=feedback.priority.value,
        affected_modules=affected_modules_list,
        status=feedback.status.value,
        submitted_by=f"{user.first_name} {user.last_name}",
        submitted_by_email=user.email,
        submitted_on=feedback.submitted_on,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at,
        comments=[comment.comment for comment in comments],
        attachment_paths=[_build_attachment_path(feedback.ticket_id, attachment) for attachment in attachments]
    )


def get_feedback_attachment_content(db: Session, feedback_id: str, attachment_id: int) -> dict:
    """Return attachment bytes and metadata directly from DB payload (or legacy path)."""
    attachment = db.query(FeedbackAttachment).filter(
        and_(
            FeedbackAttachment.ticket_id == feedback_id,
            FeedbackAttachment.id == attachment_id
        )
    ).first()

    if not attachment:
        raise FeedbackNotFoundException(feedback_id=feedback_id)

    parsed = _decode_attachment_payload(attachment.file_path)
    if parsed:
        try:
            content = base64.b64decode(parsed["data"])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Invalid base64 attachment data: {str(e)}")

        return {
            "filename": parsed.get("stored_filename") or attachment.stored_filename or attachment.original_filename,
            "mime_type": parsed.get("mime_type") or attachment.mime_type or "application/octet-stream",
            "content": content
        }

    # Legacy fallback for historical filesystem records.
    if not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=404, detail="Attachment file not found")

    try:
        with open(attachment.file_path, "rb") as attachment_file:
            content = attachment_file.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read attachment file: {str(e)}")

    return {
        "filename": attachment.stored_filename or attachment.original_filename,
        "mime_type": attachment.mime_type or "application/octet-stream",
        "content": content
    }


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
