# Workflows for the browser games launcher. No build step for
# the site itself: `run` wraps a static server for local dev,
# `playtest` is the one target that needs node (it imports and
# plays Wheelworks' own rules, which is the point of it);
# the pod-* targets build/run/push a container image from
# Containerfile (podman, matching .github/workflows/*.yml,
# which call `make pod-build` and `make pod-push`).

PORT ?= 8000
ENGINE ?= podman
REGISTRY ?= ghcr.io/fatmanuk
IMAGE ?= browser_games
TAG ?= latest
REF := $(REGISTRY)/$(IMAGE):$(TAG)

.DEFAULT_GOAL := help

.PHONY: help run playtest pod-build pod-run pod-push \
	pod-clean

help:
	@echo "Targets:"
	@echo "  run        Serve the site locally at"
	@echo "             http://localhost:$(PORT)/"
	@echo "             (override: make run PORT=9000)"
	@echo "  playtest   Build and play all 100 Wheelworks"
	@echo "             levels headless, checking the rules"
	@echo "             hold (needs node). Add --solve N to"
	@echo "             play the first N to win as well"
	@echo "  pod-build  Build the container image ($(REF))"
	@echo "  pod-run    Build and run the image, serving on"
	@echo "             http://localhost:$(PORT)/"
	@echo "  pod-push   Push the image to the registry"
	@echo "             (used by .github/workflows/push.yml)"
	@echo "  pod-clean  Remove the local image"

run:
	python3 tools/dev_server.py $(PORT)

playtest:
	node tools/playtest.mjs

pod-build:
	$(ENGINE) build -t $(REF) .

pod-run: pod-build
	$(ENGINE) run --rm -p $(PORT):8000 $(REF)

pod-push:
	$(ENGINE) push $(REF)

pod-clean:
	$(ENGINE) rmi $(REF)
