# Build stage
FROM node:20-slim AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Accept build arguments
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Dev stage - live reload for local development via docker compose (bind-mounts source, runs vite dev server)
FROM node:20-slim AS dev

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]

# Production stage
FROM node:20-slim

# Install serve globally
RUN npm install -g serve

# Copy built assets from build stage
COPY --from=build /app/dist /home/site/wwwroot

EXPOSE 80

CMD ["npx", "serve", "-s", "/home/site/wwwroot", "-l", "80"]
