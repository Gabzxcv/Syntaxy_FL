# Git Troubleshooting Guide

This guide helps resolve common Git errors encountered when working with the Code Clone Detector repository.

## Error: "fatal: [branch_name] cannot be resolved to branch"

### Problem
When you try to push to a branch and see an error like:
```
PS C:\Users\cruza\OneDrive\Desktop\Fusion_logic_code\backend> git push --force origin Allen_code_test
fatal: Allen_code_test cannot be resolved to branch
```

### Root Cause
This error occurs when:
1. The branch doesn't exist locally in your repository
2. You're not currently on the branch you're trying to push
3. The branch name is misspelled

### Solution

#### Option 1: Check if you're on the correct branch
```bash
# Check which branch you're currently on
git branch

# If you're not on the branch, checkout to it
git checkout Allen_code_test
```

#### Option 2: Fetch and checkout the branch from remote
If the branch exists on GitHub but not locally:

```bash
# Fetch all branches from remote
git fetch origin

# List all available branches (including remote)
git branch -a

# Checkout the branch (this creates a local tracking branch)
git checkout Allen_code_test

# Or use the newer syntax
git switch Allen_code_test
```

#### Option 3: Create a new local branch tracking the remote
```bash
# Create and checkout a new branch tracking the remote
git checkout -b Allen_code_test origin/Allen_code_test

# Verify you're on the correct branch
git branch
```

#### Option 4: Push from your current branch to a remote branch
If you want to push your current branch's changes to a remote branch with a different name:

```bash
# Check your current branch
git branch

# Push current branch to the remote branch
git push origin HEAD:Allen_code_test

# Or specify explicitly
git push origin <your-current-branch>:Allen_code_test
```

### After Resolving
Once you've checked out the correct branch, you can push normally:

```bash
# Regular push
git push origin Allen_code_test

# Force push (use with caution!)
git push --force origin Allen_code_test
```

**⚠️ Warning**: Use `--force` push carefully as it can overwrite remote changes!

---

## Common Git Workflows

### Working with Branches

#### List all branches
```bash
# Local branches only
git branch

# Remote branches only
git branch -r

# All branches (local and remote)
git branch -a
```

#### Create a new branch
```bash
# Create and switch to new branch
git checkout -b new-branch-name

# Or using the newer switch command
git switch -c new-branch-name
```

#### Switch between branches
```bash
# Older syntax
git checkout branch-name

# Newer syntax (Git 2.23+)
git switch branch-name
```

#### Delete a branch
```bash
# Delete local branch
git branch -d branch-name

# Force delete local branch
git branch -D branch-name

# Delete remote branch
git push origin --delete branch-name
```

### Synchronizing with Remote

#### Update your local repository
```bash
# Fetch all changes from remote (doesn't modify your working directory)
git fetch origin

# Fetch and merge changes from the current branch's remote
git pull origin

# Pull with rebase instead of merge
git pull --rebase origin
```

#### Push changes
```bash
# Push current branch to remote
git push origin <branch-name>

# Set upstream and push (first time pushing a new branch)
git push -u origin <branch-name>

# Force push (overwrites remote - use carefully!)
git push --force origin <branch-name>
```

---

## Checking Branch Status

### Verify branch existence
```bash
# Check if branch exists locally
git branch | grep branch-name

# Check if branch exists on remote
git ls-remote --heads origin branch-name

# Or
git branch -r | grep branch-name
```

### View branch information
```bash
# Show current branch
git branch --show-current

# Show branch with last commit info
git branch -v

# Show branch with upstream info
git branch -vv
```

---

## Best Practices

1. **Always check your current branch** before pushing:
   ```bash
   git status
   ```

2. **Fetch before checkout** to ensure you have the latest branch information:
   ```bash
   git fetch origin
   git checkout branch-name
   ```

3. **Avoid force push** unless absolutely necessary, as it can overwrite others' work

4. **Use descriptive branch names** to avoid confusion

5. **Keep branches up to date** with the main branch:
   ```bash
   git checkout main
   git pull origin main
   git checkout your-branch
   git merge main
   ```

---

## Getting Help

If you continue to experience issues:

1. Check your git configuration:
   ```bash
   git config --list
   ```

2. Verify your remote repository:
   ```bash
   git remote -v
   ```

3. View the git log to understand the branch history:
   ```bash
   git log --oneline --graph --all -10
   ```

4. Consult the [Git documentation](https://git-scm.com/doc) for more detailed information

---

## Repository-Specific Notes

For the Code Clone Detector repository:

- **Main branch**: `main`
- **Development branches**: Feature branches should be created from `main`
- **Naming convention**: Use descriptive names like `feature/description` or `fix/issue-name`

### Available Branches

To see all available branches in this repository:
```bash
git fetch origin
git branch -a
```

Current main branches:
- `main` - Production-ready code
- `Allen_code_test` - Test branch for Allen's code changes
- `copilot/*` - Automated branches created by GitHub Copilot

---

## Quick Reference

| Task | Command |
|------|---------|
| Check current branch | `git branch` or `git status` |
| List all branches | `git branch -a` |
| Checkout existing branch | `git checkout branch-name` |
| Create new branch | `git checkout -b branch-name` |
| Fetch all branches | `git fetch origin` |
| Push to branch | `git push origin branch-name` |
| Delete local branch | `git branch -d branch-name` |
| Delete remote branch | `git push origin --delete branch-name` |

---

For more help with Git, visit: https://git-scm.com/docs
