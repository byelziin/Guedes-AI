FROM node:20-alpine AS builder

WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/server.js ./server.js
COPY --from=builder /usr/src/app/numbers.js ./numbers.js

EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "server.js"]
