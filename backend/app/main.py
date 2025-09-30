from fastapi import FastAPI

app = FastAPI(title="Base Application")
# -------------------------------

@app.get("/")
async def root():
    return {"message": "Open /docs to test the API"}
