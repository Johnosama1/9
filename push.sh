#!/bin/bash
# push.sh — اتشغل لما تخلص التعديلات وتحب ترفعها على GitHub
# الاستخدام: bash push.sh "رسالة الـ commit"

MSG="${1:-update from Replit}"
node push.js "$MSG"
