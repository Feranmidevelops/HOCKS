# Build the client bundle
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Runtime: the game server serves the built client and the socket on one port
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY src ./src
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["npx", "tsx", "src/server/main.ts"]
