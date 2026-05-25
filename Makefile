SHELL := /bin/bash

.PHONY: deploy deploy-frontend deploy-convex

deploy:
	bash scripts/deploy-all.sh

deploy-frontend:
	bash scripts/deploy-frontend.sh

deploy-convex:
	bash scripts/deploy-convex.sh
