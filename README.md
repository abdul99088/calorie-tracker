# 🥑 Cal AI — Frictionless Bio-Metric Macro & Calorie Tracker

🚀 **Eliminating the friction of manual data entry with instant AI image analysis and personalized metabolic targeting.**

---

## 🛑 The Problem
Traditional fitness and nutrition apps fail because of **data-entry fatigue**. Forcing users to manually look up ingredients, guess portion sizes, and log items line-by-line introduces massive psychological friction. When tracking food feels like an administrative chore, users abandon their health goals within days.

## 💡 The Solution
This project is a mobile-first **Cal AI Clone** engineered to eliminate tracking friction entirely. By leveraging AI image parsing alongside real-time data visualization, users go from a plate of food to an accurate, personalized macro breakdown in seconds.

---

## ✨ Core Engineering & Real-World Problem Solving

### 📸 1. AI-Driven Visual Analysis
* **Frictionless Ingestion:** Users simply snap or upload a photo of their meal. The backend handles the image processing pipeline to instantly estimate the meal name, calorie count, and macro distribution.
* **State Interruption Handling:** Includes a UI-native cancellation override (`×`) that instantly purges raw images from memory states if a user aborts mid-stream, preventing unnecessary API overhead.

### 🧬 2. Dynamic Metabolic Calibration (Mifflin-St Jeor Engine)
* **Ditched Flat Targets:** Instead of forcing every user into a generic, hardcoded 2,000 kcal box, the system features a built-in biometric calculator.
* **Reactive Goal Setting:** By inputting biological gender, age, height, weight, and activity multipliers, the app runs the industry-standard Mifflin-St Jeor equation to instantly recalibrate custom baseline targets across the entire interface.

### 🔒 3. Multi-User Session Isolation
* Secured natively via **Supabase Authentication**.
* Implemented strict user containment query isolation (`user_id` sandboxing) to ensure historical food diary entries, profile metrics, and log deletions are securely restricted to individual account instances.

### 📊 4. Reactive Visual Analytics
* Powered by **Chart.js** integration. 
* Real-time canvas rendering triggers a recalculation of the macro doughnut allocation and weekly calorie progress the exact millisecond a user logs a new meal or completely purges a row via the diary delete action (`🗑️`).

---

## 🏗️ Tech Stack
* **Frontend:** React (SPA Architecture), Mobile-First Adaptive CSS Layout.
* **Backend & Database:** Supabase (PostgreSQL, Auth, Edge Functions).
* **Data Visualization:** Chart.js (Reactive canvas engine).

---

## 🚀 Local Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/abdul99088/calorie-tracker.git](https://github.com/abdul99088/calorie-tracker.git)
   cd calorie-tracker
