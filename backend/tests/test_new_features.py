"""Backend tests for BudgetWise NEW features (forgot/reset password + PDF report)."""
import os
import re
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TEST_EMAIL = "qa@budgetwise.test"
TEST_PASSWORD = "TestPass123!"


@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}"})
    return s


# ─── Forgot password — dev mode behavior ───
class TestForgotPassword:
    def test_forgot_password_existing_user_returns_dev_link(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": TEST_EMAIL}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "message" in data and "If an account exists" in data["message"]
        # In dev mode (ENVIRONMENT != production) we expect the dev fields
        assert "dev_reset_link" in data, f"Expected dev_reset_link in dev mode: {data}"
        assert "dev_token" in data
        assert "expires_in_minutes" in data
        assert isinstance(data["dev_token"], str) and len(data["dev_token"]) >= 20
        assert "/reset-password?token=" in data["dev_reset_link"]

    def test_forgot_password_nonexistent_user_no_enumeration(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": "TEST_nonexistent_xyz@example.com"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "message" in data and "If an account exists" in data["message"]
        # MUST NOT leak existence
        assert "dev_reset_link" not in data
        assert "dev_token" not in data


# ─── Reset password — full happy path + edge cases ───
class TestResetPassword:
    """Uses TEST_ user to avoid corrupting primary credentials."""

    @pytest.fixture(scope="class")
    def temp_user(self):
        import uuid as _u
        # NOTE: use lowercase email — register stores as-is, but forgot-password lowercases lookup.
        # This is a latent backend casing-mismatch bug (reported in test_report).
        email = f"test_reset_{_u.uuid4().hex[:8]}@example.com"
        pw = "OrigPass123!"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Reset Tester", "email": email, "password": pw}, timeout=20)
        assert r.status_code == 200, r.text
        return {"email": email, "password": pw}

    def _get_token(self, email):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": email}, timeout=20)
        assert r.status_code == 200
        return r.json()["dev_token"]

    def test_reset_invalid_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": "totally-bogus-token-xyz", "new_password": "NewPass123!"},
                          timeout=20)
        assert r.status_code == 400
        assert "invalid" in r.json().get("detail", "").lower() or "expired" in r.json().get("detail", "").lower()

    def test_reset_short_password_rejected(self, temp_user):
        token = self._get_token(temp_user["email"])
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": token, "new_password": "abc"}, timeout=20)
        assert r.status_code == 400
        assert "6 characters" in r.json().get("detail", "").lower() or "6" in r.json().get("detail", "")

    def test_reset_success_login_with_new_password(self, temp_user):
        new_pw = "BrandNewPass456!"
        token = self._get_token(temp_user["email"])
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": token, "new_password": new_pw}, timeout=20)
        assert r.status_code == 200, r.text
        assert "Password updated" in r.json()["message"]

        # New password works
        login_new = requests.post(f"{BASE_URL}/api/auth/login",
                                  json={"email": temp_user["email"], "password": new_pw}, timeout=20)
        assert login_new.status_code == 200, login_new.text

        # Old password no longer works
        login_old = requests.post(f"{BASE_URL}/api/auth/login",
                                  json={"email": temp_user["email"], "password": temp_user["password"]}, timeout=20)
        assert login_old.status_code == 401

        # update the stored password so other tests know it
        temp_user["password"] = new_pw

    def test_reset_token_one_time_use(self, temp_user):
        token = self._get_token(temp_user["email"])
        # First use
        r1 = requests.post(f"{BASE_URL}/api/auth/reset-password",
                           json={"token": token, "new_password": "OneTimePass789!"}, timeout=20)
        assert r1.status_code == 200, r1.text
        # Second use — must be rejected
        r2 = requests.post(f"{BASE_URL}/api/auth/reset-password",
                           json={"token": token, "new_password": "AnotherPass789!"}, timeout=20)
        assert r2.status_code == 400, r2.text
        detail = r2.json().get("detail", "").lower()
        assert "used" in detail or "invalid" in detail or "expired" in detail


# ─── PDF Report ───
class TestPDFReport:
    def test_pdf_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/reports/pdf", timeout=30)
        assert r.status_code == 401

    def test_pdf_download_success(self, client):
        r = client.get(f"{BASE_URL}/api/reports/pdf", timeout=60)
        assert r.status_code == 200, r.text[:300]
        # Content-Type
        ctype = r.headers.get("Content-Type", "")
        assert "application/pdf" in ctype, f"Wrong content-type: {ctype}"
        # Content-Disposition
        cdisp = r.headers.get("Content-Disposition", "")
        assert "attachment" in cdisp.lower()
        assert ".pdf" in cdisp.lower()
        # PDF magic bytes
        body = r.content
        assert body.startswith(b"%PDF"), f"Not a PDF: {body[:20]}"
        # Size > 5 KB
        assert len(body) > 5 * 1024, f"PDF too small: {len(body)} bytes"


# ─── Regression: existing endpoints still work ───
class TestRegression:
    def test_auth_me(self, client):
        r = client.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == TEST_EMAIL

    def test_transactions_get(self, client):
        r = client.get(f"{BASE_URL}/api/transactions?limit=10", timeout=15)
        assert r.status_code == 200
        assert "transactions" in r.json() and "total" in r.json()

    def test_transactions_post_then_delete(self, client):
        payload = {"type": "expense", "amount": 12.34, "category": "Other",
                   "description": "TEST_regression_txn"}
        r = client.post(f"{BASE_URL}/api/transactions", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        txn_id = r.json()["txn_id"]
        # cleanup
        d = client.delete(f"{BASE_URL}/api/transactions/{txn_id}", timeout=15)
        assert d.status_code == 200

    def test_budget_goals_get(self, client):
        r = client.get(f"{BASE_URL}/api/budget-goals", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_dashboard_kpis(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/dashboard-kpis", timeout=15)
        assert r.status_code == 200
        for k in ["total_income", "total_expenses", "net_savings", "savings_rate"]:
            assert k in r.json()

    def test_insights(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/insights", timeout=15)
        assert r.status_code == 200
        assert "insights" in r.json()

    def test_monthly_comparison(self, client):
        r = client.get(f"{BASE_URL}/api/analytics/monthly-comparison", timeout=15)
        assert r.status_code == 200
        for k in ["current", "previous", "growth"]:
            assert k in r.json()

    def test_csv_export(self, client):
        r = client.get(f"{BASE_URL}/api/transactions/export", timeout=20)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")
        assert "attachment" in r.headers.get("Content-Disposition", "").lower()
