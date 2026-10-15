FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app ./app
COPY components ./components
COPY public ./public
COPY backend.js logic.js scraper.js ./
RUN mkdir -p /app/data && npm run build && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "start"]
