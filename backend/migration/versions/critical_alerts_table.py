"""create critical alerts table

Revision ID: critical_alerts_001
Revises: ebcaac23cb1d
Create Date: 2025-01-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'critical_alerts_001'
down_revision: Union[str, None] = 'ebcaac23cb1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create critical_alerts table with production requirements
    op.create_table(
        'critical_alerts',
        # Primary Key - UUID for audit and compliance
        sa.Column('alert_id', sa.String(length=36), nullable=False, primary_key=True, comment='UUID for alert identification'),
        # Foreign Keys
        sa.Column('canister_id', sa.Integer(), nullable=False, comment='Reference to canister'),
        sa.Column('hospital_id', sa.Integer(), nullable=False, comment='Hospital ID for scoping and compliance'),
        sa.Column('branch_id', sa.Integer(), nullable=False, comment='Branch ID for scoping and compliance'),
        # Alert Information
        sa.Column('alert_type', sa.String(length=50), nullable=False, comment='Type of alert: Deviation alert, Quality alert, Refill log alert'),
        sa.Column('source', sa.String(length=20), nullable=False, comment='Source of alert: KPI, QUALITY, REFILL'),
        sa.Column('severity', sa.String(length=20), nullable=False, comment='Severity: High, Medium, Low'),
        sa.Column('message', sa.Text(), nullable=False, comment='Alert message describing the issue'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='Active', comment='Status: Active, Acknowledged'),
        # Trigger Information
        sa.Column('triggered_by', sa.String(length=20), nullable=False, server_default='system', comment='Who/what triggered: system, device, manual'),
        # Timestamp
        sa.Column('occurred_at', sa.DateTime(), nullable=False, comment='Timestamp when the alert was triggered'),
        # Deduplication Key
        sa.Column('dedup_key', sa.String(length=255), nullable=True, unique=True, comment='Deduplication key to prevent alert spam'),
        # Acknowledgment Information
        sa.Column('acknowledged_by', sa.String(), nullable=True, comment='User ID who acknowledged the alert'),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True, comment='Timestamp when alert was acknowledged'),
        # Reminder Tracking
        sa.Column('last_reminder_sent_at', sa.DateTime(), nullable=True, comment='Timestamp when last reminder email was sent'),
        # Audit Trail
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('updated_by', sa.String(), nullable=True),
        # Constraints
        sa.PrimaryKeyConstraint('alert_id'),
        sa.ForeignKeyConstraint(['canister_id'], ['canisters.canister_id'], name='fk_critical_alerts_canister_id'),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.hospital_id'], name='fk_critical_alerts_hospital_id'),
        sa.ForeignKeyConstraint(['branch_id'], ['hospital_branches.branch_id'], name='fk_critical_alerts_branch_id')
    )
    
    # Create indexes for performance and compliance queries
    op.create_index('ix_critical_alerts_alert_id', 'critical_alerts', ['alert_id'], unique=False)
    op.create_index('ix_critical_alerts_canister_id', 'critical_alerts', ['canister_id'], unique=False)
    op.create_index('ix_critical_alerts_hospital_id', 'critical_alerts', ['hospital_id'], unique=False)
    op.create_index('ix_critical_alerts_branch_id', 'critical_alerts', ['branch_id'], unique=False)
    op.create_index('ix_critical_alerts_alert_type', 'critical_alerts', ['alert_type'], unique=False)
    op.create_index('ix_critical_alerts_source', 'critical_alerts', ['source'], unique=False)
    op.create_index('ix_critical_alerts_severity', 'critical_alerts', ['severity'], unique=False)
    op.create_index('ix_critical_alerts_status', 'critical_alerts', ['status'], unique=False)
    op.create_index('ix_critical_alerts_triggered_by', 'critical_alerts', ['triggered_by'], unique=False)
    op.create_index('ix_critical_alerts_occurred_at', 'critical_alerts', ['occurred_at'], unique=False)
    op.create_index('ix_critical_alerts_dedup_key', 'critical_alerts', ['dedup_key'], unique=True)
    op.create_index('ix_critical_alerts_last_reminder_sent_at', 'critical_alerts', ['last_reminder_sent_at'], unique=False)
    # Composite indexes for common query patterns
    op.create_index('idx_alert_canister_status', 'critical_alerts', ['canister_id', 'status'], unique=False)
    op.create_index('idx_alert_type_status', 'critical_alerts', ['alert_type', 'status'], unique=False)
    op.create_index('idx_alert_occurred', 'critical_alerts', ['occurred_at'], unique=False)
    op.create_index('idx_alert_severity_status', 'critical_alerts', ['severity', 'status'], unique=False)
    op.create_index('idx_alert_hospital_branch', 'critical_alerts', ['hospital_id', 'branch_id'], unique=False)
    op.create_index('idx_alert_source_status', 'critical_alerts', ['source', 'status'], unique=False)


def downgrade() -> None:
    # Drop composite indexes
    op.drop_index('idx_alert_source_status', table_name='critical_alerts')
    op.drop_index('idx_alert_hospital_branch', table_name='critical_alerts')
    op.drop_index('idx_alert_severity_status', table_name='critical_alerts')
    op.drop_index('idx_alert_occurred', table_name='critical_alerts')
    op.drop_index('idx_alert_type_status', table_name='critical_alerts')
    op.drop_index('idx_alert_canister_status', table_name='critical_alerts')
    # Drop single column indexes
    op.drop_index('ix_critical_alerts_last_reminder_sent_at', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_dedup_key', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_occurred_at', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_triggered_by', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_status', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_severity', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_source', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_alert_type', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_branch_id', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_hospital_id', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_canister_id', table_name='critical_alerts')
    op.drop_index('ix_critical_alerts_alert_id', table_name='critical_alerts')
    
    # Drop table
    op.drop_table('critical_alerts')
