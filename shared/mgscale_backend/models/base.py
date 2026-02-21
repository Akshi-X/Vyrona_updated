from sqlalchemy.orm import declarative_base

# Single shared Base for all shared models.
# Both backend and telemetry-service must import Base from here
# so SQLAlchemy tracks all shared tables under the same metadata.
Base = declarative_base()
