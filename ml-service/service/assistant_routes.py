"""FastAPI routing and logic for the TheftGuard AI Household Usage and Bill Assistant.

Provides:
- POST /v1/assistant/chat : Interactive conversation, progressive Q&A, and bill analysis
- GET  /v1/assistant/health : Provider status, safety disclaimers, and capabilities

Privacy & Security:
- Strictly minimised context: only aggregate metrics and appliance usage flags are processed.
- No personal names, consumer account IDs, passwords, or bill images are accepted or logged.
- Secret safety: AI provider API keys remain exclusively on the backend in environment variables.
- Deterministic fallback: Operates seamlessly in local/offline mode when no AI provider key is configured.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

assistant_router = APIRouter(prefix="/v1/assistant", tags=["AI Bill Assistant"])

GEMINI_API_KEY_ENV = "GEMINI_API_KEY"
GEMINI_TIMEOUT_SECONDS = 8.0

# ------------------------------------------------------------------------------
# Pydantic Schemas
# ------------------------------------------------------------------------------

class BillContext(BaseModel):
    ocr_processing: Optional[bool] = Field(None, description="Whether OCR recognition is actively running")
    is_complete: Optional[bool] = Field(None, description="Whether all required comparison fields are valid")
    has_bills: Optional[bool] = Field(None, description="Whether bill data is present")
    missing_fields: Optional[List[str]] = Field(default_factory=list, description="List of missing required fields")
    prev_units: Optional[float] = Field(None, ge=0, description="Previous consumption in kWh")
    curr_units: Optional[float] = Field(None, ge=0, description="Current consumption in kWh")
    delta_units: Optional[float] = Field(None, description="Current minus previous kWh")
    pct_change_units: Optional[float] = Field(None, description="Percentage change in consumption")
    prev_days: Optional[int] = Field(None, gt=0, le=120, description="Previous billing days")
    curr_days: Optional[int] = Field(None, gt=0, le=120, description="Current billing days")
    prev_daily: Optional[float] = Field(None, ge=0, description="Previous daily rate in kWh/day")
    curr_daily: Optional[float] = Field(None, ge=0, description="Current daily rate in kWh/day")
    delta_daily: Optional[float] = Field(None, description="Daily rate difference in kWh/day")
    prev_amount: Optional[float] = Field(None, ge=0, description="Previous bill amount in INR")
    curr_amount: Optional[float] = Field(None, ge=0, description="Current bill amount in INR")
    delta_amount: Optional[float] = Field(None, description="Amount difference in INR")
    pct_change_amount: Optional[float] = Field(None, description="Percentage change in amount")
    prev_effective_rate: Optional[float] = Field(None, ge=0, description="Previous effective cost per unit in INR/kWh")
    curr_effective_rate: Optional[float] = Field(None, ge=0, description="Current effective cost per unit in INR/kWh")
    prev_period: Optional[str] = Field(None, max_length=50, description="Previous billing label")
    curr_period: Optional[str] = Field(None, max_length=50, description="Current billing label")
    consumer_matched: Optional[bool] = Field(None, description="Whether both bills verified same consumer")
    consumer_number: Optional[str] = Field(None, max_length=50, description="Unique Service Number (USC) or consumer number")


class QuestionnaireAnswers(BaseModel):
    occupants: Optional[str] = Field(None, max_length=50, description="Household size (e.g. '1-2', '3-4', '5+')")
    has_ac: Optional[str] = Field(None, max_length=20, description="Whether AC is used ('yes', 'no', 'skip')")
    ac_count: Optional[int] = Field(None, ge=0, le=20, description="Number of AC units")
    ac_hours: Optional[float] = Field(None, ge=0, le=24, description="Average daily AC hours")
    ac_increased: Optional[str] = Field(None, max_length=50, description="Whether AC usage increased recently")
    has_geyser: Optional[str] = Field(None, max_length=20, description="Whether electric geyser is used")
    geyser_hours: Optional[float] = Field(None, ge=0, le=24, description="Average daily geyser hours")
    has_refrigerator: Optional[str] = Field(None, max_length=50, description="Refrigerator type or presence")
    has_pump: Optional[str] = Field(None, max_length=50, description="Water pump type or presence")
    pump_hours: Optional[float] = Field(None, ge=0, le=24, description="Daily pump hours")
    has_washing_machine: Optional[str] = Field(None, max_length=50, description="Washing machine frequency")
    lifestyle_change: Optional[str] = Field(None, max_length=150, description="Guests, vacation, work from home, etc.")
    meter_accuracy_confidence: Optional[str] = Field(None, max_length=100, description="Customer belief about meter accuracy")


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$", description="'user' or 'assistant'")
    content: str = Field(..., min_length=1, max_length=1500, description="Message text")


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1500, description="User question or reply")
    conversation: Optional[List[ChatMessage]] = Field(default_factory=list, max_length=20)
    history: Optional[List[ChatMessage]] = Field(default_factory=list, max_length=20)
    bill_context: Optional[BillContext] = None
    questionnaire_answers: Optional[QuestionnaireAnswers] = None


class ApplianceEstimate(BaseModel):
    appliance: str
    wattage_watts: int
    daily_hours: float
    estimated_monthly_kwh: float
    assumptions: str


class StructuredAnalysis(BaseModel):
    outcome: str
    headline: str
    total_billed_delta_kwh: Optional[float] = None
    total_estimated_appliance_kwh: Optional[float] = None
    explained_delta_kwh: Optional[float] = None
    unexplained_delta_kwh: Optional[float] = None
    plausible_explanations: List[str]
    appliance_breakdown: List[ApplianceEstimate]
    disclaimers: List[str]
    recommended_steps: List[str]


class AssistantChatResponse(BaseModel):
    reply: str
    suggestions: List[str]
    analysis: Optional[StructuredAnalysis] = None
    provider: str
    timestamp: str


# ------------------------------------------------------------------------------
# Household Energy Estimation & Analysis Logic
# ------------------------------------------------------------------------------

# Typical Indian household appliance ratings (BEE 3-Star domestic baseline)
APPLIANCE_SPECS = {
    "ac_1_5_ton": {
        "name": "1.5 Ton Split AC (3-Star)",
        "rated_watts": 1500,
        "compressor_duty_cycle": 0.65,  # compressor cycles once room cools
        "kwh_per_hour": 0.975,
        "note": "Assumes 24°C thermostat setpoint in Indian summer conditions",
    },
    "geyser_25l": {
        "name": "25L Storage Geyser",
        "rated_watts": 2000,
        "compressor_duty_cycle": 0.80,
        "kwh_per_hour": 1.60,
        "note": "Thermostat cuts off when water reaches target temperature",
    },
    "refrigerator_250l": {
        "name": "Frost-Free Refrigerator (250L)",
        "rated_watts": 150,
        "compressor_duty_cycle": 0.40,
        "kwh_per_day": 1.25,
        "note": "Operates 24 hours with automatic compressor cycling",
    },
    "water_pump_1hp": {
        "name": "1.0 HP Domestic Water Pump",
        "rated_watts": 750,
        "compressor_duty_cycle": 1.0,
        "kwh_per_hour": 0.75,
        "note": "Direct motor operation when pumping overhead tank",
    },
    "ceiling_fan": {
        "name": "Ceiling Fan (BLDC/Standard)",
        "rated_watts": 65,
        "compressor_duty_cycle": 1.0,
        "kwh_per_hour": 0.065,
        "note": "Continuous operation at speed 3 to 4",
    },
}


def build_appliance_estimates(q: QuestionnaireAnswers, cycle_days: int = 30) -> List[ApplianceEstimate]:
    """Computes estimated monthly consumption with transparent assumptions."""
    estimates: List[ApplianceEstimate] = []

    # AC estimation
    if q.has_ac == "yes" and q.ac_hours and q.ac_hours > 0:
        units_count = q.ac_count if q.ac_count and q.ac_count > 0 else 1
        spec = APPLIANCE_SPECS["ac_1_5_ton"]
        monthly_kwh = round(spec["kwh_per_hour"] * q.ac_hours * units_count * cycle_days, 1)
        estimates.append(
            ApplianceEstimate(
                appliance=f"{units_count}x Air Conditioner ({spec['name']})",
                wattage_watts=spec["rated_watts"] * units_count,
                daily_hours=q.ac_hours,
                estimated_monthly_kwh=monthly_kwh,
                assumptions=f"Estimated at ~{spec['kwh_per_hour']} kWh/hr ({spec['note']}) over {cycle_days} days.",
            )
        )

    # Geyser estimation
    if q.has_geyser == "yes" and q.geyser_hours and q.geyser_hours > 0:
        spec = APPLIANCE_SPECS["geyser_25l"]
        monthly_kwh = round(spec["kwh_per_hour"] * q.geyser_hours * cycle_days, 1)
        estimates.append(
            ApplianceEstimate(
                appliance=spec["name"],
                wattage_watts=spec["rated_watts"],
                daily_hours=q.geyser_hours,
                estimated_monthly_kwh=monthly_kwh,
                assumptions=f"Estimated at ~{spec['kwh_per_hour']} kWh/hr ({spec['note']}) over {cycle_days} days.",
            )
        )

    # Refrigerator estimation
    if q.has_refrigerator and q.has_refrigerator != "none":
        spec = APPLIANCE_SPECS["refrigerator_250l"]
        monthly_kwh = round(spec["kwh_per_day"] * cycle_days, 1)
        estimates.append(
            ApplianceEstimate(
                appliance=spec["name"],
                wattage_watts=spec["rated_watts"],
                daily_hours=24.0,
                estimated_monthly_kwh=monthly_kwh,
                assumptions=f"Continuous operation with auto-cycling (~{spec['kwh_per_day']} kWh/day).",
            )
        )

    # Water pump estimation
    if q.has_pump and q.has_pump != "none" and q.pump_hours and q.pump_hours > 0:
        spec = APPLIANCE_SPECS["water_pump_1hp"]
        monthly_kwh = round(spec["kwh_per_hour"] * q.pump_hours * cycle_days, 1)
        estimates.append(
            ApplianceEstimate(
                appliance=spec["name"],
                wattage_watts=spec["rated_watts"],
                daily_hours=q.pump_hours,
                estimated_monthly_kwh=monthly_kwh,
                assumptions=f"Direct motor run (~{spec['kwh_per_hour']} kWh/hr) over {cycle_days} days.",
            )
        )

    return estimates


def perform_structured_analysis(
    bill: Optional[BillContext],
    q: Optional[QuestionnaireAnswers],
) -> Optional[StructuredAnalysis]:
    """Synthesizes validated bill differences and questionnaire responses into a responsible analysis."""
    if not bill or bill.prev_units is None or bill.curr_units is None:
        return None

    cycle_days = bill.curr_days or 30
    estimates = build_appliance_estimates(q, cycle_days) if q else []
    total_est_kwh = round(sum(e.estimated_monthly_kwh for e in estimates), 1)

    delta_kwh = round(bill.curr_units - bill.prev_units, 1)
    plausible: List[str] = []
    disclaimers: List[str] = [
        "Estimates use standard Indian 3-star appliance ratings and typical duty cycles; actual consumption depends on appliance age, thermostat settings, and wiring efficiency.",
        "Neutral Finding: Normal household fluctuations, weather, visitors, or tariff slab crossing does not establish electricity theft or meter tampering.",
    ]
    recommended_steps: List[str] = [
        "Verify your physical meter dial reading against the 'Current Reading' on your latest bill receipt.",
        "Check if you crossed a telescopic tariff slab (e.g., 100 or 200 units), which triggers higher per-unit rates.",
        "If you suspect a faulty meter or stuck disc/dial, contact your DISCOM helpline (e.g. 1912 in Telangana) to request meter testing.",
    ]

    # Evaluate outcome
    if abs(delta_kwh) <= 15:
        outcome = "no_unusual_change"
        headline = "Consumption is Stable and Consistent"
        plausible.append(f"The difference of {delta_kwh:+0.1f} kWh is within routine monthly variance (±5%).")
        if bill.delta_amount and abs(bill.delta_amount) > 100:
            plausible.append("Notice: Bill amount changed despite steady consumption; this typically reflects fixed charges, duty, or tariff adjustments rather than higher energy use.")
    elif delta_kwh > 15:
        # Consumption increased
        if q and q.ac_hours and q.ac_hours > 0 and q.ac_increased in ("yes", "summer", "guests"):
            outcome = "change_explained_by_appliances"
            headline = f"Consumption Increase (+{delta_kwh} kWh) Closely Matches Reported Appliance Use"
            plausible.append(f"Reported cooling/AC usage accounts for approximately {total_est_kwh} kWh of monthly load.")
            plausible.append("Rising summer temperatures cause AC compressors to run longer duty cycles even if operating hours remain unchanged.")
        elif q and q.lifestyle_change and "guests" in q.lifestyle_change.lower():
            outcome = "change_explained_by_appliances"
            headline = f"Consumption Increase (+{delta_kwh} kWh) Consistent with Guest/Occupancy Changes"
            plausible.append("Additional occupants significantly raise water heating, fan usage, cooking, and electronics consumption.")
        elif q and q.meter_accuracy_confidence and "wrong" in q.meter_accuracy_confidence.lower():
            outcome = "unusual_change_review_recommended"
            headline = f"Unusual Consumption Increase (+{delta_kwh} kWh); Meter Reading Verification Recommended"
            plausible.append("Customer reports meter dial does not match bill reading. Possible spot-billing entry error or estimated assessment.")
            recommended_steps.insert(0, "Take a clear timestamped photograph of your meter dial and compare with the 'Present Reading' column.")
        elif not q or (not q.has_ac and not q.occupants):
            outcome = "insufficient_information"
            headline = f"Recorded Consumption Rose by +{delta_kwh} kWh (Further Details Needed)"
            plausible.append("No appliance or lifestyle details have been recorded yet to evaluate this increase.")
            recommended_steps.insert(0, "Answer the quick household questionnaire to check if your cooling, heating, or refrigeration explains the change.")
        else:
            outcome = "unusual_change_review_recommended"
            headline = f"Unexplained Consumption Increase of +{delta_kwh} kWh; Review Recommended"
            plausible.append("Reported appliances do not fully account for the higher consumption recorded.")
            plausible.append("Potential factors: undetected wiring leakage, unserviced high-draw equipment, or a billing multiplier adjustment.")
    else:
        # Consumption decreased
        outcome = "no_unusual_change"
        headline = f"Recorded Consumption Decreased by {abs(delta_kwh)} kWh"
        plausible.append(f"Consumption fell from {bill.prev_units} kWh to {bill.curr_units} kWh ({bill.pct_change_units:+0.1f}%).")
        if q and q.lifestyle_change and "vacation" in q.lifestyle_change.lower():
            plausible.append("Explained by reported travel, vacation, or reduced days at home.")
        else:
            plausible.append("Reflects reduced appliance runtime, seasonal weather changes, or active energy conservation.")

    return StructuredAnalysis(
        outcome=outcome,
        headline=headline,
        total_billed_delta_kwh=delta_kwh,
        total_estimated_appliance_kwh=total_est_kwh if estimates else None,
        explained_delta_kwh=min(total_est_kwh, delta_kwh) if delta_kwh > 0 and total_est_kwh > 0 else None,
        unexplained_delta_kwh=max(0.0, round(delta_kwh - total_est_kwh, 1)) if delta_kwh > 0 and total_est_kwh > 0 else None,
        plausible_explanations=plausible,
        appliance_breakdown=estimates,
        disclaimers=disclaimers,
        recommended_steps=recommended_steps,
    )


# ------------------------------------------------------------------------------
# Deterministic Rule-Based Conversational Engine
# ------------------------------------------------------------------------------

WORD_TO_NUM: Dict[str, float] = {
    "zero": 0.0, "one": 1.0, "two": 2.0, "three": 3.0, "four": 4.0,
    "five": 5.0, "six": 6.0, "seven": 7.0, "eight": 8.0, "nine": 9.0,
    "ten": 10.0, "eleven": 11.0, "twelve": 12.0, "half": 0.5,
}


def extract_appliance_numbers(msg_lower: str) -> tuple[Optional[float], Optional[int], Optional[float]]:
    """Extracts target hours, unit count, and optional baseline previous hours."""
    hours = None
    prev_hours = None
    count = None

    all_hours: List[float] = []
    for m in re.finditer(r"(?:for\s*)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b", msg_lower):
        all_hours.append(float(m.group(1)))
    for wm in re.finditer(r"(?:for\s*)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?|hrs?|h)\b", msg_lower):
        if wm.group(1) in WORD_TO_NUM:
            all_hours.append(WORD_TO_NUM[wm.group(1)])
    if "half an hour" in msg_lower or "half hour" in msg_lower or "half a hour" in msg_lower:
        all_hours.append(0.5)

    if len(all_hours) >= 2:
        prev_hours = all_hours[0]
        hours = all_hours[-1]
    elif len(all_hours) == 1:
        hours = all_hours[0]

    digit_count = re.search(r"(\d+)\s*(?:ac|air\s*conditioner|split|window|unit)", msg_lower)
    if digit_count:
        count = int(digit_count.group(1))
    else:
        word_count = re.search(r"(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:ac|air\s*conditioner|split|window|unit)", msg_lower)
        if word_count and word_count.group(1) in WORD_TO_NUM:
            count = int(WORD_TO_NUM[word_count.group(1)])

    return hours, count, prev_hours


def _detect_history_context(conv: Optional[List[ChatMessage]]) -> Optional[str]:
    if not conv:
        return None
    for msg in reversed(conv[-6:]):
        c = msg.content.lower()
        if re.search(r"\b(?:llm|llms|large language model)\b", c):
            return "llm"
        if re.search(r"\bpython\b", c):
            return "python"
        if re.search(r"\bapis?\b", c):
            return "api"
        if re.search(r"\b(?:machine learning|deep learning|artificial intelligence)\b", c):
            return "ai"
        if re.search(r"\bac\b", c) or "air condition" in c or re.search(r"\bcooling\b", c):
            return "ac"
        if re.search(r"\bgeyser\b", c) or "water heater" in c:
            return "geyser"
        if re.search(r"\bpump\b", c) or re.search(r"\bmotor\b", c) or "borewell" in c:
            return "pump"
        if re.search(r"\bmeter\b", c) or re.search(r"\bdial\b", c):
            return "meter"
        if re.search(r"\btariff\b", c) or re.search(r"\bslabs?\b", c):
            return "tariff"
        if re.search(r"\bbills?\b", c) or re.search(r"\bkwh\b", c) or re.search(r"\bcomparison\b", c):
            return "bill"
    return None


def find_previous_hours_from_history(conv: Optional[List[ChatMessage]], current_hours: Optional[float] = None) -> Optional[float]:
    if not conv:
        return None
    for msg in reversed(conv[-8:]):
        c = msg.content.lower()
        for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(?:hours?/day|hours?|hrs?|h\b)", c):
            val = float(m.group(1))
            if current_hours is None or abs(val - current_hours) > 0.01:
                return val
        for wm in re.finditer(r"(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?/day|hours?|hrs?|h\b)", c):
            if wm.group(1) in WORD_TO_NUM:
                val = WORD_TO_NUM[wm.group(1)]
                if current_hours is None or abs(val - current_hours) > 0.01:
                    return val
    return None


def build_kwh_definition() -> str:
    return (
        "**kWh stands for Kilowatt-hour.** It is the official billing unit of electrical energy shown on your electricity bill (commonly called **\"1 Unit\"**).\n\n"
        "• **What 1 kWh (1 Unit) means in practice:**\n"
        "  Using 1,000 watts of electrical power continuously for 1 hour equals exactly 1 kWh (1 unit). For example:\n"
        "  - Running a 1,000W electric iron for 1 hour consumes **1 unit**.\n"
        "  - Running ten 100W incandescent bulbs for 1 hour consumes **1 unit**.\n"
        "  - Running a 1.5-ton 3-star AC for about 1 hour consumes approximately **0.95 to 1.1 units**.\n\n"
        "• **Difference between kW and kWh:**\n"
        "  - **kW (Kilowatt)** is the *rate* or capacity of power flow (like the speed of water flowing from a tap).\n"
        "  - **kWh (Kilowatt-hour)** is the *total energy* consumed over time (like the total liters collected in a bucket).\n"
        "  - **Contracted / Sanctioned Load (kW)**: The maximum peak power capacity sanctioned by your DISCOM (typically 1 to 5 kW for homes)."
    )


def build_ocr_processing_reply() -> str:
    return (
        "Your electricity bill is currently being scanned using on-device optical character recognition (OCR).\n\n"
        "• **Scanning in progress**: Reading meter values, dates, units consumed, and amounts payable directly from your uploaded bill image.\n"
        "• **What to do**: Please wait a few moments for the scan to finish. Once complete, you will see the extracted fields populated in your bill slots.\n"
        "• **Review**: You can quickly verify the extracted numbers or fill in any unreadable values in **Bill Comparison** (/app/bill-comparison) before running the comparison."
    )


def build_incomplete_bill_reply(bill: BillContext) -> str:
    missing = bill.missing_fields if bill.missing_fields else ["Units consumed (kWh)", "Amount payable (₹)"]
    reply = (
        "I can see bill information loaded in Bill Comparison, but some required fields are incomplete or missing before a full comparative analysis can be calculated.\n\n"
        "**Missing or Incomplete Details Needed:**\n"
    )
    for field in missing:
        reply += f"• {field}\n"
    reply += "\n**Currently Recorded Details:**\n"
    prev_str = f"{bill.prev_units:0.1f} kWh" if bill.prev_units is not None else "Not provided"
    if bill.prev_amount is not None:
        prev_str += f", ₹{bill.prev_amount:0.0f}"
    if bill.prev_period:
        prev_str += f" ({bill.prev_period})"
    curr_str = f"{bill.curr_units:0.1f} kWh" if bill.curr_units is not None else "Not provided"
    if bill.curr_amount is not None:
        curr_str += f", ₹{bill.curr_amount:0.0f}"
    if bill.curr_period:
        curr_str += f" ({bill.curr_period})"
    reply += f"• Previous Bill: {prev_str}\n"
    reply += f"• Current Bill: {curr_str}\n\n"
    reply += "Please enter or verify the missing values in the bill forms in **Bill Comparison** (/app/bill-comparison) to see your full consumption delta, normalized daily burn rate, and tariff breakdown."
    return reply


def build_comparison_reply(bill: BillContext, q: Optional[QuestionnaireAnswers] = None) -> str:
    if bill.is_complete is False or bill.curr_units is None or bill.prev_units is None:
        return build_incomplete_bill_reply(bill)

    prev_u = bill.prev_units if bill.prev_units is not None else 0.0
    curr_u = bill.curr_units if bill.curr_units is not None else 0.0
    delta_u = round(curr_u - prev_u, 1)
    pct_u = round(((curr_u - prev_u) / prev_u) * 100, 1) if prev_u > 0 else 0.0
    prev_d = bill.prev_days or 30
    curr_d = bill.curr_days or 30
    prev_daily = round(prev_u / prev_d, 2)
    curr_daily = round(curr_u / curr_d, 2)
    delta_daily = round(curr_daily - prev_daily, 2)
    pct_daily = round(((curr_daily - prev_daily) / prev_daily) * 100, 1) if prev_daily > 0 else 0.0
    prev_a = bill.prev_amount
    curr_a = bill.curr_amount
    delta_a = round(curr_a - prev_a) if prev_a is not None and curr_a is not None else None
    pct_a = round(((curr_a - prev_a) / prev_a) * 100, 1) if prev_a and prev_a > 0 and curr_a is not None else None
    prev_period = bill.prev_period or "Previous Month"
    curr_period = bill.curr_period or "Current Month"

    prev_eff = bill.prev_effective_rate if bill.prev_effective_rate is not None else (round(prev_a / prev_u, 2) if prev_a is not None and prev_u > 0 else None)
    curr_eff = bill.curr_effective_rate if bill.curr_effective_rate is not None else (round(curr_a / curr_u, 2) if curr_a is not None and curr_u > 0 else None)
    delta_eff = round(curr_eff - prev_eff, 2) if prev_eff is not None and curr_eff is not None else None

    reply = "Here is the verified breakdown of your active bill comparison:\n\n"
    if bill.consumer_matched is False:
        reply += "*(Note: The consumer numbers on your two bills did not match. Ensure both bills belong to the same connection before comparing trends.)*\n\n"
    reply += f"• **Billed Consumption**:\n"
    reply += f"  Shifted from **{prev_u:0.1f} kWh** ({prev_period}) to **{curr_u:0.1f} kWh** ({curr_period}), an increase of **{delta_u:+0.1f} kWh ({pct_u:+0.1f}%)**.\n\n"

    reply += f"• **Cycle Length Normalization**:\n"
    if prev_d != curr_d:
        diff_days = abs(curr_d - prev_d)
        more_less = "extra day(s)" if curr_d > prev_d else "fewer day(s)"
        reply += (
            f"  Your previous bill covered **{prev_d} days**, while this bill covered **{curr_d} days**. Normalized for cycle length, your daily consumption rate rose from **{prev_daily} to {curr_daily} kWh/day ({delta_daily:+0.2f} kWh/day or {pct_daily:+0.1f}%)**.\n"
            f"  *Context*: Because the current cycle has {diff_days} {more_less}, part of the overall unit increase is due to the longer billing period; the true daily intensity rose by {pct_daily:+0.1f}%, which is less than the total billed unit increase of {pct_u:+0.1f}%.\n\n"
        )
    else:
        reply += f"  Both billing cycles were **{curr_d} days**. Normalized daily rate changed from **{prev_daily} to {curr_daily} kWh/day ({delta_daily:+0.2f} kWh/day or {pct_daily:+0.1f}%)**.\n\n"

    if prev_a is not None and curr_a is not None:
        reply += f"• **Bill Amount & Tariff Escalation**:\n"
        reply += f"  Total bill amount changed from **₹{prev_a:0.0f}** to **₹{curr_a:0.0f}** (**{delta_a:+0.0f} ₹ or {pct_a:+0.1f}%**).\n"
        if pct_a is not None and pct_a > pct_daily:
            reply += (
                f"  *Tariff Slab Impact & Escalation*: Notice that your total bill amount increased by **{pct_a}%**, which is higher than the billed energy increase of **{pct_u}%** (and daily rate increase of {pct_daily}%). "
                "Under telescopic tariff structures and DISCOM billing schedules, incremental units are subject to higher slab rates alongside applicable fixed demand charges, customer charges, and fuel surcharges, which causes the bill amount to escalate faster than energy consumption. (Note: Whether a specific tariff slab threshold was crossed depends on your utility's specific slab cutoff brackets, e.g. 100 or 200 units).\n"
            )
        reply += "\n"

    if prev_eff is not None and curr_eff is not None:
        reply += (
            f"• **Effective Cost per Unit** (Total Amount ÷ Units Consumed):\n"
            f"  - {prev_period}: ₹{prev_a:0.0f} ÷ {prev_u:0.0f} units = **₹{prev_eff:0.2f} per kWh**\n"
            f"  - {curr_period}: ₹{curr_a:0.0f} ÷ {curr_u:0.0f} units = **₹{curr_eff:0.2f} per kWh** ({delta_eff:+0.2f} ₹/unit)\n"
            f"  *Explanation*: Your effective cost per unit includes fixed demand charges, customer charges, fuel surcharge adjustment (FSA), and duties averaged across all units. It is different from your marginal per-unit rate for additional units.\n\n"
        )

    # Synthesize questionnaire answers if available
    has_profile = False
    if q:
        appliance_lines = []
        if q.has_ac == "yes" and q.ac_hours and q.ac_hours > 0:
            has_profile = True
            count = q.ac_count if q.ac_count and q.ac_count > 0 else 1
            daily_kwh = round(count * q.ac_hours * 0.95, 1)
            monthly_kwh = round(daily_kwh * curr_d, 1)
            pct_bill = round((monthly_kwh / curr_u) * 100) if curr_u > 0 else None
            pct_str = f", ~{pct_bill}% of current bill" if pct_bill is not None else ""
            appliance_lines.append(f"  - **Air Conditioning**: {count} unit(s) at ~{q.ac_hours:0.1f} hrs/day = estimated **~{monthly_kwh} kWh/month** (~{daily_kwh} kWh/day{pct_str}).")

        if q.has_geyser == "yes" and q.geyser_hours and q.geyser_hours > 0:
            has_profile = True
            daily_kwh = round(q.geyser_hours * 2.0, 1)
            monthly_kwh = round(daily_kwh * curr_d, 1)
            appliance_lines.append(f"  - **Water Heater (Geyser)**: ~{q.geyser_hours:0.1f} hrs/day = estimated **~{monthly_kwh} kWh/month** (~{daily_kwh} kWh/day).")

        if q.has_pump and q.has_pump != "none" and q.pump_hours and q.pump_hours > 0:
            has_profile = True
            daily_kwh = round(q.pump_hours * 0.75, 1)
            monthly_kwh = round(daily_kwh * curr_d, 1)
            appliance_lines.append(f"  - **Water Pump / Motor**: ~{q.pump_hours:0.1f} hrs/day = estimated **~{monthly_kwh} kWh/month** (~{daily_kwh} kWh/day).")

        if q.has_refrigerator and q.has_refrigerator != "none":
            has_profile = True
            monthly_kwh = round(1.0 * curr_d, 1)
            appliance_lines.append(f"  - **Refrigerator (24/7)**: Standard auto-cycling consumes an estimated **~{monthly_kwh} kWh/month** (~1.0 kWh/day).")

        if appliance_lines:
            reply += "• **Appliance Load Breakdown (From Your Profile)**:\n"
            reply += "\n".join(appliance_lines) + "\n"
            reply += "  *(Estimates based on BEE 3-star standard appliances. You can adjust your hours in the Household Usage Profile tab above.)*\n\n"

    if not has_profile:
        reply += (
            "• **Household Profile Opportunity**:\n"
            f"  To see exactly how much your air conditioner, geyser, or pump contributes to this {delta_u:+0.1f} kWh shift, "
            "complete the quick 4-question **Household Usage Profile** in the tab above!\n\n"
        )

    reply += (
        "**Plausible Causes & Actionable Next Steps:**\n"
        "1. **Verify Physical Meter Dial**: Check your meter box to confirm cumulative kWh is equal to or greater than the current reading on your bill (rule out meter reader punch errors).\n"
        "2. **Check Compressor & Thermostat**: In hotter weather, AC compressors run longer duty cycles. Keeping thermostats at **24°C** saves 20% to 25% on cooling.\n"
        "3. **Switch-Off Test**: Turn off your main MCB for 10 minutes. If the meter pulse LED continues blinking rapidly, inspect for internal wiring leakage or continuous pump overflow.\n"
        "4. **DISCOM Inquiry**: If you suspect a meter calibration fault or punch error, take a photo of the dial and call **1912** or visit your local DISCOM sub-engineer office.\n\n"
        "*(Note: Normal seasonal bill fluctuations or slab crossing do NOT indicate electricity theft or tampering.)*"
    )
    return reply


def build_missing_bill_reply() -> str:
    return (
        "I don't have an active bill comparison loaded yet to explain.\n\n"
        "**To compare your bills side-by-side with verified metrics:**\n"
        "1. Go to Bill Comparison (/app/bill-comparison).\n"
        "2. Click \"Load Telangana sample bills (Demo)\" for an instant side-by-side walkthrough, or upload your previous and current bill receipts.\n"
        "3. Once loaded, ask me again and I will break down your exact consumption difference, normalized daily burn (kWh/day), tariff slab shift, and effective cost per unit!\n\n"
        "**Common Factors Behind Household Bill Changes:**\n"
        "1. **Seasonal Weather & Air Conditioning**:\n"
        "   In hotter months, AC compressors work much harder to reach thermostat temperatures. Even running the same hours, high outdoor heat can increase power draw by 30% to 50%.\n\n"
        "2. **Telescopic Tariff Slab Escalation (The 'Cliff Effect')**:\n"
        "   When your monthly units cross a tariff slab threshold (e.g., above 100 or 200 units), the additional units are billed at a significantly higher rate, and fixed customer charges increase.\n\n"
        "3. **Meter Reading Punch Errors or Door Lock Estimates**:\n"
        "   If a meter reader mistypes a digit or the meter was inaccessible (billed on average/estimate), your bill reading can be higher than the actual meter dial.\n\n"
        "4. **Unnoticed Continuous Power Leaks**:\n"
        "   A running water motor due to an overflowing tank, worn refrigerator door gaskets, or aging inverter batteries drawing continuous charge."
    )


def build_ac_reply(
    hours: float = 8.0,
    count: int = 1,
    bill: Optional[BillContext] = None,
    history: Optional[List[ChatMessage]] = None,
    recent_context: Optional[str] = None,
    explicit_prev_hours: Optional[float] = None,
) -> str:
    kwh_per_hour = 0.95
    daily_kwh = round(count * hours * kwh_per_hour, 1)
    monthly_kwh = round(daily_kwh * 30, 1)
    cost_min = round(monthly_kwh * 6.5)
    cost_max = round(monthly_kwh * 7.5)

    reply = (
        "Estimated Air Conditioner Power Consumption:\n\n"
        f"• Assumptions: {count} unit(s) of 1.5-Ton 3-Star Inverter AC running for {hours:0.1f} hours/day.\n"
        "• Compressor Cycling Rate: Standard 3-star inverter ACs have a rated power of ~1,200W, averaging ~0.95 kWh per hour as the compressor cycles to maintain room temperature.\n\n"
        "Calculated Estimates:\n"
        f"• Daily Energy: {hours:0.1f} hrs × 0.95 kWh/hr{' × ' + str(count) + ' ACs' if count > 1 else ''} = ~{daily_kwh} kWh (units) per day.\n"
        f"• Monthly Energy (30 days): {daily_kwh} kWh/day × 30 days = ~{monthly_kwh} kWh (units) per month.\n"
        f"• Estimated Cost: At standard Indian domestic slab rates (~₹6.50 to ₹7.50/unit), this cooling load adds approximately ₹{cost_min:,} to ₹{cost_max:,} to your monthly bill.\n\n"
    )

    prev_hours = explicit_prev_hours if explicit_prev_hours is not None else find_previous_hours_from_history(history, hours)
    if prev_hours is not None and abs(prev_hours - hours) > 0.01:
        prev_daily = round(count * prev_hours * kwh_per_hour, 1)
        prev_monthly = round(prev_daily * 30, 1)
        delta_monthly = round(prev_monthly - monthly_kwh, 1)
        pct_change = round((abs(delta_monthly) / prev_monthly) * 100) if prev_monthly > 0 else 0
        saved_min = round(abs(delta_monthly) * 6.5)
        saved_max = round(abs(delta_monthly) * 7.5)
        if delta_monthly > 0:
            reply += (
                f"• **Comparison with your previous {prev_hours:0.1f}h scenario**: "
                f"Reducing daily AC runtime from {prev_hours:0.1f} hours to {hours:0.1f} hours cuts your estimated monthly cooling consumption "
                f"from ~{prev_monthly} kWh down to ~{monthly_kwh} kWh—saving approximately "
                f"**{delta_monthly} kWh/month, or {pct_change}% (~₹{saved_min:,} to ₹{saved_max:,}) each month** under illustrative tariff assumptions (~₹6.50 to ₹7.50/unit)!\n\n"
            )
        else:
            reply += (
                f"• **Comparison with your previous {prev_hours:0.1f}h scenario**: "
                f"Increasing daily AC runtime from {prev_hours:0.1f} hours to {hours:0.1f} hours raises your monthly cooling consumption "
                f"from ~{prev_monthly} kWh up to ~{monthly_kwh} kWh—adding approximately "
                f"**{abs(delta_monthly)} kWh/month, or +{pct_change}% (~₹{saved_min:,} to ₹{saved_max:,}) each month** under illustrative tariff assumptions (~₹6.50 to ₹7.50/unit).\n\n"
            )

    if bill and bill.delta_units is not None:
        reply += f"In your active comparison, your total bill changed by {bill.delta_units:+0.1f} kWh. "
        if abs(bill.delta_units - monthly_kwh) < 50:
            reply += f"This estimated AC usage of ~{monthly_kwh} kWh closely aligns with the observed consumption change.\n\n"
        else:
            reply += f"Note that this {monthly_kwh} kWh is total estimated monthly cooling load, whereas your bill changed by {bill.delta_units:+0.1f} kWh compared to last month.\n\n"

    reply += (
        "• **Real-World Variations**: Please note that these figures are engineering estimates. Actual energy consumption depends on appliance star rating (e.g. 3-star vs 5-star inverter), "
        "room size and room insulation, outdoor ambient temperature, weather conditions, thermostat setpoint, and compressor duty cycling.\n\n"
        "*Energy Saving Tip*: Setting your AC thermostat at **24°C** instead of 18°C or 20°C saves up to 24% on cooling energy with no loss in comfort. Cleaning filters every 2 weeks prevents compressor strain."
    )
    return reply


def generate_rule_based_response(
    message: str,
    bill: Optional[BillContext],
    q: Optional[QuestionnaireAnswers],
    conversation: Optional[List[ChatMessage]] = None,
) -> AssistantChatResponse:
    """Generates friendly, helpful, context-aware responses without external network dependencies."""
    msg_lower = message.strip().lower()
    now_iso = datetime.now(timezone.utc).isoformat()
    analysis = perform_structured_analysis(bill, q)
    words = set(re.findall(r"\b[a-z0-9.]+\b", msg_lower))
    recent_context = _detect_history_context(conversation)

    # 1. Theft, meter tampering, or fraud concerns (Safety & Neutrality first)
    if words.intersection({"theft", "tampering", "tamper", "steal", "stolen", "fraud", "illegal", "hooking"}):
        reply = (
            "A high or fluctuating electricity bill is almost always caused by routine household factors: hotter summer weather leading to longer air conditioning cycles, visiting relatives, or stepping into a higher telescopic tariff slab.\n\n"
            "Important Safety Reassurance:\n"
            "• An increase in your electricity bill does NOT indicate electricity theft or meter tampering.\n"
            "• TheftGuard AI provides feeder-level loss screening tools for electricity distribution engineers at the substation level, not for penalizing household consumers.\n"
            "• If you suspect unauthorized physical hooking on your external service line or a mechanical meter fault, do not attempt to inspect live wires yourself. Contact your local DISCOM sub-engineer office or call the national 1912 electricity helpline for an authorized inspection."
        )
        suggestions = [
            "How can I check if my meter reading is accurate?",
            "Why is my electricity bill so high this month?",
            "How do tariff slabs work?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # Educational & Technical queries
    is_llm = (
        "llm" in words
        or "llms" in words
        or "large language model" in msg_lower
        or "what is an llm" in msg_lower
        or "what is a llm" in msg_lower
        or "explain llm" in msg_lower
        or (recent_context == "llm" and ("example" in msg_lower or "simple" in msg_lower or "it" in words or "explain" in words))
    )

    is_aiml_diff = (
        any(k in msg_lower for k in ["difference", "compare", "distinction", "vs"])
        and (
            ("ai" in msg_lower or "artificial intelligence" in msg_lower)
            and ("machine learning" in msg_lower or "ml" in msg_lower or "deep learning" in msg_lower or "dl" in msg_lower)
        )
    )

    is_python = (
        "python" in words
        or "what is python" in msg_lower
        or "python programming" in msg_lower
        or "explain python" in msg_lower
        or (recent_context == "python" and ("it" in words or "why" in msg_lower or "ai" in words))
    )

    is_api = (
        "api" in words
        or "apis" in words
        or "what is an api" in msg_lower
        or "what is api" in msg_lower
        or "explain api" in msg_lower
        or "explain apis" in msg_lower
        or "like i am a beginner" in msg_lower
        or "for beginners" in msg_lower
        or (recent_context == "api" and ("example" in msg_lower or "it" in words or "simple" in msg_lower))
    )

    is_general_aiml = (
        "machine learning" in msg_lower
        or "what is ml" in msg_lower
        or "how does ml work" in msg_lower
        or "what is ai" in msg_lower
        or "artificial intelligence" in msg_lower
        or ("what" in words and "ai" in words and len(words) <= 4)
    )

    is_general_tech = is_llm or is_aiml_diff or is_python or is_api or is_general_aiml

    if is_llm:
        wants_example = "example" in msg_lower or "simple" in msg_lower
        if wants_example:
            example_text = (
                "• **Simple Real-World Example**:\n"
                "  Imagine typing the phrase *'The sky is...'* into your phone keyboard, and it suggests *'blue'*. An LLM does something similar, but across billions of possible words, complex thoughts, and full paragraphs. If you give it a recipe, it predicts the next cooking step; if you give it a computer bug, it predicts the corrected code line.\n\n"
            )
        else:
            example_text = (
                "• **Simple Analogy**:\n"
                "  Think of an LLM like an advanced version of autocomplete on your phone—but scaled up to understand nuanced instructions, follow conversational context, summarize documents, write code, and answer complex questions.\n\n"
            )
        reply = (
            "**A Large Language Model (LLM)** is a type of artificial intelligence designed to understand, process, and generate human-like text.\n\n"
            "• **How it works:**\n"
            "  LLMs are built on deep neural network architectures called **Transformers**. They are trained on vast collections of text (books, articles, websites) to learn the statistical relationships between words and phrases.\n\n"
            "• **How it generates responses:**\n"
            "  When you ask a question, the model does not 'think' like a human or look up pre-written answers. Instead, it predicts the most statistically probable next words (tokens) one by one, based on the context of your conversation.\n\n"
            f"{example_text}"
            "• **How TheftGuard AI uses this:**\n"
            "  In TheftGuard AI, conversational AI handles natural language explanations, while verified deterministic math engines compute kilowatt-hours and billing numbers using grounded evidence, performing calculations carefully, disclosing uncertainty where data is incomplete, and never inventing results."
        )
        suggestions = [
            "What is Python, and why is it used in AI?",
            "What is the difference between AI, machine learning, and deep learning?",
            "Explain APIs like I am a beginner.",
            "What does kWh mean?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    if is_aiml_diff:
        reply = (
            "**The Difference Between AI, Machine Learning, and Deep Learning:**\n\n"
            "A helpful way to understand the difference is to picture **nested Russian nesting dolls** (or concentric circles), where each field is a specialized subset of the larger one:\n\n"
            "1. **Artificial Intelligence (AI) — The Broadest Umbrella**:\n"
            "   • Any computer technique that enables machines to mimic human intelligence, reasoning, or decision-making.\n"
            "   • Includes rule-based systems, expert logic, search algorithms, as well as learning models.\n\n"
            "2. **Machine Learning (ML) — A Subset of AI**:\n"
            "   • Systems that learn patterns directly from historical data rather than requiring human engineers to hardcode every rule.\n"
            "   • Instead of writing `if usage > 300`, an ML algorithm studies thousands of past consumption records and discovers the boundary patterns automatically.\n"
            "   • Common algorithms include Random Forests, Decision Trees, and Support Vector Machines.\n\n"
            "3. **Deep Learning (DL) — A Specialized Subset of ML**:\n"
            "   • Uses deep, multi-layered artificial neural networks inspired by biological neurons in the human brain.\n"
            "   • Excels at massive, high-dimensional unstructured data like images (vision), audio (speech), and natural language (LLMs).\n\n"
            "• **In TheftGuard AI**:\n"
            "  We use **Machine Learning** (a 13-feature Random Forest model) to detect feeder distribution loss anomalies, and **Natural Language AI** to power this helpful assistant workspace."
        )
        suggestions = [
            "What is an LLM?",
            "What is Python, and why is it used in AI?",
            "Explain APIs like I am a beginner.",
            "What does kWh mean?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    if is_python:
        reply = (
            "**Python** is one of the world's most popular, high-level, interpreted programming languages, renowned for its clean, readable syntax and versatility.\n\n"
            "• **Why Python dominates Artificial Intelligence:**\n"
            "  1. **Rich AI & Scientific Ecosystem**: The world's leading machine learning libraries—such as PyTorch, TensorFlow, scikit-learn, and NumPy—are built natively for Python.\n"
            "  2. **Readability & Rapid Prototyping**: Python reads almost like plain English. This allows data scientists and researchers to focus on mathematical models and algorithms rather than low-level memory management.\n"
            "  3. **Seamless Integration**: Python connects effortlessly with high-performance C/C++ backends, enabling fast hardware acceleration on GPUs and TPUs.\n\n"
            "• **Role in TheftGuard AI:**\n"
            "  TheftGuard AI's backend microservice is built in Python using **FastAPI** and **scikit-learn**. It executes our 13-feature Random Forest model to analyze transformer-level consumption patterns and screen for technical and commercial distribution losses."
        )
        suggestions = [
            "What is an LLM?",
            "What is the difference between AI, machine learning, and deep learning?",
            "Explain APIs like I am a beginner.",
            "What does kWh mean?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    if is_api:
        reply = (
            "**What is an API? (Explained for Beginners)**\n\n"
            "**API** stands for **Application Programming Interface**. In simple terms, an API is a messenger that lets two different software applications talk to each other and exchange information.\n\n"
            "• **The Restaurant Waiter Analogy**:\n"
            "  - Imagine you are sitting at a table in a restaurant looking at the menu. You are the **Client (Frontend)**.\n"
            "  - The kitchen is the **Server (Backend)** that has the ingredients and prepares the meal.\n"
            "  - You cannot walk straight into the kitchen to cook the food yourself.\n"
            "  - Instead, the **Waiter** is the **API**. The waiter takes your order (the request), delivers it to the kitchen, and brings back your prepared food (the response) to your table!\n\n"
            "• **How TheftGuard AI uses APIs**:\n"
            "  When you ask a question or upload a bill in this web application, the React browser interface sends an API request to our Python backend server at `/ml/v1/assistant/chat`, and the server sends back the verified response."
        )
        suggestions = [
            "What is an LLM?",
            "What is Python, and why is it used in AI?",
            "What is the difference between AI, machine learning, and deep learning?",
            "What does kWh mean?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    if is_general_aiml:
        reply = (
            "**Machine Learning (ML)** is a branch of artificial intelligence where computers learn to find patterns and make predictions from data, without being explicitly programmed with every rule.\n\n"
            "• **Traditional Code vs. Machine Learning:**\n"
            "  - *Traditional programming*: A developer writes specific rules (e.g. `if bill > 200 then flag`).\n"
            "  - *Machine learning*: An algorithm is fed historical consumption data and discovers subtle multi-variable patterns on its own.\n\n"
            "• **In TheftGuard AI:**\n"
            "  We utilize a **Random Forest classifier** trained on 13 engineered features—such as consumption variance, drop ratios, and seasonal patterns—to help utility engineers identify distribution losses at the transformer level."
        )
        suggestions = [
            "What is an LLM?",
            "What is Python, and why is it used in AI?",
            "Explain APIs like I am a beginner.",
            "What does kWh mean?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # Check query types
    is_kwh = (
        "kwh" in msg_lower
        or "kilowatt hour" in msg_lower
        or "what is a unit" in msg_lower
        or "what does unit mean" in msg_lower
        or "meaning of unit" in msg_lower
        or "define unit" in msg_lower
        or "kw vs kwh" in msg_lower
        or "sanctioned load" in msg_lower
        or "contracted load" in msg_lower
        or ("unit" in words and any(w in words for w in ["what", "meaning", "define", "means"]))
    )

    is_comparison = (
        not is_general_tech
        and (
            any(k in msg_lower for k in [
                "explain the comparison", "explain this comparison", "explain comparison",
                "explain my bill comparison", "explain the bill comparison",
                "explain these results", "explain the results", "explain results",
                "explain my current results", "explain current results", "explain my results",
                "what changed between my bills", "what changed between the bills",
                "what changed between bills",
                "what caused this increase", "what caused the increase",
                "compare my bills", "compare these bills", "compare bills",
                "bill comparison", "breakdown of my bill", "breakdown of the bill",
                "breakdown of bill", "explain my bill", "explain bill",
                "why is my bill high", "bill so high", "bill high",
                "why did my bill increase", "why did my bill change",
                "why did the amount increase more than the units",
                "why did the amount increase more than units",
                "amount increase more than the units",
                "amount increase more than units",
                "amount increased more than units",
                "why did the amount increase",
                "bill spike", "bill jump", "huge bill",
            ])
            or (any(k in msg_lower for k in ["what changed", "what does this mean", "what do these results mean", "what does it mean"]) and (bill is not None or recent_context == "bill"))
            or (any(k in msg_lower for k in ["explain the difference", "explain difference"]) and (bill is not None or recent_context == "bill" or any(w in words for w in ["bill", "bills", "units", "kwh"])))
            or ("amount" in words and "increase" in words and any(w in words for w in ["units", "kwh"]))
            or ("explain" in words and (("difference" in words and (bill is not None or any(w in words for w in ["bill", "bills", "units", "kwh"]))) or any(w in words for w in ["comparison", "results", "metrics", "bill", "bills"])))
            or ("compare" in words and any(w in words for w in ["bill", "bills", "months"]))
            or ("why" in words and "bill" in words and any(w in words for w in ["high", "increase", "change", "up", "jump", "spike"]))
        )
    )

    is_ac = (
        not is_general_tech
        and (
            "ac" in words
            or "air conditioner" in msg_lower
            or "air conditioning" in msg_lower
            or "cooling" in words
            or (recent_context == "ac" and (
                any(k in msg_lower for k in [
                    "hour", "hrs", "what if", "what about", "and for", "instead",
                ])
                or ("run" in msg_lower and ("only" in msg_lower or "for" in msg_lower or bool(re.search(r"\d+", msg_lower))))
            ))
        )
    )

    # ---------------------------------------------------------------------------
    # MULTI-QUESTION QUERY HANDLING
    # ---------------------------------------------------------------------------
    if is_kwh and is_comparison:
        kwh_text = build_kwh_definition()
        if bill and bill.ocr_processing:
            comp_text = build_ocr_processing_reply()
        elif bill and bill.curr_units is not None and bill.prev_units is not None:
            comp_text = build_comparison_reply(bill, q)
        elif bill and (bill.is_complete is False or (bill.has_bills and (bill.curr_units is None or bill.prev_units is None))):
            comp_text = build_incomplete_bill_reply(bill)
        else:
            comp_text = build_missing_bill_reply()
        reply = (
            "Here are answers to both parts of your question:\n\n"
            "---\n\n### 1. What kWh (Kilowatt-Hour) Means\n"
            f"{kwh_text}\n\n"
            "---\n\n### 2. Breakdown of Your Bill Comparison\n"
            f"{comp_text}"
        )
        suggestions = [
            "What should I do next?",
            "How much electricity does an AC consume in 8 hours?",
            "How do tariff slabs work?",
            "How can I check if my meter reading is accurate?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    if is_ac and is_comparison:
        hours, count, prev_hours = extract_appliance_numbers(msg_lower)
        ac_h = hours if hours is not None else 8.0
        ac_c = count if count is not None else 1
        ac_text = build_ac_reply(ac_h, ac_c, bill, conversation, recent_context, explicit_prev_hours=prev_hours)
        if bill and bill.ocr_processing:
            comp_text = build_ocr_processing_reply()
        elif bill and (bill.is_complete is False or (bill.has_bills and (bill.curr_units is None or bill.prev_units is None))):
            comp_text = build_incomplete_bill_reply(bill)
        elif bill and bill.curr_units is not None and bill.prev_units is not None:
            comp_text = build_comparison_reply(bill, q)
        else:
            comp_text = build_missing_bill_reply()
        reply = (
            "Here are answers to both parts of your question:\n\n"
            "---\n\n### 1. Air Conditioner Power Consumption\n"
            f"{ac_text}\n\n"
            "---\n\n### 2. Breakdown of Your Bill Comparison\n"
            f"{comp_text}"
        )
        suggestions = [
            "What should I do next?",
            "How do tariff slabs work?",
            "How can I check if my meter reading is accurate?",
            "Tips to reduce next month’s bill",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 2. Definition of kWh
    if is_kwh:
        reply = (
            f"{build_kwh_definition()}\n\n"
            "Would you like me to estimate how much kWh your household appliances consume, or compare your latest monthly units?"
        )
        suggestions = [
            "How much electricity does an AC consume in 8 hours?",
            "Why is my electricity bill so high this month?",
            "How do tariff slabs work?",
            "What should I do next?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 3. Help with navigating the website & explaining this webpage
    if (
        "webpage" in msg_lower
        or "website" in msg_lower
        or "this page" in msg_lower
        or "this tool" in msg_lower
        or "this app" in msg_lower
        or "explain me this" in msg_lower
        or "explain this app" in msg_lower
        or "how does theftguard work" in msg_lower
        or "what can you do" in msg_lower
        or "navigate" in words
        or ("how" in words and "use" in words and "tool" in words)
    ):
        reply = (
            "TheftGuard AI is an intelligent electricity analytics platform designed for both household consumers and distribution utility engineers.\n\n"
            "Here is a quick guide to what you can do on this website:\n\n"
            "1. Bill Comparison (/app/bill-comparison) (Current Workspace):\n"
            "   Compare two consecutive monthly electricity bills side-by-side. Inspect changes in billed kWh, normalized daily burn (kWh/day), and tariff slab costs.\n\n"
            "2. Household Usage Questionnaire & AI Assistant:\n"
            "   Answer 4 quick optional questions about your home (AC, geysers, pumps) to generate a personalized energy breakdown and understand why your bill shifted.\n\n"
            "3. Single Bill Audit (/app/bill-upload):\n"
            "   Upload a single spot-billing slip (such as TSSPDCL in Telangana) for browser-based OCR to check meter reading accuracy and punch errors.\n\n"
            "4. Utility Feeder Screening (/app/screening) & Overview (/app/dashboard):\n"
            "   Allows electricity board engineers to screen entire distribution transformer (DT) customer batches using our 13-feature machine learning model.\n\n"
            "5. Field Investigations (/app/investigations) & Reports (/app/reports):\n"
            "   Manages field audit checklists, photographic evidence, and inspection workflows.\n\n"
            "To get started right now, you can click 'Load Telangana sample bills (Demo)' in Bill Comparison to explore a live side-by-side analysis!"
        )
        suggestions = [
            "Why did my bill increase between these two months?",
            "What does kWh mean?",
            "What should I do next?",
            "How much electricity does an AC consume in 8 hours?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 4. What should I do next?
    if any(k in msg_lower for k in [
        "what should i do next", "what to do next", "what next", "next steps",
        "how to proceed", "what should i do", "what do i do now"
    ]):
        if bill and bill.ocr_processing:
            reply = (
                "Your bill is currently being scanned with on-device OCR.\n\n"
                "1. **Wait for OCR Scan**: The reader is recognizing meter readings, dates, and amounts from your bill.\n"
                "2. **Verify Extracted Values**: Check that units consumed (kWh) and amount payable (₹) match your paper bill.\n"
                "3. **Fill Any Missing Fields**: If any label on your bill was unclear, enter the numbers directly into the form.\n"
                "4. **Review Comparison**: Once both bills are entered, ask me to explain the comparison for a complete breakdown."
            )
            suggestions = [
                "What does kWh mean?",
                "How much electricity does an AC consume in 8 hours?",
                "How can I check if my meter reading is accurate?",
            ]
            return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

        if bill and bill.curr_units is not None and bill.prev_units is not None:
            delta = round(bill.curr_units - bill.prev_units, 1)
            reply = (
                f"Based on your active bill comparison ({bill.prev_units:0.1f} kWh vs {bill.curr_units:0.1f} kWh, a shift of {delta:+0.1f} kWh), here is your recommended action plan:\n\n"
                "1. Verify Your Physical Meter Reading:\n"
                "   Go to your physical meter box. Check if the cumulative reading on the dial is equal to or higher than the 'Current Reading' printed on your bill. If the meter dial shows a lower number, your bill was inflated by a reader punch error.\n\n"
                "2. Review Your Appliance Profile:\n"
                "   Click on the 'Household Usage Profile' tab in this drawer. Enter your AC hours and heavy appliances to verify whether normal cooling explains this difference.\n\n"
                "3. Perform a Switch-Off Test:\n"
                "   Turn off your home MCB or unplug appliances for 10 minutes. If the red impulse LED on your meter continues blinking rapidly, investigate internal wiring leakage or a running water pump.\n\n"
                "4. Request a Bill Revision if Inaccurate:\n"
                "   If your bill has a punch error or suspected meter fault, take a photo of the meter dial and submit a revision request to your DISCOM office or call 1912."
            )
            suggestions = [
                "How can I check if my meter reading is accurate?",
                "How do tariff slabs affect this bill amount?",
                "Tips to reduce next month’s bill",
            ]
            return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

        if bill and (bill.is_complete is False or bill.has_bills):
            reply = (
                "You have bill information loaded in Bill Comparison, but some details are still needed before computing a full comparison.\n\n"
                "1. **Enter Missing Details**: Check the bill slot cards in **Bill Comparison** (/app/bill-comparison) and enter any missing units or amounts.\n"
                "2. **Verify Meter Reading**: Confirm the current reading against your physical meter dial.\n"
                "3. **Ask for Breakdown**: Once both bills have units and amounts, ask me \"Explain the comparison\" for full analysis.\n"
                "4. **Fill Household Profile**: Add your AC or geyser usage in the Household Usage Profile tab to see itemized appliance costs."
            )
            suggestions = [
                "What does kWh mean?",
                "How can I check if my meter reading is accurate?",
                "How much electricity does an AC consume in 8 hours?",
            ]
            return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

        reply = (
            "Here is the best way to proceed step-by-step:\n\n"
            "1. Load Your Electricity Bills:\n"
            "   Go to Bill Comparison (/app/bill-comparison). You can click 'Load Telangana sample bills (Demo)' to see an immediate example, or upload your own previous and current bill receipts.\n\n"
            "2. Review Verified Metrics:\n"
            "   The tool will calculate your exact consumption difference, normalized daily burn (kWh/day), and tariff impact.\n\n"
            "3. Complete the 4-Question Usage Profile:\n"
            "   Answer quick questions about your AC, water heater, and water pump to see an itemized energy breakdown.\n\n"
            "4. Take Action on Insights:\n"
            "   Use our practical energy-saving checklist and meter-verification steps to ensure your billing is accurate and keep costs down.\n\n"
            "Would you like me to walk you through comparing your bills, or explain how electricity meters work?"
        )
        suggestions = [
            "Could you explain me this webpage?",
            "What does kWh mean?",
            "Why is my electricity bill so high this month?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 5. Bill Comparison & Breakdown
    if is_comparison:
        if bill and bill.ocr_processing:
            return AssistantChatResponse(
                reply=build_ocr_processing_reply(),
                suggestions=[
                    "What does kWh mean?",
                    "How much electricity does an AC consume in 8 hours?",
                    "How do tariff slabs work?",
                ],
                analysis=analysis,
                provider="local_rule_engine",
                timestamp=now_iso,
            )

        if bill and (bill.is_complete is False or (bill.has_bills and (bill.curr_units is None or bill.prev_units is None))):
            reply = build_incomplete_bill_reply(bill)
            suggestions = [
                "What should I do next?",
                "How much electricity does an AC consume in 8 hours?",
                "What does kWh mean?",
            ]
        elif bill and bill.curr_units is not None and bill.prev_units is not None:
            reply = build_comparison_reply(bill, q)
            suggestions = [
                "What should I do next?",
                "How much electricity does an AC consume in 8 hours?",
                "How can I check if my meter reading is accurate?",
                "Tips to reduce next month’s bill",
            ]
        else:
            reply = build_missing_bill_reply()
            suggestions = [
                "How can I check if my meter reading is accurate?",
                "What does kWh mean?",
                "How much electricity does an AC consume in 8 hours?",
                "What should I do next?",
            ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 6. Air conditioning queries & calculations (extract hours dynamically & check follow-ups)
    if is_ac:
        hours, count, prev_hours = extract_appliance_numbers(msg_lower)
        ac_h = hours if hours is not None else 8.0
        ac_c = count if count is not None else 1
        reply = build_ac_reply(ac_h, ac_c, bill, conversation, recent_context, explicit_prev_hours=prev_hours)
        suggestions = [
            "And if I run it for 4 hours instead?",
            "How do tariff slabs affect this bill amount?",
            "Tips to reduce next month’s bill",
            "Why is my electricity bill so high this month?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 7. Geyser queries
    if "geyser" in words or "water heater" in msg_lower or (recent_context == "geyser" and any(k in msg_lower for k in ["hour", "hrs", "instead", "what if", "and for"])):
        hours, _, _ = extract_appliance_numbers(msg_lower)
        g_hours = hours if hours is not None else 0.5
        daily_kwh = round(g_hours * 2.0, 1)
        monthly_kwh = round(daily_kwh * 30, 1)
        cost = round(monthly_kwh * 7)
        reply = (
            f"Water Heater / Geyser Power Consumption:\n\n"
            f"• Rating: Standard 15L to 25L storage geysers use a 2,000-watt (2 kW) heating element.\n"
            f"• Rate of Consumption: A 2 kW geyser consumes 2.0 units (kWh) for every 1 hour of continuous heating.\n"
            f"• Daily & Monthly Load: Running it for {g_hours * 60:0.0f} minutes/day consumes ~{daily_kwh} units/day (~{monthly_kwh} units/month), adding roughly ₹{cost:,} to your monthly bill.\n\n"
            "Tip: Turn off the geyser 15–20 minutes before bathing. Leaving a geyser on all day wastes 1.5 to 2.5 units daily in standby standing thermal losses alone."
        )
        suggestions = [
            "How much electricity does an AC consume in 8 hours?",
            "Tips to reduce next month’s bill",
            "How do tariff slabs work?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 8. Refrigerator
    if "refrigerator" in words or "fridge" in words:
        reply = (
            "Refrigerator Power Consumption:\n\n"
            "• Standard 250L Frost-Free (3-Star): Draws ~150W rated power, running auto-cycling compressors 24/7. It consumes approximately 1.0 unit (kWh) per day (~30 to 35 units per month).\n"
            "• Direct-Cool Single Door (190L): Uses less power, averaging 0.75 units/day (~22 to 25 units/month).\n"
            "• Large Multi-Door (400L+): Averages 1.5 to 1.8 units/day (~45 to 55 units/month).\n\n"
            "Check: If the rubber door gasket is loose or worn, warm air enters continuously, causing the compressor to run double duty and raising power consumption significantly."
        )
        suggestions = [
            "How much electricity does an AC consume in 8 hours?",
            "How can I check if my meter reading is accurate?",
            "Tips to reduce next month’s bill",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 9. Water pump
    if "pump" in words or "motor" in words or "borewell" in words:
        hours, _ = extract_appliance_numbers(msg_lower)
        p_hours = hours if hours is not None else 1.0
        daily_kwh = round(p_hours * 0.75, 1)
        monthly_kwh = round(daily_kwh * 30, 1)
        reply = (
            f"Water Pump / Motor Consumption:\n\n"
            f"• 1 HP Pump / Borewell (750W): Consumes approximately 0.75 units (kWh) per running hour.\n"
            f"• 0.5 HP Booster Pump (375W): Consumes approximately 0.38 units (kWh) per running hour.\n"
            f"• Running a 1 HP pump for {p_hours:0.1f} hour(s) daily adds ~{daily_kwh} units/day (~{monthly_kwh} units/month).\n\n"
            "Tip: Install an automatic overhead water-level controller to avoid continuous overflow, which is one of the most common causes of unnoticed bill jumps."
        )
        suggestions = [
            "How much electricity does an AC consume in 8 hours?",
            "Why is my electricity bill so high this month?",
            "Tips to reduce next month’s bill",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 9B. Complaint Drafting & Letter Templates
    if (
        ("draft" in msg_lower or "write" in msg_lower or "template" in msg_lower or "letter" in msg_lower)
        and ("complaint" in msg_lower or "discom" in msg_lower or "meter" in msg_lower or "bill" in msg_lower or "grievance" in msg_lower or "reading" in msg_lower)
    ):
        usc = bill.consumer_number if bill and bill.consumer_number else "[Your Unique Service Number / USC]"
        curr_u = bill.curr_units if bill and bill.curr_units is not None else "[Billed Units, e.g. 350]"
        prev_u = bill.prev_units if bill and bill.prev_units is not None else "[Previous Units, e.g. 150]"
        discom_name = "Southern Power Distribution Company of Telangana Limited (TGSPDCL)" if "hyderabad" in msg_lower or "south" in msg_lower or "ranga" in msg_lower else "Northern Power Distribution Company of Telangana Limited (TGNPDCL)" if "warangal" in msg_lower or "north" in msg_lower or "karimnagar" in msg_lower else "TGSPDCL / TGNPDCL"

        reply = (
            "### Structured Complaint Draft Template\n\n"
            "You can copy and adapt this professional, non-accusatory draft for submission to your distribution utility:\n\n"
            "```text\n"
            "Date: [Current Date]\n\n"
            "To\n"
            "The Assistant Engineer (Operations),\n"
            f"Section Office, {discom_name},\n"
            "[Area / Sub-station Name, Telangana]\n\n"
            f"Subject: Request for Spot Bill Reading Verification & Inspection — Service No (USC): {usc}\n\n"
            "Respected Sir / Madam,\n\n"
            f"I am writing in regard to our domestic electricity connection under Unique Service Number (USC): {usc}, registered in the name of [Consumer Name], located at [Full Address / Nearby Landmark].\n\n"
            "Upon reviewing our latest spot bill dated [Bill Date], I observed a notable discrepancy between the reading entered on the bill receipt and the physical meter display:\n"
            f"• Billed 'Present Reading': [Reading printed on bill] units (Billed Units: {curr_u} kWh)\n"
            "• Physical Meter Reading (Screen 2 LCD): [Reading shown on meter dial] kWh (as of [Inspection Date])\n"
            f"• Baseline Average Consumption: Approximately {prev_u} kWh/month\n\n"
            "We carried out a main switch-off test and confirmed that the meter LED stops blinking when the MCB is off. No high-power appliances or additional loads were operated during this cycle. The discrepancy appears to be an over-billing punch entry error or an unverified estimation.\n\n"
            "I kindly request your office to:\n"
            "1. Depute an inspecting officer to verify the physical meter reading and seal integrity.\n"
            "2. Issue a rectified bill based on actual physical consumption under the Telangana Electricity Supply Code.\n\n"
            "I have attached a dated photograph of the meter display and a copy of the recent spot bill receipt for your reference.\n\n"
            "Thank you.\n\n"
            "Yours sincerely,\n"
            "[Your Name]\n"
            "Contact Mobile: [Your Phone Number]\n"
            f"USC Number: {usc}\n"
            "Meter Serial Number: [Meter Serial Number]\n"
            "```\n\n"
            "⚠️ **Crucial Disclaimer — Draft Only (Not Automatically Submitted)**:\n"
            "• **No Automated Submission**: TheftGuard AI does not connect to DISCOM dispatch systems and cannot submit complaints on your behalf.\n"
            "• **Next Step**: Copy this text, fill in your details, and submit via:\n"
            "  1. Centralized 24x7 Helpline: **1912**\n"
            "  2. Official Web Portal (tgspdcl.cgg.gov.in or tgnpdcl.com) or Mobile App\n"
            "  3. Hand-delivery to your local Section Office Assistant Engineer (AE / Operations)."
        )
        suggestions = [
            "What information and documents should I prepare?",
            "What happens after I submit a complaint?",
            "Which official electricity department should I contact?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 9C. Information & Documents Preparation Checklist
    if (
        ("document" in msg_lower or "prepare" in msg_lower or "checklist" in msg_lower or "what do i need" in msg_lower or "what information" in msg_lower)
        and ("complaint" in msg_lower or "report" in msg_lower or "grievance" in msg_lower or "discom" in msg_lower or "submit" in msg_lower)
    ):
        usc_txt = f" (Your active bill lists USC: **{bill.consumer_number}**)" if bill and bill.consumer_number else ""
        reply = (
            "### Information & Documents to Prepare for an Official Electricity Grievance\n\n"
            "Having accurate records ensures prompt departmental dispatch and avoids duplicate inspection fees:\n\n"
            f"1. **Unique Service Number (USC) / Consumer Number**{usc_txt}:\n"
            "   - Printed at the top of your monthly spot bill receipt (essential for locating your distribution transformer and billing ledger).\n\n"
            "2. **Physical Meter Dial Reading & Serial Number**:\n"
            "   - The physical serial number stamped on the meter casing plate.\n"
            "   - Current cumulative energy reading from **Screen 2 (Cumulative kWh)** and timestamp from **Screen 1 (Date)**.\n\n"
            "3. **Recent Spot Bill Receipts**:\n"
            "   - Hard copy or digital image of your 1–3 most recent bills to demonstrate historical baseline vs the billed entry discrepancy.\n\n"
            "4. **Location & Supply Identifiers**:\n"
            "   - Full door address, landmark, and the distribution pole number (stenciled in yellow/black on the pole outside).\n\n"
            "5. **Clear Photographs (Taken Safely)**:\n"
            "   - A legible photograph of the physical LCD dial showing cumulative units.\n"
            "   - Photographs of any burnt terminals, broken seals, or physical wire anomalies.\n\n"
            "⚡ **Crucial Safety Warning**:\n"
            "Never touch meter terminals, service wires, overhead lines, or distribution poles. Take photographs only from a safe standing distance."
        )
        suggestions = [
            "What happens after I submit a complaint?",
            "Can you help me write a clear complaint?",
            "Which official electricity department should I contact?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 9D. Complaint Lifecycle & Post-Submission Workflow
    if (
        "what happens after" in msg_lower
        or "after submit" in msg_lower
        or "after submitting" in msg_lower
        or "after filing" in msg_lower
        or "after complaint" in msg_lower
        or "inspection procedure" in msg_lower
        or "complaint lifecycle" in msg_lower
    ):
        reply = (
            "### What Happens After You Submit an Electricity Complaint?\n\n"
            "Under the Telangana Electricity Regulatory Commission (TGERC) standards and Citizens' Charter, complaints follow a formal statutory workflow:\n\n"
            "1. **Docket Generation & SMS Tracking**:\n"
            "   - An official Docket / Complaint Number is generated instantly and sent to your registered mobile number via SMS.\n\n"
            "2. **Site Inspection by Technical Officers**:\n"
            "   - A departmental Lineman, Sub-Engineer, or Assistant Engineer (AE / Operations) is deputed to inspect your physical premises.\n"
            "   - They verify physical meter serial matching, seal integrity, and observe the optical LED pulse (running a switch-off test).\n\n"
            "3. **On-Site or Laboratory Meter Testing**:\n"
            "   - If the meter dial is disputed, an on-site electronic testing kit is connected, or the meter is packaged in a sealed bag in your presence for testing at the DISCOM MRT (Meter Relay & Testing) division.\n\n"
            "4. **Bill Rectification & Ledger Adjustment**:\n"
            "   - If an entry error is confirmed (meter reading on bill exceeds current physical dial), the Electricity Revenue Office (ERO) re-issues a revised spot bill under standard adjustment formulas.\n"
            "   - If the meter was stuck or defective, charges are reassessed based on the average consumption of the preceding 3–6 normal billing months.\n\n"
            "5. **Consumer Escalation (CGRF & Ombudsman)**:\n"
            "   - If your grievance is not resolved within the charter timeline, consumers have the legal right to escalate to the **Consumer Grievance Redressal Forum (CGRF)** and the **Vidyut Ombudsman** under TGERC."
        )
        suggestions = [
            "Can you help me write a clear complaint?",
            "What information and documents should I prepare?",
            "Which official electricity department should I contact?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 9E. Local Officer Contact Numbers (Unconfirmed Info Handling)
    if (
        ("phone number" in msg_lower or "mobile number" in msg_lower or "contact number" in msg_lower or "officer number" in msg_lower or "lineman number" in msg_lower or "ae number" in msg_lower)
        and ("discom" in msg_lower or "lineman" in msg_lower or "officer" in msg_lower or "substation" in msg_lower or "section" in msg_lower or "local" in msg_lower or "engineer" in msg_lower)
    ):
        reply = (
            "### Official Local Officer & Lineman Contact Numbers\n\n"
            "Direct mobile numbers of local linemen, sub-engineers, and section Assistant Engineers (AEs) are not published as fixed contact lines because personnel shift across rosters and section boundaries. TheftGuard AI does not generate or store private personal numbers to avoid outdated or misleading contact information.\n\n"
            "**To find your authorized, current local section contact:**\n"
            "1. **Check your Spot Bill Receipt**: Your printed monthly bill lists the official telephone number for your specific **'ERO / Section Office'** near the top or bottom margin.\n"
            "2. **Call 1912**: Dial **1912** (available 24x7 statewide) and provide your Unique Service Number (USC). The centralized operator will dispatch or connect you directly to the on-duty section officer for your distribution transformer."
        )
        suggestions = [
            "How do I report a suspected electricity issue?",
            "Which official electricity department should I contact?",
            "What information and documents should I prepare?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 9F. How to Report / DISCOM Identification / Helpline 1912
    if (
        "how do i report" in msg_lower
        or "how to report" in msg_lower
        or "where to report" in msg_lower
        or "which electricity department" in msg_lower
        or "which official electricity" in msg_lower
        or "which discom" in msg_lower
        or "who is my discom" in msg_lower
        or "who should i contact" in msg_lower
        or "which department should i contact" in msg_lower
        or "report a suspected" in msg_lower
        or "report electricity issue" in msg_lower
        or "register a complaint" in msg_lower
        or "file a complaint" in msg_lower
        or "lodge a complaint" in msg_lower
        or "tgspdcl" in msg_lower
        or "tsnpdcl" in msg_lower
        or "tgnpdcl" in msg_lower
        or "tsspdcl" in msg_lower
        or "1912" in msg_lower
    ):
        is_hyd = any(d in msg_lower for d in ["hyderabad", "secunderabad", "ranga reddy", "rangareddy", "medchal", "nalgonda", "mahabubnagar", "sangareddy", "siddipet", "medak"])
        is_wgl = any(d in msg_lower for d in ["warangal", "hanumakonda", "karimnagar", "khammam", "nizamabad", "adilabad", "jagtial", "mancherial"])
        
        reply = (
            "### How to Report a Suspected Electricity Issue in Telangana\n\n"
            "In Telangana, consumer billing disputes, suspected meter faults, sparks, or service line irregularities are handled through official, verified channels:\n\n"
            "• **Statewide 24x7 Toll-Free Consumer Helpline**: **1912** (accessible across all districts in Telangana).\n"
        )
        if is_hyd:
            reply += (
                "• **Your Official Distribution Utility**: **Southern Power Distribution Company of Telangana Limited (TGSPDCL)**\n"
                "  - Official Web Portal: **https://tgspdcl.cgg.gov.in**\n"
                "  - Mobile App: **TGSPDCL**\n"
                "  - Operating Headquarters: Mint Compound, Hyderabad\n\n"
            )
        elif is_wgl:
            reply += (
                "• **Your Official Distribution Utility**: **Northern Power Distribution Company of Telangana Limited (TGNPDCL)**\n"
                "  - Official Web Portal: **https://tgnpdcl.com**\n"
                "  - Mobile App: **TGNPDCL**\n"
                "  - Operating Headquarters: Nakkalagutta, Hanumakonda / Warangal\n\n"
            )
        else:
            reply += (
                "• **Distribution Utilities by Region**:\n"
                "  1. **TGSPDCL (Southern Telangana)**: Serves Hyderabad, Ranga Reddy, Medchal-Malkajgiri, Mahabubnagar, Nalgonda, Sangareddy, Medak, Siddipet, Vikarabad, Suryapet, etc. (*Portal: https://tgspdcl.cgg.gov.in*)\n"
                "  2. **TGNPDCL (Northern Telangana)**: Serves Warangal, Hanumakonda, Karimnagar, Khammam, Nizamabad, Adilabad, Bhadradri Kothagudem, Jagtial, Mancherial, etc. (*Portal: https://tgnpdcl.com*)\n\n"
                "*(Tell me your district or town if you would like me to confirm your exact DISCOM. Your utility name and section code are also printed at the top of your monthly spot bill receipt.)*\n\n"
            )
        reply += (
            "**3 Verified Submission Channels:**\n"
            "1. **Phone (Helpline 1912)**: Call 1912 to register an official grievance with an agent; an SMS tracking docket number is issued immediately.\n"
            "2. **Digital (DISCOM Mobile App / Web Portal)**: Submit a service request under the 'Consumer Grievances / Meter Verification' section with photos.\n"
            "3. **Physical (Section Office / ERO)**: Submit a written letter to the Assistant Engineer (AE / Operations) at your local distribution section office.\n\n"
            "⚠️ **Verified Contacts & Safety Rules**:\n"
            "• **Do not rely on unverified phone numbers**: Individual line-staff numbers change frequently. Look at the 'ERO / Section Phone' printed on your physical spot bill receipt or call 1912 for the authorized officer.\n"
            "• **Electrical Safety**: Never touch meters, live wires, service cables, or distribution poles. Conduct observations from a safe distance."
        )
        suggestions = [
            "What information and documents should I prepare?",
            "What happens after I submit a complaint?",
            "Can you help me write a clear complaint?",
            "My location is Hyderabad (TGSPDCL)",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 10. Meter verification & Discrepancies
    if (
        words.intersection({"meter", "reading", "dial", "faulty", "jumping", "blink"})
        or "check my meter" in msg_lower
        or "meter reading accurate" in msg_lower
    ):
        reply = (
            "Here is how you can verify your electricity meter step-by-step:\n\n"
            "1. Compare the Physical Dial Reading:\n"
            "   Go to your physical meter box. Wait for the digital display to cycle to the cumulative kWh value (labeled 'KWH' or 'TOTAL UNITS'). Compare this number with the 'Current Reading' on your bill.\n"
            "   - Normal: The meter dial should be equal to or slightly higher than the bill reading (since units have passed since billing day).\n"
            "   - Punch Error: If the meter dial shows a lower number than the bill reading, the reader mistyped it. Take a photo and request a bill revision.\n\n"
            "2. The 'Switch-Off Test' (Check for Phantom Draw or Faulty Meter):\n"
            "   - Turn OFF your main MCB switch inside your home, or unplug all appliances.\n"
            "   - Observe the small red LED pulse light on the meter (marked 'CAL' or 'imp/kWh').\n"
            "   - The blinking should stop completely. If it continues blinking at high frequency while all home power is off, there may be internal wiring leakage, a running booster pump, or a meter calibration fault.\n\n"
            "3. Reporting to DISCOM:\n"
            "   In Telangana, call 1912 or visit your local DISCOM sub-engineer office with a dated photo of your meter dial to request an official meter accuracy test."
        )
        suggestions = [
            "Why is my electricity bill so high this month?",
            "What should I do next?",
            "How do tariff slabs work?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 11. Tariff slabs & effective cost
    if (
        words.intersection({"slab", "slabs", "tariff", "rate", "telescopic", "charge", "charges"})
        or "fixed charge" in msg_lower
        or "cost per unit" in msg_lower
    ):
        reply = (
            "**Understanding Domestic Electricity Tariff Slabs & Billing Structures:**\n\n"
            "Domestic electricity billing in India typically employs a **telescopic (tiered) tariff structure** determined by each state's Electricity Regulatory Commission (such as TSERC in Telangana, KERC in Karnataka, or MERC in Maharashtra):\n\n"
            "• **Slab Brackets (Tiered Rates)**: Consumption is segmented into slab tiers. Initial lifeline units are billed at lower, subsidized rates, while incremental consumption crossing into higher slabs is billed at progressively higher per-unit rates.\n"
            "• **Specific Slabs Vary by Utility**: Slab boundaries (e.g. 50, 100, 200, or 400 units) and per-unit rates depend on your local DISCOM tariff schedule, consumer category (e.g., LT-I Domestic), and applicable state subsidy schemes (such as Gruha Jyothi or domestic lifeline subsidies).\n\n"
            "**Why the Bill Amount Often Rises Faster Than Units (The 'Cliff Effect'):**\n"
            "When monthly consumption increases and steps into a higher slab bracket, three factors compound:\n"
            "1. **Higher marginal unit rate**: Incremental units are charged at the higher rate bracket.\n"
            "2. **Fixed Demand Charges**: Monthly customer/demand charges (based on sanctioned load in kW) often increase across tiers.\n"
            "3. **Surcharges & Duty**: Electricity duty and Fuel Surcharge Adjustments (FSA/FAC) are calculated on total energy and charges.\n\n"
            "**Effective Cost per Unit**: Calculated as (Total Bill Amount ÷ Units Consumed). This is always higher than the base slab rate because it averages fixed charges, duties, and surcharges across your total units."
        )
        suggestions = [
            "Why did my bill increase between these two months?",
            "How much electricity does an AC consume in 8 hours?",
            "Tips to reduce next month’s bill",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)



    # 11D. Clarification / "I don't understand your previous answer"
    is_clarification = any(
        phrase in msg_lower
        for phrase in [
            "don't understand",
            "dont understand",
            "did not understand",
            "could not understand",
            "explain simpler",
            "explain in simpler",
            "make it simple",
            "too complicated",
            "too technical",
            "what do you mean",
            "clarify that",
            "simplify",
        ]
    )

    if is_clarification:
        last_context = _detect_history_context(conversation)
        if last_context == "ac":
            summary_text = (
                "1. **ACs consume significant power**: A standard 1.5-ton AC uses about 1 unit (kWh) of electricity for each hour it runs.\n"
                "2. **Running 8 hours daily adds ~240 units/month**: This single appliance can account for over half of an average summer bill.\n"
                "3. **Setting it at 24°C saves money**: Running at 24°C instead of 18°C lowers compressor run-time and cuts your bill by up to 24%."
            )
        elif last_context == "tariff":
            summary_text = (
                "1. **Electricity rates rise in steps (slabs)**: The more units you use in a month, the higher the price per unit becomes for those extra units.\n"
                "2. **Fixed charges also increase**: Beyond a certain usage level, utilities charge higher monthly connection fees.\n"
                "3. **Result**: A 20% increase in power usage can cause your bill amount to increase by 30% or more."
            )
        elif last_context == "bill" and bill and bill.curr_units is not None and bill.prev_units is not None:
            delta = round(bill.curr_units - bill.prev_units, 1)
            summary_text = (
                f"1. **Your usage increased**: You used **{bill.curr_units:0.1f} kWh** this month compared to **{bill.prev_units:0.1f} kWh** last month ({delta:+0.1f} units).\n"
                "2. **Check your meter**: Make sure the reading on your bill matches the dial on your physical meter to rule out reader mistypes.\n"
                "3. **Review appliances**: Extra cooling, geyser hours, or visitors usually explain unit increases."
            )
        else:
            summary_text = (
                "1. **kWh means 'Units'**: 1 unit on your bill = using 1,000 watts for 1 hour (e.g. an iron for 1 hour).\n"
                "2. **Seasonal shifts are normal**: Heat waves, summer cooling, and extra days in the billing cycle are the most common causes of high bills.\n"
                "3. **No theft accusation**: TheftGuard AI is an educational tool. Bill increases do NOT imply power theft."
            )

        reply = (
            "I apologize if my previous answer was too technical! Here is a simple, plain-English summary:\n\n"
            f"{summary_text}\n\n"
            "Would you like me to explain any specific part in more detail?"
        )
        suggestions = [
            "How much electricity does an AC consume in 8 hours?",
            "How do tariff slabs work?",
            "How can I check if my meter reading is accurate?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 12. Energy conservation tips
    if (
        words.intersection({"reduce", "save", "saving", "savings", "tips", "lower", "conserve", "cut"})
        or "save electricity" in msg_lower
        or "reduce bill" in msg_lower
    ):
        reply = (
            "High-Impact Ways to Reduce Your Monthly Electricity Bill:\n\n"
            "1. Air Conditioner Optimization (Largest Savings):\n"
            "   • Keep the thermostat at 24°C to 25°C. Every 1°C increase saves 4% to 6% on cooling power.\n"
            "   • Use the AC sleep/timer mode to automatically turn off 1–2 hours before morning wake-up.\n"
            "   • Clean AC air filters every 15 days; clogged filters force compressors to run 15% longer.\n\n"
            "2. Water Heater / Geyser Management:\n"
            "   • Switch on the geyser only 15–20 minutes before bathing; do not leave it on continuously.\n"
            "   • A 2kW geyser left powered for 2 hours daily wastes ~120 units each month.\n\n"
            "3. Switch to 5-Star BLDC Ceiling Fans:\n"
            "   • BLDC fans consume ~28W compared to ~75W for traditional induction fans, saving ~15 to 20 units per fan every month.\n\n"
            "4. Water Motor Automation:\n"
            "   • Install an automatic water-level controller to eliminate rooftop tank overflow.\n\n"
            "5. Eliminate Standby Phantom Draw:\n"
            "   • Turn off set-top boxes, microwave displays, and entertainment systems at the wall switch when unused."
        )
        suggestions = [
            "How much electricity does an AC consume in 8 hours?",
            "How do tariff slabs work?",
            "What should I do next?",
        ]
        return AssistantChatResponse(reply=reply, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 13. Pure Greetings
    is_pure_greeting = (
        not is_general_tech
        and not is_kwh
        and not is_comparison
        and not is_ac
        and (
            bool(words.intersection({"hi", "hello", "hey", "namaste", "greetings"}))
            or msg_lower.startswith(("hi there", "hello there", "good morning", "good afternoon", "good evening"))
        )
        and not bool(words.intersection({"kwh", "bill", "ac", "meter", "geyser", "pump", "motor", "fridge", "refrigerator", "tariff", "slab", "investigation"}))
    )

    if is_pure_greeting:
        greeting = "Hello! Welcome to the TheftGuard AI Bill Assistant.\n\n"
        if bill and bill.ocr_processing:
            greeting += (
                "I notice your electricity bill is currently being scanned with OCR. Once recognition completes, "
                "I will be ready to explain your consumption changes and cost breakdown!\n\n"
                "In the meantime, feel free to ask about kWh, appliance power usage, or how meters work."
            )
            suggestions = [
                "What does kWh mean?",
                "How much electricity does an AC consume in 8 hours?",
                "How do tariff slabs work?",
            ]
        elif bill and bill.curr_units is not None and bill.prev_units is not None:
            delta = round(bill.curr_units - bill.prev_units, 1)
            greeting += (
                f"I see your active bill comparison between {bill.prev_period or 'Previous Month'} ({bill.prev_units:0.1f} kWh) "
                f"and {bill.curr_period or 'Current Month'} ({bill.curr_units:0.1f} kWh), showing a shift of {delta:+0.1f} kWh.\n\n"
                "How can I help you today? You can ask me why your bill changed, how much electricity your appliances consume, or what steps to take next."
            )
            suggestions = [
                "Explain the comparison.",
                "Why did my bill increase between these two months?",
                "What should I do next?",
                "How much power does my air conditioner consume?",
                "How do tariff slabs affect this bill amount?",
            ]
        elif bill and (bill.is_complete is False or bill.has_bills):
            greeting += (
                "I can see bill information loaded in Bill Comparison, though some details are still needed before computing a full comparison.\n\n"
                "You can fill in any missing fields on the bill cards, or ask me any question about power usage and tariffs!"
            )
            suggestions = [
                "What should I do next?",
                "What does kWh mean?",
                "How much electricity does an AC consume in 8 hours?",
            ]
        else:
            greeting += (
                "I help residential consumers understand electricity bills, compare monthly consumption, "
                "calculate appliance power use (AC, geysers, pumps), and identify billing errors.\n\n"
                "You can upload your bills in Bill Comparison (/app/bill-comparison) to see an itemized breakdown, "
                "or ask me any question about power usage and tariffs!"
            )
            suggestions = [
                "Why is my electricity bill so high this month?",
                "What does kWh mean?",
                "Could you explain me this webpage?",
                "How much electricity does an AC consume in 8 hours?",
            ]
        return AssistantChatResponse(reply=greeting, suggestions=suggestions, analysis=analysis, provider="local_rule_engine", timestamp=now_iso)

    # 14. Unknown or unsupported questions
    reply = (
        "I want to make sure I give you accurate guidance. I specialize in household electricity billing, appliance energy consumption, and meter accuracy.\n\n"
        "Here are some specific topics I can help you with right now:\n"
        "• Bill Analysis: Why your bill increased, what kWh means, and how telescopic tariff slabs work.\n"
        "• Appliance Estimates: How much electricity your AC, geyser, refrigerator, or water pump consumes for specific hours.\n"
        "• Meter Verification: How to check your physical meter dial and run a switch-off test for reading errors.\n"
        "• Navigation: How to use Bill Comparison, Bill Upload OCR, or Utility Screening.\n\n"
        "Could you clarify which of these topics you would like to explore?"
    )
    return AssistantChatResponse(
        reply=reply,
        suggestions=[
            "What does kWh mean?",
            "Why is my electricity bill so high this month?",
            "How much electricity does an AC consume in 8 hours?",
            "What should I do next?",
        ],
        analysis=analysis,
        provider="local_rule_engine",
        timestamp=now_iso,
    )


# ------------------------------------------------------------------------------
# Optional Gemini AI Provider Integration (Backend-Only, Zero Frontend Exposure)
# ------------------------------------------------------------------------------

def call_gemini_provider(
    api_key: str,
    message: str,
    conversation: List[ChatMessage],
    bill: Optional[BillContext],
    q: Optional[QuestionnaireAnswers],
) -> Optional[AssistantChatResponse]:
    """Queries Google Gemini API with strict timeout, safe bounds, and data minimization."""
    now_iso = datetime.now(timezone.utc).isoformat()
    analysis = perform_structured_analysis(bill, q)

    # System instruction enforces safety, neutrality, and privacy constraints
    system_instruction = (
        "You are the TheftGuard AI Household Bill Assistant. You speak in a friendly, helpful, respectful tone. "
        "You help Indian domestic electricity consumers understand their monthly bills and consumption changes. "
        "RULES: "
        "1. NEVER accuse the customer of electricity theft, meter tampering, or fraud. An increase in consumption is normal residential variation. "
        "2. Clearly distinguish between measured bill values and estimated appliance calculations. "
        "3. Explain that tariff slabs (e.g. crossing 100 or 200 units) cause cost to rise faster than units. "
        "4. NEVER claim you have contacted an electricity provider or represent one. "
        "5. Keep responses concise (under 150 words) and format in clean bullet points where appropriate."
    )

    context_summary = "Bill Context: None provided."
    if bill and bill.curr_units is not None:
        context_summary = (
            f"Bill Context: Previous={bill.prev_units} kWh (₹{bill.prev_amount}), "
            f"Current={bill.curr_units} kWh (₹{bill.curr_amount}), "
            f"Delta={bill.delta_units} kWh ({bill.pct_change_units}%), "
            f"Cycle Days: Prev={bill.prev_days}, Curr={bill.curr_days}."
        )

    q_summary = "Questionnaire Context: None."
    if q:
        q_summary = (
            f"Appliances: Occupants={q.occupants}, AC={q.has_ac} ({q.ac_hours}h/day), "
            f"Geyser={q.has_geyser} ({q.geyser_hours}h/day), Fridge={q.has_refrigerator}, "
            f"Pump={q.has_pump}, Notes={q.lifestyle_change}."
        )

    contents = []
    # Gemini requires alternating user/model turns without duplicate consecutive roles.
    cleaned_history: List[dict] = []
    for c in (conversation or []):
        role = "user" if c.role == "user" else "model"
        if cleaned_history and cleaned_history[-1]["role"] == role:
            cleaned_history[-1]["parts"][0]["text"] += f"\n{c.content}"
        else:
            cleaned_history.append({"role": role, "parts": [{"text": c.content}]})

    # If the last turn in cleaned_history is a user turn that matches current prompt, pop it
    if cleaned_history and cleaned_history[-1]["role"] == "user":
        if cleaned_history[-1]["parts"][0]["text"].strip() == message.strip():
            cleaned_history.pop()

    prior_turns = cleaned_history[-4:] if len(cleaned_history) > 4 else cleaned_history
    contents.extend(prior_turns)

    user_prompt = f"System Context:\n{context_summary}\n{q_summary}\n\nUser Question:\n{message}"
    if contents and contents[-1]["role"] == "user":
        contents[-1]["parts"][0]["text"] += f"\n\n{user_prompt}"
    else:
        contents.append({"role": "user", "parts": [{"text": user_prompt}]})

    payload = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 450,
        },
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=GEMINI_TIMEOUT_SECONDS) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                candidate = data.get("candidates", [{}])[0]
                text_part = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
                if text_part:
                    return AssistantChatResponse(
                        reply=text_part.strip(),
                        suggestions=[
                            "Estimate my appliance energy use",
                            "Explain my effective cost per unit",
                            "Tips to reduce electricity consumption",
                        ],
                        analysis=analysis,
                        provider="gemini",
                        timestamp=now_iso,
                    )
    except Exception as exc:
        print(f"[theftguard-assistant] External AI provider error or timeout: {type(exc).__name__}", file=sys.stderr)

    return None


# ------------------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------------------

@assistant_router.get("/health")
def assistant_health():
    """Returns AI Assistant status, configured provider, and safety capabilities."""
    has_gemini = bool(os.getenv(GEMINI_API_KEY_ENV))
    return {
        "status": "ok",
        "provider": "gemini" if has_gemini else "local_rule_engine",
        "external_ai_configured": has_gemini,
        "capabilities": [
            "household_questionnaire",
            "bill_aware_analysis",
            "appliance_energy_estimation",
            "cycle_length_normalization",
            "discrepancy_and_meter_guidance",
            "energy_conservation_tips",
        ],
        "privacy": {
            "data_minimization": True,
            "no_pii_stored": True,
            "client_safe_secrets": True,
        },
    }


@assistant_router.post("/chat", response_model=AssistantChatResponse)
def assistant_chat(payload: AssistantChatRequest):
    """Processes user queries, questionnaire updates, and bill comparison analysis."""
    gemini_key = os.getenv(GEMINI_API_KEY_ENV)
    conv = payload.conversation or payload.history or []

    # 1. If Gemini API key is configured, attempt external AI response
    if gemini_key:
        ai_resp = call_gemini_provider(
            gemini_key,
            payload.message,
            conv,
            payload.bill_context,
            payload.questionnaire_answers,
        )
        if ai_resp:
            return ai_resp

    # 2. Fall back cleanly to the deterministic rule-based engine
    return generate_rule_based_response(
        payload.message,
        payload.bill_context,
        payload.questionnaire_answers,
        conv,
    )
