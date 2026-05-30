FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN yarn install --production

COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY migrations ./migrations

ENV NODE_ENV=production
EXPOSE 3000

USER node

CMD ["sh", "-c", "node scripts/production-preflight.mjs && npm start"]
