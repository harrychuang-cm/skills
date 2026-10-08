# Example Prototype PRD

## Product Summary

Example Prototype is a neutral Project Intake flow for validating the reusable Storybook prototype contract. It demonstrates how a project request moves from intake, through review, into implementation handoff.

## Problem

New projects need a repeatable way to align product scope, flow metadata, local fixtures, and acceptance criteria before implementation starts.

## Users

- Product owner who submits a project request.
- Design-system reviewer who checks completeness.
- Engineer or AI agent who needs a deterministic implementation handoff.

## Goals

- Capture project request details in a deterministic Storybook story.
- Review requirements and risks before approval.
- Show a decision node in UI Flow without making it a full product route.
- Provide docs, flow metadata, data contracts, and acceptance criteria in one Storybook surface.

## Non-Goals

- No real approval API.
- No authentication, permissioning, or notifications.
- No production project management integration.

## Core Journeys

### Journey 1: Approve a request

A user opens Project Intake and submits the request; a reviewer inspects requirements and requests approval; the approval decision sends the complete request to Implementation Handoff (intake → review → approval decision → handoff).

### Journey 2: Request changes

The approval decision finds the request incomplete and sends it back to review with notes (intake → review → approval decision → review). Review can also return to intake as a reference transition.

## AI Implementation Scope

The example exists as a contract test for future prototypes. Agents should mirror the folder shape, route metadata, deterministic data, and `parameters.prototype` attachment.

## Dependencies

- Storybook prototype inspector.
- Template tokens generated from `.storybook/project.config.ts`.
- Local fixture data in `examplePrototypeData.ts`.
