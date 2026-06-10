FROM node:20-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/ ./src/
COPY relay.config.json ./
RUN mkdir -p data
EXPOSE 3001
ENV DB_PATH=/app/data/relay.db
CMD ["node", "src/index.js"]
