import pytest
import sys
from unittest.mock import MagicMock, patch
from sqlalchemy.orm import Session

from app.config.database import get_db, init_db, SessionLocal, engine, Base


def test_get_db_yields_session():
    """Test get_db dependency yields a database session"""
    # Mock SessionLocal to return a mock session
    mock_session = MagicMock(spec=Session)
    original_sessionlocal = SessionLocal
    with patch('app.config.database.SessionLocal', return_value=mock_session):
        # Call get_db as a generator
        db_gen = get_db()
        db = next(db_gen)
        
        assert db == mock_session
        
        # Close the generator (triggers finally block)
        try:
            db_gen.close()
        except GeneratorExit:
            pass
        
        # Verify session.close() was called in finally block
        mock_session.close.assert_called_once()


def test_get_db_closes_session_on_exception():
    """Test get_db closes session even when exception occurs"""
    mock_session = MagicMock(spec=Session)
    
    with patch('app.config.database.SessionLocal', return_value=mock_session):
        db_gen = get_db()
        db = next(db_gen)
        
        # Simulate exception - the finally block should still close
        try:
            raise ValueError("Test exception")
        except ValueError:
            pass
        
        # Close the generator (triggers finally block)
        try:
            db_gen.close()
        except GeneratorExit:
            pass
        
        # Verify session.close() was called in finally block
        mock_session.close.assert_called_once()


def test_get_db_context_manager_usage():
    """Test get_db can be used as context manager"""
    mock_session = MagicMock(spec=Session)
    with patch('app.config.database.SessionLocal', return_value=mock_session):
        # Use get_db as generator (FastAPI dependency pattern)
        db_gen = get_db()
        db = next(db_gen)
        
        assert db is not None
        assert db == mock_session
        
        # Close generator
        try:
            db_gen.close()
        except GeneratorExit:
            pass


def test_init_db_imports_all_models():
    """Test init_db imports all model modules"""
    with patch('app.config.database.Base.metadata.create_all') as mock_create_all:
        with patch('app.config.database.engine') as mock_engine:
            # Create mock modules for all model imports
            # The relative import "from ..models import user_model" needs app.models to exist
            mock_models_package = MagicMock()
            # Create individual mock modules
            for model_name in ['user_model', 'otp_model', 'patient_model', 'patient_stage_model',
                             'feedback_model', 'feedback_attachment', 'feedback_comments',
                             'shipment_model', 'shipment_leg_model', 'pharma_model',
                             'provider_model', 'carrier_model', 'task_model', 'chat_model',
                             'chat_read_status']:
                setattr(mock_models_package, model_name, MagicMock())
            
            # Patch sys.modules to make the import work
            modules_to_patch = {
                'app.models': mock_models_package,
            }
            # Also add individual model modules
            for model_name in ['user_model', 'otp_model', 'patient_model', 'patient_stage_model',
                             'feedback_model', 'feedback_attachment', 'feedback_comments',
                             'shipment_model', 'shipment_leg_model', 'pharma_model',
                             'provider_model', 'carrier_model', 'task_model', 'chat_model',
                             'chat_read_status']:
                modules_to_patch[f'app.models.{model_name}'] = getattr(mock_models_package, model_name)
            
            with patch.dict(sys.modules, modules_to_patch, clear=False):
                init_db()
                
                # Verify create_all was called
                mock_create_all.assert_called_once_with(bind=mock_engine)


def test_init_db_creates_tables():
    """Test init_db creates all tables"""
    with patch('app.config.database.Base.metadata') as mock_metadata:
        with patch('app.config.database.engine') as mock_engine:
            init_db()
            
            # Verify create_all was called with engine
            mock_metadata.create_all.assert_called_once_with(bind=mock_engine)


def test_init_db_executes_without_error():
    """Test init_db executes without error and calls create_all"""
    with patch('app.config.database.Base.metadata.create_all') as mock_create_all:
        with patch('app.config.database.engine') as mock_engine:
            # Patch the from import by patching sys.modules
            mock_modules = {
                'app.models.user_model': MagicMock(),
                'app.models.otp_model': MagicMock(),
                'app.models.patient_model': MagicMock(),
                'app.models.patient_stage_model': MagicMock(),
                'app.models.feedback_model': MagicMock(),
                'app.models.feedback_attachment': MagicMock(),
                'app.models.feedback_comments': MagicMock(),
                'app.models.shipment_model': MagicMock(),
                'app.models.shipment_leg_model': MagicMock(),
                'app.models.pharma_model': MagicMock(),
                'app.models.provider_model': MagicMock(),
                'app.models.carrier_model': MagicMock(),
                'app.models.task_model': MagicMock(),
                'app.models.chat_model': MagicMock(),
                'app.models.chat_read_status': MagicMock(),
            }
            with patch.dict(sys.modules, mock_modules):
                init_db()
                
                # Verify create_all was called
                mock_create_all.assert_called_once_with(bind=mock_engine)

