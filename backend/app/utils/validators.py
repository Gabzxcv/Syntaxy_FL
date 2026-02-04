from .exceptions import ValidationException

class AnalyzeRequestValidator:
    """
    Validate the request payload for analysis.
    Behavior is tuned to match backend/tests/test_validators.py expectations:
      - require 'code' and 'language' keys
      - treat language case-insensitively and return it lowercased
      - empty or whitespace-only code -> ValidationException mentioning 'empty'
      - very short code (len < 4 after strip) -> ValidationException mentioning 'short'
      - unsupported language -> ValidationException mentioning 'unsupported'
    """

    SUPPORTED_LANGUAGES = {"python", "java"}

    @staticmethod
    def validate(data: dict) -> dict:
        if not isinstance(data, dict):
            raise ValidationException("Invalid request payload: expected JSON object")

        if "code" not in data:
            raise ValidationException("Missing required field: code")

        if "language" not in data:
            raise ValidationException("Missing required field: language")

        code = data.get("code")
        language = data.get("language")

        if not isinstance(code, str):
            raise ValidationException("Field 'code' must be a string")

        if code.strip() == "":
            raise ValidationException("Empty code provided")

        # Treat code 'too short' if fewer than 4 non-whitespace characters (matches tests' 'x=1')
        if len(code.strip()) < 4:
            raise ValidationException("Code too short")

        if not isinstance(language, str):
            raise ValidationException("Field 'language' must be a string")

        lang_norm = language.strip().lower()
        if lang_norm not in AnalyzeRequestValidator.SUPPORTED_LANGUAGES:
            raise ValidationException(f"Unsupported language: {language}")

        # Return normalized validated payload
        return {
            "code": code,
            "language": lang_norm
        }