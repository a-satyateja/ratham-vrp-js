FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port (Cloud Run will inject PORT env var, but 3000 is our default)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
