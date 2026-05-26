# GitHub Setup Guide — Belmar Cloud Platform
**For:** First-time GitHub users
**Time:** ~20 minutes

---

## What is GitHub and why use it?

GitHub stores your code with full history of every change ever made. Key benefits for this project:
- **Rollback** — if a change breaks something, revert to any previous version in seconds
- **Auto-deploy** — pushing to GitHub automatically updates the live site (Cloudflare Pages)
- **History** — every change is logged with who made it and why
- **Backup** — your code is never lost, even if your laptop dies

---

## Step 1 — Create a GitHub account

1. Go to **github.com**
2. Click **Sign up**
3. Use your `@belmarcloud.com` email
4. Choose a username (e.g. `roanalfonso` or `belmarcloud`)
5. Complete verification and confirm your email

---

## Step 2 — Install GitHub Desktop

GitHub Desktop gives you a visual interface — no command line needed.

1. Go to **desktop.github.com**
2. Download for Mac or Windows
3. Install and open it
4. Click **Sign in to GitHub.com**
5. Authorise in the browser window that opens
6. You'll land on the GitHub Desktop home screen

---

## Step 3 — Create the repository

A repository (repo) is a folder that GitHub tracks.

1. In GitHub Desktop, click **Create a New Repository on your hard drive**
2. Fill in:
   - **Name:** `belmar-platform`
   - **Description:** `Belmar Cloud internal PSA + CRM platform`
   - **Local path:** choose a folder on your computer (e.g. `Documents/belmar-platform`)
   - **Initialize with README:** ✅ checked
   - **Git ignore:** None
   - **License:** None
3. Click **Create Repository**

---

## Step 4 — Add your files

1. Open your new repo folder in Finder/Explorer
   - GitHub Desktop → Repository menu → **Show in Finder** (Mac) or **Show in Explorer** (Windows)
2. Create this folder structure inside it:

```
belmar-platform/
├── docs/
│   ├── requirements.md
│   ├── user-guide.md
│   └── admin-guide.md
├── workers/
│   ├── proxy-worker.js
│   └── ruddr-mcp.js
└── index.html
```

3. Copy the files you downloaded from this chat into the right folders:
   - `requirements.md` → `docs/`
   - `user-guide.md` → `docs/`
   - `admin-guide.md` → `docs/`
   - `proxy-worker.js` → `workers/`
   - `index.html` → root folder

4. Copy your `ruddr-mcp.js` Worker code (from Cloudflare) into `workers/ruddr-mcp.js`

---

## Step 5 — Make your first commit

A commit is a saved snapshot with a description of what changed.

1. Switch back to GitHub Desktop
2. You'll see all your new files listed on the left under **Changes**
3. At the bottom left, fill in:
   - **Summary:** `Initial commit — add dashboard, workers, and docs`
   - **Description:** *(optional)* `First version of Belmar Cloud platform`
4. Click **Commit to main**

---

## Step 6 — Publish to GitHub

Your repo is currently only on your computer. Publishing puts it on GitHub.com.

1. Click **Publish repository** (top of GitHub Desktop)
2. Uncheck **Keep this code private** — actually **leave it checked** (private is correct for this)
3. Click **Publish repository**
4. Go to `github.com/yourusername/belmar-platform` — your files are there

---

## Step 7 — Connect GitHub to Cloudflare Pages (auto-deploy)

Once connected, every time you update `index.html` and push to GitHub, Cloudflare automatically deploys the new version. No more manual uploading.

1. Go to `dash.cloudflare.com`
2. **Workers & Pages** → click your Pages project (`belmar-psa`)
3. **Settings** → **Build & deploy** → **Connect to Git**
4. Authorise Cloudflare to access your GitHub account
5. Select the `belmar-platform` repository
6. Settings:
   - **Branch to deploy:** `main`
   - **Build command:** *(leave blank)*
   - **Build output directory:** `/` (forward slash only)
7. Click **Save**

From now on: edit file → commit → push → site updates automatically.

---

## Day-to-day workflow

### Making a change to index.html

1. Open `index.html` in a text editor (VS Code recommended — free at code.visualstudio.com)
2. Make your changes
3. Save the file
4. Switch to GitHub Desktop — you'll see `index.html` listed under Changes
5. Write a summary: e.g. `fix: update PROXY_URL to new worker address`
6. Click **Commit to main**
7. Click **Push origin** (top right)
8. Cloudflare deploys automatically — site updated in ~30 seconds

### Updating a doc

Same process — edit the markdown file, commit, push.

### Viewing history

1. GitHub Desktop → **History** tab (top left)
2. See every commit ever made, who made it, when, and what changed
3. Click any commit to see the exact lines that were added/removed

### Rolling back to a previous version

If something breaks:
1. GitHub Desktop → **History** tab
2. Right-click the last working commit
3. **Revert changes in commit** — or for a full reset, **Checkout commit**
4. Commit and push — site reverts immediately

---

## Working with the Console (Claude API) and GitHub

When building new features in Claude Console:

1. **Before your Console session:**
   - Make sure your local files are up to date (`Pull origin` in GitHub Desktop)
   - Upload the latest `index.html`, `requirements.md`, `schema.sql` to your Console Project

2. **During your Console session:**
   - Claude returns updated file contents
   - Copy the output into your local file (replace the whole thing)

3. **After your Console session:**
   - Open GitHub Desktop — review changes highlighted in red/green
   - Write a clear commit message describing what was built
   - Commit and push
   - Cloudflare auto-deploys

---

## Useful VS Code tips

VS Code is the best free editor for this project. Install it from `code.visualstudio.com`.

**Open your repo in VS Code:**
- GitHub Desktop → Repository menu → **Open in Visual Studio Code**

**Recommended extensions (install from the Extensions panel):**
- **Prettier** — auto-formats code on save
- **ESLint** — catches JS errors
- **GitHub Copilot** — AI code suggestions (optional, paid)
- **Markdown Preview Enhanced** — preview `.md` files as formatted docs

**Useful shortcuts:**
- `Cmd+S` / `Ctrl+S` — save
- `Cmd+Z` / `Ctrl+Z` — undo
- `Cmd+Shift+F` / `Ctrl+Shift+F` — search across all files
- `Cmd+P` / `Ctrl+P` — quick open any file

---

## Common issues

**"Authentication failed" when pushing:**
- GitHub Desktop → Preferences → Accounts → sign out and back in

**"Merge conflict":**
- This happens if two people edit the same file simultaneously
- GitHub Desktop will flag the conflict and show both versions
- Open the file, choose which version to keep, delete the conflict markers
- Commit the resolved file

**Cloudflare not auto-deploying:**
- Check the Pages → Deployments tab for error messages
- Most common cause: syntax error in the HTML file
- Roll back to the previous commit and investigate

**File not appearing in GitHub Desktop changes:**
- Make sure the file is inside the repo folder
- Check it was actually saved (VS Code shows a dot on the tab if unsaved)

---

## Quick reference

| Action | GitHub Desktop |
|---|---|
| Save a snapshot | Commit (bottom left) |
| Upload to GitHub | Push origin (top right) |
| Download latest | Pull origin (top right) |
| See history | History tab |
| Undo last commit | History → right-click → Revert |
| Open in VS Code | Repository menu → Open in VS Code |
| Open folder | Repository menu → Show in Finder/Explorer |
