"""Unit tests for the TheftGuard AI Household Usage and Bill Assistant endpoint.

Standard library only (uses ASGI dispatcher without external httpx).

Verifies:
- GET /v1/assistant/health
- POST /v1/assistant/chat (greetings, bill context explanation, appliance questionnaire)
- Mathematical and cycle length normalization in assistant responses
- Separation of verified facts and estimates
- Safe handling of zero/missing values
- Deterministic fallback when external AI provider is unconfigured
- Safety disclaimers (no false theft accusations)
"""

from __future__ import annotations

import asyncio
import json
import unittest
import urllib.parse
from typing import Any, Dict, Optional, Tuple

from service.main import app
from service.assistant_routes import (
    ApplianceEstimate,
    BillContext,
    QuestionnaireAnswers,
    build_appliance_estimates,
    generate_rule_based_response,
    perform_structured_analysis,
)


def request_endpoint(
    method: str,
    path: str,
    body: Optional[Any] = None,
    params: Optional[Dict[str, Any]] = None,
) -> Tuple[int, Dict[str, Any]]:
    """Helper to dispatch ASGI requests directly through FastAPI app (standard library only)."""
    qs = urllib.parse.urlencode(params or {}).encode()
    raw_body = json.dumps(body).encode() if body is not None else b""

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "path": path,
        "raw_path": path.encode(),
        "query_string": qs,
        "headers": [
            [b"content-type", b"application/json"],
            [b"content-length", str(len(raw_body)).encode()],
        ],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
    }

    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": raw_body, "more_body": False}
        return {"type": "http.disconnect"}

    resp = {}
    chunks = []

    async def send(msg):
        if msg["type"] == "http.response.start":
            resp["status"] = msg["status"]
        elif msg["type"] == "http.response.body":
            chunks.append(msg.get("body", b""))

    asyncio.run(app(scope, receive, send))
    text_data = b"".join(chunks).decode("utf-8")
    resp["data"] = json.loads(text_data) if text_data else {}
    return resp["status"], resp["data"]


class TestAssistantEndpoints(unittest.TestCase):
    def test_assistant_health_endpoint(self):
        status_code, data = request_endpoint("GET", "/v1/assistant/health")
        self.assertEqual(status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertIn("provider", data)
        self.assertIn("capabilities", data)
        self.assertTrue(data["privacy"]["data_minimization"])
        self.assertTrue(data["privacy"]["client_safe_secrets"])

    def test_assistant_chat_welcome_without_bills(self):
        payload = {"message": "Hello, can you help me?"}
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        self.assertIn("TheftGuard AI Bill Assistant", data["reply"])
        self.assertGreaterEqual(len(data["suggestions"]), 2)
        self.assertEqual(data["provider"], "local_rule_engine")

    def test_assistant_chat_with_bill_context(self):
        payload = {
            "message": "Why did my bill increase this month?",
            "bill_context": {
                "prev_units": 220.0,
                "curr_units": 245.0,
                "delta_units": 25.0,
                "pct_change_units": 11.4,
                "prev_days": 30,
                "curr_days": 31,
                "prev_daily": 7.33,
                "curr_daily": 7.90,
                "delta_daily": 0.57,
                "prev_amount": 1480.0,
                "curr_amount": 1725.0,
                "delta_amount": 245.0,
                "pct_change_amount": 16.6,
                "prev_period": "June 2026",
                "curr_period": "July 2026",
                "consumer_matched": True,
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)

        # Reply explains both consumption and amount
        self.assertIn("220", data["reply"])
        self.assertIn("245", data["reply"])
        self.assertIn("1480", data["reply"])
        self.assertIn("1725", data["reply"])

        # Structured analysis generated
        analysis = data["analysis"]
        self.assertIsNotNone(analysis)
        self.assertEqual(analysis["total_billed_delta_kwh"], 25.0)
        self.assertTrue(any("theft" in d.lower() or "tampering" in d.lower() for d in analysis["disclaimers"]))

    def test_assistant_chat_with_appliance_questionnaire(self):
        payload = {
            "message": "Here are my appliances",
            "bill_context": {
                "prev_units": 220.0,
                "curr_units": 320.0,
                "delta_units": 100.0,
                "prev_days": 30,
                "curr_days": 30,
            },
            "questionnaire_answers": {
                "occupants": "3-4",
                "has_ac": "yes",
                "ac_count": 1,
                "ac_hours": 4.0,
                "ac_increased": "yes",
                "has_geyser": "no",
                "has_refrigerator": "frost_free",
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)

        analysis = data["analysis"]
        self.assertIsNotNone(analysis)
        self.assertEqual(analysis["outcome"], "change_explained_by_appliances")
        self.assertGreater(len(analysis["appliance_breakdown"]), 0)

        # Check AC estimation
        ac_item = next(a for a in analysis["appliance_breakdown"] if "Air Conditioner" in a["appliance"])
        self.assertGreater(ac_item["estimated_monthly_kwh"], 50.0)
        self.assertIn("Assumes", ac_item["assumptions"])

    def test_safe_handling_of_zero_consumption(self):
        bill = BillContext(
            prev_units=0.0,
            curr_units=50.0,
            delta_units=50.0,
            pct_change_units=None,
            prev_amount=100.0,
            curr_amount=350.0,
        )
        res = perform_structured_analysis(bill, None)
        self.assertIsNotNone(res)
        self.assertEqual(res.outcome, "insufficient_information")

    def test_neutral_disclaimer_preserves_safety(self):
        # Even with large consumption change, disclaimers state no theft/tampering is proven
        bill = BillContext(prev_units=100.0, curr_units=400.0)
        res = perform_structured_analysis(bill, None)
        self.assertIsNotNone(res)
        self.assertTrue(any("does not establish electricity theft" in d.lower() for d in res.disclaimers))

    def test_rejection_of_oversized_message(self):
        big_msg = "A" * 2000
        status_code, _ = request_endpoint("POST", "/v1/assistant/chat", body={"message": big_msg})
        self.assertEqual(status_code, 422)  # Validation error (max_length=1500)

    def test_kwh_definition_intent(self):
        payload = {"message": "What does kWh mean?"}
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        self.assertIn("Kilowatt-hour", data["reply"])
        self.assertIn("1 Unit", data["reply"])
        self.assertIn("1,000 watts", data["reply"])

    def test_webpage_explanation_intent(self):
        payload = {"message": "Could you explain me this webpage?"}
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        self.assertIn("TheftGuard AI", data["reply"])
        self.assertIn("/app/bill-comparison", data["reply"])
        self.assertIn("/app/screening", data["reply"])

    def test_why_high_bill_without_bill_context(self):
        payload = {"message": "Why is my electricity bill so high this month?"}
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        self.assertIn("Air Conditioning", data["reply"])
        self.assertIn("Tariff Slab Escalation", data["reply"])
        self.assertIn("Bill Comparison (/app/bill-comparison)", data["reply"])

    def test_why_high_bill_with_active_sample_bills(self):
        payload = {
            "message": "Why is my electricity bill so high this month?",
            "bill_context": {
                "prev_units": 220.0,
                "curr_units": 245.0,
                "delta_units": 25.0,
                "pct_change_units": 11.4,
                "prev_days": 30,
                "curr_days": 31,
                "prev_daily": 7.33,
                "curr_daily": 7.90,
                "delta_daily": 0.57,
                "prev_amount": 1480.0,
                "curr_amount": 1725.0,
                "delta_amount": 245.0,
                "pct_change_amount": 16.6,
                "prev_period": "June 2026",
                "curr_period": "July 2026",
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        self.assertIn("220", data["reply"])
        self.assertIn("245", data["reply"])
        self.assertIn("11.4%", data["reply"])
        self.assertIn("7.33", data["reply"])
        self.assertIn("7.9", data["reply"])
        self.assertIn("1480", data["reply"])
        self.assertIn("1725", data["reply"])
        self.assertIn("Tariff Slab Impact", data["reply"])

    def test_what_should_i_do_next_with_and_without_bills(self):
        # Without bills
        _, data_no_bill = request_endpoint("POST", "/v1/assistant/chat", body={"message": "What should I do next?"})
        self.assertIn("Bill Comparison (/app/bill-comparison)", data_no_bill["reply"])
        self.assertIn("Load Telangana sample bills (Demo)", data_no_bill["reply"])

        # With bills
        _, data_with_bill = request_endpoint("POST", "/v1/assistant/chat", body={
            "message": "What should I do next?",
            "bill_context": {"prev_units": 200.0, "curr_units": 250.0},
        })
        self.assertIn("Verify Your Physical Meter Reading", data_with_bill["reply"])
        self.assertIn("Switch-Off Test", data_with_bill["reply"])

    def test_ac_calculation_from_hours(self):
        payload = {"message": "I use my AC for 8 hours every day. How much electricity could it consume?"}
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        self.assertIn("8", data["reply"])
        self.assertIn("1.5-Ton 3-Star Inverter AC", data["reply"])
        self.assertIn("0.95 kWh", data["reply"])
        self.assertIn("7.6 kWh", data["reply"])
        self.assertIn("228", data["reply"])

    def test_follow_up_conversation_context(self):
        payload = {
            "message": "And if I run it for 4 hours instead?",
            "conversation": [
                {"role": "user", "content": "How much power does an AC consume in 8 hours?"},
                {"role": "assistant", "content": "An AC running 8 hours consumes ~7.6 units/day (~228 kWh/month)."},
            ],
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        self.assertIn("4", data["reply"])
        self.assertIn("3.8 kWh", data["reply"])
        self.assertIn("114", data["reply"])

    def test_unknown_question_clarification(self):
        payload = {"message": "What is the capital of Mars?"}
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        self.assertIn("I specialize in household electricity billing", data["reply"])
        self.assertIn("Bill Analysis", data["reply"])
        self.assertIn("Appliance Estimates", data["reply"])

    def test_explain_comparison_with_active_sample_bills(self):
        payload = {
            "message": "Explain the comparison.",
            "bill_context": {
                "prev_units": 220.0,
                "curr_units": 245.0,
                "delta_units": 25.0,
                "pct_change_units": 11.4,
                "prev_days": 30,
                "curr_days": 31,
                "prev_daily": 7.33,
                "curr_daily": 7.90,
                "delta_daily": 0.57,
                "prev_amount": 1480.0,
                "curr_amount": 1725.0,
                "delta_amount": 245.0,
                "pct_change_amount": 16.6,
                "prev_period": "June 2026",
                "curr_period": "July 2026",
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        # Exact figures
        self.assertIn("220", reply)
        self.assertIn("245", reply)
        self.assertIn("11.4%", reply)
        self.assertIn("7.33", reply)
        self.assertIn("7.9", reply)
        self.assertIn("1480", reply)
        self.assertIn("1725", reply)
        # Effective cost per unit grounded calculation
        self.assertIn("6.73", reply)
        self.assertIn("7.04", reply)
        self.assertIn("0.31", reply)
        # Slab escalation explanation
        self.assertIn("Tariff Slab Impact", reply)
        # Safety disclaimer
        self.assertIn("do NOT indicate electricity theft", reply)

    def test_explain_comparison_without_active_bills(self):
        payload = {"message": "Explain the comparison."}
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("don't have an active bill comparison loaded", reply)
        self.assertIn("Bill Comparison (/app/bill-comparison)", reply)
        self.assertIn("Load Telangana sample bills (Demo)", reply)

    def test_follow_up_word_numbers_with_savings_calculation(self):
        payload = {
            "message": "What if I use it for four hours instead?",
            "conversation": [
                {"role": "user", "content": "How much electricity does my AC use for 8 hours?"},
                {
                    "role": "assistant",
                    "content": "A 1.5-Ton 3-Star Inverter AC running for 8 hours uses ~7.6 kWh/day (~228 kWh/month).",
                },
            ],
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("4.0 hours/day", reply)
        self.assertIn("3.8 kWh/day", reply)
        self.assertIn("114.0 kWh (units) per month", reply)
        self.assertIn("Comparison with your previous 8.0h scenario", reply)
        self.assertIn("114.0 kWh", reply)

    def test_multi_question_kwh_and_comparison(self):
        payload = {
            "message": "What does kWh mean and why did my bill increase?",
            "bill_context": {
                "prev_units": 220.0,
                "curr_units": 245.0,
                "delta_units": 25.0,
                "pct_change_units": 11.4,
                "prev_days": 30,
                "curr_days": 31,
                "prev_daily": 7.33,
                "curr_daily": 7.90,
                "delta_daily": 0.57,
                "prev_amount": 1480.0,
                "curr_amount": 1725.0,
                "delta_amount": 245.0,
                "pct_change_amount": 16.6,
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        # Both components must be present
        self.assertIn("What kWh (Kilowatt-Hour) Means", reply)
        self.assertIn("1,000 watts", reply)
        self.assertIn("Breakdown of Your Bill Comparison", reply)
        self.assertIn("220", reply)
        self.assertIn("245", reply)
        self.assertIn("Tariff Slab Impact", reply)

    def test_comparison_with_questionnaire_context(self):
        payload = {
            "message": "Explain the comparison.",
            "bill_context": {
                "prev_units": 220.0,
                "curr_units": 245.0,
                "delta_units": 25.0,
                "pct_change_units": 11.4,
                "prev_days": 30,
                "curr_days": 31,
                "prev_daily": 7.33,
                "curr_daily": 7.90,
                "delta_daily": 0.57,
                "prev_amount": 1480.0,
                "curr_amount": 1725.0,
                "delta_amount": 245.0,
                "pct_change_amount": 16.6,
            },
            "questionnaire_answers": {
                "occupants": "3-4",
                "has_ac": "yes",
                "ac_count": 1,
                "ac_hours": 4.0,
                "ac_increased": "yes",
                "has_geyser": "no",
                "has_refrigerator": "frost_free",
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Appliance Load Breakdown (From Your Profile)", reply)
        self.assertIn("Air Conditioning", reply)
        self.assertNotIn("Please complete the household questionnaire", reply)

    def test_exact_two_turn_ac_sequence_and_50_percent_savings(self):
        # Step 1: 8 hours standalone without bill comparison
        step1_msg = "I use my AC for 8 hours daily. How much electricity could it consume?"
        status1, data1 = request_endpoint("POST", "/v1/assistant/chat", body={"message": step1_msg})
        self.assertEqual(status1, 200)
        reply1 = data1["reply"]
        self.assertIn("1.5-Ton 3-Star Inverter AC", reply1)
        self.assertIn("8.0 hours/day", reply1)
        self.assertIn("0.95 kWh", reply1)
        self.assertIn("7.6 kWh", reply1)
        self.assertIn("228.0 kWh", reply1)
        self.assertIn("Real-World Variations", reply1)
        self.assertIn("thermostat setpoint", reply1)
        self.assertIn("weather conditions", reply1)
        self.assertIn("compressor duty cycling", reply1)

        # Step 2: "What if I use it for 4 hours instead?"
        step2_payload = {
            "message": "What if I use it for 4 hours instead?",
            "conversation": [
                {"role": "user", "content": step1_msg},
                {"role": "assistant", "content": reply1},
            ],
        }
        status2, data2 = request_endpoint("POST", "/v1/assistant/chat", body=step2_payload)
        self.assertEqual(status2, 200)
        reply2 = data2["reply"]
        self.assertIn("4.0 hours/day", reply2)
        self.assertIn("3.8 kWh", reply2)
        self.assertIn("114.0 kWh", reply2)
        # Reduction: 114 kWh/month, or 50%
        self.assertIn("50%", reply2)
        self.assertIn("114.0 kWh/month", reply2)
        # Tariff savings (~₹741 to ₹855)
        self.assertIn("741", reply2)
        self.assertIn("855", reply2)
        self.assertIn("illustrative tariff assumptions", reply2)

    def test_amount_increased_more_than_units_query(self):
        payload = {
            "message": "Why did the amount increase more than the units?",
            "bill_context": {
                "prev_units": 220.0,
                "curr_units": 245.0,
                "delta_units": 25.0,
                "pct_change_units": 11.4,
                "prev_days": 30,
                "curr_days": 31,
                "prev_daily": 7.33,
                "curr_daily": 7.90,
                "delta_daily": 0.57,
                "prev_amount": 1480.0,
                "curr_amount": 1725.0,
                "delta_amount": 245.0,
                "pct_change_amount": 16.6,
                "prev_effective_rate": 6.73,
                "curr_effective_rate": 7.04,
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("16.6%", reply)
        self.assertIn("Tariff Slab Impact", reply)
        self.assertIn("6.73", reply)
        self.assertIn("7.04", reply)
        self.assertIn("do NOT indicate electricity theft", reply)

    def test_what_does_this_mean_query(self):
        payload = {
            "message": "What does this mean?",
            "bill_context": {
                "prev_units": 220.0,
                "curr_units": 245.0,
                "delta_units": 25.0,
                "pct_change_units": 11.4,
                "prev_days": 30,
                "curr_days": 31,
                "prev_daily": 7.33,
                "curr_daily": 7.90,
                "prev_amount": 1480.0,
                "curr_amount": 1725.0,
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("220", reply)
        self.assertIn("245", reply)
        self.assertIn("Cycle Length Normalization", reply)

    def test_incomplete_bill_comparison_query(self):
        payload = {
            "message": "Explain the comparison.",
            "bill_context": {
                "is_complete": False,
                "has_bills": True,
                "missing_fields": ["Current Bill: Units consumed (kWh)", "Current Bill: Amount payable (₹)"],
                "prev_units": 220.0,
                "curr_units": None,
                "prev_amount": 1480.0,
                "curr_amount": None,
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("some required fields are incomplete or missing", reply)
        self.assertIn("Current Bill: Units consumed (kWh)", reply)
        self.assertIn("Current Bill: Amount payable (₹)", reply)
        self.assertIn("220.0 kWh", reply)
        self.assertNotIn("I don't have an active bill comparison loaded yet", reply)

    def test_single_message_ac_reduction_query(self):
        payload = {
            "message": "I use my AC for 8 hours daily. What if I use it for 4 hours instead?",
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("4.0 hours/day", reply)
        self.assertIn("3.8 kWh", reply)
        self.assertIn("114.0 kWh", reply)
        self.assertIn("50%", reply)
        self.assertIn("114.0 kWh/month", reply)
        self.assertIn("741", reply)
        self.assertIn("855", reply)
        self.assertIn("engineering estimates", reply)

    def test_ocr_partial_amount_3448_and_controlled_sample_test(self):
        # 1. Partial OCR State: OCR extracted curr_amount=3447.50, but missed previous units, previous amount, and current units
        partial_payload = {
            "message": "Explain the comparison.",
            "bill_context": {
                "is_complete": False,
                "has_bills": True,
                "missing_fields": [
                    "Previous Bill: Units consumed (kWh)",
                    "Previous Bill: Amount payable (₹)",
                    "Current Bill: Units consumed (kWh)",
                ],
                "prev_units": None,
                "curr_units": None,
                "prev_amount": None,
                "curr_amount": 3447.5,
                "prev_period": "June 2026",
                "curr_period": "July 2026",
            },
        }
        status_part, data_part = request_endpoint("POST", "/v1/assistant/chat", body=partial_payload)
        self.assertEqual(status_part, 200)
        reply_part = data_part["reply"]
        self.assertIn("some required fields are incomplete or missing", reply_part)
        self.assertIn("Previous Bill: Units consumed (kWh)", reply_part)
        self.assertIn("Previous Bill: Amount payable (₹)", reply_part)
        self.assertIn("Current Bill: Units consumed (kWh)", reply_part)
        self.assertIn("Previous Bill: Not provided", reply_part)
        self.assertIn("Current Bill: Not provided, ₹3448", reply_part)
        self.assertNotIn("I don't have an active bill comparison loaded yet", reply_part)

        # 2. Controlled Test with Explicit Sample Values:
        # Previous: 220 kWh, ₹1,480, 30 days
        # Current: 245 kWh, ₹1,725, 31 days
        controlled_payload = {
            "message": "Explain the comparison.",
            "bill_context": {
                "is_complete": True,
                "has_bills": True,
                "missing_fields": [],
                "prev_units": 220.0,
                "curr_units": 245.0,
                "delta_units": 25.0,
                "pct_change_units": 11.4,
                "prev_days": 30,
                "curr_days": 31,
                "prev_daily": 7.33,
                "curr_daily": 7.90,
                "delta_daily": 0.57,
                "prev_amount": 1480.0,
                "curr_amount": 1725.0,
                "delta_amount": 245.0,
                "pct_change_amount": 16.6,
                "prev_effective_rate": 6.73,
                "curr_effective_rate": 7.04,
                "prev_period": "June 2026",
                "curr_period": "July 2026",
                "consumer_matched": True,
            },
        }
        status_ctrl, data_ctrl = request_endpoint("POST", "/v1/assistant/chat", body=controlled_payload)
        self.assertEqual(status_ctrl, 200)
        reply_ctrl = data_ctrl["reply"]
        self.assertIn("220.0 kWh", reply_ctrl)
        self.assertIn("245.0 kWh", reply_ctrl)
        self.assertIn("+25.0 kWh", reply_ctrl)
        self.assertIn("11.4%", reply_ctrl)
        self.assertIn("1480", reply_ctrl)
        self.assertIn("1725", reply_ctrl)
    def test_cleared_bill_comparison_query(self):
        payload = {
            "message": "Explain the comparison.",
            "bill_context": None,
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("I don't have an active bill comparison loaded yet", reply)

    def test_ocr_processing_bill_context(self):
        ocr_payload = {
            "message": "Explain the comparison.",
            "bill_context": {
                "ocr_processing": True,
                "is_complete": False,
                "has_bills": True,
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=ocr_payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("currently being scanned", reply)
        self.assertIn("optical character recognition", reply)
        self.assertNotIn("I don't have an active bill comparison loaded yet", reply)

        greet_payload = {
            "message": "Hi there",
            "bill_context": {
                "ocr_processing": True,
                "is_complete": False,
                "has_bills": True,
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=greet_payload)
        self.assertEqual(status_code, 200)
        self.assertIn("currently being scanned with OCR", data["reply"])

        next_payload = {
            "message": "What should I do next?",
            "bill_context": {
                "ocr_processing": True,
                "is_complete": False,
                "has_bills": True,
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=next_payload)
        self.assertEqual(status_code, 200)
        self.assertIn("currently being scanned with on-device OCR", data["reply"])

    def test_incomplete_bill_context_missing_fields(self):
        payload = {
            "message": "Explain the comparison.",
            "bill_context": {
                "is_complete": False,
                "has_bills": True,
                "missing_fields": [
                    "Previous Bill: Units consumed (kWh)",
                    "Previous Bill: Amount payable (₹)",
                    "Current Bill: Units consumed (kWh)",
                ],
                "prev_units": None,
                "curr_units": None,
                "curr_amount": 3447.5,
                "curr_period": "July 2026",
            },
        }
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body=payload)
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Previous Bill: Units consumed (kWh)", reply)
        self.assertIn("Previous Bill: Amount payable (₹)", reply)
        self.assertIn("Current Bill: Units consumed (kWh)", reply)
        self.assertIn("3448", reply)
        self.assertIn("Bill Comparison", reply)


    def test_general_questions_llm_python_ml(self):
        # 1. "What is an LLM?"
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body={"message": "What is an LLM?"})
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Large Language Model", reply)
        self.assertIn("Transformer", reply)
        self.assertNotIn("I don't have an active bill comparison loaded yet", reply)

        # 2. "What is Python?"
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body={"message": "What is Python?"})
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("programming language", reply)
        self.assertNotIn("I don't have an active bill comparison loaded yet", reply)

        # 3. "What is machine learning?"
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body={"message": "What is machine learning?"})
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Machine Learning", reply)
        self.assertIn("patterns", reply)

    def test_tariff_explanation_neutrality(self):
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body={"message": "How do tariff slabs work?"})
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("telescopic", reply.lower())
        self.assertIn("slab", reply.lower())
    def test_benchmark_1_what_is_an_llm(self):
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body={"message": "What is an LLM?"})
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Large Language Model", reply)
        self.assertIn("Transformer", reply)
        self.assertNotIn("I don't have an active bill comparison", reply)
        self.assertTrue(any("Python" in s or "machine learning" in s for s in data["suggestions"]))

    def test_benchmark_2_what_is_an_llm_with_example_after_ac(self):
        conv = [
            {"role": "user", "content": "How much electricity does a 1.5-ton inverter AC consume in 8 hours?"},
            {"role": "assistant", "content": "An AC running 8 hours consumes ~7.6 kWh/day."},
        ]
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "What is an LLM? Explain it with a simple example.", "conversation": conv},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Large Language Model", reply)
        self.assertTrue("example" in reply.lower() or "simple" in reply.lower())
        # Crucial bug prevention: must NEVER return AC calculation
        self.assertNotIn("Air Conditioner Power Consumption", reply)
        self.assertNotIn("1.5-Ton 3-Star Inverter AC", reply)

    def test_benchmark_3_ai_ml_dl_difference(self):
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "What is the difference between AI, machine learning, and deep learning?"},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Artificial Intelligence (AI)", reply)
        self.assertIn("Machine Learning (ML)", reply)
        self.assertIn("Deep Learning (DL)", reply)
        self.assertNotIn("I don't have an active bill comparison loaded yet", reply)

    def test_benchmark_4_python_in_ai_after_ac(self):
        conv = [
            {"role": "user", "content": "How much electricity does a 1.5-ton inverter AC consume in 8 hours?"},
            {"role": "assistant", "content": "An AC running 8 hours consumes ~7.6 kWh/day."},
        ]
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "What is Python, and why is it used in AI?", "conversation": conv},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Python", reply)
        self.assertIn("programming language", reply)
        self.assertTrue("PyTorch" in reply or "scikit-learn" in reply)
        self.assertNotIn("Air Conditioner Power Consumption", reply)

    def test_benchmark_5_explain_apis_beginner(self):
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "Explain APIs like I am a beginner."},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Application Programming Interface", reply)
        self.assertTrue("waiter" in reply.lower())
        self.assertTrue("kitchen" in reply.lower() or "client" in reply.lower())

    def test_benchmark_6_what_does_kwh_mean(self):
        status_code, data = request_endpoint("POST", "/v1/assistant/chat", body={"message": "What does kWh mean?"})
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Kilowatt-hour", reply)
        self.assertIn("1 Unit", reply)
        self.assertIn("1,000 watts", reply)

    def test_benchmark_7_ac_8_hours(self):
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "How much electricity does a 1.5-ton inverter AC consume in 8 hours?"},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("1.5-Ton 3-Star Inverter AC", reply)
        self.assertTrue("8.0 hours/day" in reply or "8 hours/day" in reply)
        self.assertIn("7.6 kWh", reply)
        self.assertIn("228.0 kWh", reply)

    def test_benchmark_8_ac_4_hours_follow_up(self):
        conv = [
            {"role": "user", "content": "How much electricity does a 1.5-ton inverter AC consume in 8 hours?"},
            {"role": "assistant", "content": "A 1.5-Ton 3-Star Inverter AC running for 8.0 hours/day uses ~7.6 kWh/day (~228.0 kWh/month)."},
        ]
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "What if I run it for only 4 hours?", "conversation": conv},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertTrue("4.0 hours/day" in reply or "4 hours/day" in reply)
        self.assertIn("3.8 kWh", reply)
        self.assertIn("114.0 kWh", reply)
        self.assertTrue("Comparison with your previous 8" in reply or "saving" in reply)

    def test_benchmark_9_explain_bill_comparison_with_bills(self):
        bill = {
            "is_complete": True,
            "has_bills": True,
            "prev_units": 220.0,
            "curr_units": 245.0,
            "delta_units": 25.0,
            "pct_change_units": 11.4,
            "prev_days": 30,
            "curr_days": 31,
            "prev_amount": 1480.0,
            "curr_amount": 1725.0,
            "delta_amount": 245.0,
            "pct_change_amount": 16.6,
            "prev_period": "June 2026",
            "curr_period": "July 2026",
            "consumer_matched": True,
        }
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "Explain my bill comparison.", "bill_context": bill},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("220.0 kWh", reply)
        self.assertIn("245.0 kWh", reply)
        self.assertIn("11.4%", reply)
        self.assertIn("1480", reply)
        self.assertIn("1725", reply)
        self.assertIn("Cycle Length Normalization", reply)

    def test_benchmark_10_explain_bill_comparison_without_bills(self):
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "Explain my bill comparison"},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("I don't have an active bill comparison loaded yet", reply)
        self.assertIn("Bill Comparison (/app/bill-comparison)", reply)
        self.assertIn("Load Telangana sample bills (Demo)", reply)

    def test_reporting_guidance_discom_routing(self):
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "How do I report a suspected electricity issue in Hyderabad?"},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("1912", reply)
        self.assertIn("TGSPDCL", reply)
        self.assertIn("tgspdcl.cgg.gov.in", reply)

        status_code_w, data_w = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "Which electricity department should I contact in Warangal?"},
        )
        self.assertEqual(status_code_w, 200)
        self.assertIn("TGNPDCL", data_w["reply"])
        self.assertIn("1912", data_w["reply"])

    def test_reporting_guidance_documents_checklist(self):
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={
                "message": "What information and documents should I prepare for a complaint?",
                "bill_context": {"consumer_number": "123456789"},
            },
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Unique Service Number (USC)", reply)
        self.assertIn("123456789", reply)
        self.assertIn("Screen 2 (Cumulative kWh)", reply)
        self.assertIn("Never touch meter terminals", reply)

    def test_reporting_guidance_complaint_lifecycle(self):
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "What happens after I submit a complaint?"},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Docket Generation", reply)
        self.assertIn("Site Inspection", reply)
        self.assertIn("Bill Rectification", reply)
        self.assertIn("CGRF", reply)

    def test_reporting_guidance_complaint_draft(self):
        status_code, data = request_endpoint(
            "POST",
            "/v1/assistant/chat",
            body={"message": "Can you help me write a clear complaint for Hyderabad?"},
        )
        self.assertEqual(status_code, 200)
        reply = data["reply"]
        self.assertIn("Assistant Engineer (Operations)", reply)
        self.assertIn("Draft Only (Not Automatically Submitted)", reply)
        self.assertIn("1912", reply)


if __name__ == "__main__":
    unittest.main()



