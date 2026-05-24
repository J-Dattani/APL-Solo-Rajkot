import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# Proactively load .env file from root or backend directory if present
for env_path in [".env", "backend/.env", "../.env"]:
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        os.environ[key.strip()] = val.strip().strip('"').strip("'")
        except Exception as e:
            print(f"Error reading .env file at {env_path}: {e}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pull key directly from environment, with hardcoded emergency fallback
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyBqH-DRvxNnmLLuEr8K6LAj_UlASD6lnJI")

try:
    client = genai.Client(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"Warning: Client initialization failed without API key: {e}")
    client = None

# Define strict response schemas so the frontend never crashes
class QuizData(BaseModel):
    question: str
    options: list[str] = Field(description="Must provide exactly 3 or 4 clear multiple choice strings.")
    correct_option_index: int = Field(description="0-indexed location of the right choice.")

class ResourceItem(BaseModel):
    title: str
    url: str
    type: str = Field(description="e.g., 'Video', 'Documentation', 'Paid Course'")

class TutorResponse(BaseModel):
    lesson_content: str
    quiz: QuizData | None = None
    mastery_delta: int = 0
    pace_adjustment: float = 1.0
    milestone_id: int | None = None
    mind_map_nodes: list[str] | None = None
    curated_resources: list[ResourceItem] | None = None

class ChatPayload(BaseModel):
    topic: str
    user_message: str | None = ""
    current_mastery: int = 10
    current_pace: float = 1.0

def generate_bulletproof_link(resource_title: str, resource_type: str) -> str:
    """
    Converts any learning resource title into a guaranteed, 100% active, 
    search-optimized redirection link for YouTube or general courses.
    """
    search_query = resource_title.replace(" ", "+").replace("&", "%26")
    
    if resource_type.upper() == "VIDEO":
        return f"https://www.youtube.com/results?search_query={search_query}"
    elif resource_type.upper() == "PAID COURSE" or resource_type.upper() == "COURSE":
        return f"https://www.coursera.org/courses?query={search_query}"
    else:
        return f"https://www.google.com/search?q={search_query}"

@app.post("/api/session/chat")
async def chat_tutor(payload: ChatPayload):
    if not GEMINI_API_KEY or not client:
        # Emergency local fallback loop if Wi-Fi network drops completely
        return {
            "lesson_content": f"Offline mode backup. Let's dig deeper into {payload.topic} using our existing parameters.",
            "quiz": {
                "question": "Which system component manages dynamic profile alterations?",
                "options": ["A) The state compiler loop", "B) Static string layers", "C) UI templates"],
                "correct_option_index": 0
            },
            "mastery_delta": 5,
            "pace_adjustment": 1.0
        }
    
    try:
        system_instruction = (
            f"You are the advanced core intelligence layer of an Elite Autonomous Cognitive Tutor Engine running live at the APL Solo Hackathon. Your goal is to drive a continuous, interactive learning dialogue that adapts to the user's comprehension metrics in real time.\n\n"
            f"### 🛠️ MANDATORY OPERATIONS FOR CHAT & RESOURCE DELIVERY:\n\n"
            f"1. WHATSAPP CHAT FLOW & CONTINUOUS STREAMING:\n"
            f"   - You are participating in a continuous chat conversation. Do not repeat introductory fluff or welcome messages if the user is asking follow-up questions.\n"
            f"   - If the user explicitly asks for 'more videos,' '5 more repositories,' or 'deeper examples,' you must scale up the content immediately. Expand the lesson text or add new resource objects into the output stream tailored to their request.\n\n"
            f"2. MULTI-MODAL FILE & IMAGE HANDLING:\n"
            f"   - If the incoming interaction string contains an embedded token notification like '[Attached Image Context: filename.png]', treat the submission as an active multi-modal troubleshooting event.\n"
            f"   - Analyze the associated code query as a direct debugging or code review request. Diagnose the error clearly in the text response block, and provide optimized corrective code blocks instantly.\n\n"
            f"3. TEXT FORMATTING CONTROL FOR THE BUBBLE WINDOW:\n"
            f"   - CRITICAL: To prevent ugly display glitches on the frontend interface, clean your text fields of all raw markdown block wrappers like triple-backticks ( ``` ) or heavy bolding syntax markers (**).\n"
            f"   - Present code snippets cleanly with explicit line breaks wrapped inside the string block so the user's monospace console displays them flawlessly inside their chat bubble.\n\n"
            f"4. QUIZ LOGIC (Mode A Only):\n"
            f"   - Keep providing a single 4-option multiple-choice verification quiz if the user is pursuing a structured track, but completely drop the quiz block if they are running free conversational queries or asking for direct code in Mode B.\n\n"
            f"### 🛡️ STRICT DATA OUTPUT SCHEME:\n"
            f"You must strictly return a validated JSON payload mapping directly to the application schema. Do not output outer markdown block ticks around the JSON wrapper, conversational introductions, or trailing explanations. Compile the parameters instantly."
        )

        user_content = (
            f"### 📥 INSTANT INPUT VARIABLES:\n"
            f"- Target Topic/Query: {payload.topic}\n"
            f"- Current Session Mode: [Evaluate if user is in 'Mode A: Structured' or 'Mode B: Exploratory']\n"
            f"- Continuous Conversation History: {payload.user_message}\n"
            f"- Active Metrics: Mastery is {payload.current_mastery}%, Pace is {payload.current_pace}x."
        )

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=TutorResponse,
                temperature=0.6,
            ),
        )
        
        # Bulletproof JSON extraction: find first '{' and last '}'
        raw_text = response.text.strip()
        start_idx = raw_text.find('{')
        end_idx = raw_text.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            raw_text = raw_text[start_idx:end_idx+1]
            
        parsed_json_response = json.loads(raw_text)
        
        if parsed_json_response.get("curated_resources"):
            for resource in parsed_json_response["curated_resources"]:
                r_type = resource.get("type", "")
                r_title = resource.get("title", "")
                resource["url"] = generate_bulletproof_link(r_title, r_type)
                
        return parsed_json_response
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg or "quota" in error_msg.lower() or "exhausted" in error_msg.lower():
            return {
                "lesson_content": "⚠️ **Engine Throttle - Rate Limit Exceeded**\n\nThe Gemini Cognitive Engine has hit its request limit for this minute. Please wait 15-20 seconds before initializing the next stream.",
                "quiz": None,
                "mastery_delta": 0,
                "pace_adjustment": 1.0,
                "mind_map_nodes": None,
                "curated_resources": None
            }
        raise HTTPException(status_code=500, detail=error_msg)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
