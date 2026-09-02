# AWS Production Architecture

## Submission boundary

This repository is container-ready and includes Docker Compose for local use. It
does not deploy AWS infrastructure because no AWS account is available for this
submission. This document describes the production deployment I would implement
for the same application.

## Architecture at a glance

```text
GitHub Actions -- OIDC --> Amazon ECR --> Amazon ECS Fargate service
                                          |
Internet --> Route 53 --> ALB + ACM ------+--> Node.js / Express container
                                                    |
                                             Amazon RDS PostgreSQL

CloudWatch <------------------------------- ECS logs, metrics, alarms
Secrets Manager --------------------------> database and runtime secrets
```

The current Docker image packages the React frontend and Express API together.
An Application Load Balancer (ALB) routes HTTPS traffic to an ECS Fargate
service, which serves that container. Fargate keeps the existing Node.js
application model intact while removing host and cluster administration.

## Core services

| Concern | AWS service | Design decision |
| --- | --- | --- |
| Container image | Amazon ECR | CI publishes immutable images tagged with the commit SHA. |
| Application runtime | Amazon ECS on Fargate | Run at least two API tasks across private subnets; scale on CPU, memory, and request load. |
| Public traffic | Application Load Balancer + ACM | Terminate TLS at the ALB and route only `/api/*` and application traffic to healthy tasks using `/api/health`. |
| Database | Amazon RDS for PostgreSQL | Replace SQLite with PostgreSQL for concurrent access, backups, point-in-time recovery, and safe horizontal scaling. |
| Secrets | AWS Secrets Manager | Inject database credentials, session signing configuration, and external integration settings at task start. |
| DNS | Amazon Route 53 | Map the production domain to the load balancer. |
| Observability | Amazon CloudWatch | Centralise structured logs, service metrics, dashboards, and alarms. |

## Networking and security

- Place the ALB in public subnets and ECS tasks plus RDS in private subnets.
- Allow inbound internet traffic only to the ALB on HTTPS. Allow the ECS security
  group to receive traffic only from the ALB; allow RDS traffic only from ECS.
- Use a managed identity provider such as Amazon Cognito or the bank's existing
  OIDC provider in production. The seeded demo login and browser session storage
  in this submission are intentionally limited to local demonstration.
- Store session and credential material outside the image. Use short-lived task
  roles and GitHub Actions OIDC rather than static AWS access keys.
- Enable encryption in transit with ACM certificates and encryption at rest for
  RDS, ECR, CloudWatch Logs, and Secrets Manager.
- Apply request-size limits, strict CORS rules, security headers, and rate limits
  at the application and edge layers.

## Data and resilience

SQLite is appropriate for this self-contained take-home, but it is not suitable
for a multi-task production service. PostgreSQL would become the source of truth
for customers, accounts, transactions, disputes, sessions, and audit events.

The database would use Multi-AZ deployment, automated backups, point-in-time
recovery, and monitored connection limits. Schema changes would be delivered as
versioned migrations before a compatible application rollout. ECS deployments
would use rolling or blue/green deployment with health checks and rollback on
failed tasks.

## Background processing and Lambda

The core portal API would remain an ECS Fargate service, not a Lambda function.
It is a long-running Express application already designed as a Docker container.

Lambda is appropriate for isolated, event-driven work added later, for example:

- send a dispute status notification after a case event is published
- run scheduled reminders for cases awaiting customer action
- process uploaded evidence after it lands in S3

Those flows could use EventBridge or SQS to decouple the API from slow or
retryable work. No Lambda function is claimed or implemented in this submission.

## Delivery pipeline

The existing GitHub Actions workflow validates every push with a clean install,
type check, tests, and production build. A production deployment pipeline would
extend it as follows:

1. GitHub Actions authenticates to AWS using OIDC and a least-privilege IAM role.
2. The verified Docker image is built and pushed to ECR with the commit SHA tag.
3. Database migrations run as a controlled one-off ECS task.
4. The ECS service is updated to the new immutable image.
5. CloudWatch alarms and ALB health checks determine rollout success; failed
   deployments roll back automatically.

## Operations

Each request would carry a correlation ID through structured JSON logs. CloudWatch
alarms would notify the team about elevated 5xx rates, authentication failures,
latency, ECS task restarts, and RDS capacity pressure. Runbooks would cover
rollback, database recovery, customer-session incidents, and third-party API
failures.
