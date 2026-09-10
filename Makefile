IMAGE ?= junhyung.cloud/library/mc-mcp-server

.PHONY: check
check:
	pnpm install --frozen-lockfile
	pnpm typecheck
	pnpm lint
	pnpm test
	pnpm docs:tools
	git diff --exit-code -- README.md docs/tools.md

# Local check only. GitHub Actions is what publishes to the registry.
.PHONY: image
image:
	docker buildx build --load -t $(IMAGE):local .

.PHONY: chart-lint
chart-lint:
	helm lint charts/mc-mcp-server --set auth.token=lint-only
	helm template charts/mc-mcp-server --set auth.token=lint-only > /dev/null

.PHONY: clean
clean:
	rm -rf dist
