# Makefile — common developer shortcuts for ReligioGram backend.
# Usage: make <target>
# Prerequisites: Node 20+, Docker / Docker Compose, psql (optional for db-*)

.PHONY: help dev test lint typecheck build migrate seed \
        docker-up docker-down docker-logs db-reset \
        k6-smoke k6-soak audit secrets-scan clean

##@ General

help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Development

dev: ## Start backend in watch mode (requires local .env)
	npm run start:dev

install: ## Install Node dependencies
	npm ci

##@ Testing

test: ## Run unit tests with coverage
	npx jest --testPathPattern="\.spec\.ts$$" --coverage --coverageThreshold='{"global":{"lines":60,"functions":60,"branches":50}}'

test-e2e: ## Run NestJS E2E tests (requires running DB)
	npx jest --config jest-e2e.json --runInBand

test-ci: ## Run tests exactly as CI does (with PostGIS service assumed running)
	npx jest --testPathPattern="\.spec\.ts$$" --passWithNoTests --coverage \
	  --coverageReporters=lcov \
	  --coverageThreshold='{"global":{"lines":60,"functions":60,"branches":50}}'

##@ Code Quality

lint: ## Run ESLint
	npx eslint "src/**/*.ts" --max-warnings=0

typecheck: ## Run TypeScript type check (no emit)
	npx tsc --noEmit

audit: ## Run npm security audit (HIGH+CRITICAL)
	npm audit --audit-level=high

secrets-scan: ## Run gitleaks for secret detection (full history)
	gitleaks detect --config .gitleaks.toml --source . --log-opts="--all"

##@ Database

migrate: ## Run TypeORM migrations
	npx typeorm-ts-node-commonjs migration:run -d src/config/data-source.ts

migrate-revert: ## Revert the last migration
	npx typeorm-ts-node-commonjs migration:revert -d src/config/data-source.ts

seed: ## Run DB seed (dev only — will refuse in production)
	npx ts-node src/seed.ts

db-reset: ## Drop, recreate DB and run migrations + seed (DESTRUCTIVE — dev only)
	@echo "⚠️  This will destroy all data. Press Ctrl-C to abort, or wait 5s..."
	@sleep 5
	psql $${DATABASE_URL} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	$(MAKE) migrate
	$(MAKE) seed

##@ Docker

docker-up: ## Start full docker-compose stack (dev)
	docker compose -f docker-compose.dev.yml up -d

docker-down: ## Stop docker-compose stack
	docker compose -f docker-compose.dev.yml down

docker-logs: ## Tail docker-compose logs
	docker compose -f docker-compose.dev.yml logs -f

docker-build: ## Build the production Docker image
	docker build -t religiogram-backend:local .

##@ Load Testing

k6-smoke: ## Run k6 smoke test against local/staging
	@test -n "$${BASE_URL}" || (echo "Set BASE_URL= first"; exit 1)
	k6 run load/smoke.k6.js -e BASE_URL=$${BASE_URL}

k6-soak: ## Run k6 soak test (28-min) — set BASE_URL=
	@test -n "$${BASE_URL}" || (echo "Set BASE_URL= first"; exit 1)
	k6 run load/soak.k6.js -e BASE_URL=$${BASE_URL}

##@ Housekeeping

build: ## Build TypeScript to dist/
	npx tsc -p tsconfig.json

clean: ## Remove build artefacts
	rm -rf dist coverage
