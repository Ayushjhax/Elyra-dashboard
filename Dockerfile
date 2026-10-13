FROM node:24-alpine

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .

# NEXT_PUBLIC_ values are inlined into the client bundle at build time, and
# .dockerignore keeps .env* out of the image — so without these, the build
# ships with Privy unconfigured and sign-in silently disabled. Pass them with
# --build-arg. Server-only secrets are runtime env, never build args.
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SOLANA_RPC_URL
ARG NEXT_PUBLIC_REFERRAL_BASE_URL
RUN pnpm build --webpack

EXPOSE 3000
CMD ["pnpm", "start"]
