FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the code
COPY . .

# Build the SvelteKit application
RUN npm run build

# Prune dev dependencies to keep the final image light
RUN npm ci --omit=dev

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built application and production dependencies from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 5173

ENV NODE_ENV=production
ENV PORT=5173

# Run the node app
CMD ["node", "build"]
