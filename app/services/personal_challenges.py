"""Rank reviewed habit options using voluntary preferences and short, scoped history."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.dtos.health import PersonalChallengePreferences
from app.models.health import Challenge, ChallengeLog, HealthCheckup, UserChallenge
from app.repositories.engagement_repository import EngagementRepository
from app.services.personal_challenge_catalog import DOMAINS, PERSONAL_METADATA

_NO_TIME = "no_time"
_FORGOT = "forgot"
_DISCOMFORT = "physical_discomfort"
_TOO_HARD = "goal_too_hard"
_ENVIRONMENT = "environment"
_PREPARE = 0
_LIGHT = 1
_MODERATE = 2
_ACTIVITY = "aerobic_activity"
_DRINK = "hydration"
_DIET = "fiber_diet"
_DIFFICULTY_LIMIT = {"easy": _LIGHT, "moderate": _MODERATE, "advanced": _MODERATE}
_FOCUSED_DOMAIN = {"diet": _DIET, "activity": _ACTIVITY}
_TIPS = {
    _NO_TIME: "시간이 부족했던 미션은 점심 대신 퇴근 뒤처럼 다른 일과에 붙여 보세요.",
    _FORGOT: "자주 잊었다면 원래 하던 일과 바로 뒤로 알림을 옮겨 보세요.",
    _DISCOMFORT: "몸이 불편할 때는 활동을 멈추고, 불편함이 계속되면 의료진과 상의하세요.",
    _TOO_HARD: "부담이 컸던 미션은 실천이 쉬운 한 단계로 바꿔 보세요.",
    _ENVIRONMENT: "장소나 준비물이 걸림돌이었다면 지금 있는 곳에서 할 수 있는 대안을 골라 보세요.",
}


@dataclass(frozen=True)
class HabitHealthSignals:
    starting_activity: bool = False
    prefer_activity_planning: bool = False
    interested_in_sodium_labels: bool = False
    prefer_routine_cue: bool = False

    @classmethod
    def from_checkup(cls, checkup: HealthCheckup, today: date) -> HabitHealthSignals:
        return cls(
            starting_activity=checkup.regular_exercise is False,
            prefer_activity_planning=any(
                value is True
                for value in (
                    checkup.arthritis_rheumatism_diagnosis,
                    checkup.heart_disease_diagnosis,
                    checkup.chronic_lung_disease_diagnosis,
                    checkup.cerebrovascular_disease_diagnosis,
                )
            ),
            interested_in_sodium_labels=checkup.hypertension_diagnosis is True,
            prefer_routine_cue=(
                (today - checkup.checkup_date).days <= 14 and checkup.sleep_difficulty_last_week in {"code_3", "code_4"}
            ),
        )


@dataclass(frozen=True)
class HabitHistory:
    completion_days: dict[str, int] = field(default_factory=dict)
    barriers: dict[str, dict[str, int]] = field(default_factory=dict)
    recent_discomfort: bool = False

    def has_entries(self) -> bool:
        return bool(self.completion_days or self.barriers)

    def adjustment_tips(self) -> list[str]:
        reasons = {
            reason
            for counts in self.barriers.values()
            for reason, count in counts.items()
            if count >= 2 and reason != _DISCOMFORT
        }
        if self.recent_discomfort:
            reasons.add(_DISCOMFORT)
        return [
            _TIPS[reason] for reason in (_DISCOMFORT, _NO_TIME, _FORGOT, _TOO_HARD, _ENVIRONMENT) if reason in reasons
        ]


async def load_habit_history(user_id: int, today: date) -> HabitHistory:
    """Read only owned selections and distinct completion/barrier days."""
    first = today - timedelta(days=27)
    logs = await ChallengeLog.filter(user_id=user_id, is_completed=True, log_date__range=(first, today)).values_list(
        "user_challenge_id", "log_date"
    )
    barriers = await EngagementRepository().list_barriers(user_id, first, today)
    ids = {selected_id for selected_id, _ in logs} | {entry.user_challenge_id for entry in barriers}
    if not ids:
        return HabitHistory()
    selections = dict(await UserChallenge.filter(user_id=user_id, id__in=ids).values_list("id", "challenge_id"))
    catalog = {
        challenge_id: (code, category)
        for challenge_id, code, category in await Challenge.filter(id__in=set(selections.values())).values_list(
            "id", "code", "category"
        )
    }
    by_selection = {key: catalog[challenge_id] for key, challenge_id in selections.items() if challenge_id in catalog}
    completion_days: defaultdict[str, set[date]] = defaultdict(set)
    for selected_id, log_date in logs:
        code, _ = by_selection.get(selected_id, ("", ""))
        if code in PERSONAL_METADATA:
            completion_days[code].add(log_date)

    domain_by_category = {"activity": _ACTIVITY, "diet": _DIET, "hydration": _DRINK}
    barrier_days: defaultdict[str, defaultdict[str, set[date]]] = defaultdict(lambda: defaultdict(set))
    discomfort = False
    completed_keys = set(logs)
    # A later submission may refine a reason. Treat each day as one observation for ranking.
    seen: set[tuple[int, date]] = set()
    for entry in barriers:
        key = (entry.user_challenge_id, entry.log_date)
        if key in seen or entry.user_challenge_id not in by_selection:
            continue
        seen.add(key)
        _, category = by_selection[entry.user_challenge_id]
        domain = domain_by_category.get(category)
        if domain and (key not in completed_keys or entry.reason_code == _DISCOMFORT):
            barrier_days[domain][entry.reason_code].add(entry.log_date)
            if domain == _ACTIVITY and entry.reason_code == _DISCOMFORT:
                discomfort |= entry.log_date >= today - timedelta(days=6)
    return HabitHistory(
        completion_days={key: len(days) for key, days in completion_days.items()},
        barriers={
            domain: {reason: len(days) for reason, days in reasons.items()} for domain, reasons in barrier_days.items()
        },
        recent_discomfort=discomfort,
    )


class PersonalChallengeRanker:
    def __init__(
        self, preferences: PersonalChallengePreferences, health: HabitHealthSignals, history: HabitHistory
    ) -> None:
        self.preferences = preferences
        self.health = health
        self.history = history

    def eligible(self, item: dict) -> bool:
        context = self.preferences.context
        if "any" not in item["contexts"] and context != "any" and context not in item["contexts"]:
            return False
        if item["drink_fit"] == "often" and self.preferences.sweet_drinks == "rarely":
            return False
        limit = _DIFFICULTY_LIMIT[self.preferences.difficulty]
        if item["domain"] == _ACTIVITY:
            if (
                self.preferences.mobility == "limited"
                or self.health.prefer_activity_planning
                or self.history.recent_discomfort
            ):
                limit = _PREPARE
            elif self.preferences.mobility == "unspecified" or self.health.starting_activity:
                limit = min(limit, _LIGHT)
        return item["demand"] <= limit

    def _preference_scores(self, item: dict) -> list[tuple[int, str]]:
        context = self.preferences.context
        reasons = [(0, "지금 할 수 있는 한 가지 행동부터 시작해 보세요.")]
        if context != "any" and context in item["contexts"]:
            reasons.append((6, "고른 장소에서 평소 일과에 붙여 실천할 수 있어요."))
        elif "any" in item["contexts"]:
            reasons.append((2, "장소가 바뀌어도 같은 방식으로 시도할 수 있어요."))
        if item["domain"] == _DRINK and item["drink_fit"] == self.preferences.sweet_drinks:
            reasons.append((7, "평소 음료 선택에 맞춘 한 번의 실천이에요."))
        if item["domain"] == _FOCUSED_DOMAIN.get(self.preferences.focus) and item["demand"] == _LIGHT:
            reasons.append((2, "관심 있는 영역에서 바로 해볼 수 있는 행동이에요."))
        return reasons

    def _health_scores(self, item: dict) -> list[tuple[int, str]]:
        domain = item["domain"]
        demand = item["demand"]
        habit = item["habit"]
        reasons = []
        if domain == _DIET and self.health.interested_in_sodium_labels and habit in {"label_sodium", "sauce_on_side"}:
            reasons.append((8, "메뉴나 영양표시를 살펴보고 식사 선택을 준비할 수 있어요."))
        if domain != _ACTIVITY:
            return reasons
        if self.health.starting_activity or self.health.prefer_activity_planning:
            if demand == _PREPARE:
                reasons.append((8, "먼저 내 몸과 일정에 맞는 활동 시간이나 장소를 준비해 보세요."))
            elif demand == _LIGHT:
                reasons.append((3, "지금 기록에 맞춰 부담이 적은 활동부터 제안해요."))
        if self.health.prefer_routine_cue and habit == "movement_schedule":
            reasons.append((9, "하루 중 기억하기 쉬운 일과에 다음 실천을 붙여 보세요."))
        if self.preferences.mobility == "limited" and demand == _PREPARE:
            reasons.append((11, "활동 조절이 필요하다고 선택해, 직접 움직이지 않는 준비를 제안해요."))
        return reasons

    def _history_scores(self, code: str, item: dict) -> list[tuple[int, str]]:
        domain = item["domain"]
        demand = item["demand"]
        reasons = []
        if domain == _ACTIVITY and self.history.recent_discomfort:
            reasons.append((12, "최근 실천에서 불편함이 있어, 움직임 없이 준비만 할 수 있는 미션을 골랐어요."))
        barriers = self.history.barriers.get(domain, {})
        if any(barriers.get(key, 0) >= 2 for key in (_NO_TIME, _TOO_HARD)) and demand == _PREPARE:
            reasons.append((9, "지난 실천이 버거웠던 날을 고려해 준비부터 시작할 수 있어요."))
        if barriers.get(_ENVIRONMENT, 0) >= 2 and "any" in item["contexts"]:
            reasons.append((6, "준비물이나 장소가 달라져도 이어갈 수 있는 행동이에요."))
        if barriers.get(_FORGOT, 0) >= 2 and demand == _PREPARE:
            reasons.append((5, "기억하기 쉬운 일과에 붙여 다시 시작하도록 돕는 미션이에요."))
        if self.history.completion_days.get(code, 0) >= 2:
            reasons.append((5, "여러 날 실천한 행동을 같은 일과에 이어갈 수 있어요."))
        return reasons

    def _score(self, code: str, item: dict) -> tuple[int, str]:
        reasons = [*self._preference_scores(item), *self._health_scores(item), *self._history_scores(code, item)]
        return sum(weight for weight, _ in reasons), max(reasons, key=lambda reason: reason[0])[1]

    def ranked_options(self) -> dict[str, list[tuple[str, str]]]:
        by_domain: dict[str, list[tuple[int, str, str]]] = {domain: [] for domain in DOMAINS}
        for code, item in PERSONAL_METADATA.items():
            if self.eligible(item):
                score, reason = self._score(code, item)
                by_domain[item["domain"]].append((score, code, reason))
        return {
            domain: [(code, reason) for _, code, reason in sorted(items, key=lambda item: (-item[0], item[1]))]
            for domain, items in by_domain.items()
        }


def choose_options(options: dict[str, list[tuple[str, str]]], rotation: int) -> list[str]:
    """First choose the highest match; explicit refresh rotates eligible options across domains."""
    selected = []
    offset = 0
    for domain in DOMAINS:
        candidates = options[domain]
        rotation, digit = divmod(rotation, len(candidates))
        selected.append(candidates[(digit + offset) % len(candidates)][0])
        offset += digit
    return selected
