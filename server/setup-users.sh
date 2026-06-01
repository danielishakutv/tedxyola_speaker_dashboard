#!/bin/bash
# Interactive user setup script for TEDx Speaker Dashboard
# Run this on the VPS after deployment to create admin and editor accounts

set -e

echo "════════════════════════════════════════════════════════"
echo "  TEDx Speaker Dashboard - User Setup"
echo "════════════════════════════════════════════════════════"
echo ""
echo "This script will create 3 users:"
echo "  1. Admin account (full access)"
echo "  2. Editor account 1 (Peace)"
echo "  3. Editor account 2 (Rachael)"
echo ""

# Prompt for admin credentials
read -p "Admin username [@Admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-@Admin}

while true; do
    read -sp "Admin password: " ADMIN_PASS
    echo ""
    read -sp "Confirm admin password: " ADMIN_PASS_CONFIRM
    echo ""
    if [ "$ADMIN_PASS" = "$ADMIN_PASS_CONFIRM" ]; then
        break
    else
        echo "❌ Passwords don't match. Try again."
    fi
done

# Prompt for editor 1 credentials
echo ""
read -p "Editor 1 username [@Peace]: " EDITOR1_USER
EDITOR1_USER=${EDITOR1_USER:-@Peace}

while true; do
    read -sp "Editor 1 password: " EDITOR1_PASS
    echo ""
    read -sp "Confirm editor 1 password: " EDITOR1_PASS_CONFIRM
    echo ""
    if [ "$EDITOR1_PASS" = "$EDITOR1_PASS_CONFIRM" ]; then
        break
    else
        echo "❌ Passwords don't match. Try again."
    fi
done

# Prompt for editor 2 credentials
echo ""
read -p "Editor 2 username [@Rachael]: " EDITOR2_USER
EDITOR2_USER=${EDITOR2_USER:-@Rachael}

while true; do
    read -sp "Editor 2 password: " EDITOR2_PASS
    echo ""
    read -sp "Confirm editor 2 password: " EDITOR2_PASS_CONFIRM
    echo ""
    if [ "$EDITOR2_PASS" = "$EDITOR2_PASS_CONFIRM" ]; then
        break
    else
        echo "❌ Passwords don't match. Try again."
    fi
done

echo ""
echo "────────────────────────────────────────────────────────"
echo "Creating users..."
echo "────────────────────────────────────────────────────────"

# Export variables and run seed
export ADMIN_USER ADMIN_PASS EDITOR1_USER EDITOR1_PASS EDITOR2_USER EDITOR2_PASS
node seed-users.js

echo ""
echo "════════════════════════════════════════════════════════"
echo "✓ Setup complete!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Login credentials:"
echo "  Admin:    $ADMIN_USER"
echo "  Editor 1: $EDITOR1_USER"
echo "  Editor 2: $EDITOR2_USER"
echo ""
echo "⚠️  Keep these credentials secure!"
echo ""
