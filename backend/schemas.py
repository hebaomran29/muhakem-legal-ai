from typing import Optional

from pydantic import BaseModel


class RouterMessage(BaseModel):
    role: str
    text: str


class RouterRequest(BaseModel):
    messages: list[RouterMessage]
    current_text: str


class RouterResponse(BaseModel):
    intent: str
    should_route: bool
    is_reference: bool
    response: str
    enriched_prompt: str


class ConsultationChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ConsultationChatResponse(BaseModel):
    session_id: Optional[str] = None
    reply: str
    needs_clarification: bool
    routing: Optional[dict] = None


class GenerateMemoRequest(BaseModel):
    raw_text: str
    court: Optional[str] = None
    case_number: Optional[str] = None
    lawyer_name: Optional[str] = None
    lawyer_license: Optional[str] = None


class JobResponse(BaseModel):
    job_id: str
    status: str
    db_session_id: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    stage: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None


class SaveSectionsRequest(BaseModel):
    sections: list[dict]


class ChatEditRequest(BaseModel):
    job_id: str
    message: str


class ResumeResponse(BaseModel):
    job_id: str
    status: str
    db_session_id: Optional[str] = None
    chat_history: list[dict] = []


class GenerateContractRequest(BaseModel):
    query: str


class ContractChatEditRequest(BaseModel):
    job_id: str
    message: str


class CreateFirmRequest(BaseModel):
    name: str


class InviteMemberRequest(BaseModel):
    email: str


class MeResponse(BaseModel):
    user_id: str
    email: Optional[str] = None
    firm_ids: list[str] = []


class PinSessionRequest(BaseModel):
    pinned: bool
