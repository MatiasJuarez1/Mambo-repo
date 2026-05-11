from fastapi import FastAPI
 
app = FastAPI(title="Mambo API")
 
 
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
 
