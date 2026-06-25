# BudgetWise - Render Deployment Guide

## Architecture on Render
You'll deploy **2 services** on Render:
1. **Backend** → Web Service (FastAPI/Python)
2. **Frontend** → Static Site (React)

Your **MongoDB Atlas** is already cloud-hosted, so no DB setup needed on Render.

---

## Step 1: Push Code to GitHub

First, save your project to GitHub using Emergent's **"Save to GitHub"** button in the top-right corner of the interface. This creates a GitHub repo with your full project.

---

## Step 2: Deploy the Backend (Web Service)

1. Go to [render.com](https://render.com) → **Dashboard** → **New +** → **Web Service**
2. Connect your GitHub repo
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `budgetwise-api` |
| **Root Directory** | `backend` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements-render.txt` |
| **Start Command** | `uvicorn server:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | Free (or Starter $7/mo for always-on) |

4. Add **Environment Variables** (click "Advanced" → "Add Environment Variable"):

| Key | Value |
|-----|-------|
| `MONGO_URL` | `mongodb+srv://Pawan:Pawan81@crystalcluster0.uoekko0.mongodb.net/?appName=CrystalCluster0` |
| `DB_NAME` | `test_database` |
| `JWT_SECRET` | `your-strong-secret-key-here-change-this` |
| `CORS_ORIGINS` | `https://budgetwise-frontend.onrender.com` *(update after frontend deploy)* |
| `PYTHON_VERSION` | `3.11.0` |

5. Click **Create Web Service** → Wait for build to complete
6. Note your backend URL (e.g. `https://budgetwise-api.onrender.com`)

---

## Step 3: Deploy the Frontend (Static Site)

1. Go to Render **Dashboard** → **New +** → **Static Site**
2. Connect the same GitHub repo
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `budgetwise-frontend` |
| **Root Directory** | `frontend` |
| **Build Command** | `chmod +x render-build.sh && ./render-build.sh` |
| **Publish Directory** | `build` |

4. Add **Environment Variables**:

| Key | Value |
|-----|-------|
| `REACT_APP_BACKEND_URL` | `https://budgetwise-api.onrender.com` *(your backend URL from Step 2)* |

5. Click **Create Static Site**

---

## Step 4: Add Rewrite Rule (Frontend)

Since this is a Single Page App (SPA), you need to handle client-side routing:

1. Go to your Static Site → **Redirects/Rewrites** tab
2. Add a rewrite rule:

| Source | Destination | Action |
|--------|-------------|--------|
| `/*` | `/index.html` | **Rewrite** |

This ensures routes like `/dashboard`, `/reports`, etc. work when accessed directly.

---

## Step 5: Update CORS on Backend

After the frontend is deployed, go back to your **Backend Web Service** → **Environment**:
- Update `CORS_ORIGINS` to your actual frontend URL:
  ```
  https://budgetwise-frontend.onrender.com
  ```

---

## Step 6: Whitelist IPs on MongoDB Atlas

1. Go to [MongoDB Atlas](https://cloud.mongodb.com) → Your Cluster → **Network Access**
2. Click **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`)
   - Or add Render's specific IP ranges (check Render docs)
3. Click **Confirm**

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Frontend shows blank page | Add the `/*` → `/index.html` rewrite rule |
| CORS errors | Update `CORS_ORIGINS` env var on backend with your frontend URL |
| MongoDB connection fails | Whitelist Render IPs in Atlas Network Access |
| Backend 502 errors | Check Render logs, ensure `PORT` env var is being used |
| Google OAuth not working | Google OAuth via Emergent Auth may not work on external domains |

---

## Important Notes

- **Free tier on Render**: Backend spins down after 15 min of inactivity. First request after sleep takes ~30 seconds.
- **Starter plan ($7/mo)**: Always-on, no cold starts.
- **Google OAuth**: The Emergent Google Auth integration is designed for the Emergent platform. On Render, JWT login/registration will work. For Google OAuth on Render, you'd need to set up your own Google OAuth credentials.
