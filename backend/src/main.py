from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from src.config.database import init_db
# fixed import

app = FastAPI(title="Patient Information System", version="1.0.0")

# Initialize database tables
init_db()

# Mount static folder (create directory if needed)
import os
static_dir = "static"
if not os.path.exists(static_dir):
    os.makedirs(static_dir)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


# Include API routes
from src.controller.patient_controller import router as patient_router
app.include_router(patient_router)


# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)  # pass app instance
