#!/bin/bash
# push.sh — اتشغل لما تخلص التعديلات وتحب ترفعها على GitHub
# الاستخدام: bash push.sh "رسالة الـ commit"

MSG="${1:-update}"

echo "🔒 Removing any stale git lock..."
rm -f .git/index.lock

echo "📦 Staging all changes..."
git add -A

echo "💬 Committing: $MSG"
git commit -m "$MSG"

echo "🚀 Pushing to GitHub..."
git push origin main

echo "✅ Done! Check Vercel for automatic deployment."
