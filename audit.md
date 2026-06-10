# FULL PRODUCT AUDIT, TESTING, DOCUMENTATION & OWNER HANDBOOK

You are acting as a Senior Software QA Engineer, Technical Writer, Product Manager, and System Architect.

IMPORTANT RULES:

* Read and understand the ENTIRE codebase before writing anything.
* Do not assume features. Verify them from the actual code.
* Follow all imports, services, Firestore functions, APIs, components, routes, permissions, and business logic.
* This is a production audit.
* Be extremely detailed.
* Do not make changes yet unless necessary to complete testing.
* If documentation already exists, compare it with the current implementation and update it.

## PROJECT CONTEXT

This is a production educational management platform.

Important architectural rule:

* Each branch is completely isolated from other branches.
* Each branch has only one admin.
* Data from one branch must never affect another branch.
* All documentation must reflect this architecture.

---

# PHASE 1 — COMPLETE FEATURE INVENTORY

Inspect the entire codebase and produce a complete inventory of:

### Student Features

* Registration
* Login
* Profile
* Payments
* Annual fees
* Support classes
* Training courses
* Languages
* Requests
* Notifications
* Attendance
* Certificates
* Any other feature found

### Admin Features

* Dashboard
* Student management
* Registration approval
* Payment verification
* Annual fee management
* Support classes management
* Training course management
* Language management
* Teachers management
* Capacity management
* Groups management
* Reports
* Statistics
* Correction requests
* Notifications
* Settings
* Any other feature found

### System Features

* Authentication
* Authorization
* Branch isolation
* Firestore rules
* Data validation
* Capacity enforcement
* Payment workflows
* Expiry calculations
* Logging
* Error handling
* Security protections
* Any hidden or background processes

Create a complete feature catalog.

---

# PHASE 2 — SYSTEM ARCHITECTURE DOCUMENTATION

Explain:

## Overall Architecture

* Frontend structure
* Backend structure
* Firebase structure
* Collections
* Subcollections
* Services
* APIs
* Utilities

## Data Flow

For every major operation explain:

Example:

Student Registration
→ UI
→ Validation
→ Firestore Service
→ Database
→ Admin Review
→ Approval
→ Activation

Create similar flow diagrams for all major processes.

---

# PHASE 3 — DATABASE DOCUMENTATION

Inspect all Firestore collections.

For each collection document:

### Collection Name

Purpose

Fields

Field Types

Required Fields

Relationships

Indexes Required

Security Considerations

Example Document Structure

Include every collection.

---

# PHASE 4 — ROLE & PERMISSION DOCUMENTATION

Document:

## Student Permissions

What students can:

* View
* Create
* Edit
* Delete

## Admin Permissions

What admins can:

* View
* Create
* Edit
* Delete
* Approve
* Reject

## Branch Isolation Rules

Explain exactly how branch separation works.

Show examples.

Document security assumptions.

---

# PHASE 5 — COMPLETE TESTING AUDIT

Create a professional QA checklist.

For every feature list:

### Tested

* What was tested
* Result
* Risk level

### Needs Manual Testing

Provide exact test steps.

Example:

#### Training Registration

Test Case 1:

* Create student
* Register in class
* Verify registration

Expected Result:

* Registration succeeds

Test Case 2:

* Fill class to capacity
* Attempt another registration

Expected Result:

* User-friendly capacity message displayed

Continue this process for ALL features.

---

# PHASE 6 — FIND UNTESTED AREAS

Search the entire codebase and identify:

* Features never tested
* Edge cases
* Missing validations
* Missing permissions
* Potential bugs
* Race conditions
* UI inconsistencies
* Security concerns
* Data integrity risks

Rank by severity:

Critical
High
Medium
Low

---

# PHASE 7 — OWNER HANDBOOK

Create a non-technical guide for the owner.

Use simple language.

Explain:

## What the Website Does

## How Students Use It

Step-by-step.

## How Admin Uses It

Step-by-step.

## Daily Workflow

Example:

1. Students register
2. Payments arrive
3. Admin verifies payment
4. Student becomes active
5. Student joins classes

etc.

---

# PHASE 8 — ADMIN HANDBOOK

Create a practical operations manual.

Include:

### Student Management

### Payment Verification

### Annual Fees

### Support Classes

### Training Courses

### Languages

### Teachers

### Groups

### Capacity Limits

### Reports

### Troubleshooting

### Common Mistakes

### Best Practices

---

# PHASE 9 — UI SCREEN DOCUMENTATION

For every page:

* Page Name
* Purpose
* Who can access it
* Actions available
* Related database collections
* Related services

Include screenshots if possible.

---

# PHASE 10 — PROJECT STRUCTURE GUIDE

Explain:

* Folder structure
* Components
* Services
* Hooks
* Contexts
* Utilities
* Firebase files
* Configuration files

For every important file explain why it exists.

---

# PHASE 11 — RELEASE READINESS REPORT

Provide:

### What Works Well

### Remaining Risks

### Missing Tests

### Recommended Improvements

### Production Readiness Score

Score:

* Security
* Stability
* Maintainability
* Usability
* Performance

Provide an overall score out of 100.

---

# DELIVERABLES

Generate these documents:

1. Executive Summary
2. Complete Feature Inventory
3. Technical Architecture Guide
4. Database Documentation
5. Permissions Documentation
6. QA Testing Checklist
7. Untested Features Report
8. Owner Handbook
9. Admin Handbook
10. UI/Page Documentation
11. Project Structure Guide
12. Release Readiness Report

Important:

* Base everything on the actual code.
* Do not assume functionality.
* Verify every claim from implementation.
* Flag any uncertainty explicitly.
* Be extremely detailed.
* Produce documentation that can be handed directly to the owner and used for staff training.
