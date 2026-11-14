from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.prediction.contracts import ACTIVE_MODEL


class ConsentCreateRequest(BaseModel):
    consent_item: Literal["health_data"] = "health_data"
    version: str = Field(default="1.0", max_length=30)
    is_agreed: Literal[True]


class EligibilityCreateRequest(BaseModel):
    birth_date: date | None = None
    has_diabetes_diagnosis: bool = False
    has_urgent_warning_sign: bool = False
    population_in_scope: bool = True

    @model_validator(mode="after")
    def validate_birth_date(self) -> EligibilityCreateRequest:
        if self.birth_date is not None:
            if self.birth_date > date.today():
                raise ValueError("생년월일은 오늘보다 미래일 수 없습니다.")
            if self.birth_date < date(1900, 1, 1):
                raise ValueError("생년월일이 올바르지 않습니다.")
        return self


class HealthCheckupCreateRequest(BaseModel):
    checkup_type: Literal["initial", "reassessment"] = "initial"
    checkup_date: date
    height_cm: float = Field(ge=120, le=220)
    weight_kg: float = Field(ge=25, le=250)
    waist_cm: float | None = Field(default=None, ge=45, le=160)
    systolic_bp: int | None = Field(default=None, ge=70, le=250)
    diastolic_bp: int | None = Field(default=None, ge=40, le=150)
    self_rated_health: Literal["very_good", "good", "fair", "poor", "very_poor"] | None = None
    meal_count_yesterday: int | None = Field(default=None, ge=0, le=10)
    smoking_status: Literal["never", "former", "current"]
    regular_exercise: bool
    current_drinker: bool
    exercise_days_per_week: float = Field(ge=0, le=7)
    exercise_minutes: float = Field(ge=0, le=720)
    annual_household_income_10k_krw: float | None = Field(default=None, ge=0, le=123_500)
    health_satisfaction_score: float | None = Field(default=None, ge=0, le=100)
    economic_satisfaction_score: float | None = Field(default=None, ge=0, le=100)
    overall_quality_of_life_score: float | None = Field(default=None, ge=0, le=100)
    hypertension_diagnosis: bool | None = None
    cancer_diagnosis: bool | None = None
    chronic_lung_disease_diagnosis: bool | None = None
    liver_disease_diagnosis: bool | None = None
    heart_disease_diagnosis: bool | None = None
    cerebrovascular_disease_diagnosis: bool | None = None
    psychiatric_disease_diagnosis: bool | None = None
    arthritis_rheumatism_diagnosis: bool | None = None
    education_level: Literal["code_1", "code_2", "code_3", "code_4", "code_97"] | None = None
    marital_status: Literal["code_1", "code_2", "code_3", "code_4", "code_5"] | None = None
    household_structure: Literal["single_person", "multi_person"] | None = None
    depressed_feeling_last_week: Literal["code_1", "code_2", "code_3", "code_4"] | None = None
    sleep_difficulty_last_week: Literal["code_1", "code_2", "code_3", "code_4"] | None = None
    feature_schema_version: str = Field(default=ACTIVE_MODEL.feature_schema_version, max_length=100)

    @model_validator(mode="after")
    def validate_blood_pressure(self) -> HealthCheckupCreateRequest:
        if self.systolic_bp is not None and self.diastolic_bp is not None and self.systolic_bp <= self.diastolic_bp:
            raise ValueError("수축기 혈압은 이완기 혈압보다 커야 합니다.")
        if not self.regular_exercise and (self.exercise_days_per_week != 0 or self.exercise_minutes != 0):
            raise ValueError("규칙적 운동을 하지 않으면 운동 일수와 시간은 0이어야 합니다.")
        if self.regular_exercise and (self.exercise_days_per_week == 0 or self.exercise_minutes == 0):
            raise ValueError("규칙적 운동을 하면 운동 일수와 시간은 0보다 커야 합니다.")
        return self


class CurrentScreeningInputCreateRequest(BaseModel):
    """Optional KNHANES-aligned inputs stored separately from account data."""

    health_checkup_id: int = Field(gt=0)
    input_as_of_date: date
    walking_days: float | None = Field(default=None, ge=0, le=7)
    energy_kcal: float | None = Field(default=None, ge=0, le=8000)
    protein_g: float | None = Field(default=None, ge=0, le=500)
    fat_g: float | None = Field(default=None, ge=0, le=500)
    carbohydrate_g: float | None = Field(default=None, ge=0, le=1000)
    sodium_mg: float | None = Field(default=None, ge=0, le=20000)
    region: int | None = Field(default=None, ge=1, le=17)
    urban: Literal["urban", "rural"] | None = None
    education: Literal["code_1", "code_2", "code_3", "code_4", "code_97"] | None = None
    income_quartile: Literal["1", "2", "3", "4"] | None = None
    household_income_quartile: Literal["1", "2", "3", "4"] | None = None
    hypertension_family_history: bool | None = None
    diabetes_family_history: bool | None = None
    alcohol_frequency: Literal[1, 2, 3, 4, 5, 6, 8]


class PredictionJobCreateRequest(BaseModel):
    checkup_id: int = Field(gt=0)
    current_screening_input_id: int | None = Field(default=None, gt=0)
    model_key: Literal["diabetes_current_screening", "diabetes_incidence", "diabetes_lifetime_risk"] = (
        "diabetes_incidence"
    )
    # diabetes_lifetime_risk에서만 쓰인다 (API-LIFE-002). 다른 값은 계약 위반으로 거부한다.
    prediction_type: Literal["survival_curve"] | None = None

    @model_validator(mode="after")
    def validate_prediction_type(self) -> PredictionJobCreateRequest:
        if self.model_key == "diabetes_lifetime_risk" and self.prediction_type != "survival_curve":
            raise ValueError("diabetes_lifetime_risk requires prediction_type=survival_curve")
        if self.model_key == "diabetes_incidence" and self.prediction_type is not None:
            raise ValueError("diabetes_incidence does not accept prediction_type")
        if self.model_key == "diabetes_current_screening" and self.prediction_type is not None:
            raise ValueError("diabetes_current_screening does not accept prediction_type")
        if self.model_key != "diabetes_current_screening" and self.current_screening_input_id is not None:
            raise ValueError("current_screening_input_id is only valid for diabetes_current_screening")
        return self


class PersonalChallengePreferences(BaseModel):
    focus: Literal["balanced", "diet", "activity"] = "balanced"
    difficulty: Literal["easy", "moderate", "advanced"] = "easy"
    context: Literal["any", "home", "work", "dining_out"] = "any"
    mobility: Literal["unspecified", "comfortable", "limited"] = "unspecified"
    sweet_drinks: Literal["unspecified", "often", "rarely"] = "unspecified"
    use_health_record: bool = False
    use_activity_history: bool = False


class PersonalChallengeRecommendationRequest(PersonalChallengePreferences):
    rotation: int = Field(default=0, ge=0, le=1_000_000)


class ChallengeCycleCreateRequest(PersonalChallengePreferences):
    start_date: date
    challenge_ids: list[int] = Field(min_length=1, max_length=3)
    prediction_id: int | None = Field(default=None, gt=0)
    catalog_version: Literal["evidence-v3", "personal-v4"] | None = None

    @model_validator(mode="after")
    def unique_challenges(self) -> ChallengeCycleCreateRequest:
        if len(self.challenge_ids) != len(set(self.challenge_ids)):
            raise ValueError("같은 챌린지를 중복 선택할 수 없습니다.")
        return self


class ChallengeLogUpsertRequest(BaseModel):
    is_completed: bool
    value: float | None = Field(default=None, ge=0)
    source: Literal["self_report"] = "self_report"
    note: str | None = Field(default=None, max_length=200)


class ChallengeVerificationCreateRequest(BaseModel):
    verification_date: date
    verification_type: Literal["photo", "location"]
    evidence_ref: str | None = Field(default=None, max_length=500)
    evidence_digest: str | None = Field(default=None, min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")
    location_accuracy_m: float | None = Field(default=None, ge=0, le=100000)

    @model_validator(mode="after")
    def validate_evidence(self) -> ChallengeVerificationCreateRequest:
        if self.verification_type == "photo" and not (self.evidence_ref or self.evidence_digest):
            raise ValueError("사진 인증에는 증빙 참조 또는 SHA-256 해시가 필요합니다.")
        if self.verification_type == "location" and self.location_accuracy_m is None:
            raise ValueError("위치 인증에는 위치 정확도가 필요합니다.")
        return self


class ChallengeCycleStatusRequest(BaseModel):
    status: Literal["stopped"]
    reason: str = Field(default="user_requested", max_length=80)


class EnvelopeMeta(BaseModel):
    request_id: str
    timestamp: datetime


class FeedbackCreateRequest(BaseModel):
    context_type: Literal["prediction", "recommendation", "service"]
    prediction_id: int | None = Field(default=None, gt=0)
    recommendation_id: int | None = Field(default=None, gt=0)
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_context_reference(self) -> FeedbackCreateRequest:
        if self.context_type == "prediction" and self.prediction_id is None:
            raise ValueError("예측 결과 피드백에는 prediction_id가 필요합니다.")
        if self.context_type == "recommendation" and self.recommendation_id is None:
            raise ValueError("추천 피드백에는 recommendation_id가 필요합니다.")
        return self
