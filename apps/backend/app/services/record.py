"""
Service layer for medical records stored in MongoDB.
"""

from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from fastapi import HTTPException, status

from typing import Dict, Any, List

from app.schemas.record import RecordCreate


async def create_record(
    db_mongo: AsyncIOMotorDatabase,
    doctor_id: int,
    doctor_name: str,
    patient_unique_id: str,
    data: RecordCreate,
) -> Dict[str, Any]:
    """
    Create a new medical record in MongoDB.
    """
    now = datetime.now(timezone.utc)
    
    # Build the document
    record_doc = {
        "patient_unique_id": patient_unique_id,
        "doctor_id": doctor_id,
        "doctor_name": doctor_name,
        "title": data.title,
        "type": data.type,
        "description": data.description,
        "attachments": [att.model_dump() for att in data.attachments] if data.attachments else [],
        "metadata": data.metadata or {},
        "created_at": now,
        "updated_at": now,
    }
    
    # Insert into MongoDB
    collection = db_mongo["records"]
    result = await collection.insert_one(record_doc)
    
    # Fetch it back to return (with the string _id)
    created_record = await collection.find_one({"_id": result.inserted_id})
    if not created_record:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve the created record."
        )
    created_record["_id"] = str(created_record["_id"])
    return created_record


async def get_patient_records(
    db_mongo: AsyncIOMotorDatabase,
    patient_unique_id: str,
) -> List[Dict[str, Any]]:
    """
    Retrieve all medical records for a specific patient, sorted newest first.
    """
    collection = db_mongo["records"]
    cursor = collection.find({"patient_unique_id": patient_unique_id}).sort("created_at", -1)
    
    records = []
    async for document in cursor:
        document["_id"] = str(document["_id"])
        records.append(document)
        
    return records


async def get_record_by_id(
    db_mongo: AsyncIOMotorDatabase,
    record_id: str,
) -> Dict[str, Any] | None:
    """
    Retrieve a specific medical record by its MongoDB ObjectId.
    """
    try:
        obj_id = ObjectId(record_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid record ID format."
        )
        
    collection = db_mongo["records"]
    document = await collection.find_one({"_id": obj_id})
    if document:
        document["_id"] = str(document["_id"])
    return document
