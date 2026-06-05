# syntax=docker/dockerfile:1

FROM node:23-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:23-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsucGF5Y2xhcml0eS5hcHAk
ARG NEXT_PUBLIC_APP_URL=https://payclarity.app
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/overview
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/overview
RUN npm run build

FROM node:23-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copy the standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
