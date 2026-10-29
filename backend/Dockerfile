FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production DB_PATH=/data/app.db
EXPOSE 8080
CMD ["npm", "start"]
