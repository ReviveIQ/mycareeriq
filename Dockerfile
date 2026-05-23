FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --no-frozen-lockfile

COPY . .

# Force rebuild timestamp
ARG BUILD_DATE
RUN echo "Build: $BUILD_DATE"

RUN pnpm build

EXPOSE 3000

CMD ["node", "dist/index.js"]
