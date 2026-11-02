#!/bin/bash
# ==============================================================================
# Vyrona — Automated AWS Deployment Script
# Usage:
#   ./deploy.sh          (Deploys both frontend and backend)
#   ./deploy.sh backend  (Deploys backend code & rebuilds backend container)
#   ./deploy.sh frontend (Builds frontend locally & updates Nginx on EC2)
# ==============================================================================

set -e

EC2_HOST="16.113.114.79"
KEY_PATH="$HOME/Downloads/vyrona_ssh.pem"
REMOTE_USER="ubuntu"
REMOTE_DIR="/home/ubuntu/mG-SCALE"

TARGET="${1:-all}"

echo "=========================================="
echo "🚀 Deploying to AWS EC2: $EC2_HOST"
echo "Target: $TARGET"
echo "=========================================="

# Check if SSH key exists
if [ ! -f "$KEY_PATH" ]; then
    echo "❌ Error: SSH key not found at $KEY_PATH"
    exit 1
fi

SSH_CMD="ssh -i $KEY_PATH -o StrictHostKeyChecking=no"
RSYNC_SSH="ssh -i $KEY_PATH -o StrictHostKeyChecking=no"

deploy_backend() {
    echo ""
    echo "📦 [1/3] Syncing docker-compose configuration..."
    rsync -avz -e "$RSYNC_SSH" \
        docker-compose.aws.yml $REMOTE_USER@$EC2_HOST:$REMOTE_DIR/docker-compose.yml

    echo "📦 [2/3] Syncing Backend files..."
    rsync -avz -e "$RSYNC_SSH" \
        --exclude '.venv' \
        --exclude '__pycache__' \
        --exclude '.pytest_cache' \
        --exclude 'logs' \
        backend/ $REMOTE_USER@$EC2_HOST:$REMOTE_DIR/backend/

    echo "🔄 [3/3] Restarting Backend container on EC2..."
    $SSH_CMD $REMOTE_USER@$EC2_HOST "cd $REMOTE_DIR && docker compose up -d --build backend && docker compose up -d"
    echo "✅ Backend updated successfully!"
}

deploy_frontend() {
    echo ""
    cd FrontEnd
    GOOGLE_KEY="${GOOGLE_MAPS_API_KEY:-${VITE_GOOGLE_MAPS_API_KEY:-}}"
    if [ -n "$GOOGLE_KEY" ]; then
        VITE_API_BASE_URL="http://$EC2_HOST:8000" VITE_GOOGLE_MAPS_API_KEY="$GOOGLE_KEY" npm run build
    else
        VITE_API_BASE_URL="http://$EC2_HOST:8000" npm run build
    fi
    cd ..

    echo "📦 [2/2] Syncing Frontend build to Nginx on EC2..."
    rsync -avz -e "$RSYNC_SSH" \
        FrontEnd/dist/ $REMOTE_USER@$EC2_HOST:$REMOTE_DIR/dist/

    $SSH_CMD $REMOTE_USER@$EC2_HOST "sudo cp -r $REMOTE_DIR/dist/* /var/www/html/ && sudo systemctl reload nginx"
    echo "✅ Frontend updated successfully!"
}

if [ "$TARGET" = "backend" ]; then
    deploy_backend
elif [ "$TARGET" = "frontend" ]; then
    deploy_frontend
elif [ "$TARGET" = "all" ]; then
    deploy_backend
    deploy_frontend
else
    echo "❌ Unknown target: $TARGET. Use 'all', 'backend', or 'frontend'."
    exit 1
fi

echo ""
echo "=========================================="
echo "🎉 Deployment complete!"
echo "Visit: http://$EC2_HOST"
echo "API Docs: http://$EC2_HOST/docs"
echo "=========================================="
