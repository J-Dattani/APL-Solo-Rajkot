import os
import uuid
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pymongo import MongoClient
from google import genai
from google.genai import types

# ----------------------------------------------------
# 1. DATABASE & SESSION PERSISTENCE
# ----------------------------------------------------
MONGODB_URI = os.environ.get("MONGODB_URI")
db_client = None
db = None
sessions_col = None

if MONGODB_URI:
    try:
        db_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        # Check connection
        db_client.admin.command('ping')
        db = db_client.get_database("cognitive_tutor")
        sessions_col = db.get_collection("sessions")
        print("Connected to MongoDB Atlas successfully.")
    except Exception as e:
        print(f"Failed to connect to MongoDB Atlas: {e}. Falling back to local file storage.")

class SessionManager:
    def __init__(self, col=None, local_path="sessions.json"):
        self.col = col
        self.local_path = local_path
        self._local_sessions = {}
        if not col:
            # Create a path inside backend directory if it exists, otherwise root
            dir_prefix = "backend" if os.path.exists("backend") else "."
            self.local_path = os.path.join(dir_prefix, local_path)
            if os.path.exists(self.local_path):
                try:
                    with open(self.local_path, "r", encoding="utf-8") as f:
                        self._local_sessions = json.load(f)
                except Exception:
                    self._local_sessions = {}

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        if self.col is not None:
            try:
                doc = self.col.find_one({"session_id": session_id})
                if doc:
                    doc.pop("_id", None)
                    return doc
            except Exception as e:
                print(f"MongoDB read error: {e}. Falling back to local cache.")
        return self._local_sessions.get(session_id)

    def save_session(self, session_id: str, session_data: Dict[str, Any]):
        if self.col is not None:
            try:
                self.col.replace_one({"session_id": session_id}, session_data, upsert=True)
                return
            except Exception as e:
                print(f"MongoDB write error: {e}. Falling back to local cache.")
        
        self._local_sessions[session_id] = session_data
        try:
            with open(self.local_path, "w", encoding="utf-8") as f:
                json.dump(self._local_sessions, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving session locally: {e}")

session_manager = SessionManager(col=sessions_col)

# ----------------------------------------------------
# 2. GEMINI NATIVE SDK INITIALIZATION
# ----------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
# If not present in env, we will try to look for the default google configuration or raise warning
if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY env variable not set. Gemini API calls will fail unless authenticated via gcloud.")

try:
    # Initialize native google-genai client
    client = genai.Client(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"Error initializing GenAI Client: {e}")
    client = None

# ----------------------------------------------------
# 3. SCHEMAS FOR STRUCTURED TUTOR OUTPUT
# ----------------------------------------------------
class ProfileUpdate(BaseModel):
    mastery_score_delta: int = Field(description="Adjustment to mastery score, range -15 to +15. Positive for good answers, negative for misconceptions.")
    pace_coefficient_delta: float = Field(description="Adjustment to pace speed, range -0.15 to +0.15. Positive to speed up, negative to slow down/break details.")
    new_explored_concepts: List[str] = Field(description="Sub-concepts that the user has successfully understood or discussed.")
    new_knowledge_gaps: List[str] = Field(description="Sub-concepts or knowledge gaps identified that the user struggles with.")
    resolved_knowledge_gaps: List[str] = Field(description="Gaps from the existing knowledge_gaps list that are now resolved.")

class QuizOption(BaseModel):
    id: str = Field(description="Option identifier, e.g. A, B, C, D")
    text: str = Field(description="The option content text")

class ChallengeQuiz(BaseModel):
    question: str = Field(description="The conceptual or coding quiz question")
    options: List[QuizOption] = Field(description="Multiple choice options. Provide at least 3-4 options.")
    correct_answer: str = Field(description="The correct option identifier, e.g. 'A' or 'B'")
    explanation: str = Field(description="Why this is the correct answer. Displayed after user submits.")

class TutorResponse(BaseModel):
    criticism: str = Field(description="Internal critique of the user's comprehension based on their input. What they did well or got wrong.")
    profile_update: ProfileUpdate = Field(description="Updates to mutate the user's profile state.")
    presentation_style: str = Field(description="The style used: 'ANALOGY' (concrete/real-world metaphors), 'TECHNICAL' (APIs, code, architecture details), 'STANDARD' (direct definition).")
    message: str = Field(description="The markdown dialogue output to display to the user.")
    trigger_quiz: bool = Field(description="Set to true if we should present a micro-quiz challenge now to verify understanding.")
    quiz: Optional[ChallengeQuiz] = Field(None, description="Quiz object. Required if trigger_quiz is True.")

# ----------------------------------------------------
# 4. FASTAPI APP INITIALIZATION
# ----------------------------------------------------
app = FastAPI(title="Autonomous Cognitive Tutor Engine", version="1.0.0")

# Enable strict CORS middleware allowing cross-origin traffic from any host
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------
# 5. CORE HELPER SYSTEM PROMPTS
# ----------------------------------------------------
SYSTEM_INSTRUCTION = """You are an Elite Cognitive Tutor. Your goal is to guide the user to master a complex technical topic.
You execute an "Adaptive Learning Branching Loop":
1. Track the user profile: mastery score (0-100), pace coefficient (0.5 to 2.0), explored sub-concepts, and knowledge gaps.
2. Analyze the user's inputs. Critique their level of understanding.
3. Adapt presentation:
   - If they are struggling, pivot to 'ANALOGY' mode: use intuitive real-world metaphors, simple language, and zero syntax noise.
   - If they show mastery, pivot to 'TECHNICAL' mode: show code syntax, system architecture, API schemas, and escalate difficulty.
   - Otherwise, use 'STANDARD' direct definitions.
4. Periodically (when a sub-concept explanation is finished or user wants a challenge), trigger a micro-quiz challenge to verify understanding. Set `trigger_quiz=True` and populate the `quiz` field.
5. In your markdown `message`, do NOT mention these JSON fields, internal states, or updates. Talk naturally as a high-end personal tutor. If they just answered a quiz, evaluate their choice in the message and give them immediate feedback.
"""

def generate_tutor_step(
    topic: str,
    profile: Dict[str, Any],
    history: List[Dict[str, Any]],
    user_input: str,
    active_quiz: Optional[Dict[str, Any]] = None
) -> TutorResponse:
    if not client:
        # Return static mock response if client is not configured
        return TutorResponse(
            criticism="Gemini client not initialized.",
            profile_update=ProfileUpdate(
                mastery_score_delta=5,
                pace_coefficient_delta=0.0,
                new_explored_concepts=["Basics"],
                new_knowledge_gaps=[],
                resolved_knowledge_gaps=[]
            ),
            presentation_style="STANDARD",
            message="*Note: Gemini client is not initialized. Running in Mock Mode.*\n\nLet's start learning about: " + topic + "!",
            trigger_quiz=False,
            quiz=None
        )

    # Format the prompt context
    history_str = ""
    for msg in history[-8:]: # Last 8 messages for context
        history_str += f"{msg['role'].upper()}: {msg['content']}\n"

    prompt = f"""Topic to teach: {topic}
Current User Profile:
- Mastery Score: {profile['mastery_score']}/100
- Pace Coefficient: {profile['pace_coefficient']}x
- Explored Concepts: {json.dumps(profile['explored_concepts'])}
- Active Knowledge Gaps: {json.dumps(profile['knowledge_gaps'])}

Conversation History:
{history_str}

New User Input: {user_input}
"""

    if active_quiz:
        prompt += f"\nNote: The user was responding to the following active quiz challenge:\n" \
                  f"Question: {active_quiz['question']}\n" \
                  f"Correct Option: {active_quiz['correct_answer']}\n" \
                  f"Explanation: {active_quiz['explanation']}\n" \
                  f"The user selected or typed: \"{user_input}\"\n" \
                  f"Please grade this response. If correct, raise mastery and resolve this gap. If wrong, lower mastery, add gap, and pivot presentation style."

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=TutorResponse,
                system_instruction=SYSTEM_INSTRUCTION
            ),
        )
        return TutorResponse.model_validate_json(response.text)
    except Exception as e:
        print(f"Error calling Gemini: {e}")
        # Fallback response
        return TutorResponse(
            criticism=f"API execution failure: {str(e)}",
            profile_update=ProfileUpdate(
                mastery_score_delta=0,
                pace_coefficient_delta=0.0,
                new_explored_concepts=[],
                new_knowledge_gaps=[],
                resolved_knowledge_gaps=[]
            ),
            presentation_style="STANDARD",
            message=f"I encountered a small hiccup communicating with my cognitive center. Let's keep trying! \n\n*Error details: {e}*",
            trigger_quiz=False,
            quiz=None
        )

# ----------------------------------------------------
# 6. ROUTE ENDPOINTS
# ----------------------------------------------------
class StartSessionRequest(BaseModel):
    topic: str

class ChatRequest(BaseModel):
    session_id: str
    message: str

@app.get("/")
def read_root():
    return {"status": "online", "message": "Autonomous Cognitive Tutor Engine API is live."}

@app.post("/api/session/start")
def start_session(req: StartSessionRequest):
    session_id = str(uuid.uuid4())
    initial_profile = {
        "mastery_score": 10,
        "pace_coefficient": 1.0,
        "explored_concepts": [],
        "knowledge_gaps": []
    }
    
    # Get introductory tutor prompt
    tutor_res = generate_tutor_step(
        topic=req.topic,
        profile=initial_profile,
        history=[],
        user_input="Introduce the topic and explain the foundational concept."
    )

    # Mutate profile based on intro updates
    profile = initial_profile
    updates = tutor_res.profile_update
    profile["mastery_score"] = max(0, min(100, profile["mastery_score"] + updates.mastery_score_delta))
    profile["pace_coefficient"] = max(0.5, min(2.0, round(profile["pace_coefficient"] + updates.pace_coefficient_delta, 2)))
    for c in updates.new_explored_concepts:
        if c not in profile["explored_concepts"]:
            profile["explored_concepts"].append(c)
    for g in updates.new_knowledge_gaps:
        if g not in profile["knowledge_gaps"]:
            profile["knowledge_gaps"].append(g)

    # Prepare chat history
    history = [
        {"role": "model", "content": tutor_res.message, "timestamp": datetime.utcnow().isoformat(), "presentation_style": tutor_res.presentation_style}
    ]

    session_data = {
        "session_id": session_id,
        "topic": req.topic,
        "profile": profile,
        "history": history,
        "active_quiz": tutor_res.quiz.model_dump() if (tutor_res.trigger_quiz and tutor_res.quiz) else None,
        "status": "QUIZ_ACTIVE" if (tutor_res.trigger_quiz and tutor_res.quiz) else "IDLE"
    }

    session_manager.save_session(session_id, session_data)
    return session_data

@app.post("/api/session/chat")
def chat(req: ChatRequest):
    session = session_manager.get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Add user message to history
    user_msg = {
        "role": "user",
        "content": req.message,
        "timestamp": datetime.utcnow().isoformat()
    }
    session["history"].append(user_msg)

    # Update status to processing (represented in API flow)
    active_quiz = session.get("active_quiz")

    # Get tutor response
    tutor_res = generate_tutor_step(
        topic=session["topic"],
        profile=session["profile"],
        history=session["history"][:-1],  # Send previous history
        user_input=req.message,
        active_quiz=active_quiz
    )

    # Clear active quiz as it is now answered
    session["active_quiz"] = None

    # Apply profile mutations
    profile = session["profile"]
    updates = tutor_res.profile_update
    profile["mastery_score"] = max(0, min(100, profile["mastery_score"] + updates.mastery_score_delta))
    profile["pace_coefficient"] = max(0.5, min(2.0, round(profile["pace_coefficient"] + updates.pace_coefficient_delta, 2)))
    
    # Explored concepts
    for c in updates.new_explored_concepts:
        if c not in profile["explored_concepts"]:
            profile["explored_concepts"].append(c)
            
    # Add new gaps
    for g in updates.new_knowledge_gaps:
        if g not in profile["knowledge_gaps"]:
            profile["knowledge_gaps"].append(g)

    # Resolve gaps
    for g in updates.resolved_knowledge_gaps:
        if g in profile["knowledge_gaps"]:
            profile["knowledge_gaps"].remove(g)

    # Add model response to history
    model_msg = {
        "role": "model",
        "content": tutor_res.message,
        "timestamp": datetime.utcnow().isoformat(),
        "presentation_style": tutor_res.presentation_style
    }
    session["history"].append(model_msg)

    # Handle quiz triggering
    if tutor_res.trigger_quiz and tutor_res.quiz:
        session["active_quiz"] = tutor_res.quiz.model_dump()
        session["status"] = "QUIZ_ACTIVE"
    else:
        session["active_quiz"] = None
        session["status"] = "IDLE"

    session_manager.save_session(req.session_id, session)
    return session

@app.get("/api/session/state")
def get_session_state(session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@app.post("/api/session/reset")
def reset_session(session_id: str = Body(..., embed=True)):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    initial_profile = {
        "mastery_score": 10,
        "pace_coefficient": 1.0,
        "explored_concepts": [],
        "knowledge_gaps": []
    }
    
    tutor_res = generate_tutor_step(
        topic=session["topic"],
        profile=initial_profile,
        history=[],
        user_input="Let's restart the topic from scratch. Please introduce the foundational concept."
    )

    profile = initial_profile
    updates = tutor_res.profile_update
    profile["mastery_score"] = max(0, min(100, profile["mastery_score"] + updates.mastery_score_delta))
    profile["pace_coefficient"] = max(0.5, min(2.0, round(profile["pace_coefficient"] + updates.pace_coefficient_delta, 2)))
    for c in updates.new_explored_concepts:
        if c not in profile["explored_concepts"]:
            profile["explored_concepts"].append(c)
    for g in updates.new_knowledge_gaps:
        if g not in profile["knowledge_gaps"]:
            profile["knowledge_gaps"].append(g)

    session["profile"] = profile
    session["history"] = [
        {"role": "model", "content": tutor_res.message, "timestamp": datetime.utcnow().isoformat(), "presentation_style": tutor_res.presentation_style}
    ]
    session["active_quiz"] = tutor_res.quiz.model_dump() if (tutor_res.trigger_quiz and tutor_res.quiz) else None
    session["status"] = "QUIZ_ACTIVE" if (tutor_res.trigger_quiz and tutor_res.quiz) else "IDLE"

    session_manager.save_session(session_id, session)
    return session

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
