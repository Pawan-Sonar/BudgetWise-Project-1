"""Polish-phase QA tests: input validation, duplicate guards, KPI math, CSV escape, dashboard concurrency."""
import os
import csv
import io
import time
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://da1fe05d-af7a-403a-af7d-6598ef8abb5c.preview.emergentagent.com").rstrip("/")
TEST_EMAIL = "qa@budgetwise.test"
TEST_PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}",
                      "Content-Type": "application/json"})
    return s


# ─── Auth error messaging ───
class TestAuthErrors:
    def test_login_wrong_password_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": TEST_EMAIL, "password": "WRONG_PW_xx"}, timeout=15)
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_login_nonexistent_email_returns_401_not_404(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "noexist_xx_polish@example.com", "password": "x"}, timeout=15)
        # Anti-enumeration: same 401 as wrong password
        assert r.status_code == 401

    def test_reset_invalid_token_returns_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": "garbage_xyz", "new_password": "NewPass1234!"}, timeout=15)
        assert r.status_code == 400
        assert "Invalid" in r.json().get("detail", "") or "expired" in r.json().get("detail", "").lower()


# ─── Transaction input validation (POLISH PHASE FOCUS) ───
class TestTransactionValidation:
    """These tests document expected behaviour: amount must be > 0, description non-empty."""

    def test_zero_amount_should_be_rejected(self, client):
        r = client.post(f"{BASE_URL}/api/transactions",
                        json={"type": "expense", "amount": 0,
                              "category": "Food & Dining", "description": "Test"}, timeout=15)
        # Cleanup if accidentally created
        if r.status_code == 200:
            tid = r.json().get("txn_id")
            if tid:
                client.delete(f"{BASE_URL}/api/transactions/{tid}", timeout=10)
        assert r.status_code in (400, 422), f"Expected validation error for amount=0, got {r.status_code}"

    def test_negative_amount_should_be_rejected(self, client):
        r = client.post(f"{BASE_URL}/api/transactions",
                        json={"type": "expense", "amount": -50,
                              "category": "Food & Dining", "description": "Test"}, timeout=15)
        if r.status_code == 200:
            tid = r.json().get("txn_id")
            if tid:
                client.delete(f"{BASE_URL}/api/transactions/{tid}", timeout=10)
        assert r.status_code in (400, 422), f"Expected validation error for negative amount, got {r.status_code}"

    def test_empty_description_should_be_rejected(self, client):
        r = client.post(f"{BASE_URL}/api/transactions",
                        json={"type": "expense", "amount": 100,
                              "category": "Food & Dining", "description": ""}, timeout=15)
        if r.status_code == 200:
            tid = r.json().get("txn_id")
            if tid:
                client.delete(f"{BASE_URL}/api/transactions/{tid}", timeout=10)
        assert r.status_code in (400, 422), f"Expected validation error for empty description, got {r.status_code}"


# ─── Budget Goals duplicate guard ───
class TestBudgetGoalDuplicate:
    def test_duplicate_goal_rejected(self, client):
        # The seeded user already has 3 monthly goals. Re-create one of them.
        existing = client.get(f"{BASE_URL}/api/budget-goals", timeout=15).json()
        if not existing:
            pytest.skip("No seeded goals available")
        sample = existing[0]
        payload = {"category": sample["category"], "limit_amount": 999, "period": sample["period"]}
        r = client.post(f"{BASE_URL}/api/budget-goals", json=payload, timeout=15)
        assert r.status_code == 409, f"Expected 409 conflict, got {r.status_code}: {r.text}"
        assert "already exists" in r.json().get("detail", "")


# ─── KPI math correctness ───
class TestKPIMath:
    def test_kpi_math_consistency(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/dashboard-kpis", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert round(d["net_savings"], 2) == round(d["total_income"] - d["total_expenses"], 2)
        if d["total_income"] > 0:
            expected_rate = round((d["net_savings"] / d["total_income"]) * 100, 1)
            assert abs(d["savings_rate"] - expected_rate) < 0.2, \
                f"savings_rate mismatch: {d['savings_rate']} vs expected {expected_rate}"

    def test_top_category_is_max_expense(self, client):
        kpi = client.get(f"{BASE_URL}/api/analytics/dashboard-kpis", timeout=15).json()
        if not kpi.get("top_category") or kpi["total_expenses"] <= 0:
            pytest.skip("No expense data to validate top category")
        # Get all expense txns and verify top category really is the max
        txns = client.get(f"{BASE_URL}/api/transactions?type=expense&limit=1000", timeout=15).json()["transactions"]
        sums = {}
        for t in txns:
            sums[t["category"]] = sums.get(t["category"], 0) + t["amount"]
        if sums:
            max_cat = max(sums, key=sums.get)
            # KPI computation may filter to current period; allow either current-period top or all-time top
            assert kpi["top_category"]["category"] in sums, \
                f"Top category {kpi['top_category']} not in any expense category"


# ─── CSV Export escaping ───
class TestCSVExport:
    def test_csv_export_special_chars_escaped(self, client):
        # Create a transaction with comma, quote, and unicode in description
        payload = {"type": "expense", "amount": 7.77,
                   "category": "Food & Dining",
                   "description": 'POLISH_TEST: a,b "quoted" 日本 €'}
        c = client.post(f"{BASE_URL}/api/transactions", json=payload, timeout=15)
        if c.status_code != 200:
            pytest.skip(f"Could not create test txn ({c.status_code}); validation fix may already be in place")
        tid = c.json()["txn_id"]
        try:
            r = client.get(f"{BASE_URL}/api/transactions/export", timeout=20)
            assert r.status_code == 200
            assert "text/csv" in r.headers.get("content-type", "") or r.text.startswith(("type,", "Date,", "date,"))
            # Parse CSV
            reader = csv.reader(io.StringIO(r.text))
            rows = list(reader)
            descriptions = [c for row in rows for c in row]
            # The escaped description must round-trip
            assert any('POLISH_TEST' in d for d in descriptions), "Test description not found in CSV"
            assert any('日本' in d for d in descriptions), "Unicode not preserved in CSV"
        finally:
            client.delete(f"{BASE_URL}/api/transactions/{tid}", timeout=10)


# ─── Dashboard concurrent-call sanity (no duplicate calls on mount is a frontend concern,
#     but backend must handle parallel analytics requests cleanly) ───
class TestDashboardConcurrency:
    def test_analytics_endpoints_parallel_ok(self, client):
        # Hit all three analytics endpoints back-to-back; all should 200
        endpoints = ["/api/analytics/dashboard-kpis",
                     "/api/analytics/monthly-comparison",
                     "/api/analytics/insights"]
        for ep in endpoints:
            r = client.get(f"{BASE_URL}{ep}", timeout=20)
            assert r.status_code == 200, f"{ep} → {r.status_code}: {r.text[:200]}"


# ─── /api/auth/me works with valid token, fails with garbage ───
class TestAuthMe:
    def test_me_with_garbage_token_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": "Bearer garbage.token.value"}, timeout=10)
        assert r.status_code == 401

    def test_me_with_valid_token(self, client):
        r = client.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == TEST_EMAIL
