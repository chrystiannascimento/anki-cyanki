FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the code
COPY . .

EXPOSE 5173

ENV NODE_ENV=development
ENV PORT=5173

# Run the SvelteKit development server exposing it to the docker network
CMD sh -c "npm install && npm run dev -- --host 0.0.0.0"
