from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    anthropic_api_key: str
    ocr_model: str = "claude-haiku-4-5-20251001"
    grading_model: str = "claude-haiku-4-5-20251001"
    escalation_model: str = "claude-sonnet-4-6"
    confidence_threshold: float = 0.75

    class Config:
        env_file = ".env"

settings = Settings()
