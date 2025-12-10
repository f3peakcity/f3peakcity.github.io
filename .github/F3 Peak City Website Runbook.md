# F3 Peak City Website Development Runbook

## Prerequisites
- Hugo v0.130.0 installed (`brew install hugo`)
- Git configured with GitHub credentials
- Local clone of `f3peakcity.github.io` repository

## Daily Development Workflow

### 1. Start Your Local Development Server

```bash
cd /path/to/f3peakcity.github.io
hugo server -D
```

**What this does:**
- Builds the site locally
- Serves it at `http://localhost:1313`
- Watches for file changes and auto-refreshes your browser
- The `-D` flag includes draft content

**Pro tip:** Keep this terminal window open while you work. The site will automatically rebuild as you save changes.

---

### 2. Make Your Changes

Depending on what you're updating:

#### **Updating Existing Content**
1. Search the repo for the content you want to change
2. Edit the markdown (`.md`) files in the `/content` directory
3. Save your changes
4. Check `http://localhost:1313` in your browser – changes appear instantly

#### **Adding a New Backblast**
1. Create a new file in `/content/backblasts/`
2. Use this naming convention: `YYYY-MM-DD-ao-name.md`
3. Include proper front matter (copy from an existing backblast)
4. Write your backblast content
5. Preview at `http://localhost:1313/backblasts/`

#### **Updating AO Information**
Update these locations:
- Schedule page content
- Q Sheet links
- Consider submitting an F3 Nation Map Change Request (if location details changed)

#### **Styling/CSS Changes**
If modifying the Beautiful Hugo theme:
- Edit files in the `_vendor` directory (after running `hugo mod vendor`)
- Or work in a local clone of the forked theme repo and update `config.toml` with a replace directive

---

### 3. Test Your Changes Locally

Before pushing anything:

✅ **Visual Check:** Browse the affected pages at `http://localhost:1313`

✅ **Link Check:** Click through navigation and any links you modified

✅ **Mobile Check:** Resize your browser or use dev tools to check responsive design

✅ **Build Check:** Stop the server (`Ctrl+C`) and run a full build:
```bash
hugo
```
This ensures there are no build errors that might break the production site.

---

### 4. Commit Your Changes

```bash
# Check what you've changed
git status

# Review your specific changes
git diff

# Stage your changes
git add .
# Or stage specific files:
# git add content/backblasts/2024-12-10-example.md

# Commit with a descriptive message
git commit -m "Add backblast for 2024-12-10 beatdown at The Mothership"
```

**Commit Message Best Practices:**
- Start with a verb: "Add", "Update", "Fix", "Remove"
- Be specific: "Update Q Sheet with new AO location" not "changes"
- Reference issues if applicable: "Fix broken link (closes #42)"

---

### 5. Push to GitHub

```bash
# Push to the main branch
git push origin main
```

**What happens next:**
- GitHub Pages automatically rebuilds the site
- Changes appear at `https://f3peakcity.com` within a few minutes
- Check the "Actions" tab in GitHub to monitor the deployment

---

### 6. Verify Production Deployment

After pushing:

1. Wait 2-5 minutes for GitHub Pages to rebuild
2. Visit `https://f3peakcity.com` and verify your changes
3. Clear your browser cache if you don't see updates (`Cmd+Shift+R` on Mac)

---

## Common Workflows

### Quick Content Update
```bash
hugo server -D          # Start dev server
# Make your edits in VS Code/text editor
# Save and preview at localhost:1313
git add .
git commit -m "Update [description]"
git push origin main
```

### Adding Multiple Backblasts
```bash
hugo server -D
# Create multiple .md files in /content/backblasts/
# Preview each at localhost:1313
git add content/backblasts/
git commit -m "Add backblasts for week of Dec 10-16"
git push origin main
```

### Updating the Theme
```bash
# In the forked beautifulhugo repo
git commit -m "Update theme styles"
git tag v0.0.2
git push --tags

# Back in f3peakcity.github.io
hugo mod get github.com/f3peakcity/beautifulhugo@v0.0.2
hugo mod tidy
git add go.mod go.sum
git commit -m "Update theme to v0.0.2"
git push origin main
```

---

## Troubleshooting

### Port 1313 Already in Use
```bash
# Kill existing Hugo process
pkill hugo
# Or use a different port
hugo server -D -p 1314
```

### Changes Not Appearing Locally
```bash
# Stop server (Ctrl+C) and restart
hugo server -D --disableFastRender
```

### Changes Not Appearing on Production
- Check GitHub Actions for build errors
- Clear browser cache
- Verify your push succeeded: `git log --oneline -5`

### Module Issues
```bash
hugo mod clean
hugo mod get
hugo mod tidy
```

---

## Quick Reference

**Start developing:** `hugo server -D`

**Stop server:** `Ctrl+C`

**Full build:** `hugo`

**Clean build:** `hugo --cleanDestinationDir`

**View site:** `http://localhost:1313`

**Git workflow:** `git status` → `git add .` → `git commit -m "message"` → `git push origin main`

---

## Tips for Success

- **Always test locally first** – don't push untested changes to production
- **Use meaningful commit messages** – your future self will thank you
- **Keep your local repo updated** – run `git pull origin main` before starting work
- **Create branches for major changes** – use `git checkout -b feature-name` for experimental work
- **Ask for help** – ping Wahoo or Clockwork on Slack if you're stuck

---

## Need Help?

- **Hugo docs:** https://gohugo.io/documentation/
- **Beautiful Hugo theme:** https://github.com/f3peakcity/beautifulhugo
- **F3 Peak City admins:** Wahoo, Clockwork on Slack
- **Open an issue:** https://github.com/f3peakcity/f3peakcity.github.io/issues