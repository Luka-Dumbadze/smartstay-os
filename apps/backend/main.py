"""SmartStay OS MVP - FastAPI application entry point (uvicorn main:app --port 8000)."""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
import routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.pool()                                             # fail fast if PostgreSQL is not reachable
    relay = asyncio.create_task(routes.relay_loop())      # outbox -> SSE relay
    yield
    relay.cancel()


app = FastAPI(title='SmartStay OS', version='0.1.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:3000', 'http://127.0.0.1:3000'],
                   allow_methods=['*'], allow_headers=['*'])
app.include_router(routes.router)


@app.get('/')
def root():
    return {'service': 'SmartStay OS API', 'console': 'http://localhost:3000', 'docs': '/docs'}
