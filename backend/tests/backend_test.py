"""Backend tests for BudgetWise enhanced features (KPIs, insights, filters, budget goals)."""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://da1fe05d-af7a-403a-af7d-6598ef8abb5c.preview.emergentagent.com").rstrip("/")
TEST_EMAIL = "qa@budgetwise.test"
TEST_PASSWORD = "TestPass123!"


@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
                      timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str)
    assert data["user"]["email"] == TEST_EMAIL
    return data["token"]


@pytest.fixture(scope="session")
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"})
    return s


# ─── Auth (light retest) ───
class TestAuth:
    def test_register_existing_returns_error(self):
        # Idempotency check - existing user should not be allowed to register again
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Test", "email": TEST_EMAIL, "password": TEST_PASSWORD},
                          timeout=15)
        assert r.status_code in (400, 409), f"Expected duplicate-user error, got {r.status_code}"

    def test_register_and_login_new_user(self):
        unique = f"TEST_user_{datetime.now().strftime('%H%M%S%f')}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Temp", "email": unique, "password": "Temp123!"},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert "token" in r.json()
        # Login
        r2 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": unique, "password": "Temp123!"},
                           timeout=15)
        assert r2.status_code == 200
        # Email is normalized to lowercase canonical form on register/login (per iteration_3 fix)
        assert r2.json()["user"]["email"] == unique.lower()


# ─── Dashboard KPIs ───
class TestDashboardKPIs:
    def test_kpis_shape(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/dashboard-kpis", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["total_income", "total_expenses", "net_savings", "savings_rate",
                  "top_category", "transaction_count"]:
            assert k in data, f"Missing key {k} in KPI response"
        assert isinstance(data["total_income"], (int, float))
        assert isinstance(data["total_expenses"], (int, float))
        assert isinstance(data["net_savings"], (int, float))
        assert isinstance(data["savings_rate"], (int, float))
        assert isinstance(data["transaction_count"], int)
        # Net savings consistency
        assert round(data["net_savings"], 2) == round(data["total_income"] - data["total_expenses"], 2)

    def test_top_category_structure(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/dashboard-kpis", timeout=20)
        data = r.json()
        tc = data["top_category"]
        if data["total_expenses"] > 0:
            assert tc is not None and "category" in tc and "amount" in tc
            assert tc["amount"] > 0
        # else: top_category can be None


# ─── Monthly Comparison ───
class TestMonthlyComparison:
    def test_monthly_comparison_shape(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/monthly-comparison", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for sect in ["current", "previous", "growth"]:
            assert sect in data
        for sect in ["current", "previous"]:
            for k in ["label", "income", "expenses", "net_savings"]:
                assert k in data[sect], f"Missing {k} in {sect}"
        for k in ["income_pct", "expenses_pct", "savings_pct"]:
            assert k in data["growth"]


# ─── Insights ───
class TestInsights:
    def test_insights_returns_array(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/insights", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "insights" in data and isinstance(data["insights"], list)
        assert len(data["insights"]) >= 1
        for item in data["insights"]:
            for k in ["type", "direction", "message", "icon"]:
                assert k in item, f"Missing {k} in insight item: {item}"
            assert isinstance(item["message"], str) and len(item["message"]) > 0

    def test_insights_has_multiple_types_with_seeded_data(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/insights", timeout=20)
        items = r.json()["insights"]
        types_seen = {i["type"] for i in items}
        # With seeded data across two months, expect at least 2 distinct insight types
        assert len(types_seen) >= 2, f"Expected multiple insight types, got: {types_seen}"


# ─── Transaction Filters ───
class TestTransactionFilters:
    def test_min_amount_filter(self, client):
        r = client.get(f"{BASE_URL}/api/transactions?min_amount=2000&limit=100", timeout=20)
        assert r.status_code == 200, r.text
        for t in r.json()["transactions"]:
            assert t["amount"] >= 2000, f"min_amount filter violated: {t}"

    def test_max_amount_filter(self, client):
        r = client.get(f"{BASE_URL}/api/transactions?max_amount=1000&limit=100", timeout=20)
        assert r.status_code == 200
        for t in r.json()["transactions"]:
            assert t["amount"] <= 1000

    def test_min_and_max_amount_range(self, client):
        r = client.get(f"{BASE_URL}/api/transactions?min_amount=500&max_amount=5000&limit=100", timeout=20)
        assert r.status_code == 200
        for t in r.json()["transactions"]:
            assert 500 <= t["amount"] <= 5000

    def test_type_filter(self, client):
        r = client.get(f"{BASE_URL}/api/transactions?type=expense&limit=100", timeout=20)
        assert r.status_code == 200
        for t in r.json()["transactions"]:
            assert t["type"] == "expense"

    def test_category_filter(self, client):
        # First find an existing category
        all_r = client.get(f"{BASE_URL}/api/transactions?limit=100", timeout=20).json()
        if not all_r["transactions"]:
            pytest.skip("No transactions seeded")
        cat = all_r["transactions"][0]["category"]
        r = client.get(f"{BASE_URL}/api/transactions?category={cat}&limit=100", timeout=20)
        assert r.status_code == 200
        for t in r.json()["transactions"]:
            assert t["category"] == cat

    def test_search_case_insensitive(self, client):
        # Use a probable substring from a description or category
        all_r = client.get(f"{BASE_URL}/api/transactions?limit=100", timeout=20).json()
        if not all_r["transactions"]:
            pytest.skip("No transactions seeded")
        sample = all_r["transactions"][0]
        # Pick something from category since description varies
        token = sample["category"][:4]
        token_upper = token.upper()
        token_lower = token.lower()
        r1 = client.get(f"{BASE_URL}/api/transactions?search={token_upper}&limit=100", timeout=20)
        r2 = client.get(f"{BASE_URL}/api/transactions?search={token_lower}&limit=100", timeout=20)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["total"] == r2.json()["total"], "Search must be case-insensitive"
        assert r1.json()["total"] >= 1
        # All results must contain token in either category or description (case-insensitive)
        for t in r1.json()["transactions"]:
            assert token_lower in t["category"].lower() or token_lower in (t.get("description") or "").lower()

    def test_combined_filters(self, client):
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = client.get(
            f"{BASE_URL}/api/transactions?type=expense&min_amount=1&max_amount=1000000"
            f"&start_date=2020-01-01&end_date={now}&limit=100", timeout=20)
        assert r.status_code == 200, r.text
        for t in r.json()["transactions"]:
            assert t["type"] == "expense"
            assert 1 <= t["amount"] <= 1000000
            assert "2020-01-01" <= t["date"] <= now


# ─── Budget Goals CRUD ───
class TestBudgetGoals:
    created_ids = []

    def test_get_goals_includes_spent(self, client):
        r = client.get(f"{BASE_URL}/api/budget-goals", timeout=20)
        assert r.status_code == 200, r.text
        goals = r.json()
        assert isinstance(goals, list)
        if goals:
            for g in goals:
                assert "spent" in g, f"Goal missing 'spent' field: {g}"
                assert isinstance(g["spent"], (int, float))
                assert "category" in g and "limit_amount" in g
                assert g["spent"] >= 0

    def test_create_update_delete_goal(self, client):
        payload = {"category": "TEST_Travel", "limit_amount": 5000, "period": "monthly"}
        r = client.post(f"{BASE_URL}/api/budget-goals", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["category"] == "TEST_Travel"
        assert created["limit_amount"] == 5000
        assert "goal_id" in created
        gid = created["goal_id"]
        TestBudgetGoals.created_ids.append(gid)

        # Verify in GET
        r2 = client.get(f"{BASE_URL}/api/budget-goals", timeout=20)
        ids = [g["goal_id"] for g in r2.json()]
        assert gid in ids

        # Update
        r3 = client.put(f"{BASE_URL}/api/budget-goals/{gid}", json={"limit_amount": 7500}, timeout=20)
        assert r3.status_code == 200, r3.text
        assert r3.json()["limit_amount"] == 7500

        # Delete
        r4 = client.delete(f"{BASE_URL}/api/budget-goals/{gid}", timeout=20)
        assert r4.status_code == 200

        # Verify deletion
        r5 = client.get(f"{BASE_URL}/api/budget-goals", timeout=20)
        ids2 = [g["goal_id"] for g in r5.json()]
        assert gid not in ids2

    @classmethod
    def teardown_class(cls):
        # Best-effort cleanup
        try:
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=10)
            token = r.json().get("token")
            if token:
                hdr = {"Authorization": f"Bearer {token}"}
                for gid in cls.created_ids:
                    requests.delete(f"{BASE_URL}/api/budget-goals/{gid}", headers=hdr, timeout=10)
        except Exception:
            pass
