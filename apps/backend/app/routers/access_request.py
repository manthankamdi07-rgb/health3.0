"""
Router for the doctor access-request flow.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.access_request import (
    AccessRequestCreate,
    AccessRequestRespond,
    AccessRequestOut,
)
from app.schemas.auth import MessageResponse
from app.utils.security import get_current_user, require_role
from app.services.access_request import (
    create_access_request,
    respond_to_access_request,
    get_pending_requests_for_patient,
    get_requests_by_doctor,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/access", tags=["Access Requests"])


@router.post(
    "/request",
    response_model=AccessRequestOut,
    status_code=201,
    summary="Request access to a patient's records",
    dependencies=[Depends(require_role(UserRole.DOCTOR))],
)
async def request_access(
    data: AccessRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Doctor requests access to a patient's records by their unique patient ID."""
    req = await create_access_request(
        doctor_user=current_user,
        patient_unique_id=data.patient_unique_id,
        reason=data.reason,
        db=db,
    )
    return AccessRequestOut(
        id=req.id,
        doctor_id=req.doctor_id,
        patient_id=req.patient_id,
        patient_unique_id=req.patient_unique_id,
        status=req.status.value,
        reason=req.reason,
        created_at=req.created_at,
        responded_at=req.responded_at,
        expires_at=req.expires_at,
    )


@router.get(
    "/pending",
    response_model=list[AccessRequestOut],
    summary="List pending access requests (for patients)",
    dependencies=[Depends(require_role(UserRole.PATIENT))],
)
async def list_pending_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient views all pending access requests from doctors."""
    requests = await get_pending_requests_for_patient(current_user, db)
    return [
        AccessRequestOut(
            id=r.id,
            doctor_id=r.doctor_id,
            patient_id=r.patient_id,
            patient_unique_id=r.patient_unique_id,
            status=r.status.value,
            reason=r.reason,
            created_at=r.created_at,
            responded_at=r.responded_at,
            expires_at=r.expires_at,
        )
        for r in requests
    ]


@router.post(
    "/{request_id}/respond",
    response_model=AccessRequestOut,
    summary="Approve or deny an access request (for patients)",
    dependencies=[Depends(require_role(UserRole.PATIENT))],
)
async def respond_to_request(
    request_id: int,
    data: AccessRequestRespond,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient approves or denies a specific access request."""
    req = await respond_to_access_request(
        patient_user=current_user,
        request_id=request_id,
        approve=data.approve,
        db=db,
    )
    return AccessRequestOut(
        id=req.id,
        doctor_id=req.doctor_id,
        patient_id=req.patient_id,
        patient_unique_id=req.patient_unique_id,
        status=req.status.value,
        reason=req.reason,
        created_at=req.created_at,
        responded_at=req.responded_at,
        expires_at=req.expires_at,
    )


@router.get(
    "/my-requests",
    response_model=list[AccessRequestOut],
    summary="List all access requests made by the current doctor",
    dependencies=[Depends(require_role(UserRole.DOCTOR))],
)
async def list_doctor_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Doctor views all their access requests and their statuses."""
    requests = await get_requests_by_doctor(current_user, db)
    return [
        AccessRequestOut(
            id=r.id,
            doctor_id=r.doctor_id,
            patient_id=r.patient_id,
            patient_unique_id=r.patient_unique_id,
            status=r.status.value,
            reason=r.reason,
            created_at=r.created_at,
            responded_at=r.responded_at,
            expires_at=r.expires_at,
        )
        for r in requests
    ]
