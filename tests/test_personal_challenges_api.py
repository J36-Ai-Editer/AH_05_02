"""Exercise personal recommendations, cycle selection and rewards over the MVP API."""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest

from app.models.engagement import ChallengeBarrier
from app.models.game import RewardTransaction
from app.models.health import ChallengeCycle, ChallengeLog, DailyChallengeReward, EligibilityCheck, HealthCheckup
from app.services.challenge_proofs import challenge_today
from app.services.personal_challenge_catalog import DOMAINS, PERSONAL_CATALOG_VERSION
from tests.test_challenge_v3_api import api as api

_RECOMMENDATIONS = "/api/v1/challenge-recommendations/personal"
_CYCLES = "/api/v1/challenge-cycles"


async def _recommend(api, **preferences):
    response = await api.client.post(_RECOMMENDATIONS, headers=api.headers, json=preferences)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()["data"]


def _start_payload(items, *, start_date=None, **preferences):
    return {
        "start_date": (start_date or challenge_today()).isoformat(),
        "challenge_ids": [item["challenge_id"] for item in items],
        "catalog_version": PERSONAL_CATALOG_VERSION,
        **preferences,
    }


@pytest.mark.asyncio
async def test_personal_recommendation_auth_context_and_mobility_restrictions(api):
    denied = await api.client.post(_RECOMMENDATIONS, json={"context": "home"})
    assert denied.status_code == 401

    recommendations = await _recommend(
        api, context="work", mobility="limited", difficulty="advanced", sweet_drinks="rarely"
    )
    assert recommendations["catalog_version"] == PERSONAL_CATALOG_VERSION
    assert tuple(item["domain"] for item in recommendations["items"]) == DOMAINS
    assert len(recommendations["options"]) > len(recommendations["items"])
    assert {item["challenge_id"] for item in recommendations["items"]} <= {
        item["challenge_id"] for item in recommendations["options"]
    }
    for option in recommendations["options"]:
        assert set(option["contexts"]) & {"any", "work"}
        assert option["drink_fit"] != "often"
        assert option["verification_type"] == 3
        assert option["cue"] and option["fallback"] and option["completion_rule"]
        assert option["supporting_sources"]
        if option["domain"] == "aerobic_activity":
            assert option["demand"] == 0


@pytest.mark.asyncio
async def test_health_record_and_owned_barrier_history_are_separate_opt_ins(api):
    today = challenge_today()
    preferences = {"context": "dining_out", "mobility": "comfortable", "difficulty": "moderate"}
    initial = await _recommend(api, **preferences)
    start = await api.client.post(
        _CYCLES,
        headers=api.headers,
        json=_start_payload(initial["items"], start_date=today - timedelta(days=3), **preferences),
    )
    assert start.status_code == 201, start.text
    selected = start.json()["data"]["user_challenges"]
    activity = next(item for item in selected if item["domain"] == "aerobic_activity")
    await ChallengeBarrier.create(
        user_id=api.user.id,
        user_challenge_id=activity["user_challenge_id"],
        log_date=today - timedelta(days=1),
        reason_code="physical_discomfort",
        note="never-include-this-private-barrier-note",
    )
    eligibility = await EligibilityCheck.get(user_id=api.user.id)
    await HealthCheckup.create(
        user_id=api.user.id,
        eligibility_check_id=eligibility.id,
        checkup_date=today,
        age=60,
        sex="female",
        height_cm=181.23,
        weight_kg=73.45,
        bmi=22.4,
        systolic_bp=137,
        regular_exercise=False,
        current_drinker=False,
        hypertension_diagnosis=True,
        feature_schema_version="private-health-fixture",
    )

    no_opt_in = await _recommend(api, **preferences)
    assert no_opt_in["items"] == initial["items"]
    assert not no_opt_in["policy"]["health_record_applied"]
    assert not no_opt_in["policy"]["activity_history_applied"]
    assert any(item["domain"] == "aerobic_activity" and item["demand"] > 0 for item in no_opt_in["options"])

    record_only = await _recommend(api, use_health_record=True, **preferences)
    assert record_only["policy"]["health_record_applied"]
    assert not record_only["policy"]["activity_history_applied"]
    assert record_only["items"][1]["habit"] in {"label_sodium", "sauce_on_side"}
    assert not record_only["policy"]["adjustment_tips"]

    history_only = await _recommend(api, use_activity_history=True, **preferences)
    assert history_only["policy"]["activity_history_applied"]
    assert not history_only["policy"]["health_record_applied"]
    assert history_only["policy"]["adjustment_tips"]
    assert history_only["items"][1] == no_opt_in["items"][1]
    assert all(item["demand"] == 0 for item in history_only["options"] if item["domain"] == "aerobic_activity")

    for result in (no_opt_in, record_only, history_only):
        response_repr = repr(result)
        for private_value in (
            "never-include-this-private-barrier-note",
            "private-health-fixture",
            "physical_discomfort",
            "hypertension_diagnosis",
            "systolic_bp",
            "height_cm",
            "181.23",
        ):
            assert private_value not in response_repr


@pytest.mark.asyncio
async def test_start_revalidates_personal_options_and_legacy_log_and_reward_flow(api):
    preferences = {"context": "home", "mobility": "limited", "difficulty": "moderate"}
    recommended = await _recommend(api, **preferences)
    payload = _start_payload(recommended["items"], **preferences)
    catalog = await api.client.get("/api/v1/challenges", params={"catalog_version": PERSONAL_CATALOG_VERSION})
    assert catalog.status_code == 200, catalog.text
    by_code = {item["code"]: item for item in catalog.json()["data"]["items"]}
    restrictions = [
        {**payload, "challenge_ids": [*payload["challenge_ids"][:2], by_code["pv4_indoor_music"]["challenge_id"]]},
        {
            **payload,
            "challenge_ids": [
                payload["challenge_ids"][0],
                by_code["pv4_menu_veg"]["challenge_id"],
                payload["challenge_ids"][2],
            ],
        },
        {**payload, "catalog_version": "evidence-v3"},
    ]
    legacy = await api.client.get("/api/v1/challenges")
    legacy_id = legacy.json()["data"]["items"][0]["challenge_id"]
    restrictions.append({**payload, "challenge_ids": [legacy_id, *payload["challenge_ids"][1:]]})
    for rejected in restrictions:
        response = await api.client.post(_CYCLES, headers=api.headers, json=rejected)
        assert response.status_code == 422, response.text
    assert await ChallengeCycle.filter(user_id=api.user.id).count() == 0

    response = await api.client.post(_CYCLES, headers=api.headers, json=payload)
    assert response.status_code == 201, response.text
    cycle = response.json()["data"]
    selected = cycle["user_challenges"]
    assert tuple(item["domain"] for item in selected) == DOMAINS
    assert all(item["catalog_version"] == PERSONAL_CATALOG_VERSION for item in selected)

    reward_date = challenge_today().isoformat()
    reward_url = f"/api/v1/challenge-rewards/daily/{reward_date}"
    premature_reward = await api.client.post(reward_url, headers=api.headers)
    assert premature_reward.status_code == 409, premature_reward.text
    for item in selected:
        log_url = f"/api/v1/user-challenges/{item['user_challenge_id']}/logs/{reward_date}"
        data = {"is_completed": True, "value": 100}
        first = await api.client.put(log_url, headers=api.headers, json=data)
        retried = await api.client.put(log_url, headers=api.headers, json=data)
        assert first.status_code == retried.status_code == 200, (first.text, retried.text)
        assert first.json()["data"]["log_id"] == retried.json()["data"]["log_id"]
        assert retried.json()["data"]["value"] == 1

    finished = await api.client.get(f"{_CYCLES}/{cycle['cycle_id']}", headers=api.headers)
    assert finished.status_code == 200, finished.text
    assert finished.json()["data"]["completion_rate"] == 100
    assert await ChallengeLog.filter(user_id=api.user.id).count() == 3

    first = await api.client.post(reward_url, headers=api.headers)
    second = await api.client.post(reward_url, headers=api.headers)
    assert first.is_success and second.is_success, (first.text, second.text)
    claimed, retried = first.json()["data"], second.json()["data"]
    assert claimed["reward_id"] == retried["reward_id"]
    assert claimed["credited"] is True and retried["credited"] is False
    assert claimed["carrot_balance"] == retried["carrot_balance"]
    assert await DailyChallengeReward.filter(user_id=api.user.id).count() == 1
    assert await RewardTransaction.filter(user_id=api.user.id, source_type="daily_challenge_reward").count() == 1


@pytest.mark.asyncio
async def test_concurrent_cycle_creation_only_starts_one_cycle(api):
    recommended = await _recommend(api)
    payload = _start_payload(recommended["items"])
    first, second = await asyncio.gather(
        api.client.post(_CYCLES, headers=api.headers, json=payload),
        api.client.post(_CYCLES, headers=api.headers, json=payload),
    )
    assert {first.status_code, second.status_code} == {201, 409}, (first.text, second.text)
    assert await ChallengeCycle.filter(user_id=api.user.id).count() == 1
