# 📚 IELTS Preparation Platform

A simple real-time platform for IELTS practice tests.  
Teachers create tests, students join and complete them live via Socket.io.

---

## 🗂 Project Structure

```
ielts-platform/
├── server/
│   └── server.js          # Express + Socket.io backend
├── public/
│   ├── student.html        # Student page  →  /student
│   ├── teacher.html        # Teacher page  →  /teacher
│   ├── student.js          # Student logic
│   ├── teacher.js          # Teacher logic
│   └── style.css           # Shared styles
├── uploads/                # Uploaded audio files (auto-created)
├── data/                   # JSON state storage (auto-created)
├── package.json
├── .gitignore
└── README.md
```

---

## 🚀 Run Locally

### 1. Install dependencies

```bash
cd ielts-platform
npm install
```

### 2. Start the server

```bash
npm start
```

### 3. Open in browser

- Teacher: http://localhost:3000/teacher  
- Student: http://localhost:3000/student  

---

## ☁️ Deploy to Render (free tier)

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/ielts-platform.git
git push -u origin main
```

### Step 2 — Create a Web Service on Render

1. Go to https://render.com and sign up / log in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo
4. Fill in the settings:
   - **Name**: ielts-platform (or any name)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Click **"Create Web Service"**

Render will deploy automatically. You'll get a URL like:  
`https://ielts-platform.onrender.com`

Your pages will be at:
- `https://ielts-platform.onrender.com/teacher`
- `https://ielts-platform.onrender.com/student`

### ⚠️ Notes on Render Free Tier

- Free services **spin down after 15 min of inactivity** and take ~30s to wake up.
- Uploaded audio files are **ephemeral** (lost on restart). For permanent storage, consider Cloudinary or AWS S3.
- For production use, upgrade to a paid plan.

---

## 🎓 How to Use

### Teacher
1. Open `/teacher`
2. Choose **Listening** (upload MP3/WAV) or **Reading** (paste passage)
3. Add questions with 4 options each, mark the correct answer
4. Set time limit (minutes)
5. Click **Save Test**
6. Share the `/student` link with students
7. Wait for students to join (visible in the waiting room list)
8. Click **▶ Start Test** — all students receive the test instantly

### Student
1. Open `/student`
2. Enter full name → **Join Test Session**
3. Wait in the waiting room
4. When teacher starts: test appears automatically
5. Answer questions, submit before time runs out
6. See results immediately

---

## 🛠 Tech Stack

| Layer    | Technology              |
|----------|-------------------------|
| Frontend | HTML, CSS, Vanilla JS   |
| Backend  | Node.js + Express       |
| Realtime | Socket.io               |
| Storage  | JSON file + local disk  |
