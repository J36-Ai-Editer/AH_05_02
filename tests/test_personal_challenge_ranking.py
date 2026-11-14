from itertools import product

from app.dtos.health import PersonalChallengePreferences
from app.services.personal_challenge_catalog import DOMAINS, PERSONAL_CATALOG, PERSONAL_METADATA
from app.services.personal_challenges import HabitHealthSignals, HabitHistory, PersonalChallengeRanker, choose_options


def ranked(*, health=None, history=None, **preferences):
    ranker = PersonalChallengeRanker(
        PersonalChallengePreferences(**preferences),
        health or HabitHealthSignals(),
        history or HabitHistory(),
    )
    return ranker.ranked_options()


def test_every_supported_preference_combination_has_one_choice_per_domain():
    assert len(PERSONAL_CATALOG) == len(PERSONAL_METADATA) == 25
    for context, mobility, drinks, difficulty in product(
        ("any", "home", "work", "dining_out"),
        ("unspecified", "comfortable", "limited"),
        ("unspecified", "often", "rarely"),
        ("easy", "moderate", "advanced"),
    ):
        options = ranked(context=context, mobility=mobility, sweet_drinks=drinks, difficulty=difficulty)
        suggested = choose_options(options, 0)
        assert [PERSONAL_METADATA[code]["domain"] for code in suggested] == list(DOMAINS)
        assert all(PERSONAL_METADATA[code]["verification_type"] == 3 for code in suggested)
        if mobility == "limited":
            assert all(PERSONAL_METADATA[code]["demand"] == 0 for code, _ in options["aerobic_activity"])


def test_health_preferences_change_the_actual_content_and_limit_activity():
    default = ranked(context="dining_out", mobility="comfortable", difficulty="advanced")
    adapted = ranked(
        context="dining_out",
        mobility="comfortable",
        difficulty="advanced",
        health=HabitHealthSignals(starting_activity=True, interested_in_sodium_labels=True, prefer_routine_cue=True),
    )
    assert choose_options(default, 0) != choose_options(adapted, 0)
    assert PERSONAL_METADATA[adapted["fiber_diet"][0][0]]["habit"] in {"label_sodium", "sauce_on_side"}
    assert all(PERSONAL_METADATA[code]["demand"] <= 1 for code, _ in adapted["aerobic_activity"])
    safe = ranked(
        mobility="comfortable", difficulty="advanced", health=HabitHealthSignals(prefer_activity_planning=True)
    )
    assert all(PERSONAL_METADATA[code]["demand"] == 0 for code, _ in safe["aerobic_activity"])


def test_refresh_varies_candidates_without_relaxing_safety():
    limited = ranked(
        context="work", mobility="comfortable", difficulty="advanced", history=HabitHistory(recent_discomfort=True)
    )
    plans = {tuple(choose_options(limited, rotation)) for rotation in range(12)}
    assert len(plans) > 3
    assert len({plan[2] for plan in plans}) > 1
    assert all(PERSONAL_METADATA[plan[2]]["demand"] == 0 for plan in plans)
