# Workflows for the browser games launcher. No build step: these
# targets just wrap a static server (ES module imports need
# http(s), not file://).

PORT ?= 8000

.DEFAULT_GOAL := help

.PHONY: help run

help:
	@echo "Targets:"
	@echo "  run   Serve the site at http://localhost:$(PORT)/"
	@echo "        (override: make run PORT=9000)"

run:
	python3 tools/dev_server.py $(PORT)
