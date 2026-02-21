# Expense Manager Frontend — run from apps/web/ (or: make -C apps/web <target>)

.PHONY: fmt lint test build run format-check

fmt:
	npm run format

format-check:
	npm run format:check

lint:
	npm run lint

test:
	npm run test -- --coverage

build:
	npm run build
	docker build -t expense-manager-frontend .

run:
	npm run dev
